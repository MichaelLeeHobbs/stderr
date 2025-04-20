// src/normalizeError.ts
// normalizeError.ts
// A robust error normalizer with native cause support, AggregateError handling,
// stack preservation, metadata copying (including non-enumerable & symbols),
// depth-limited recursion, circular reference detection, and optional subclassing.

import {
    Dictionary, DynamicError,
    ErrorRecord,
    ErrWithUnkCause,
    ErrWithUnkErrors,
    isArray,
    isError,
    isErrWithErrorsArr,
    isErrWithErrorsObj,
    isErrWithUnkCause,
    isFunction,
    isNonNullObject,
    isObject,
    isPrimitive,
    isString,
    isUndefined,
} from './types';
import {extractMetaData, supportsAggregateError, supportsErrorOptions} from './libs';
import * as util from 'node:util';

export interface NormalizeOptions {
    /** If provided, overrides the new error's stack trace. */
    originalStack?: string;
    /** Maximum recursion depth for nested cause/errors normalization. */
    maxDepth?: number;
    /** Include non-enumerable properties in metadata copying. */
    includeNonEnumerable?: boolean;
    /** Include symbol-keyed properties in metadata copying. */
    includeSymbols?: boolean;
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
    maxDepth?: number;
    includeNonEnumerable?: boolean;
    includeSymbols?: boolean;
    enableSubclassing?: boolean;
    useAggregateError?: boolean;
    useCauseError?: boolean;
    patchToString?: boolean;
}

const defaultOptions: Required<NormalizeOptionsInternal> = {
    originalStack: undefined,
    maxDepth: Infinity,
    includeNonEnumerable: false,
    includeSymbols: false,
    enableSubclassing: false,
    useAggregateError: true,
    useCauseError: true,
    patchToString: false,
};

const HAS_ERROR_OPTIONS = supportsErrorOptions();
const HAS_AGGREGATE_ERROR = supportsAggregateError();

export function normalizeError<T = DynamicError>(input: unknown, options: NormalizeOptions = {originalStack: undefined}): T {
    const opts = {...defaultOptions, ...options};
    return _normalize(input, opts, 0, new WeakSet()) as T;
}

function _normalize(input: unknown, opts: Required<NormalizeOptionsInternal>, depth: number, seen: WeakSet<object>): DynamicError {
    if (depth >= opts.maxDepth) {
        const e = new Error('Max depth reached') as DynamicError;
        if (opts.patchToString) {
            overrideToString(e);
        }
        return e;
    }

    // 1. Already Error
    if (isError(input)) {
        seen.add(input);
        return normalizeExistingError(input, opts, depth, seen);
    }

    // 2. Primitive string
    if (isString(input)) {
        const e = new Error(input) as DynamicError;
        // Override stack if requested
        if (opts.originalStack) {
            e.stack = opts.originalStack;
        }
        if (opts.patchToString) {
            overrideToString(e);
        }
        return e;
    }

    // 3. Other primitives
    if (isPrimitive(input)) {
        const e = new Error(String(input)) as DynamicError;
        // Override stack if requested
        if (opts.originalStack) {
            e.stack = opts.originalStack;
        }
        return e;
    }

    // 4. Object-like
    if (isObject(input)) {
        const obj = input as ErrorRecord;
        if (seen.has(input)) {
            return new Error('<Circular>') as DynamicError;
        }
        seen.add(input);

        const name = isString(obj.name) ? obj.name : 'Error';
        // Message extraction
        let message: string;
        if (isString(obj.message)) {
            message = obj.message;
        } else {
            try {
                message = JSON.stringify(obj);
            } catch {
                message = Object.prototype.toString.call(obj);
            }
        }

        // Extract raw cause & errors
        const rawCause = obj.cause;
        const rawErrors = obj.errors;

        // Copy metadata keys
        const metadataKeys = extractMetaData(obj, opts);

        // Determine if we should create AggregateError
        let error: DynamicError;
        if (name === 'AggregateError' || Array.isArray(rawErrors)) {
            error = normalizeAggregateError(rawErrors, message, opts, depth, seen);
        } else if (opts.enableSubclassing && isFunction((globalThis as Dictionary)[name])) {
            error = normalizeSubclassError(name, message, rawCause, opts, depth, seen);
        } else {
            error = normalizeCauseError(rawCause, message, opts, depth, seen);
        }

        // Set name
        error.name = name;

        // Override stack if requested
        if (opts.originalStack) {
            error.stack = opts.originalStack;
        }

        // Attach metadata
        attachMetaData(error, obj, metadataKeys, opts, depth, seen);

        // Attach cause if native not used
        attachCause(error, opts, depth, seen, rawCause);

        // Attach errors map if object shape
        attachErrorsToObject(error, opts, depth, seen, rawErrors);

        // Ensure toString & inspect
        if (opts.patchToString) {
            overrideToString(error);
        }
        return error;
    }

    // Fallback
    return new Error(String(input)) as DynamicError;
}

function normalizeExistingError(err: DynamicError, opts: Required<NormalizeOptionsInternal>, depth: number, seen: WeakSet<object>): DynamicError {
    // Coerce message
    if (!isString(err.message)) {
        err.message = String(err.message || '');
    }
    err.name = err.name || 'Error';
    // Preserve original stack
    if (opts.originalStack) {
        err.stack = opts.originalStack;
    }
    // Recursively normalize cause
    normalizeErrorWithCause(err, opts, depth, seen);

    // Recursively normalize errors
    normalizeErrorWithErrors(err, opts, depth, seen);
    if (opts.patchToString) {
        overrideToString(err);
    }
    return err;
}

function normalizeErrorWithCause(err: DynamicError, opts: Required<NormalizeOptionsInternal>, depth: number, seen: WeakSet<object>): DynamicError {
    if (isErrWithUnkCause(err)) {
        if (isObject(err.cause) && seen.has(err.cause as object)) {
            err.cause = new Error('<Circular>');
        } else {
            const c = (err as ErrWithUnkCause).cause;
            err.cause = isError(c) ? normalizeExistingError(c, opts, depth + 1, seen) : _normalize(c, opts, depth + 1, seen);
        }
    }
    return err;
}

function normalizeErrorWithErrors(err: DynamicError, opts: Required<NormalizeOptionsInternal>, depth: number, seen: WeakSet<object>): DynamicError {
    if (isErrWithErrorsArr(err)) {
        err.errors = err.errors.map((e: unknown) => (isError(e) ? normalizeExistingError(e, opts, depth + 1, seen) : _normalize(e, opts, depth + 1, seen)));
    } else if (isErrWithErrorsObj(err)) {
        const raw = err.errors as ErrorRecord;
        const normalized: ErrorRecord = {};
        for (const [k, v] of Object.entries(raw)) {
            normalized[k] = isError(v) ? normalizeExistingError(v, opts, depth + 1, seen) : _normalize(v, opts, depth + 1, seen);
        }
        err.errors = normalized;
    }
    return err;
}

function normalizeAggregateError(
    rawErrors: unknown,
    message: string,
    opts: Required<NormalizeOptionsInternal>,
    depth: number,
    seen: WeakSet<object>
): DynamicError {
    let error: DynamicError;
    // Normalize errors array1
    const errsArray = isArray(rawErrors) ? rawErrors.map(e => _normalize(e, opts, depth + 1, seen)) : [];
    if (HAS_AGGREGATE_ERROR && opts.useAggregateError) {
        // @ts-expect-error AggregateError may not be a supported depending on the environment
        error = new AggregateError(errsArray, message);
    } else {
        // Fallback to Error if AggregateError is not supported
        error = new Error(message) as DynamicError;
        error.errors = errsArray;
    }
    return error;
}

function normalizeSubclassError(
    name: string,
    message: string,
    rawCause: unknown,
    opts: Required<NormalizeOptionsInternal>,
    depth: number,
    seen: WeakSet<object>
): DynamicError {
    try {
        // Attempt to use the global constructor if available
        const Ctor = (globalThis as Dictionary)[name] as new (msg: string) => DynamicError;
        const error = new Ctor(message);
        error.name = name;
        return error;
    } catch {
        // Fallback to standard Error
        return normalizeCauseError(rawCause, message, opts, depth, seen);
    }
}

function normalizeCauseError(rawCause: unknown, message: string, opts: Required<NormalizeOptionsInternal>, depth: number, seen: WeakSet<object>): DynamicError {
    let error: DynamicError;
    // Use native cause support when available
    if (!isUndefined(rawCause) && HAS_ERROR_OPTIONS) {
        const causeErr = isError(rawCause) ? normalizeExistingError(rawCause, opts, depth + 1, seen) : _normalize(rawCause, opts, depth + 1, seen);
        // @ts-expect-error cause may not be a supported property depending on the environment
        error = new Error(message, {cause: causeErr}) as DynamicError;
    } else {
        error = new Error(message) as DynamicError;
    }
    return error;
}

function attachMetaData(
    error: DynamicError,
    source: ErrorRecord,
    metadataKeys: (string | symbol)[],
    opts: Required<NormalizeOptionsInternal>,
    depth: number,
    seen: WeakSet<object>
): void {
    // Attach metadata
    for (const key of metadataKeys) {
        try {
            // noinspection UnnecessaryLocalVariableJS
            let value = source[key as keyof typeof source];
            if (isObject(value) && seen.has(value)) {
                value = '<Circular>';
            }
            if (isError(value)) {
                value = normalizeExistingError(value, opts, depth + 1, seen);
            }
            error[key] = value;
        } /* node:coverage ignore next 2 */ catch {
            /* ignore */
        }
    }
}

function attachCause(error: DynamicError, opts: Required<NormalizeOptionsInternal>, depth: number, seen: WeakSet<object>, cause?: unknown) {
    if (isUndefined(cause) || (HAS_ERROR_OPTIONS && opts.useCauseError)) {
        return;
    }
    const causeErr = isError(cause) ? normalizeExistingError(cause, opts, depth + 1, seen) : _normalize(cause, opts, depth + 1, seen);
    try {
        (error as ErrWithUnkCause).cause = causeErr;
    } /* node:coverage ignore next 2 */ catch {
        /* ignore as maybe read-only */
    }
}

function attachErrorsToObject(error: DynamicError, opts: Required<NormalizeOptionsInternal>, depth: number, seen: WeakSet<object>, rawErrors: unknown) {
    if (isNonNullObject(rawErrors) && !isArray(rawErrors)) {
        const normalized: ErrorRecord = {};
        for (const [k, v] of Object.entries(rawErrors as ErrorRecord)) {
            normalized[k] = isError(v) ? normalizeExistingError(v, opts, depth + 1, seen) : _normalize(v, opts, depth + 1, seen);
        }
        try {
            (error as ErrWithUnkErrors).errors = normalized;
        } /* node:coverage ignore next 2 */ catch {
            /* ignore as maybe read-only */
        }
    }
}

function overrideToString(error: DynamicError) {
    try {
        Object.defineProperty(error, 'toString', {
            value(): string {
                return util.inspect(this);
            },
            writable: true,
            configurable: true,
        });
    } /* node:coverage ignore next 2 */ catch {
        /* ignore as maybe read-only */
    }
}
