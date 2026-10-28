// A robust error normalizer with native cause support, AggregateError handling,
// stack preservation, metadata copying (including non-enumerable & symbols),
// depth-limited recursion, circular reference detection, and optional subclassing.

import { StdError } from './StdError';
import type { ErrorRecord, ErrorShape, Primitive } from './types';
import { isArray, isErrorInstance, isErrorLike, isFunction, isInstanceOf, isObject, isPrimitive, isString, isSymbol } from './types';
import {
    addMarker,
    boundKeys,
    checkDepthLimit,
    copyPropertiesTo,
    CRITICAL_SECURITY_KEYS,
    formatDate,
    freeKey,
    getCustomKeys,
    isMarkerKey,
    LIMIT_NAMES,
    type Limits,
    primitiveToError,
    safeGet,
    setLimit,
    unbox,
    unknownToString,
    validateLimits,
    VisitTracker,
} from './utils';
import { LEGACY_LEAK_KEYS, MAX_ARRAY_LENGTH, MAX_DEPTH, MAX_PROPERTIES } from './constants';

export interface NormalizeOptions {
    maxDepth?: number;
    maxProperties?: number;
    maxArrayLength?: number;
}

// Backing values for the validated stderr.maxDepth / maxProperties / maxArrayLength accessors
const defaults: Limits = { maxDepth: MAX_DEPTH, maxProperties: MAX_PROPERTIES, maxArrayLength: MAX_ARRAY_LENGTH };

const normalizeProperty = (v: unknown, opts: Limits, depth: number, tracker: VisitTracker): unknown =>
    !isPrimitive(v) ? normalizeUnknown(v, opts, depth + 1, tracker) : isSymbol(v) ? v.toString() : v;

const normalizeUnknown = (input: unknown, opts: Limits, depth: number, tracker: VisitTracker): unknown => {
    const depthCheck = checkDepthLimit(depth, opts.maxDepth);
    if (depthCheck) return depthCheck;
    if (isSymbol(input)) return input.toString();
    if (isPrimitive(input)) return input;

    const marker = tracker.enter(input as object);
    if (marker) return marker;
    try {
        return normalizeObject(input as object, opts, depth, tracker);
    } finally {
        tracker.leave(input as object);
    }
};

const normalizeObject = (input: object, opts: Limits, depth: number, tracker: VisitTracker): unknown => {
    if (isArray(input)) {
        // For arrays, just return the bounded slice - truncation metadata added by caller if needed.
        // Items go through normalizeProperty, like object values: a primitive is kept at the depth limit.
        return input.slice(0, opts.maxArrayLength).map(e => normalizeProperty(e, opts, depth, tracker));
    }

    // new String('x') and the like: the value, not one property per character
    const boxed = unbox(input);
    if (boxed !== undefined) return isSymbol(boxed) ? boxed.toString() : boxed;

    // Built-ins whose state is not in own properties would otherwise collapse to {}
    if (isInstanceOf(input, Date)) return new Date(input.getTime());
    if (isInstanceOf(input, RegExp)) return input.toString();
    if (isInstanceOf(input, Map)) {
        const entries = Array.from(input.entries()).slice(0, opts.maxArrayLength);
        return new Map(entries.map(([k, v]) => [normalizeProperty(k, opts, depth, tracker), normalizeProperty(v, opts, depth, tracker)]));
    }
    if (isInstanceOf(input, Set)) {
        const values = Array.from(input.values()).slice(0, opts.maxArrayLength);
        return new Set(values.map(v => normalizeProperty(v, opts, depth, tracker)));
    }

    // Metadata uses the stricter isErrorLike: { name: 'bob' } is data, not an error
    if (isErrorLike(input)) return normalizeObjectToError(input as ErrorRecord, opts, depth, tracker);

    if (isObject(input)) {
        const normalized: ErrorRecord = {};
        copyPropertiesTo(input, normalized, {
            excludeKeys: new Set(),
            skipFunctions: true,
            convertSymbolKeys: true,
            maxProperties: opts.maxProperties,
            maxArrayLength: opts.maxArrayLength,
            normalizeValue: v => normalizeProperty(v, opts, depth, tracker),
        });
        return normalized;
    }
    // A function (e.g. an array element) becomes its tag
    return unknownToString(input);
};

/** An error made up from a non-error value has no origin: drop the stack that points into this file. */
const errorFromPrimitive = (value: Primitive): StdError => {
    const e = primitiveToError(value);
    delete e.stack;
    return e;
};

const convertToErrorShape = (value: unknown, opts: Limits, depth: number, tracker: VisitTracker): ErrorShape => {
    const normalized = normalizeUnknown(value, opts, depth + 1, tracker);
    if (isErrorInstance(normalized)) return normalized as ErrorShape;
    if (isPrimitive(normalized)) return errorFromPrimitive(normalized);
    // An array in an error slot is a list of errors, as for stderr([...])
    if (isArray(normalized)) return aggregateToError(normalized, opts, depth + 1, tracker);
    if (isInstanceOf(normalized, Date)) return errorFromPrimitive(formatDate(normalized));
    // Everything else normalizeUnknown returns is an object (Map, Set or plain)
    return normalizeObjectToError(normalized as ErrorRecord, opts, depth + 1, tracker);
};

const aggregateToError = (errors: unknown[], opts: Limits, depth: number, tracker: VisitTracker): ErrorShape =>
    normalizeObjectToError({ errors, name: 'AggregateError', message: 'AggregateError' }, opts, depth, tracker);

interface NormalizedErrors {
    errors: ErrorShape[] | ErrorRecord;
    /** A single non-list, non-map value was wrapped in an array, AggregateError style */
    single?: boolean;
    /** Array truncation message, added to the error after its properties are copied */
    truncated?: string;
}

/** Normalizes an `errors` field: a list (Array or Set), a map keyed by field (Map or plain object), or a single error. */
const normalizeErrors = (errors: unknown, opts: Limits, depth: number, tracker: VisitTracker): NormalizedErrors => {
    const toError = (value: unknown) => convertToErrorShape(value, opts, depth, tracker);

    if (isInstanceOf(errors, Map)) {
        const normObj: ErrorRecord = {};
        const entries = Array.from(errors.entries());
        for (const [key, value] of entries.slice(0, opts.maxProperties)) {
            const keyStr = unknownToString(key);
            // Same keys as a plain-object map drops: `normObj['__proto__'] = ...` would replace its prototype
            if (CRITICAL_SECURITY_KEYS.has(keyStr) || LEGACY_LEAK_KEYS.has(keyStr)) continue;
            normObj[freeKey(normObj, keyStr)] = toError(value);
        }
        if (entries.length > opts.maxProperties) {
            addMarker(normObj, '_truncated', `Property count (${entries.length}) exceeds limit (${opts.maxProperties}), showing first ${opts.maxProperties}`);
        }
        return { errors: normObj };
    }

    const list = isInstanceOf(errors, Set) ? Array.from(errors.values()) : isArray(errors) ? errors : undefined;
    if (list) {
        const truncated =
            list.length > opts.maxArrayLength
                ? `Array length (${list.length}) exceeds limit (${opts.maxArrayLength}), showing first ${opts.maxArrayLength}`
                : undefined;
        return { errors: list.slice(0, opts.maxArrayLength).map(toError), truncated };
    }

    // isErrorLike, not isErrorShaped: a field called `name` or `message` ({ name: 'required', email: 'invalid' })
    // does not make the map an error.
    if (isObject(errors) && !isErrorLike(errors)) {
        const normObj: ErrorRecord = {};
        const { keys, truncated } = boundKeys(getCustomKeys(errors, { includeNonEnumerable: true, excludeKeys: new Set() }), opts.maxProperties);
        for (const key of keys) {
            const value = safeGet(errors, key);
            // A carried-over truncation marker stays a string
            // Distinct symbols can share a description (Symbol('id') twice): keep both instead of overwriting
            const field = isSymbol(key) ? freeKey(normObj, key.toString()) : key;
            normObj[field] = isMarkerKey(key) && isString(value) ? value : toError(value);
        }
        if (truncated) addMarker(normObj, '_truncated', truncated);
        return { errors: normObj };
    }

    return { errors: [toError(errors)], single: true };
};

const normalizeObjectToError = (input: ErrorRecord, opts: Limits, depth: number, tracker: VisitTracker): ErrorShape => {
    const depthCheck = checkDepthLimit(depth, opts.maxDepth);
    /* node:coverage ignore next 1 - failsafe, will always be caught before this point */
    if (depthCheck) return new StdError(depthCheck, { maxDepth: opts.maxDepth });

    // Read every standard field through safeGet: a throwing getter must not abort normalization
    const cause = safeGet(input, 'cause');
    const errors = safeGet(input, 'errors');
    const name = safeGet(input, 'name');
    const message = safeGet(input, 'message');
    const stack = safeGet(input, 'stack');

    // Only undefined/null mean "no cause" or "no errors": 0, '' and false are real values
    const normalizedCause = cause !== undefined && cause !== null ? convertToErrorShape(cause, opts, depth, tracker) : undefined;
    const normalized = errors !== undefined && errors !== null ? normalizeErrors(errors, opts, depth, tracker) : undefined;

    // A single non-array `errors` value only supplies defaults; it never replaces the input's own name or message
    const defaultText = normalized?.single ? 'AggregateError' : undefined;
    const finalName = name ? unknownToString(name) : (defaultText ?? 'Error');
    let finalMessage = defaultText ?? '';
    if (message !== undefined && message !== null) {
        finalMessage = isObject(message) ? unknownToString(normalizeUnknown(message, opts, depth + 1, tracker)) : unknownToString(message);
    }

    const e = new StdError(finalMessage, { name: finalName, ...opts, cause: normalizedCause, errors: normalized?.errors });

    // Keep the original stack: a fresh one would point into this file instead of the error's origin.
    // No original stack means there is no origin to show; stderr() gives the root the caller's stack.
    if (isString(stack)) e.stack = stack;
    else delete e.stack;

    copyPropertiesTo(input, e, {
        skipFunctions: true,
        convertSymbolKeys: true,
        maxProperties: opts.maxProperties,
        maxArrayLength: opts.maxArrayLength,
        normalizeValue: v => normalizeProperty(v, opts, depth, tracker),
    });

    // Added after the copy so a user property named `_truncated` cannot overwrite it
    if (normalized?.truncated) addMarker(e, '_truncated', normalized.truncated);

    return e;
};

/** stderr() plus the global limits used when an option is not given. Invalid values throw TypeError/RangeError. */
interface Stderr {
    (input: unknown, options?: NormalizeOptions): StdError;
    /** Default 8, integer 1-1000 */
    maxDepth: number;
    /** Default 1000, integer 1-100000 */
    maxProperties: number;
    /** Default 10000, integer 1-1000000 */
    maxArrayLength: number;
}

/**
 * Normalize any input into a StdError instance.
 * Never throws: an input that cannot be read at all (e.g. a revoked Proxy) becomes a placeholder StdError.
 * @param input - Input to normalize
 * @param options - Normalization options
 * @returns Normalized StdError instance
 */
const stderr = ((input: unknown, options: NormalizeOptions = {}): StdError => {
    validateLimits(options);

    // Resolve per-field with ??, not a spread: `{...options}` copies an explicit
    // `undefined` over the default, which would leave the recursion limits unset.
    const opts: Limits = {
        maxDepth: options.maxDepth ?? defaults.maxDepth,
        maxProperties: options.maxProperties ?? defaults.maxProperties,
        maxArrayLength: options.maxArrayLength ?? defaults.maxArrayLength,
    };
    const tracker = new VisitTracker();

    let result: StdError;
    try {
        result = normalizeRoot(input, opts, tracker);
    } catch (err) {
        result = new StdError(`Unknown error (could not normalize value: ${unknownToString(err)})`, { maxDepth: opts.maxDepth });
    }
    // Input without a stack: point at the code that called stderr(), not into this library
    const ErrorCtor = Error as ErrorConstructor & { captureStackTrace?: (target: object, ctor?: unknown) => void };
    if (!isString(result.stack) && typeof ErrorCtor.captureStackTrace === 'function') ErrorCtor.captureStackTrace(result, stderr);
    return result;
}) as Stderr;

const normalizeRoot = (input: unknown, opts: Limits, tracker: VisitTracker): StdError => {
    if (isPrimitive(input)) return errorFromPrimitive(input);
    const boxed = unbox(input as object);
    if (boxed !== undefined) return errorFromPrimitive(boxed);
    // Built-ins whose value is not in own properties: their text, as for a Date or RegExp cause
    if (isInstanceOf(input, Date)) return errorFromPrimitive(formatDate(input));
    if (isInstanceOf(input, RegExp)) return errorFromPrimitive(input.toString());

    tracker.hold(input as object);
    if (isFunction(input)) return errorFromPrimitive(unknownToString(input));
    if (isArray(input)) return aggregateToError(input, opts, 0, tracker) as StdError;
    return normalizeObjectToError(input as ErrorRecord, opts, 0, tracker) as StdError;
};

for (const name of LIMIT_NAMES) {
    Object.defineProperty(stderr, name, {
        get: () => defaults[name],
        set: (value: number) => setLimit(defaults, name, value),
        enumerable: true,
        configurable: false,
    });
}

export { stderr };
