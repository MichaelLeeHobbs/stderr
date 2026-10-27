// A robust error normalizer with native cause support, AggregateError handling,
// stack preservation, metadata copying (including non-enumerable & symbols),
// depth-limited recursion, circular reference detection, and optional subclassing.

import { StdError } from './StdError';
import type { ErrorRecord, ErrorShape } from './types';
import { isArray, isErrorInstance, isErrorLike, isErrorShaped, isFunction, isInstanceOf, isObject, isPrimitive, isString, isSymbol } from './types';
import { addMarker, checkDepthLimit, copyPropertiesTo, getCustomKeys, primitiveToError, safeGet, unknownToString, VisitTracker } from './utils';
import { MAX_ARRAY_LENGTH, MAX_DEPTH, MAX_PROPERTIES } from './constants';

export interface NormalizeOptions {
    maxDepth?: number;
    maxProperties?: number;
    maxArrayLength?: number;
}

type NormalizeOptionsInternal = Required<NormalizeOptions>;

const validateOption = (name: string, value: number | undefined, min: number, max: number): void => {
    if (value === undefined) return;
    if (!Number.isInteger(value)) throw new TypeError(`${name} must be an integer, got: ${typeof value}`);
    if (value < min || value > max) throw new RangeError(`${name} must be between ${min} and ${max}, got: ${value}`);
};

let _maxDepth = MAX_DEPTH;
let _maxProperties = MAX_PROPERTIES;
let _maxArrayLength = MAX_ARRAY_LENGTH;

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

const convertToErrorShape = (value: unknown, opts: NormalizeOptionsInternal, depth: number, tracker: VisitTracker): ErrorShape => {
    const normalized = normalizeUnknown(value, opts, depth + 1, tracker);
    if (isErrorInstance(normalized)) return normalized as ErrorShape;
    if (isPrimitive(normalized)) return primitiveToError(normalized);
    if (isObject(normalized)) return normalizeObjectToError(normalized as ErrorRecord, opts, depth + 1, tracker);
    /* node:coverage ignore next - should be unreachable */
    return new StdError(unknownToString(value) ?? 'Unknown', { maxDepth: opts.maxDepth });
};

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

    // Simplified errors handling
    if (errors) {
        if (isArray(errors)) {
            const originalLength = errors.length;
            const bounded = errors.slice(0, opts.maxArrayLength);
            normalizedErrors = bounded.map(e => convertToErrorShape(e, opts, depth, tracker));

            // Track truncation info
            if (originalLength > opts.maxArrayLength) {
                truncationInfo = `Array length (${originalLength}) exceeds limit (${opts.maxArrayLength}), showing first ${opts.maxArrayLength}`;
            }
        } else if (isObject(errors) && !isErrorShaped(errors)) {
            // Map of errors
            const errObj = errors as ErrorRecord;
            const normObj: ErrorRecord = {};
            const allKeys = getCustomKeys(errObj, { includeNonEnumerable: true, excludeKeys: new Set() });
            const boundedKeys = allKeys.slice(0, opts.maxProperties);

            for (const key of boundedKeys) {
                normObj[key.toString()] = convertToErrorShape(safeGet(errObj, key), opts, depth, tracker);
            }

            // Add truncation marker if needed
            if (allKeys.length > opts.maxProperties) {
                addMarker(
                    normObj,
                    '_truncated',
                    `Property count (${allKeys.length}) exceeds limit (${opts.maxProperties}), showing first ${opts.maxProperties}`
                );
            }
            normalizedErrors = normObj;
        } else {
            // Single error treated as aggregate (Error instance or other object)
            isSingleErrorAggregate = true;
            normalizedErrors = [convertToErrorShape(errors, opts, depth, tracker)];
        }
    }

    const finalName = name ? unknownToString(name) : isSingleErrorAggregate ? 'AggregateError' : 'Error';

    let finalMessage = '';
    if (isSingleErrorAggregate) {
        finalMessage = 'AggregateError';
    } else if (message !== undefined && message !== null) {
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

    // Keep the original stack: a fresh one would point into this file instead of the error's origin
    if (isString(stack)) e.stack = stack;

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
    validateOption('maxDepth', options.maxDepth, 1, 1000);
    validateOption('maxProperties', options.maxProperties, 1, 100000);
    validateOption('maxArrayLength', options.maxArrayLength, 1, 1000000);

    // Resolve per-field with ??, not a spread: `{...options}` copies an explicit
    // `undefined` over the default, which would leave the recursion limits unset.
    const opts: NormalizeOptionsInternal = {
        maxDepth: options.maxDepth ?? _maxDepth,
        maxProperties: options.maxProperties ?? _maxProperties,
        maxArrayLength: options.maxArrayLength ?? _maxArrayLength,
    };
    const tracker = new VisitTracker();

    try {
        if (isPrimitive(input)) return primitiveToError(input);

        tracker.hold(input as object);
        if (isFunction(input)) return primitiveToError(unknownToString(input));
        if (isArray(input)) {
            return normalizeObjectToError({ errors: input, name: 'AggregateError', message: 'AggregateError' }, opts, 0, tracker) as StdError;
        }
        return normalizeObjectToError(input as ErrorRecord, opts, 0, tracker) as StdError;
    } catch (err) {
        return new StdError(`Unknown error (could not normalize value: ${unknownToString(err)})`, { maxDepth: opts.maxDepth });
    }
};

Object.defineProperty(stderr, 'maxDepth', {
    /* node:coverage ignore next */
    get: () => _maxDepth,
    /* node:coverage ignore next 4 */
    set: (value: number) => {
        validateOption('maxDepth', value, 1, 1000);
        _maxDepth = value;
    },
    enumerable: true,
    configurable: false,
});

Object.defineProperty(stderr, 'maxProperties', {
    /* node:coverage ignore next */
    get: () => _maxProperties,
    /* node:coverage ignore next 4 */
    set: (value: number) => {
        validateOption('maxProperties', value, 1, 100000);
        _maxProperties = value;
    },
    enumerable: true,
    configurable: false,
});

Object.defineProperty(stderr, 'maxArrayLength', {
    /* node:coverage ignore next */
    get: () => _maxArrayLength,
    /* node:coverage ignore next 4 */
    set: (value: number) => {
        validateOption('maxArrayLength', value, 1, 1000000);
        _maxArrayLength = value;
    },
    enumerable: true,
    configurable: false,
});

export { stderr };
