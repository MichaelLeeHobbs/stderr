// src/normalizeErrorV2.ts
// A robust error normalizer with native cause support, AggregateError handling,
// stack preservation, metadata copying (including non-enumerable & symbols),
// depth-limited recursion, circular reference detection, and optional subclassing.

import {Dictionary, ErrorRecord, ErrorShape, InspectOptions, isArray, isError, isErrorLike, isFunction, isObject, isPrimitive, isSymbol,} from './types';
import {extractMetaData, supportsAggregateError, supportsErrorOptions} from './libs';
import * as console from 'node:console';
import {primitiveToError, unknownToString} from './utils';

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
    // console.log('normalizeMetaData', {target, source, opts, depth, seen}); // Keep for debugging if needed
    const metadataKeys = extractMetaData(source, opts);
    for (const key of metadataKeys) {
        try {
            const keyStr = key.toString();
            console.log('normalizeMetaData key', {key, keyStr}); // Keep for debugging if needed
            // Avoid reprocessing standard properties that normalizeObjectToError already handled
            if (keyStr === 'name' || keyStr === 'message' || keyStr === 'stack' || keyStr === 'cause' || keyStr === 'errors') {
                continue;
            }

            let value = source[key as keyof typeof source];

            // Use normalizeUnknown for any non-primitive value.
            // It handles depth checks, circular refs, and delegates normalization (like to normalizeObjectToError).
            if (!isPrimitive(value)) {
                // Pass depth + 1 as we are descending into a property
                value = normalizeUnknown(value, opts, depth + 1, seen);
            } else if (isSymbol(value)) {
                value = value.toString();
            }

            // Assign if value is not undefined (e.g., wasn't a skipped symbol)
            if (value !== undefined) {
                target[keyStr] = value;
            }
        } /* node:coverage ignore next 2 */ catch {
            // TODO: someway to debug - we shouldn't end up here but who knows
        }
    }
    return target;
};

// We don't want to force the error shape on purely unknown objects
normalizeUnknown = (input: unknown, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): unknown => {
    // 1. Handle depth limit first
    if (depth >= opts.maxDepth) {
        // Return a placeholder string instead of an Error for max depth reached within unknown structures
        return `<Max depth of ${depth} reached>`;
    }

    // 2. Handle primitives (including symbols based on options)
    if (isPrimitive(input)) {
        if (isSymbol(input)) {
            // Return string representation if included, otherwise undefined to signal skipping
            return input.toString();
        }
        return input; // Other primitives pass through
    }

    // 3. Handle circular references for objects/arrays
    // Check *before* adding to seen set
    if (seen.has(input)) {
        return '<Circular>'; // Use placeholder string for circular refs in unknown structures
    }
    // Add to seen set *before* processing/recursing
    seen.add(input);

    // 4. Handle specific object types
    if (isArray(input)) {
        // Recursively normalize array elements, passing depth + 1
        return input.map((e: unknown) => normalizeUnknown(e, opts, depth + 1, seen));
    }

    if (isErrorLike(input)) {
        // Delegate ErrorLike objects to normalizeObjectToError
        // Pass the *current* depth, as normalizeObjectToError handles its own internal depth checks/recursion
        return normalizeObjectToError(input, opts, depth, seen);
    }

    if (isObject(input)) {
        // Plain objects (not Errors, not Arrays)
        const obj = input as ErrorRecord;
        const normalized: ErrorRecord = {};
        // Use extractMetaData to respect includeNonEnumerable for plain objects too
        const keys = extractMetaData(obj, opts);
        for (const key of keys) {
            const keyStr = key.toString();

            let value = obj[key as keyof typeof obj];
            // Recursively normalize property values, passing depth + 1
            if (!isPrimitive(value)) {
                value = normalizeUnknown(value, opts, depth + 1, seen);
            } else if (isSymbol(value)) {
                value = value.toString();
            }

            if (value !== undefined) {
                normalized[keyStr] = value;
            }
        }
        return normalized;
    }

    // Fallback for unexpected types (should be rare after previous checks)
    /* node:coverage ignore next */
    return String(input);
};

normalizeObjectToError = (input: ErrorRecord, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape => {
    // Depth check (for cause/errors recursion within this function)
    // Note: The initial call's depth and circular check is handled by the caller (normalizeError or normalizeUnknown)
    if (depth >= opts.maxDepth) {
        // Return an actual Error instance when max depth is hit during Error normalization
        return new Error(`[Max depth of ${depth} reached]`) as ErrorShape;
    }

    // The caller (normalizeUnknown or normalizeError) is responsible for the seen check/add

    let shouldBeAggregateError = false;
    const errorShape: Partial<ErrorShape> = {}; // Use Partial initially

    // --- Normalize Cause ---
    if (input.cause) {
        // Use normalizeUnknown for cause - it handles primitives, errors, objects, depth, circular refs
        const normalizedCause = normalizeUnknown(input.cause, opts, depth + 1, seen);
        // Only attach cause if it normalized to an ErrorShape (normalizeUnknown calls normalizeObjectToError for ErrorLike)
        // Primitives or plain objects in cause become Errors via normalizeUnknown->normalizeObjectToError or normalizePrimitiveToError path
        if (isErrorLike(normalizedCause)) {
            errorShape.cause = normalizedCause as ErrorShape;
        } else if (isPrimitive(normalizedCause)) {
            errorShape.cause = primitiveToError(normalizedCause);
        } else if (isObject(normalizedCause)) {
            // If cause was an object but not ErrorLike, normalize it to ErrorShape
            errorShape.cause = normalizeObjectToError(normalizedCause as ErrorRecord, opts, depth + 1, seen);
        }
    }

    // --- Normalize Errors (for AggregateError) ---
    if (isArray(input.errors)) {
        shouldBeAggregateError = true;
        errorShape.name = unknownToString(input.name) || 'AggregateError'; // Preserve original name if possible
        errorShape.message = unknownToString(input.message) || 'AggregateError'; // Preserve original message
        // Normalize each item in the errors array
        errorShape.errors = input.errors
            .map((e: unknown) => normalizeUnknown(e, opts, depth + 1, seen))
            // Filter out undefined results (e.g. skipped symbols) and wrap non-errors
            .map(ne => {
                if (isErrorLike(ne)) {
                    return ne as ErrorShape;
                }
                if (isPrimitive(ne)) {
                    return primitiveToError(ne);
                }
                if (isObject(ne)) {
                    return normalizeObjectToError(ne as ErrorRecord, opts, depth + 1, seen);
                }
                return null; // Mark for filtering
            })
            .filter(ne => ne !== null) as ErrorShape[]; // Ensure it's ErrorShape[]
    } else if (isObject(input.errors)) {
        // Handle object map of errors (non-standard but seen)
        // Don't automatically assume AggregateError for object map, keep original name/message if present
        errorShape.name = unknownToString(errorShape.name) || 'Error';
        errorShape.message = unknownToString(errorShape.message) || '';
        const normalizedErrors: ErrorRecord = {};
        const errorKeys = extractMetaData(input.errors, opts); // Respect options for keys
        for (const key of errorKeys) {
            const keyStr = key.toString();

            const value = input.errors[key as keyof typeof input.errors];
            const normalizedValue = normalizeUnknown(value, opts, depth + 1, seen);

            if (isErrorLike(normalizedValue)) {
                normalizedErrors[keyStr] = normalizedValue as ErrorShape;
            } else if (isPrimitive(normalizedValue)) {
                // Wrap primitives in Error
                normalizedErrors[keyStr] = primitiveToError(normalizedValue);
            } else if (isObject(normalizedValue)) {
                // Normalize object errors
                normalizedErrors[keyStr] = normalizeObjectToError(normalizedValue as ErrorRecord, opts, depth + 1, seen);
            }
        }
        errorShape.errors = normalizedErrors; // Assign the object map
    } else if (input.errors) {
        // Handle single non-array/non-object error property (treat as single-item aggregate)
        shouldBeAggregateError = true;
        errorShape.name = unknownToString(input.name) || 'AggregateError';
        errorShape.message = unknownToString(input.message) || 'AggregateError';
        const normalizedSingleError = normalizeUnknown(input.errors, opts, depth + 1, seen);
        if (isErrorLike(normalizedSingleError)) {
            errorShape.errors = [normalizedSingleError as ErrorShape];
        } else if (normalizedSingleError !== null && normalizedSingleError !== undefined) {
            if (isPrimitive(normalizedSingleError)) {
                errorShape.errors = [primitiveToError(normalizedSingleError)];
            } else {
                errorShape.errors = [normalizeObjectToError(normalizedSingleError as ErrorRecord, opts, depth + 1, seen)];
            }
        } else {
            errorShape.errors = []; // Empty array if normalization failed
        }
    }

    // --- Determine Name and Message ---
    // Prioritize existing name/message, provide defaults if necessary
    errorShape.name = unknownToString(input.name || errorShape.name /* from errors handling */ || 'Error');
    if (input.message !== undefined && input.message !== null) {
        // Normalize message if it's an object, otherwise convert to string
        errorShape.message = isObject(input.message) ? unknownToString(normalizeUnknown(input.message, opts, depth + 1, seen)) : unknownToString(input.message);
    } else {
        // Use message derived from errors handling or fallback based on name/input
        errorShape.message = errorShape.message !== undefined ? unknownToString(errorShape.message) : '';
    }
    // Ensure name is not empty
    if (!errorShape.name) {
        errorShape.name = 'Error';
    }

    // --- Construct the Base Error Instance ---
    let e: ErrorShape;
    const Ctor = globalThis[errorShape.name as keyof typeof globalThis] as typeof Error | undefined;
    let nativeCauseUsed = false;

    if (opts.enableSubclassing && isFunction(Ctor) && Ctor.prototype instanceof Error) {
        try {
            // Attempt to construct using the subclass constructor
            e = new Ctor(errorShape.message) as ErrorShape;
            // Ensure name matches if constructor changes it
            e.name = errorShape.name;
        } catch {
            // Fallback if subclass constructor fails
            e = new Error(errorShape.message) as ErrorShape;
            e.name = errorShape.name; // Set name on fallback
        }
    } else if (shouldBeAggregateError && HAS_AGGREGATE_ERROR && opts.useAggregateError && isArray(errorShape.errors)) {
        // Use AggregateError if applicable and enabled
        // @ts-expect-error AggregateError may not be supported; errors array is validated above
        e = new AggregateError(errorShape.errors, errorShape.message) as ErrorShape;
        e.name = errorShape.name; // Ensure name is consistent
        nativeCauseUsed = true;
    } else if (HAS_ERROR_OPTIONS && opts.useCauseError && errorShape.cause) {
        // Use native cause if applicable and enabled
        // @ts-expect-error cause may not be supported
        e = new Error(errorShape.message, {cause: errorShape.cause}) as ErrorShape;
        e.name = errorShape.name;
    } else {
        // Default basic Error constructor
        e = new Error(errorShape.message) as ErrorShape;
        e.name = errorShape.name;
    }

    // --- Attach Properties to the Constructed Error ---

    // Attach cause if native cause wasn't used (and cause exists)
    if (errorShape.cause && (!nativeCauseUsed || !e.cause)) {
        e.cause = errorShape.cause;
    }

    // Attach errors if it exists (and wasn't handled by AggregateError constructor)
    // This handles the object map case and the fallback when useAggregateError is false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (errorShape.errors && !(e instanceof (globalThis as any).AggregateError && isArray(errorShape.errors))) {
        e.errors = errorShape.errors;
    }

    // --- Copy Metadata ---
    // Call normalizeMetaData to copy remaining properties from the original input object `source`
    // Pass the *current* depth, normalizeMetaData will increment for nested properties
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
        // For non-primitives (objects, arrays, functions, etc.)
        // Add to seen set *before* calling the main normalization
        if (seen.has(input)) {
            // Should not happen at top level unless input itself is weird
            /* node:coverage ignore next 2 */
            e = new Error('[Circular Input]') as ErrorShape;
        } else {
            seen.add(input);

            // If input is an Error and no originalStack provided, then preserve the original stack
            if (isError(input) && !opts.originalStack) {
                opts.originalStack = input.stack;
                console.warn('Preserve originalStack option, this may not be supported in all environments', opts.originalStack);
            }

            // Delegate based on type
            if (isFunction(input)) {
                // Treat functions like primitives (convert to string)
                e = primitiveToError(input.toString());
            } else if (isArray(input)) {
                // Treat array input as a request for an AggregateError
                e = normalizeObjectToError({errors: input, name: 'AggregateError', message: 'AggregateError'}, opts, depth, seen);
            } else if (isObject(input)) {
                // Main path for objects (including Error instances)
                e = normalizeObjectToError(input as ErrorRecord, opts, depth, seen);
                /* node:coverage ignore next 4 */
            } else {
                // Fallback for other unexpected non-primitive types
                e = primitiveToError(String(input));
            }
        }
    }

    // Apply originalStack if provided
    if (opts.originalStack) {
        e.stack = opts.originalStack;
    }

    // Apply toString override if requested
    if (opts.patchToString) {
        overrideToString(e);
    }

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
    if (typeof nodeInspect === 'function') {
        try {
            Object.defineProperty(error, 'toString', {
                value(): string {
                    // Use inspect with controlled depth. Note: maxDepth here refers to *inspection* depth,
                    // not the normalization depth limit already applied. Use a reasonable depth for inspection.
                    return nodeInspect!(this, {depth: normalizeError.maxDepth, compact: false, breakLength: Infinity});
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
