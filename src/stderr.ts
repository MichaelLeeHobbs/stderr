// src/stderr.ts

// A robust error normalizer with native cause support, AggregateError handling,
// stack preservation, metadata copying (including non-enumerable & symbols),
// depth-limited recursion, circular reference detection, and optional subclassing.

import { StdError } from './StdError';
import type { Dictionary, ErrorRecord, ErrorShape } from './types';
import { isArray, isErrorShaped, isFunction, isObject, isPrimitive, isSymbol } from './types';
import { getCustomKeys, primitiveToError, unknownToString } from './utils';

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

interface StderrFn {
    <T = StdError>(input: unknown, options?: NormalizeOptions, depth?: number): T;

    maxDepth: number;
}

// Forward declarations needed due to circular dependencies between functions
// eslint-disable-next-line prefer-const
let normalizeUnknown: (input: unknown, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>) => unknown;
// eslint-disable-next-line prefer-const
let normalizeObjectToError: (input: ErrorRecord, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>) => ErrorShape;

// Private storage for maxDepth (set before defaultOptions)
let _maxDepth = 8;

// Default options function (uses _maxDepth directly)
const defaultOptions = (): Required<NormalizeOptionsInternal> => ({
    maxDepth: _maxDepth,
});

const normalizeMetaData = (target: ErrorShape, source: Dictionary, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape => {
    // Always include non-enumerable properties for complete error capture
    const metadataKeys = getCustomKeys(source, { includeNonEnumerable: true });

    // Enforce loop bound to prevent DoS
    const boundedKeys = metadataKeys.slice(0, MAX_PROPERTIES);
    if (metadataKeys.length > MAX_PROPERTIES) {
        // Log warning but continue (graceful degradation)
        console.warn(`Property count (${metadataKeys.length}) exceeds MAX_PROPERTIES (${MAX_PROPERTIES}), truncating`);
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
        } /* node:coverage ignore next 8 */ catch (err) {
            // Only ignore property access errors (getters that throw, etc.)
            // Re-throw serious errors like out-of-memory
            if (err instanceof RangeError || err instanceof ReferenceError) {
                throw err;
            }
            // Silently skip properties that can't be accessed (getters that throw, etc.)
        }
    }
    return target;
};

// We don't want to force the error shape on purely unknown objects
normalizeUnknown = (input: unknown, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): unknown => {
    // Depth limit for unknown structures
    if (depth >= opts.maxDepth) return `[Max depth of ${opts.maxDepth} reached]`;

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

        // Enforce loop bound
        const boundedKeys = keys.slice(0, MAX_PROPERTIES);
        if (keys.length > MAX_PROPERTIES) {
            console.warn(`Property count (${keys.length}) exceeds MAX_PROPERTIES (${MAX_PROPERTIES}), truncating`);
        }

        for (const key of boundedKeys) {
            const keyStr = key.toString();
            let value = obj[key as keyof typeof obj];

            // Skip functions - they're not useful in serialized errors
            if (typeof value === 'function') continue;

            if (!isPrimitive(value)) value = normalizeUnknown(value, opts, depth + 1, seen);
            else if (isSymbol(value)) value = value.toString();

            if (value !== undefined) normalized[keyStr] = value;
        }
        return normalized;
    }
    /* node:coverage ignore next 3 */
    // Fallback for any other unknown type
    return String(input);
};

normalizeObjectToError = (input: ErrorRecord, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape => {
    // Depth check for Error normalization
    if (depth >= opts.maxDepth) return new StdError(`[Max depth of ${opts.maxDepth} reached]`, { maxDepth: opts.maxDepth });

    const errorShape: Partial<ErrorShape> = {};

    // Cause
    if (input.cause !== undefined && input.cause !== null) {
        const normalizedCause = normalizeUnknown(input.cause, opts, depth + 1, seen);
        if (isErrorShaped(normalizedCause)) errorShape.cause = normalizedCause as ErrorShape;
        else if (isPrimitive(normalizedCause)) errorShape.cause = primitiveToError(normalizedCause);
        else if (isObject(normalizedCause)) errorShape.cause = normalizeObjectToError(normalizedCause as ErrorRecord, opts, depth + 1, seen);
    }

    // Errors (shape detection)
    type AggregateMode = 'none' | 'array' | 'single';
    let aggregateMode: AggregateMode = 'none';

    if (isArray(input.errors)) {
        aggregateMode = 'array';

        const errorsArray = input.errors as unknown[];
        const boundedErrors = errorsArray.slice(0, MAX_ARRAY_LENGTH);
        if (errorsArray.length > MAX_ARRAY_LENGTH) {
            console.warn(`Errors array length (${errorsArray.length}) exceeds MAX_ARRAY_LENGTH (${MAX_ARRAY_LENGTH}), truncating`);
        }

        errorShape.errors = boundedErrors
            .map((e: unknown) => normalizeUnknown(e, opts, depth + 1, seen))
            .map(ne => {
                if (isErrorShaped(ne)) return ne as ErrorShape;
                if (isPrimitive(ne)) return primitiveToError(ne);
                if (isObject(ne)) return normalizeObjectToError(ne as ErrorRecord, opts, depth + 1, seen);
                /* node:coverage ignore next */
                return null;
            })
            .filter(ne => ne !== null) as ErrorShape[];
    } else if (isErrorShaped(input.errors)) {
        // Single Error instance -> treat as "single" AggregateError
        aggregateMode = 'single';
        const normalizedSingleError = normalizeUnknown(input.errors, opts, depth + 1, seen);
        if (isErrorShaped(normalizedSingleError)) {
            errorShape.errors = [normalizedSingleError as ErrorShape];
        } /* node:coverage ignore next 2 */ else if (isPrimitive(normalizedSingleError)) {
            errorShape.errors = [primitiveToError(normalizedSingleError)];
        } /* node:coverage ignore next 2 */ else if (isObject(normalizedSingleError)) {
            errorShape.errors = [normalizeObjectToError(normalizedSingleError as ErrorRecord, opts, depth + 1, seen)];
        } /* node:coverage ignore next 2 */ else {
            errorShape.errors = [];
        }
    } else if (isObject(input.errors)) {
        // Non-standard object map of errors
        const normalizedErrors: ErrorRecord = {};
        // Always include non-enumerable for complete error capture
        const errorKeys = getCustomKeys(input.errors as object, {
            includeNonEnumerable: true,
            excludeKeys: new Set(),
        });

        // Enforce loop bound
        const boundedErrorKeys = errorKeys.slice(0, MAX_PROPERTIES);
        if (errorKeys.length > MAX_PROPERTIES) {
            console.warn(`Error property count (${errorKeys.length}) exceeds MAX_PROPERTIES (${MAX_PROPERTIES}), truncating`);
        }

        for (const key of boundedErrorKeys) {
            const keyStr = key.toString();
            const value = (input.errors as Dictionary)[key as keyof typeof input.errors];

            // Skip functions in error maps
            if (typeof value === 'function') continue;

            const normalizedValue = normalizeUnknown(value, opts, depth + 1, seen);

            if (isErrorShaped(normalizedValue)) normalizedErrors[keyStr] = normalizedValue as ErrorShape;
            else if (isPrimitive(normalizedValue)) normalizedErrors[keyStr] = primitiveToError(normalizedValue);
            else if (isObject(normalizedValue)) normalizedErrors[keyStr] = normalizeObjectToError(normalizedValue as ErrorRecord, opts, depth + 1, seen);
        }
        errorShape.errors = normalizedErrors;
    } else if (input.errors !== undefined && input.errors !== null) {
        // Single non-array/non-object -> AggregateError with one item
        aggregateMode = 'single';
        const normalizedSingleError = normalizeUnknown(input.errors, opts, depth + 1, seen);
        /* node:coverage ignore next 2 */
        if (isErrorShaped(normalizedSingleError)) {
            errorShape.errors = [normalizedSingleError as ErrorShape];
        } else if (isPrimitive(normalizedSingleError)) {
            errorShape.errors = [primitiveToError(normalizedSingleError)];
        } /* node:coverage ignore next 2 */ else if (isObject(normalizedSingleError)) {
            errorShape.errors = [normalizeObjectToError(normalizedSingleError as ErrorRecord, opts, depth + 1, seen)];
        } /* node:coverage ignore next 2 */ else {
            errorShape.errors = [];
        }
    }

    // Name and Message (shape-aware)
    const computeFinalName = (): string => {
        if (aggregateMode === 'single') return input.name ? unknownToString(input.name) : 'AggregateError';
        if (aggregateMode === 'array') return input.name ? unknownToString(input.name) : 'Error';
        return input.name ? unknownToString(input.name) : 'Error';
    };

    const computeFinalMessage = (): string => {
        // Tests require overriding any provided message for single-value errors
        if (aggregateMode === 'single') return 'AggregateError';
        if (input.message !== undefined && input.message !== null) {
            return isObject(input.message) ? unknownToString(normalizeUnknown(input.message, opts, depth + 1, seen)) : unknownToString(input.message);
        }
        return '';
    };

    const finalName = computeFinalName();
    const finalMessage = computeFinalMessage();

    // Construct the StdError instance
    const stderrOptions: Dictionary = {
        name: finalName,
        maxDepth: opts.maxDepth,
    };

    if (errorShape.cause !== undefined && errorShape.cause !== null) {
        stderrOptions.cause = errorShape.cause;
    }

    if (errorShape.errors !== undefined && errorShape.errors !== null) {
        stderrOptions.errors = errorShape.errors;
    }

    // Create the StdError instance
    const e = new StdError(finalMessage, stderrOptions) as ErrorShape;

    // Copy all custom metadata properties
    return normalizeMetaData(e, input, opts, depth, seen);
};

const stderr = <T = ErrorShape>(input: unknown, options: NormalizeOptions = {}, depth = 0): T => {
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
    if (isErrorShaped(input)) {
        originalStack = (input as ErrorShape).stack;
    }

    let e: ErrorShape;

    // Primitives
    if (isPrimitive(input)) {
        e = primitiveToError(input);
    } else {
        /* node:coverage ignore next 2 */
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
            } /* node:coverage ignore next 2 */ else {
                e = primitiveToError(String(input));
            }
        }
    }

    // Always preserve original stack trace if we captured one
    if (originalStack) {
        e.stack = originalStack;
    }

    // Type cast to generic T - allows callers to specify expected return type
    // while we always return StdError. This is safe because StdError extends Error
    // and implements ErrorShape, satisfying most use cases.
    return e as T;
};

// Configure maxDepth with getter/setter for validation
Object.defineProperty(stderr, 'maxDepth', {
    get(): number {
        return _maxDepth;
    },
    set(value: number) {
        if (!Number.isInteger(value)) {
            throw new TypeError(`maxDepth must be an integer, got: ${typeof value}`);
        }
        if (value < 1 || value > 1000) {
            throw new RangeError(`maxDepth must be between 1 and 1000, got: ${value}`);
        }
        _maxDepth = value;
    },
    enumerable: true,
    configurable: false,
});

// Export stderr with proper type (maxDepth property added via Object.defineProperty above)
export { stderr };
export type { StderrFn };
