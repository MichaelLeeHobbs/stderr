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
 * Helper: Bounds an array to a maximum length with truncation marker if exceeded.
 * Prevents DoS attacks via excessively large arrays/property lists.
 */
const boundWithTruncationMarker = <T>(arr: T[], maxLength: number, description: string): (T | string)[] => {
    if (arr.length > maxLength) {
        const truncated = arr.slice(0, maxLength);
        const marker = `[${description} truncated: ${arr.length} items, showing first ${maxLength}]`;
        return [...truncated, marker as T];
    }
    return arr;
};

/**
 * Helper: Validates numeric options with range checking
 */
const validateOption = (name: string, value: number | undefined, min: number, max: number): void => {
    if (value === undefined) return;
    if (!Number.isInteger(value)) {
        throw new TypeError(`${name} must be an integer, got: ${typeof value}`);
    }
    if (value < min || value > max) {
        throw new RangeError(`${name} must be between ${min} and ${max}, got: ${value}`);
    }
};

/**
 * Helper: Shared normalize value function for property copying
 */
const createNormalizeValue = (opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>) => {
    return (value: unknown): unknown => {
        if (!isPrimitive(value)) return normalizeUnknown(value, opts, depth + 1, seen);
        if (isSymbol(value)) return value.toString();
        return value;
    };
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

// Private storage for maxDepth
let _maxDepth = 8;

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
        const boundedArray = boundWithTruncationMarker(input as unknown[], opts.maxArrayLength, 'Array length');
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
            normalizeValue: createNormalizeValue(opts, depth, seen),
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
    const errorsRecord = errorsObj as ErrorRecord;
    const normalizedErrors: ErrorRecord = {};
    const errorKeys = getCustomKeys(errorsRecord, { includeNonEnumerable: true, excludeKeys: new Set() });
    const boundedErrorKeys = boundWithTruncationMarker(errorKeys, opts.maxProperties, 'Error property count');

    for (const key of boundedErrorKeys) {
        const keyStr = key.toString();
        const value = errorsRecord[key];

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
        const boundedErrors = boundWithTruncationMarker(input.errors as unknown[], opts.maxArrayLength, 'Errors array length');
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
        normalizeValue: createNormalizeValue(opts, depth, seen),
    });

    return e;
};

const stderr = (input: unknown, options: NormalizeOptions = {}): StdError => {
    // Validate options
    validateOption('maxDepth', options.maxDepth, 1, 1000);
    validateOption('maxProperties', options.maxProperties, 1, 100000);
    validateOption('maxArrayLength', options.maxArrayLength, 1, 1000000);

    const seen = new WeakSet<object>();
    const opts: NormalizeOptionsInternal = {
        maxDepth: _maxDepth,
        maxProperties: MAX_PROPERTIES,
        maxArrayLength: MAX_ARRAY_LENGTH,
        ...options,
    };

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
                e = normalizeObjectToError({ errors: input as unknown[], name: 'AggregateError', message: 'AggregateError' } as ErrorRecord, opts, 0, seen);
            } else if (isObject(input)) {
                e = normalizeObjectToError(input as ErrorRecord, opts, 0, seen);
            } else {
                e = primitiveToError(unknownToString(input));
            }
        }
    }

    // Always preserve original stack trace if we captured one
    if (originalStack) e.stack = originalStack;

    return e as StdError;
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
