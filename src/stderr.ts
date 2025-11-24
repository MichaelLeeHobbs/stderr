// A robust error normalizer with native cause support, AggregateError handling,
// stack preservation, metadata copying (including non-enumerable & symbols),
// depth-limited recursion, circular reference detection, and optional subclassing.

import { StdError } from './StdError';
import type { ErrorRecord, ErrorShape } from './types';
import { isArray, isErrorShaped, isFunction, isObject, isPrimitive, isSymbol } from './types';
import { checkDepthLimit, getCustomKeys, primitiveToError, unknownToString } from './utils';

/**
 * Maximum number of properties to process when normalizing error objects.
 * Prevents DoS attacks via objects with excessive properties.
 */
const MAX_PROPERTIES = 1000;

/**
 * Maximum array length to process when normalizing error arrays.
 * Prevents DoS attacks via extremely large arrays.
 */
const MAX_ARRAY_LENGTH = 10000;

/**
 * Options for normalizing errors with stderr()
 */
export interface NormalizeOptions {
    /**
     * Maximum recursion depth for nested cause/errors normalization.
     *
     * Prevents infinite recursion in circular error structures.
     *
     * @default 8
     * @example
     * ```typescript
     * // Limit depth to 3 levels
     * const err = stderr(deepError, { maxDepth: 3 });
     * ```
     */
    maxDepth?: number;
}

interface NormalizeOptionsInternal extends NormalizeOptions {
    maxDepth: number;
}

// Forward declarations needed due to circular dependencies between functions
// eslint-disable-next-line prefer-const
let normalizeUnknown: (input: unknown, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>) => unknown;
// eslint-disable-next-line prefer-const
let normalizeObjectToError: (input: ErrorRecord, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>) => ErrorShape;

/**
 * Helper: Converts any normalized value to ErrorShape.
 * This pattern was repeated across normalizeErrorsArray, normalizeErrorsSingle, and normalizeErrorsObject.
 */
const convertToErrorShape = (value: unknown, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape => {
    const normalized = normalizeUnknown(value, opts, depth + 1, seen);

    if (isErrorShaped(normalized)) return normalized as ErrorShape;
    if (isPrimitive(normalized)) return primitiveToError(normalized);
    if (isObject(normalized)) return normalizeObjectToError(normalized as ErrorRecord, opts, depth + 1, seen);
    /* node:coverage ignore next 3 */
    // This should be impossible to reach
    return new StdError(unknownToString(value) ?? 'Unknown', { maxDepth: opts.maxDepth });
};

/**
 * Helper: Copies properties from source to target with normalization.
 * Shared logic between normalizeMetaData and normalizeUnknown object handling.
 */
const copyProperties = (
    source: ErrorRecord,
    target: ErrorRecord,
    keys: (string | symbol)[],
    opts: NormalizeOptionsInternal,
    depth: number,
    seen: WeakSet<object>,
    maxProperties: number
): void => {
    const boundedKeys = keys.slice(0, maxProperties);
    if (keys.length > maxProperties) {
        console.warn(`Property count (${keys.length}) exceeds MAX_PROPERTIES (${maxProperties}), truncating`);
    }

    for (const key of boundedKeys) {
        try {
            const keyStr = key.toString();
            let value = source[key as keyof typeof source];

            // Skip functions - they're not useful in serialized errors
            if (typeof value === 'function') continue;

            if (!isPrimitive(value)) value = normalizeUnknown(value, opts, depth + 1, seen);
            else if (isSymbol(value)) value = value.toString();

            if (value !== undefined) target[keyStr] = value;
        } /* node:coverage ignore next 6 */ catch (err) {
            // Only ignore property access errors (getters that throw, etc.)
            // Re-throw serious errors like out-of-memory
            if (err instanceof RangeError || err instanceof ReferenceError) throw err;
            // Silently skip properties that can't be accessed (getters that throw, etc.)
        }
    }
};

// Private storage for maxDepth (set before defaultOptions)
let _maxDepth = 8;

// Default options function (uses _maxDepth directly)
const defaultOptions = (): Required<NormalizeOptionsInternal> => ({
    maxDepth: _maxDepth,
});

// We don't want to force the error shape on purely unknown objects
normalizeUnknown = (input: unknown, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): unknown => {
    const depthCheck = checkDepthLimit(depth, opts.maxDepth);
    if (depthCheck) return depthCheck;

    // Primitives (symbol first for clarity)
    if (isSymbol(input)) return input.toString();
    if (isPrimitive(input)) return input;

    // Circular detection for objects/arrays
    if (seen.has(input as object)) return '[Circular]';
    seen.add(input as object);

    // Arrays
    if (isArray(input)) {
        const boundedArray = (input as unknown[]).slice(0, MAX_ARRAY_LENGTH);
        if (input.length > MAX_ARRAY_LENGTH) {
            console.warn(`Array length (${input.length}) exceeds MAX_ARRAY_LENGTH (${MAX_ARRAY_LENGTH}), truncating`);
        }
        return boundedArray.map((e: unknown) => normalizeUnknown(e, opts, depth + 1, seen));
    }

    // Error-like
    if (isErrorShaped(input)) return normalizeObjectToError(input as ErrorRecord, opts, depth, seen);

    // Plain objects
    if (isObject(input)) {
        const obj = input as ErrorRecord;
        const normalized: ErrorRecord = {};
        // Always include non-enumerable for complete capture, no key exclusions for plain objects
        const keys = getCustomKeys(obj, {
            includeNonEnumerable: true,
            excludeKeys: new Set(),
        });

        copyProperties(obj, normalized, keys, opts, depth, seen, MAX_PROPERTIES);

        return normalized;
    }
    /* node:coverage ignore next 3 */
    // This should be impossible to reach
    return unknownToString(input);
};

/**
 * Normalizes an errors array property.
 * Handles array length bounds and converts each item to ErrorShape.
 */
const normalizeErrorsArray = (errorsArray: unknown[], opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape[] => {
    if (errorsArray.length > MAX_ARRAY_LENGTH) {
        console.warn(`Errors array length (${errorsArray.length}) exceeds MAX_ARRAY_LENGTH (${MAX_ARRAY_LENGTH}), truncating`);
    }

    return errorsArray.slice(0, MAX_ARRAY_LENGTH).map((e: unknown) => convertToErrorShape(e, opts, depth, seen));
};

/**
 * Normalizes an errors object (key-value map of errors).
 * Handles property count bounds.
 */
const normalizeErrorsObject = (errorsObj: object, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorRecord => {
    const normalizedErrors: ErrorRecord = {};
    const errorKeys = getCustomKeys(errorsObj, { includeNonEnumerable: true, excludeKeys: new Set() });

    // Enforce loop bound
    const boundedErrorKeys = errorKeys.slice(0, MAX_PROPERTIES);
    if (errorKeys.length > MAX_PROPERTIES) {
        console.warn(`Error property count (${errorKeys.length}) exceeds MAX_PROPERTIES (${MAX_PROPERTIES}), truncating`);
    }

    for (const key of boundedErrorKeys) {
        const keyStr = key.toString();
        const value = (errorsObj as ErrorRecord)[key as keyof typeof errorsObj];

        // Skip functions in error maps
        if (typeof value === 'function') continue;

        normalizedErrors[keyStr] = convertToErrorShape(value, opts, depth, seen);
    }

    return normalizedErrors;
};

normalizeObjectToError = (input: ErrorRecord, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape => {
    const depthCheck = checkDepthLimit(depth, opts.maxDepth);
    if (depthCheck) return new StdError(depthCheck, { maxDepth: opts.maxDepth });

    // Normalize cause
    const normalizedCause = input.cause ? convertToErrorShape(input.cause, opts, depth, seen) : undefined;

    // Normalize errors property based on its type
    // Track if this is a "single error as aggregate" case for default name/message
    let normalizedErrors: ErrorShape[] | ErrorRecord | undefined;
    let isSingleErrorAggregate = false;

    if (isArray(input.errors)) {
        normalizedErrors = normalizeErrorsArray(input.errors as unknown[], opts, depth, seen);
    } else if (isErrorShaped(input.errors)) {
        isSingleErrorAggregate = true;
        normalizedErrors = [convertToErrorShape(input.errors, opts, depth, seen)];
    } else if (isObject(input.errors)) {
        normalizedErrors = normalizeErrorsObject(input.errors as object, opts, depth, seen);
    } else if (input.errors !== undefined && input.errors !== null) {
        isSingleErrorAggregate = true;
        normalizedErrors = [convertToErrorShape(input.errors, opts, depth, seen)];
    }

    // Compute name: Use input.name if present, otherwise default to 'AggregateError' for single-error case, 'Error' otherwise
    const finalName = input.name ? unknownToString(input.name) : isSingleErrorAggregate ? 'AggregateError' : 'Error';

    // Compute message: Use 'AggregateError' for single-error case, otherwise use input.message
    const finalMessage = isSingleErrorAggregate
        ? 'AggregateError'
        : input.message !== undefined && input.message !== null
          ? isObject(input.message)
              ? unknownToString(normalizeUnknown(input.message, opts, depth + 1, seen))
              : unknownToString(input.message)
          : '';

    // Construct the StdError instance
    const stderrOptions: Record<string | symbol, unknown> = { name: finalName, maxDepth: opts.maxDepth };

    if (normalizedCause !== undefined && normalizedCause !== null) stderrOptions.cause = normalizedCause;
    if (normalizedErrors !== undefined && normalizedErrors !== null) stderrOptions.errors = normalizedErrors;

    // Create the StdError instance
    const e = new StdError(finalMessage, stderrOptions) as ErrorShape;

    // Copy all custom metadata properties (always include non-enumerable for complete error capture)
    const metadataKeys = getCustomKeys(input, { includeNonEnumerable: true });
    copyProperties(input, e, metadataKeys, opts, depth, seen, MAX_PROPERTIES);

    return e;
};

const stderr = <T = StdError>(input: unknown, options: NormalizeOptions = {}, depth = 0): T => {
    // Validate options (simple inline validation, no Zod needed)
    if (options.maxDepth !== undefined) {
        if (!Number.isInteger(options.maxDepth)) {
            throw new TypeError(`maxDepth must be an integer, got: ${typeof options.maxDepth}`);
        }
        if (options.maxDepth < 1 || options.maxDepth > 1000) {
            throw new RangeError(`maxDepth must be between 1 and 1000, got: ${options.maxDepth}`);
        }
    }

    const seen = new WeakSet<object>();
    const opts: NormalizeOptionsInternal = { ...defaultOptions(), ...options };

    // Capture original stack if input is error-shaped
    let originalStack: string | undefined;
    if (isErrorShaped(input)) originalStack = input.stack;

    let e: ErrorShape;

    // Primitives
    if (isPrimitive(input)) {
        e = primitiveToError(input);
    } else {
        if (seen.has(input as object)) {
            e = new StdError('[Circular Input]');
        } else {
            seen.add(input as object);

            // Handle Error-like objects
            if (isFunction(input)) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
                e = primitiveToError((input as Function).toString());
            } else if (isArray(input)) {
                e = normalizeObjectToError({ errors: input as unknown[], name: 'AggregateError', message: 'AggregateError' } as ErrorRecord, opts, depth, seen);
            } else if (isObject(input)) {
                e = normalizeObjectToError(input as ErrorRecord, opts, depth, seen);
            } else {
                e = primitiveToError(String(input));
            }
        }
    }

    // Always preserve original stack trace if we captured one
    if (originalStack) e.stack = originalStack;

    // Type cast to generic T - allows callers to specify expected return type
    // while we always return StdError. This is safe because StdError extends Error
    // and implements ErrorShape, satisfying most use cases.
    return e as T;
};

// Configure maxDepth with getter/setter for validation
Object.defineProperty(stderr, 'maxDepth', {
    /* node:coverage ignore next 2 */
    get(): number {
        return _maxDepth;
    },
    /* node:coverage ignore next 4 */
    set(value: number) {
        if (!Number.isInteger(value)) throw new TypeError(`maxDepth must be an integer, got: ${typeof value}`);
        if (value < 1 || value > 1000) throw new RangeError(`maxDepth must be between 1 and 1000, got: ${value}`);
        _maxDepth = value;
    },
    enumerable: true,
    configurable: false,
});

// Export stderr with proper type (maxDepth property added via Object.defineProperty above)
export { stderr };
