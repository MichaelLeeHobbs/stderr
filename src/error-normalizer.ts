// error-normalizer.ts
// A robust error normalizer with native cause support, AggregateError handling,
// stack preservation, metadata copying (including non-enumerable & symbols),
// depth-limited recursion, circular reference detection, and optional subclassing.

import {
    DictionaryStringSymbol,
    ErrorRecord,
    ErrWithUnkCause,
    ErrWithUnkErrors,
    isError,
    isErrWithUnkCause,
    isErrWithErrorsArr,
    isErrWithErrorsObj,
    isObject,
    isPrimitive,
    isString,
} from './types';
import {extractMetaData, supportsAggregateError, supportsErrorOptions} from './libs';

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

export function standardizeError<T = Error>(input: unknown, options: NormalizeOptions = {originalStack: undefined}): T {
    const opts = {...defaultOptions, ...options};
    return _standardize(input, opts, 0, new WeakSet()) as T;
}

function _standardize(input: unknown, opts: Required<NormalizeOptionsInternal>, depth: number, seen: WeakSet<object>): Error {
    if (depth >= opts.maxDepth) {
        const e = new Error('Max depth reached');
        if (opts.patchToString) {
            overrideToString(e);
        }
        return e;
    }

    // 1. Already Error
    if (input instanceof Error) {
        seen.add(input);
        return normalizeExistingError(input, opts, depth, seen);
    }

    // 2. Primitive string
    if (isString(input)) {
        const e = new Error(input);
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
        const e = new Error(String(input));
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
            return new Error('<Circular>');
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
        let error: Error;
        if (name === 'AggregateError' || Array.isArray(rawErrors)) {
            error = normalizeAggregateError(rawErrors, message, opts, depth, seen);
        } else if (opts.enableSubclassing && typeof (globalThis as DictionaryStringSymbol)[name] === 'function') {
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
    return new Error(String(input));
}

function normalizeExistingError(err: Error, opts: Required<NormalizeOptionsInternal>, depth: number, seen: WeakSet<object>): Error {
    console.debug('Normalizing existing error', err.message, {err, opts});
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

function normalizeErrorWithCause(err: Error, opts: Required<NormalizeOptionsInternal>, depth: number, seen: WeakSet<object>): Error {
    if (isErrWithUnkCause(err)) {
        if (isObject((err as ErrWithUnkCause).cause) && seen.has(err.cause as object)) {
            (err as ErrWithUnkCause).cause = new Error('<Circular>');
        } else {
            const c = (err as ErrWithUnkCause).cause;
            (err as ErrWithUnkCause).cause = isError(c) ? normalizeExistingError(c, opts, depth + 1, seen) : _standardize(c, opts, depth + 1, seen);
        }
    }
    return err;
}

function normalizeErrorWithErrors(err: Error, opts: Required<NormalizeOptionsInternal>, depth: number, seen: WeakSet<object>): Error {
    if (isErrWithErrorsArr(err)) {
        err.errors = err.errors.map((e: unknown) => (isError(e) ? normalizeExistingError(e, opts, depth + 1, seen) : _standardize(e, opts, depth + 1, seen)));
    } else if (isErrWithErrorsObj(err)) {
        const raw = err.errors as Record<string, unknown>;
        const normalized: Record<string, Error> = {};
        for (const [k, v] of Object.entries(raw)) {
            normalized[k] = isError(v) ? normalizeExistingError(v, opts, depth + 1, seen) : _standardize(v, opts, depth + 1, seen);
        }
        err.errors = normalized;
    }
    return err;
}

function normalizeAggregateError(rawErrors: unknown, message: string, opts: Required<NormalizeOptionsInternal>, depth: number, seen: WeakSet<object>): Error {
    let error: Error;
    // Normalize errors array1
    const errsArray = Array.isArray(rawErrors) ? rawErrors.map(e => _standardize(e, opts, depth + 1, seen)) : [];
    if (HAS_AGGREGATE_ERROR && opts.useAggregateError) {
        // @ts-expect-error AggregateError may not be a supported depending on the environment
        error = new AggregateError(errsArray, message);
    } else {
        // Fallback to Error if AggregateError is not supported
        error = new Error(message);
        // @ts-expect-error errors may not be a supported property depending on the environment
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
): Error {
    try {
        // Attempt to use the global constructor if available
        const Ctor = (globalThis as DictionaryStringSymbol)[name] as new (msg: string) => Error;
        const error = new Ctor(message);
        error.name = name;
        return error;
    } catch {
        // Fallback to standard Error
        return normalizeCauseError(rawCause, message, opts, depth, seen);
    }
}

function normalizeCauseError(rawCause: unknown, message: string, opts: Required<NormalizeOptionsInternal>, depth: number, seen: WeakSet<object>): Error {
    let error: Error;
    // Use native cause support when available
    if (rawCause !== undefined && HAS_ERROR_OPTIONS) {
        const causeErr = isError(rawCause) ? normalizeExistingError(rawCause, opts, depth + 1, seen) : _standardize(rawCause, opts, depth + 1, seen);
        // @ts-expect-error cause may not be a supported property depending on the environment
        error = new Error(message, {cause: causeErr});
    } else {
        error = new Error(message);
    }
    return error;
}

function attachMetaData(
    error: Error,
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
            // @ts-expect-error metadata properties are not known
            error[key] = value;
        } /* node:coverage ignore next 2 */ catch {
            /* ignore */
        }
    }
}

function attachCause(error: Error, opts: Required<NormalizeOptionsInternal>, depth: number, seen: WeakSet<object>, cause?: unknown) {
    if (cause === undefined || (HAS_ERROR_OPTIONS && opts.useCauseError)) {
        return;
    }
    const causeErr = isError(cause) ? normalizeExistingError(cause, opts, depth + 1, seen) : _standardize(cause, opts, depth + 1, seen);
    try {
        (error as ErrWithUnkCause).cause = causeErr;
    } /* node:coverage ignore next 2 */ catch {
        /* ignore as maybe read-only */
    }
}

function attachErrorsToObject(error: Error, opts: Required<NormalizeOptionsInternal>, depth: number, seen: WeakSet<object>, rawErrors: unknown) {
    if (rawErrors && typeof rawErrors === 'object' && !Array.isArray(rawErrors)) {
        const normalized: Record<string, Error> = {};
        for (const [k, v] of Object.entries(rawErrors as Record<string, unknown>)) {
            normalized[k] = isError(v) ? normalizeExistingError(v, opts, depth + 1, seen) : _standardize(v, opts, depth + 1, seen);
        }
        try {
            (error as ErrWithUnkErrors).errors = normalized;
        } /* node:coverage ignore next 2 */ catch {
            /* ignore as maybe read-only */
        }
    }
}

function overrideToString(error: Error) {
    try {
        Object.defineProperty(error, 'toString', {
            value(): string {
                // Use stack if present
                if (isErrWithUnkCause(this)) {
                    const causePart = `  cause: ${this.cause}`;
                    return this.stack ? `${this.stack}\n${causePart}` : `${this.name}: ${this.message}\n${causePart}`;
                }
                return this.stack ?? `${this.name}: ${this.message}`;
            },
            writable: true,
            configurable: true,
        });
    } /* node:coverage ignore next 2 */ catch {
        /* ignore as maybe read-only */
    }
}
