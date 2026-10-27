// A robust error normalizer with native cause support, AggregateError handling,
// stack preservation, metadata copying (including non-enumerable & symbols),
// depth-limited recursion, circular reference detection, and optional subclassing.

import { StdError } from './StdError';
import type { ErrorRecord, ErrorShape } from './types';
import { isArray, isErrorInstance, isErrorLike, isFunction, isInstanceOf, isObject, isPrimitive, isString, isSymbol } from './types';
import {
    addMarker,
    boundKeys,
    checkDepthLimit,
    copyPropertiesTo,
    CRITICAL_SECURITY_KEYS,
    freeKey,
    getCustomKeys,
    isMarkerKey,
    LIMIT_NAMES,
    type Limits,
    primitiveToError,
    safeGet,
    setLimit,
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

type NormalizeOptionsInternal = Limits;

// Backing values for the validated stderr.maxDepth / maxProperties / maxArrayLength accessors
const defaults: Limits = { maxDepth: MAX_DEPTH, maxProperties: MAX_PROPERTIES, maxArrayLength: MAX_ARRAY_LENGTH };

const normalizeProperty = (v: unknown, opts: NormalizeOptionsInternal, depth: number, tracker: VisitTracker): unknown =>
    !isPrimitive(v) ? normalizeUnknown(v, opts, depth + 1, tracker) : isSymbol(v) ? v.toString() : v;

const normalizeUnknown = (input: unknown, opts: NormalizeOptionsInternal, depth: number, tracker: VisitTracker): unknown => {
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

const normalizeObject = (input: object, opts: NormalizeOptionsInternal, depth: number, tracker: VisitTracker): unknown => {
    if (isArray(input)) {
        // For arrays, just return the bounded slice - truncation metadata added by caller if needed
        return input.slice(0, opts.maxArrayLength).map(e => normalizeUnknown(e, opts, depth + 1, tracker));
    }

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
    /* node:coverage ignore next 2 - should be unreachable */
    return unknownToString(input);
};

/** An error made up from a non-error value has no origin: drop the stack that points into this file. */
const withoutStack = <T extends Error>(e: T): T => {
    delete e.stack;
    return e;
};

const convertToErrorShape = (value: unknown, opts: NormalizeOptionsInternal, depth: number, tracker: VisitTracker): ErrorShape => {
    const normalized = normalizeUnknown(value, opts, depth + 1, tracker);
    if (isErrorInstance(normalized)) return normalized as ErrorShape;
    if (isPrimitive(normalized)) return withoutStack(primitiveToError(normalized));
    // An array in an error slot is a list of errors, as for stderr([...])
    if (isArray(normalized)) return aggregateToError(normalized, opts, depth + 1, tracker);
    if (isInstanceOf(normalized, Date)) {
        return withoutStack(primitiveToError(Number.isNaN(normalized.getTime()) ? 'Invalid Date' : normalized.toISOString()));
    }
    if (isObject(normalized)) return normalizeObjectToError(normalized as ErrorRecord, opts, depth + 1, tracker);
    /* node:coverage ignore next - should be unreachable */
    return new StdError(unknownToString(value) ?? 'Unknown', { maxDepth: opts.maxDepth });
};

const aggregateToError = (errors: unknown[], opts: NormalizeOptionsInternal, depth: number, tracker: VisitTracker): ErrorShape =>
    normalizeObjectToError({ errors, name: 'AggregateError', message: 'AggregateError' }, opts, depth, tracker);

const normalizeObjectToError = (input: ErrorRecord, opts: NormalizeOptionsInternal, depth: number, tracker: VisitTracker): ErrorShape => {
    const depthCheck = checkDepthLimit(depth, opts.maxDepth);
    /* node:coverage ignore next 1 - failsafe, will always be caught before this point */
    if (depthCheck) return new StdError(depthCheck, { maxDepth: opts.maxDepth });

    // Read every standard field through safeGet: a throwing getter must not abort normalization
    const cause = safeGet(input, 'cause');
    const errors = safeGet(input, 'errors');
    const name = safeGet(input, 'name');
    const message = safeGet(input, 'message');
    const stack = safeGet(input, 'stack');

    // Only undefined/null mean "no cause": 0, '' and false are real values
    const normalizedCause = cause !== undefined && cause !== null ? convertToErrorShape(cause, opts, depth, tracker) : undefined;

    let normalizedErrors: ErrorShape[] | ErrorRecord | undefined;
    let isSingleErrorAggregate = false;
    let truncationInfo: string | undefined;

    // Only undefined/null mean "no errors", as for cause
    if (errors !== undefined && errors !== null) {
        // A Set of errors is a list, like an array
        const errorList = isInstanceOf(errors, Set) ? Array.from(errors.values()) : isArray(errors) ? errors : undefined;
        if (isInstanceOf(errors, Map)) {
            // Map of errors keyed by field: same output as a plain-object map
            const normObj: ErrorRecord = {};
            const entries = Array.from(errors.entries());
            for (const [key, value] of entries.slice(0, opts.maxProperties)) {
                const keyStr = unknownToString(key);
                // Same keys as a plain-object map drops: `normObj['__proto__'] = ...` would replace its prototype
                if (CRITICAL_SECURITY_KEYS.has(keyStr) || LEGACY_LEAK_KEYS.has(keyStr)) continue;
                normObj[freeKey(normObj, keyStr)] = convertToErrorShape(value, opts, depth, tracker);
            }
            if (entries.length > opts.maxProperties) {
                addMarker(
                    normObj,
                    '_truncated',
                    `Property count (${entries.length}) exceeds limit (${opts.maxProperties}), showing first ${opts.maxProperties}`
                );
            }
            normalizedErrors = normObj;
        } else if (errorList) {
            const originalLength = errorList.length;
            const bounded = errorList.slice(0, opts.maxArrayLength);
            normalizedErrors = bounded.map(e => convertToErrorShape(e, opts, depth, tracker));

            // Track truncation info
            if (originalLength > opts.maxArrayLength) {
                truncationInfo = `Array length (${originalLength}) exceeds limit (${opts.maxArrayLength}), showing first ${opts.maxArrayLength}`;
            }
        } else if (isObject(errors) && !isErrorLike(errors)) {
            // Map of errors keyed by field. isErrorLike, not isErrorShaped: a field called `name` or `message`
            // ({ name: 'required', email: 'invalid' }) does not make the map an error.
            const errObj = errors as ErrorRecord;
            const normObj: ErrorRecord = {};
            const { keys, truncated } = boundKeys(getCustomKeys(errObj, { includeNonEnumerable: true, excludeKeys: new Set() }), opts.maxProperties);

            for (const key of keys) {
                const value = safeGet(errObj, key);
                // A carried-over truncation marker stays a string
                normObj[key.toString()] = isMarkerKey(key) && isString(value) ? value : convertToErrorShape(value, opts, depth, tracker);
            }

            if (truncated) addMarker(normObj, '_truncated', truncated);
            normalizedErrors = normObj;
        } else {
            // Single error treated as aggregate (Error instance or other object)
            isSingleErrorAggregate = true;
            normalizedErrors = [convertToErrorShape(errors, opts, depth, tracker)];
        }
    }

    const finalName = name ? unknownToString(name) : isSingleErrorAggregate ? 'AggregateError' : 'Error';

    // A single non-array `errors` value only supplies a default; it never replaces the input's own message
    let finalMessage = isSingleErrorAggregate ? 'AggregateError' : '';
    if (message !== undefined && message !== null) {
        finalMessage = isObject(message) ? unknownToString(normalizeUnknown(message, opts, depth + 1, tracker)) : unknownToString(message);
    }

    const e = new StdError(finalMessage, {
        name: finalName,
        maxDepth: opts.maxDepth,
        maxProperties: opts.maxProperties,
        maxArrayLength: opts.maxArrayLength,
        cause: normalizedCause,
        errors: normalizedErrors,
    });

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
    if (truncationInfo) addMarker(e, '_truncated', truncationInfo);

    return e;
};

/**
 * Normalize any input into a StdError instance.
 * Never throws: an input that cannot be read at all (e.g. a revoked Proxy) becomes a placeholder StdError.
 * @param input - Input to normalize
 * @param options - Normalization options
 * @returns Normalized StdError instance
 */
const stderr = (input: unknown, options: NormalizeOptions = {}): StdError => {
    validateLimits(options);

    // Resolve per-field with ??, not a spread: `{...options}` copies an explicit
    // `undefined` over the default, which would leave the recursion limits unset.
    const opts: NormalizeOptionsInternal = {
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
};

const normalizeRoot = (input: unknown, opts: NormalizeOptionsInternal, tracker: VisitTracker): StdError => {
    if (isPrimitive(input)) return withoutStack(primitiveToError(input));

    tracker.hold(input as object);
    if (isFunction(input)) return withoutStack(primitiveToError(unknownToString(input)));
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
