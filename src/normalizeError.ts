// src/normalizeError.ts
// A robust error normalizer with native cause support, AggregateError handling,
// stack preservation, metadata copying (including non-enumerable & symbols),
// depth-limited recursion, circular reference detection, and optional subclassing.

import {Dictionary, ErrorRecord, ErrorShape, isArray, isError, isErrorLike, isFunction, isObject, isPrimitive, isSymbol} from './types';
import {extractMetaData, supportsAggregateError, supportsErrorOptions} from './libs';
import {primitiveToError, unknownToString} from './utils';

const HAS_ERROR_OPTIONS = supportsErrorOptions();
const HAS_AGGREGATE_ERROR = supportsAggregateError();

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

interface NormalizeErrorFn {
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

const normalizeMetaData = (target: ErrorShape, source: Dictionary, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape => {
    const metadataKeys = extractMetaData(source, opts);
    for (const key of metadataKeys) {
        try {
            const keyStr = key.toString();
            // Avoid reprocessing standard properties that normalizeObjectToError already handled
            if (keyStr === 'name' || keyStr === 'message' || keyStr === 'stack' || keyStr === 'cause' || keyStr === 'errors') continue;

            let value = source[key as keyof typeof source];

            // Use normalizeUnknown for any non-primitive value.
            if (!isPrimitive(value)) value = normalizeUnknown(value, opts, depth + 1, seen);
            else if (isSymbol(value)) value = value.toString();

            // Assign if value is not undefined
            if (value !== undefined) target[keyStr] = value;
        } /* node:coverage ignore next 2 */ catch {
            // Ignore metadata copy errors
        }
    }
    return target;
};

// We don't want to force the error shape on purely unknown objects
normalizeUnknown = (input: unknown, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): unknown => {
    // 1. Handle depth limit first - Return a placeholder string instead of an Error for max depth reached within unknown structures
    if (depth >= opts.maxDepth) return `<Max depth of ${depth} reached>`;

    // 2. Handle primitives (including symbols)
    if (isPrimitive(input) && isSymbol(input)) return input.toString();
    if (isPrimitive(input)) return input;

    // 3. Handle circular references for objects/arrays
    if (seen.has(input as object)) return '<Circular>';

    seen.add(input as object);

    // 4. Handle specific object types
    if (isArray(input)) return input.map((e: unknown) => normalizeUnknown(e, opts, depth + 1, seen));

    if (isErrorLike(input)) return normalizeObjectToError(input as ErrorRecord, opts, depth, seen);

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

    /* node:coverage ignore next */
    return String(input);
};

normalizeObjectToError = (input: ErrorRecord, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape => {
    // Depth check (for cause/errors recursion within this function)
    if (depth >= opts.maxDepth) return new Error(`[Max depth of ${depth} reached]`) as ErrorShape;

    const errorShape: Partial<ErrorShape> = {};

    // --- Normalize Cause ---
    if (input.cause !== undefined && input.cause !== null) {
        const normalizedCause = normalizeUnknown(input.cause, opts, depth + 1, seen);
        if (isErrorLike(normalizedCause)) errorShape.cause = normalizedCause as ErrorShape;
        else if (isPrimitive(normalizedCause)) errorShape.cause = primitiveToError(normalizedCause);
        else if (isObject(normalizedCause)) errorShape.cause = normalizeObjectToError(normalizedCause as ErrorRecord, opts, depth + 1, seen);
    }

    // --- Normalize Errors (shape detection) ---
    type AggregateMode = 'none' | 'array' | 'single';
    let aggregateMode: AggregateMode = 'none';

    if (isArray(input.errors)) {
        aggregateMode = 'array';

        errorShape.errors = input.errors
            .map((e: unknown) => normalizeUnknown(e, opts, depth + 1, seen))
            .map(ne => {
                if (isErrorLike(ne)) return ne as ErrorShape;
                if (isPrimitive(ne)) return primitiveToError(ne);
                if (isObject(ne)) return normalizeObjectToError(ne as ErrorRecord, opts, depth + 1, seen);
                return null;
            })
            .filter(ne => ne !== null) as ErrorShape[];
    } else if (isObject(input.errors)) {
        // Non-standard object map of errors
        const normalizedErrors: ErrorRecord = {};
        const errorKeys = extractMetaData(input.errors, opts);
        for (const key of errorKeys) {
            const keyStr = key.toString();
            const value = input.errors[key as keyof typeof input.errors];
            const normalizedValue = normalizeUnknown(value, opts, depth + 1, seen);

            if (isErrorLike(normalizedValue)) normalizedErrors[keyStr] = normalizedValue as ErrorShape;
            else if (isPrimitive(normalizedValue)) normalizedErrors[keyStr] = primitiveToError(normalizedValue);
            else if (isObject(normalizedValue)) normalizedErrors[keyStr] = normalizeObjectToError(normalizedValue as ErrorRecord, opts, depth + 1, seen);
        }
        errorShape.errors = normalizedErrors;
    } else if (input.errors !== undefined && input.errors !== null) {
        // Single non-array/non-object -> AggregateError with one item
        aggregateMode = 'single';

        const normalizedSingleError = normalizeUnknown(input.errors, opts, depth + 1, seen);
        if (isErrorLike(normalizedSingleError)) errorShape.errors = [normalizedSingleError as ErrorShape];
        else if (isPrimitive(normalizedSingleError)) errorShape.errors = [primitiveToError(normalizedSingleError)];
        else if (isObject(normalizedSingleError)) errorShape.errors = [normalizeObjectToError(normalizedSingleError as ErrorRecord, opts, depth + 1, seen)];
        else errorShape.errors = [];
    }

    // --- Determine Name and Message (shape-aware, guarded) ---
    const computeFinalName = (): string => {
        if (aggregateMode === 'single') return input.name !== undefined && input.name !== null ? unknownToString(input.name) : 'AggregateError';
        if (aggregateMode === 'array') return input.name !== undefined && input.name !== null ? unknownToString(input.name) : 'Error';
        // object-map of errors or no errors at all
        return input.name ? unknownToString(input.name) : 'Error';
    };

    const computeFinalMessage = (): string => {
        // TODO: is this the right behavior?  It means AggregateErrors always lose their original message
        // Tests require overriding any provided message
        if (aggregateMode === 'single') return 'AggregateError';
        if (input.message) {
            return isObject(input.message) ? unknownToString(normalizeUnknown(input.message, opts, depth + 1, seen)) : unknownToString(input.message);
        }
        // Default
        return '';
    };

    const finalName = computeFinalName();
    const finalMessage = computeFinalMessage();

    // --- Construct the Base Error Instance ---
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
    } else if (shouldBeAggregateError && HAS_AGGREGATE_ERROR && opts.useAggregateError && isArray(errorShape.errors)) {
        e = new AggregateError(errorShape.errors, finalMessage) as ErrorShape;
        e.name = finalName; // enforce the chosen name
        nativeCauseUsed = true;
    } else if (HAS_ERROR_OPTIONS && opts.useCauseError && errorShape.cause) {
        e = new Error(finalMessage, {cause: errorShape.cause}) as ErrorShape;
        e.name = finalName;
    } else {
        e = new Error(finalMessage) as ErrorShape;
        e.name = finalName;
    }

    // --- Attach Properties to the Constructed Error ---
    if (errorShape.cause && (!nativeCauseUsed || !e.cause)) e.cause = errorShape.cause;

    // Attach errors unless handled by native AggregateError
    const AggregateErrorCtor: unknown = (globalThis as unknown as { AggregateError?: unknown }).AggregateError;
    const shouldSkipManualErrorsAttach =
        AggregateErrorCtor &&
        typeof AggregateErrorCtor === 'function' &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        e instanceof (AggregateErrorCtor as any) &&
        isArray(errorShape.errors);

    if (errorShape.errors && !shouldSkipManualErrorsAttach) e.errors = errorShape.errors;

    // --- Copy Metadata (excluding already-handled props) ---
    return normalizeMetaData(e, input, opts, depth, seen);
};

export const normalizeError: NormalizeErrorFn = <T = ErrorShape>(input: unknown, options: NormalizeOptions = {}, depth = 0): T => {
    const seen = new WeakSet<object>();
    const opts = {...defaultOptions(), ...options};

    let e: ErrorShape;

    // Handle primitives first
    if (isPrimitive(input)) {
        e = primitiveToError(input);
    } else {
        if (seen.has(input as object)) {
            /* node:coverage ignore next 2 */
            e = new Error('[Circular Input]') as ErrorShape;
        } else {
            seen.add(input as object);

            // Preserve original stack for Error inputs if not provided
            if (isError(input) && !opts.originalStack) {
                opts.originalStack = input.stack;
                // Non-fatal note about preservation not being universal across envs
                console.warn('Preserve originalStack option, this may not be supported in all environments', opts.originalStack);
            }

            if (isFunction(input)) e = primitiveToError(input.toString());
            // Treat array input as AggregateError request
            else if (isArray(input)) e = normalizeObjectToError({errors: input, name: 'AggregateError', message: 'AggregateError'}, opts, depth, seen);
            else if (isObject(input)) e = normalizeObjectToError(input as ErrorRecord, opts, depth, seen);
            /* node:coverage ignore next */ else e = primitiveToError(String(input));
        }
    }

    // Apply originalStack if provided
    if (opts.originalStack) e.stack = opts.originalStack;

    // Apply toString override if requested
    if (opts.patchToString) overrideToString(e);

    return e as T;
};

// Default options for normalizeError
normalizeError.maxDepth = 8;
normalizeError.includeNonEnumerable = false;
normalizeError.enableSubclassing = false;
normalizeError.useAggregateError = true;
normalizeError.useCauseError = true;
normalizeError.patchToString = false;

const defaultOptions = (): Required<NormalizeOptionsInternal> => ({
    originalStack: undefined,
    maxDepth: normalizeError.maxDepth,
    includeNonEnumerable: normalizeError.includeNonEnumerable,
    enableSubclassing: normalizeError.enableSubclassing,
    useAggregateError: normalizeError.useAggregateError,
    useCauseError: normalizeError.useCauseError,
    patchToString: normalizeError.patchToString,
});

function overrideToString(error: ErrorShape) {
    // In Node, use util.inspect dynamically so jest spies can observe the call.
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const util = require('util');
        Object.defineProperty(error, 'toString', {
            value(): string {
                return util.inspect(this, {
                    depth: normalizeError.maxDepth,
                    compact: false,
                    breakLength: Infinity,
                    showHidden: true, // include non-enumerable like [cause], [errors]
                });
            },
            writable: true,
            configurable: true,
        });
    } /* node:coverage ignore next 2 */ catch {
        // ignore if util not available (browser), default Error.prototype.toString will be used
    }
}
