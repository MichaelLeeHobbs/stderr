// A robust error normalizer with native cause support, AggregateError handling,
// stack preservation, metadata copying (including non-enumerable & symbols),
// depth-limited recursion, circular reference detection, and optional subclassing.

import { StdError } from './StdError';
import type { ErrorRecord, ErrorShape } from './types';
import { isArray, isErrorShaped, isFunction, isObject, isPrimitive, isSymbol } from './types';
import { checkDepthLimit, getCustomKeys, primitiveToError, unknownToString, copyPropertiesTo } from './utils';

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

    /**
     * Maximum number of properties to process when normalizing error objects.
     *
     * Prevents DoS attacks via objects with excessive properties.
     *
     * @default 1000
     * @example
     * ```typescript
     * // Limit to 500 properties
     * const err = stderr(error, { maxProperties: 500 });
     * ```
     */
    maxProperties?: number;

    /**
     * Maximum array length to process when normalizing error arrays.
     *
     * Prevents DoS attacks via extremely large arrays.
     *
     * @default 10000
     * @example
     * ```typescript
     * // Limit to 5000 array items
     * const err = stderr(error, { maxArrayLength: 5000 });
     * ```
     */
    maxArrayLength?: number;
}

type NormalizeOptionsInternal = Required<NormalizeOptions>;

/**
 * Helper: Bounds an array to a maximum length with warning if truncated.
 * Prevents DoS attacks via excessively large arrays/property lists.
 */
const boundWithWarning = <T>(arr: T[], maxLength: number, description: string): T[] => {
    if (arr.length > maxLength) {
        console.warn(`${description} (${arr.length}) exceeds limit (${maxLength}), truncating`);
    }
    return arr.slice(0, maxLength);
};

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

// Private storage for maxDepth (set before defaultOptions)
let _maxDepth = 8;

// Default options function (uses _maxDepth directly)
const defaultOptions = (): Required<NormalizeOptionsInternal> => ({
    maxDepth: _maxDepth,
    maxProperties: MAX_PROPERTIES,
    maxArrayLength: MAX_ARRAY_LENGTH,
});

// We don't want to force the error shape on purely unknown objects
const normalizeUnknown = (input: unknown, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): unknown => {
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
        const boundedArray = boundWithWarning(input as unknown[], opts.maxArrayLength, 'Array length');
        return boundedArray.map((e: unknown) => normalizeUnknown(e, opts, depth + 1, seen));
    }

    // Error-like
    if (isErrorShaped(input)) return normalizeObjectToError(input as ErrorRecord, opts, depth, seen);

    // Plain objects
    if (isObject(input)) {
        const obj = input as ErrorRecord;
        const normalized: ErrorRecord = {};

        // Use unified property copy utility with normalization
        copyPropertiesTo(obj, normalized, {
            excludeKeys: new Set(), // No exclusions for plain objects (already filtered by getCustomKeys)
            skipFunctions: true,
            convertSymbolKeys: true, // Convert symbols to strings for serialization
            maxProperties: opts.maxProperties,
            normalizeValue: value => {
                if (!isPrimitive(value)) return normalizeUnknown(value, opts, depth + 1, seen);
                if (isSymbol(value)) return value.toString();
                return value;
            },
        });

        return normalized;
    }
    /* node:coverage ignore next 3 */
    // This should be impossible to reach
    return unknownToString(input);
};

/**
 * Normalizes an errors object (key-value map of errors).
 * Handles property count bounds.
 */
const normalizeErrorsObject = (errorsObj: object, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorRecord => {
    const normalizedErrors: ErrorRecord = {};
    const errorKeys = getCustomKeys(errorsObj, { includeNonEnumerable: true, excludeKeys: new Set() });
    const boundedErrorKeys = boundWithWarning(errorKeys, opts.maxProperties, 'Error property count');

    for (const key of boundedErrorKeys) {
        const keyStr = key.toString();
        const value = (errorsObj as ErrorRecord)[key as keyof typeof errorsObj];

        // Skip functions in error maps
        if (typeof value === 'function') continue;

        normalizedErrors[keyStr] = convertToErrorShape(value, opts, depth, seen);
    }

    return normalizedErrors;
};

const normalizeObjectToError = (input: ErrorRecord, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape => {
    const depthCheck = checkDepthLimit(depth, opts.maxDepth);
    if (depthCheck) return new StdError(depthCheck, { maxDepth: opts.maxDepth });

    // Normalize cause
    const normalizedCause = input.cause ? convertToErrorShape(input.cause, opts, depth, seen) : undefined;

    // Normalize errors property based on its type
    // Track if this is a "single error as aggregate" case for default name/message
    let normalizedErrors: ErrorShape[] | ErrorRecord | undefined;
    let isSingleErrorAggregate = false;

    if (isArray(input.errors)) {
        // Inline array normalization with bounded warning
        const boundedErrors = boundWithWarning(input.errors as unknown[], opts.maxArrayLength, 'Errors array length');
        normalizedErrors = boundedErrors.map((e: unknown) => convertToErrorShape(e, opts, depth, seen));
    } else if (isErrorShaped(input.errors)) {
        isSingleErrorAggregate = true;
        normalizedErrors = [convertToErrorShape(input.errors, opts, depth, seen)];
    } else if (isObject(input.errors)) {
        normalizedErrors = normalizeErrorsObject(input.errors as object, opts, depth, seen);
    } else if (input.errors) {
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

    if (normalizedCause) stderrOptions.cause = normalizedCause;
    if (normalizedErrors) stderrOptions.errors = normalizedErrors;

    // Create the StdError instance
    const e = new StdError(finalMessage, stderrOptions) as ErrorShape;

    // Copy all custom metadata properties with normalization
    copyPropertiesTo(input, e, {
        // getCustomKeys already excludes STANDARD_ERROR_KEYS, we just use defaults
        skipFunctions: true,
        convertSymbolKeys: true, // Convert symbols to strings for serialization
        maxProperties: opts.maxProperties,
        normalizeValue: value => {
            if (!isPrimitive(value)) return normalizeUnknown(value, opts, depth + 1, seen);
            if (isSymbol(value)) return value.toString();
            return value;
        },
    });

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

    if (options.maxProperties !== undefined) {
        if (!Number.isInteger(options.maxProperties)) {
            throw new TypeError(`maxProperties must be an integer, got: ${typeof options.maxProperties}`);
        }
        if (options.maxProperties < 1 || options.maxProperties > 100000) {
            throw new RangeError(`maxProperties must be between 1 and 100000, got: ${options.maxProperties}`);
        }
    }

    if (options.maxArrayLength !== undefined) {
        if (!Number.isInteger(options.maxArrayLength)) {
            throw new TypeError(`maxArrayLength must be an integer, got: ${typeof options.maxArrayLength}`);
        }
        if (options.maxArrayLength < 1 || options.maxArrayLength > 1000000) {
            throw new RangeError(`maxArrayLength must be between 1 and 1000000, got: ${options.maxArrayLength}`);
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
                e = primitiveToError(unknownToString(input));
            } else if (isArray(input)) {
                e = normalizeObjectToError({ errors: input as unknown[], name: 'AggregateError', message: 'AggregateError' } as ErrorRecord, opts, depth, seen);
            } else if (isObject(input)) {
                e = normalizeObjectToError(input as ErrorRecord, opts, depth, seen);
            } else {
                e = primitiveToError(unknownToString(input));
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
