// src/stderr.ts

// A robust error normalizer with native cause support, AggregateError handling,
// stack preservation, metadata copying (including non-enumerable & symbols),
// depth-limited recursion, circular reference detection, and optional subclassing.

import type { Dictionary, ErrorRecord, ErrorShape } from './types';
import { isArray, isErrorShaped, isFunction, isObject, isPrimitive, isSymbol } from './types';
import { extractMetaData, supportsAggregateError, supportsErrorOptions } from './libs';
import { primitiveToError, unknownToString } from './utils';

export interface NormalizeOptions {
    /** If provided, overrides the new error's stack trace. */
    originalStack?: string;
    /** Maximum recursion depth for nested cause/errors normalization. */
    maxDepth?: number;
    /** Include non-enumerable properties in metadata copying. */
    includeNonEnumerable?: boolean;
    /** Attempt to preserve subclasses by using a constructor matching the name. */
    enableSubclassing?: boolean;
    /** Use AggregateError if available and applicable. */
    useAggregateError?: boolean;
    /** Use CauseError if available and applicable. */
    useCauseError?: boolean;
    /** Patch the error message to override the default toString() method. */
    patchToString?: boolean;
}

interface NormalizeOptionsInternal extends NormalizeOptions {
    originalStack: string | undefined;
    maxDepth: number;
    includeNonEnumerable: boolean;
    enableSubclassing: boolean;
    useAggregateError: boolean;
    useCauseError: boolean;
    patchToString: boolean;
}

interface StderrFn {
    <T = ErrorShape>(input: unknown, options?: NormalizeOptions, depth?: number): T;

    maxDepth: number;
    includeNonEnumerable: boolean;
    enableSubclassing: boolean;
    useAggregateError: boolean;
    useCauseError: boolean;
    patchToString: boolean;
}

// Forward declarations needed due to circular dependencies between functions
// eslint-disable-next-line prefer-const
let normalizeUnknown: (input: unknown, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>) => unknown;
// eslint-disable-next-line prefer-const
let normalizeObjectToError: (input: ErrorRecord, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>) => ErrorShape;

const IGNORED_META_KEYS = new Set(['name', 'message', 'stack', 'cause', 'errors']);

const normalizeMetaData = (target: ErrorShape, source: Dictionary, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape => {
    const metadataKeys = extractMetaData(source, opts);
    for (const key of metadataKeys) {
        try {
            const keyStr = key.toString();
            if (IGNORED_META_KEYS.has(keyStr)) continue;

            let value = source[key as keyof typeof source];

            if (!isPrimitive(value)) value = normalizeUnknown(value, opts, depth + 1, seen);
            else if (isSymbol(value)) value = value.toString();

            if (value !== undefined) target[keyStr] = value;
        } /* node:coverage ignore next 3 */ catch {
            // Ignore metadata copy errors
        }
    }
    return target;
};

// We don't want to force the error shape on purely unknown objects
normalizeUnknown = (input: unknown, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): unknown => {
    // 1) Depth limit for unknown structures
    if (depth >= opts.maxDepth) return `<Max depth of ${depth} reached>`;

    // 2) Primitives (symbol first for clarity)
    if (isSymbol(input)) return input.toString();
    if (isPrimitive(input)) return input;

    // 3) Circular detection for objects/arrays
    if (seen.has(input as object)) return '<Circular>';
    seen.add(input as object);

    // 4) Arrays
    if (isArray(input)) return input.map((e: unknown) => normalizeUnknown(e, opts, depth + 1, seen));

    // 5) Error-like
    if (isErrorShaped(input)) return normalizeObjectToError(input as ErrorRecord, opts, depth, seen);

    // 6) Plain objects
    if (isObject(input)) {
        const obj = input as ErrorRecord;
        const normalized: ErrorRecord = {};
        const keys = extractMetaData(obj, opts);
        for (const key of keys) {
            const keyStr = key.toString();
            let value = obj[key as keyof typeof obj];

            if (!isPrimitive(value)) value = normalizeUnknown(value, opts, depth + 1, seen);
            else if (isSymbol(value)) value = value.toString();

            if (value !== undefined) normalized[keyStr] = value;
        }
        return normalized;
    }

    /* node:coverage ignore next 3 */
    // 7) Fallback for any other unknown type - we should never reach here
    return String(input);
};

normalizeObjectToError = (input: ErrorRecord, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape => {
    // Depth check for Error normalization
    if (depth >= opts.maxDepth) return new Error(`[Max depth of ${depth} reached]`) as ErrorShape;

    const errorShape: Partial<ErrorShape> = {};

    // --- Cause ---
    if (input.cause !== undefined && input.cause !== null) {
        const normalizedCause = normalizeUnknown(input.cause, opts, depth + 1, seen);
        if (isErrorShaped(normalizedCause)) errorShape.cause = normalizedCause as ErrorShape;
        else if (isPrimitive(normalizedCause)) errorShape.cause = primitiveToError(normalizedCause);
        else if (isObject(normalizedCause)) errorShape.cause = normalizeObjectToError(normalizedCause as ErrorRecord, opts, depth + 1, seen);
    }

    // --- Errors (shape detection) ---
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
        const errorKeys = extractMetaData(input.errors as object, opts);
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

    // --- Name and Message (shape-aware) ---
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

    // --- Construct the Error instance ---
    const shouldBeAggregateError = aggregateMode !== 'none';

    let e: ErrorShape;
    const Ctor = globalThis[finalName as keyof typeof globalThis] as typeof Error | undefined;
    let nativeCauseUsed = false;

    if (opts.enableSubclassing && isFunction(Ctor) && Ctor.prototype instanceof Error) {
        try {
            e = new Ctor(finalMessage) as ErrorShape;
            e.name = finalName;
        } catch {
            e = new Error(finalMessage) as ErrorShape;
            e.name = finalName;
        }
    } else if (shouldBeAggregateError && supportsAggregateError() && opts.useAggregateError && isArray(errorShape.errors)) {
        e = new AggregateError(errorShape.errors, finalMessage) as ErrorShape;
        e.name = finalName;
        nativeCauseUsed = true;
    } else if (supportsErrorOptions() && opts.useCauseError && errorShape.cause) {
        e = new Error(finalMessage, {cause: errorShape.cause}) as ErrorShape;
        e.name = finalName;
    } else {
        e = new Error(finalMessage) as ErrorShape;
        e.name = finalName;
    }

    // --- Attach properties ---
    if (errorShape.cause && (!nativeCauseUsed || !(e as ErrorShape).cause)) e.cause = errorShape.cause;

    const AggregateErrorCtor: unknown = (globalThis as unknown as { AggregateError?: unknown }).AggregateError;
    const handledByNativeAggregate =
        AggregateErrorCtor &&
        typeof AggregateErrorCtor === 'function' &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        e instanceof (AggregateErrorCtor as any) &&
        isArray(errorShape.errors);

    if (errorShape.errors && !handledByNativeAggregate) e.errors = errorShape.errors;

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
            e = new Error('[Circular Input]') as ErrorShape;
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

    // Patch the error toString() method if requested
    if (opts.patchToString) overrideToString(e);

    return e as T;
};

// Default options for stderr
stderr.maxDepth = 8;
stderr.includeNonEnumerable = false;
stderr.enableSubclassing = false;
stderr.useAggregateError = true;
stderr.useCauseError = true;
stderr.patchToString = false;

const defaultOptions = (): Required<NormalizeOptionsInternal> => ({
    originalStack: undefined,
    maxDepth: stderr.maxDepth,
    includeNonEnumerable: stderr.includeNonEnumerable,
    enableSubclassing: stderr.enableSubclassing,
    useAggregateError: stderr.useAggregateError,
    useCauseError: stderr.useCauseError,
    patchToString: stderr.patchToString,
});

function overrideToString(error: ErrorShape) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const util = require('util');
        Object.defineProperty(error, 'toString', {
            value(): string {
                return util.inspect(this, {
                    depth: stderr.maxDepth,
                    compact: false,
                    breakLength: Infinity,
                    showHidden: true, // include non-enumerable like [cause], [errors]
                });
            },
            writable: true,
            configurable: true,
        });
    } /* node:coverage ignore next 3 */ catch {
        // ignore in non-Node environments
    }
}
