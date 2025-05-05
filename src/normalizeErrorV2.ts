// src/normalizeError.ts
// A robust error normalizer with native cause support, AggregateError handling,
// stack preservation, metadata copying (including non-enumerable & symbols),
// depth-limited recursion, circular reference detection, and optional subclassing.

import {Dictionary, ErrorRecord, ErrorShape, InspectOptions, isArray, isErrorLike, isFunction, isObject, isPrimitive, isString, isSymbol} from './types';
import {extractMetaData, supportsAggregateError, supportsErrorOptions} from './libs';

let nodeInspect: ((obj: unknown, options?: InspectOptions) => string) | undefined;
try {
    // only works in Node
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nodeInspect = require('util').inspect;
} /* node:coverage ignore next 2 */ catch {
    nodeInspect = undefined;
}

const HAS_ERROR_OPTIONS = supportsErrorOptions();
const HAS_AGGREGATE_ERROR = supportsAggregateError();

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
    maxDepth: number;
    includeNonEnumerable: boolean;
    includeSymbols: boolean;
    enableSubclassing: boolean;
    useAggregateError: boolean;
    useCauseError: boolean;
    patchToString: boolean;
}

interface NormalizeErrorFn {
    <T = ErrorShape>(input: unknown, options?: NormalizeOptions, depth?: number): T;

    maxDepth: number;
    includeNonEnumerable: boolean;
    includeSymbols: boolean;
    enableSubclassing: boolean;
    useAggregateError: boolean;
    useCauseError: boolean;
    patchToString: boolean;
}

const unknownToString = (input: unknown): string => {
    if (isString(input)) {
        return input;
    }
    // if (isArray(input)) {
    //     return input.map(unknownToString).join(', ');
    // }
    if (isPrimitive(input)) {
        return String(input);
    }
    if (isObject(input)) {
        try {
            return JSON.stringify(input);
        } catch {
            return Object.prototype.toString.call(input);
        }
    }
    return String(input);
};

const normalizeMetaData = (target: ErrorShape, source: Dictionary, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape => {
    // console.log('normalizeMetaData', {target, source, opts, depth, seen});
    // Now we attach the rest of the properties
    const metadataKeys = extractMetaData(source, opts);
    for (const key of metadataKeys) {
        try {
            let value = source[key as keyof typeof source];
            const keyStr = key.toString();
            if ((isSymbol(key) || isSymbol(value)) && !opts.includeSymbols) {
                continue;
            }
            if (isObject(value) && seen.has(value)) {
                value = '<Circular>';
            }
            if (isErrorLike(value)) {
                value = normalizeObjectToError(value, opts, depth + 1, seen);
            }
            if (isArray(value)) {
                value = value.map((e: unknown) => normalizeUnknown(e, opts, depth + 1, seen));
            }
            if (isObject(value)) {
                value = normalizeUnknown(value, opts, depth + 1, seen);
            }
            if (isSymbol(value)) {
                value = value.toString();
            }
            target[keyStr] = value;
        } /* node:coverage ignore next 2 */ catch {
            // TODO: someway to debug - we shouldn't end up here but who knows
        }
    }
    return target;
};

const normalizePrimitiveToError = (input: unknown): ErrorShape => {
    if (!isPrimitive(input)) {
        throw new TypeError('Input must be a primitive value');
    }

    if (input === undefined) {
        return new Error('Unknown error (Undefined)') as ErrorShape;
    }
    if (input === null) {
        return new Error('Unknown error (Null)') as ErrorShape;
    }
    return new Error(unknownToString(input)) as ErrorShape;
};

// We don't want to force the error shape on purely unknown objects
const normalizeUnknown = (input: unknown, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): unknown => {
    if (depth >= opts.maxDepth) {
        return `<Max depth of ${depth} reached>`;
    }
    if (isPrimitive(input)) {
        if (isSymbol(input) && !opts.includeSymbols) {
            return null;
        }
        return input;
    }
    if (seen.has(input)) {
        return '<Circular>';
    }

    if (isObject(input)) {
        seen.add(input);
    }
    if (isArray(input)) {
        return input.map((e: unknown) => normalizeUnknown(e, opts, depth + 1, seen));
    }
    // if is error like but not error shaped
    if (isErrorLike(input)) {
        return normalizeObjectToError(input, opts, depth + 1, seen);
    }
    if (isObject(input)) {
        const obj = input as ErrorRecord;
        const normalized: ErrorRecord = {};
        for (const [k, v] of Object.entries(obj)) {
            if ((isSymbol(k) || isSymbol(v)) && !opts.includeSymbols) {
                continue;
            }
            normalized[k] = normalizeUnknown(v, opts, depth + 1, seen);
        }
        return normalized;
    }
    // Fallback
    return String(input);
};

const normalizeObjectToError = (input: ErrorRecord, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape => {
    let shouldBeAggregateError = false;
    const errorShape: ErrorShape = {};
    if (depth >= opts.maxDepth) {
        return new Error(`[Max depth of ${depth} reached]`) as ErrorShape;
    }
    if (seen.has(input)) {
        return new Error('[Circular]') as ErrorShape;
    }
    seen.add(input);

    if (input.cause) {
        // We expect the cause to be an error
        errorShape.cause = normalizeUnknownToError(input.cause, opts, depth + 1, seen);
    }
    if (isArray(input.errors)) {
        shouldBeAggregateError = true;
        errorShape.name = 'AggregateError';
        errorShape.message = 'AggregateError';
        // We expect the errors to be an array of errors if errors is an array
        errorShape.errors = input.errors.map((e: unknown) => normalizeUnknownToError(e, opts, depth + 1, seen));
    } else if (isObject(input.errors)) {
        errorShape.name = 'AggregateError';
        errorShape.message = 'AggregateError';
        // We expect the errors to be an object of errors which isn't an AggregateError
        const normalized: ErrorRecord = {};
        for (const [k, v] of Object.entries(input.errors)) {
            if ((isSymbol(k) || isSymbol(v)) && !opts.includeSymbols) {
                continue;
            }
            const key = k.toString();
            normalized[key] = normalizeUnknownToError(v, opts, depth + 1, seen);
        }
        errorShape.errors = normalized;
    } else if (input.errors) {
        errorShape.name = 'AggregateError';
        errorShape.message = 'AggregateError';
        shouldBeAggregateError = true;
        // If we get here we will treat this is an AggregateError of 1 error
        errorShape.errors = [normalizeUnknownToError(input.errors, opts, depth + 1, seen)];
    }

    // TODO: I feel like we could do better here
    errorShape.name = unknownToString(input.name || errorShape.name || 'Error');
    if (input.message) {
        // @ts-expect-error not really sure what to do if we get a non-string here
        errorShape.message = isObject(input.message)
            ? normalizeUnknown(input.message || '', opts, depth + 1, seen)
            : unknownToString(input.message || errorShape.message || unknownToString(input));
    }

    // Start building the error
    let e: ErrorShape;
    if (opts.enableSubclassing && isFunction((globalThis as Dictionary)[errorShape.name])) {
        const maybeCtor = (globalThis as Dictionary)[errorShape.name];
        e = new Error(errorShape.message) as ErrorShape;

        if (isFunction(maybeCtor) && maybeCtor.prototype instanceof Error) {
            try {
                // @ts-expect-error unknown constructor has any type
                e = new maybeCtor(errorShape.message) as ErrorShape;
            } catch {
                // ignore errors in constructor
            }
        }
    } else if (shouldBeAggregateError && HAS_AGGREGATE_ERROR && opts.useAggregateError) {
        // @ts-expect-error AggregateError may not be a supported property depending on the environment
        e = new AggregateError(errorShape.errors, errorShape.message) as ErrorShape;
    } else if (HAS_ERROR_OPTIONS && opts.useCauseError && errorShape.cause) {
        // @ts-expect-error cause may not be a supported property depending on the environment
        e = new Error(errorShape.message, {cause: errorShape.cause}) as ErrorShape;
    } else {
        e = new Error(errorShape.message) as ErrorShape;
    }

    // Attach basic properties
    e.name = errorShape.name;
    // Dont attach the message if it is undefined
    if (errorShape.message) {
        e.message = errorShape.message;
    }

    // Attach cause if native not used
    if (!opts.useCauseError && errorShape.cause) {
        e.cause = errorShape.cause;
    }

    // Attach errors
    if (isObject(errorShape.errors)) {
        e.errors = errorShape.errors;
    }

    // Now we attach the rest of the properties.
    // Do not depth + 1 as normalizeMetaData will do that if needed
    return normalizeMetaData(e, input, opts, depth, seen);
};

// Is we get here we want an Error Shaped object back
const normalizeUnknownToError = (input: unknown, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape | null => {
    // Turn a primitive into an error
    if (isPrimitive(input)) {
        return normalizePrimitiveToError(input);
    }
    return normalizeObjectToError(input as ErrorRecord, opts, depth + 1, seen);
};

export const normalizeError: NormalizeErrorFn = <T = ErrorShape>(input: unknown, options: NormalizeOptions = {originalStack: undefined}, depth = 0): T => {
    const seen = new WeakSet<object>();
    const opts = {...defaultOptions(), ...options};
    let e = input as ErrorShape;
    if (isPrimitive(input)) {
        if (isSymbol(input) && !opts.includeSymbols) {
            throw new TypeError('Input is a symbol and includeSymbols is false');
        }
        e = normalizePrimitiveToError(input);
    } else if (isFunction(input)) {
        // If we get a function we want to treat it as a function
        e = normalizePrimitiveToError(input.toString());
    } else if (isArray(input)) {
        e = normalizeObjectToError({errors: input}, opts, depth, seen);
    } else {
        e = normalizeObjectToError(input as ErrorShape, opts, depth, seen);
    }
    if (opts.originalStack) {
        e.stack = opts.originalStack;
    }
    if (opts.patchToString) {
        overrideToString(e);
    }
    return e as T;
};

// Default options for normalizeError
normalizeError.maxDepth = 8;
normalizeError.includeNonEnumerable = false;
normalizeError.includeSymbols = false;
normalizeError.enableSubclassing = false;
normalizeError.useAggregateError = true;
normalizeError.useCauseError = true;
normalizeError.patchToString = false;

const defaultOptions = (): Required<NormalizeOptionsInternal> => ({
    originalStack: undefined,
    maxDepth: normalizeError.maxDepth,
    includeNonEnumerable: normalizeError.includeNonEnumerable,
    includeSymbols: normalizeError.includeSymbols,
    enableSubclassing: normalizeError.enableSubclassing,
    useAggregateError: normalizeError.useAggregateError,
    useCauseError: normalizeError.useCauseError,
    patchToString: normalizeError.patchToString,
});

function overrideToString(error: ErrorShape) {
    if (typeof nodeInspect === 'function') {
        try {
            Object.defineProperty(error, 'toString', {
                value(): string {
                    // in Node: use inspect for full object+metadata
                    return nodeInspect!(this, {depth: normalizeError.maxDepth, compact: false});
                },
                writable: true,
                configurable: true,
            });
        } /* node:coverage ignore next 2 */ catch {
            // ignore in case it’s read‑only
        }
    }
    // otherwise do nothing — browser will use Error.prototype.toString
}
