// src/stderr.ts

// A robust error normalizer with native cause support, AggregateError handling,
// stack preservation, metadata copying (including non-enumerable & symbols),
// depth-limited recursion, circular reference detection, and optional subclassing.

import { StdError } from './StdError';
import type { Dictionary, ErrorRecord, ErrorShape } from './types';
import { isArray, isErrorShaped, isFunction, isObject, isPrimitive, isSymbol } from './types';
import { getCustomKeys, primitiveToError, unknownToString } from './utils';

export interface NormalizeOptions {
    /** If provided, overrides the new error's stack trace. */
    originalStack?: string;
    /** Maximum recursion depth for nested cause/errors normalization. */
    maxDepth?: number;
    /** Include non-enumerable properties in metadata copying. */
    includeNonEnumerable?: boolean;
}

interface NormalizeOptionsInternal extends NormalizeOptions {
    originalStack: string | undefined;
    maxDepth: number;
    includeNonEnumerable: boolean;
}

interface StderrFn {
    <T = StdError>(input: unknown, options?: NormalizeOptions, depth?: number): T;

    maxDepth: number;
    includeNonEnumerable: boolean;
}

// Forward declarations needed due to circular dependencies between functions
// eslint-disable-next-line prefer-const
let normalizeUnknown: (input: unknown, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>) => unknown;
// eslint-disable-next-line prefer-const
let normalizeObjectToError: (input: ErrorRecord, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>) => ErrorShape;

const normalizeMetaData = (target: ErrorShape, source: Dictionary, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape => {
    const metadataKeys = getCustomKeys(source, { includeNonEnumerable: opts.includeNonEnumerable });
    for (const key of metadataKeys) {
        try {
            const keyStr = key.toString();
            let value = source[key as keyof typeof source];

            if (!isPrimitive(value)) value = normalizeUnknown(value, opts, depth + 1, seen);
            else if (isSymbol(value)) value = value.toString();

            if (value !== undefined) target[keyStr] = value;
        } catch (err) {
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
    if (isArray(input)) return input.map((e: unknown) => normalizeUnknown(e, opts, depth + 1, seen));

    // Error-like
    if (isErrorShaped(input)) return normalizeObjectToError(input as ErrorRecord, opts, depth, seen);

    // Plain objects
    if (isObject(input)) {
        const obj = input as ErrorRecord;
        const normalized: ErrorRecord = {};
        const keys = getCustomKeys(obj, {
            includeNonEnumerable: opts.includeNonEnumerable,
            excludeKeys: new Set(), // Don't exclude any keys for plain objects
        });
        for (const key of keys) {
            const keyStr = key.toString();
            let value = obj[key as keyof typeof obj];

            if (!isPrimitive(value)) value = normalizeUnknown(value, opts, depth + 1, seen);
            else if (isSymbol(value)) value = value.toString();

            if (value !== undefined) normalized[keyStr] = value;
        }
        return normalized;
    }

    /* node:coverage ignore next 2 */
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

        errorShape.errors = (input.errors as unknown[])
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
        const errorKeys = getCustomKeys(input.errors as object, {
            includeNonEnumerable: opts.includeNonEnumerable,
            excludeKeys: new Set(), // Don't exclude any keys from errors object
        });
        for (const key of errorKeys) {
            const keyStr = key.toString();
            const value = (input.errors as Dictionary)[key as keyof typeof input.errors];
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

export const stderr: StderrFn = <T = ErrorShape>(input: unknown, options: NormalizeOptions = {}, depth = 0): T => {
    const seen = new WeakSet<object>();
    const opts: NormalizeOptionsInternal = { ...defaultOptions(), ...options };

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

            if (isErrorShaped(input) && !opts.originalStack) opts.originalStack = (input as ErrorShape).stack;

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

    // Preserve the original stack if provided
    if (opts.originalStack) e.stack = opts.originalStack;

    // Type cast to generic T - allows callers to specify expected return type
    // while we always return StdError. This is safe because StdError extends Error
    // and implements ErrorShape, satisfying most use cases.
    return e as T;
};

// Default options for stderr
stderr.maxDepth = 8;
stderr.includeNonEnumerable = false;

const defaultOptions = (): Required<NormalizeOptionsInternal> => ({
    originalStack: undefined,
    maxDepth: stderr.maxDepth,
    includeNonEnumerable: stderr.includeNonEnumerable,
});
