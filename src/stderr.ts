// A robust error normalizer with native cause support, AggregateError handling,
// stack preservation, metadata copying (including non-enumerable & symbols),
// depth-limited recursion, circular reference detection, and optional subclassing.

import { StdError } from './StdError';
import type { ErrorRecord, ErrorShape } from './types';
import { isArray, isErrorShaped, isFunction, isObject, isPrimitive, isSymbol } from './types';
import { checkDepthLimit, getCustomKeys, primitiveToError, unknownToString, copyPropertiesTo } from './utils';

const MAX_PROPERTIES = 1000;
const MAX_ARRAY_LENGTH = 10000;

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

let _maxDepth = 8;

const normalizeUnknown = (input: unknown, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): unknown => {
    if (checkDepthLimit(depth, opts.maxDepth)) return checkDepthLimit(depth, opts.maxDepth);
    if (isSymbol(input)) return input.toString();
    if (isPrimitive(input)) return input;

    if (seen.has(input as object)) return '[Circular]';
    seen.add(input as object);

    if (isArray(input)) {
        // For arrays, just return the bounded slice - truncation metadata added by caller if needed
        return input.slice(0, opts.maxArrayLength).map(e => normalizeUnknown(e, opts, depth + 1, seen));
    }

    if (isErrorShaped(input)) return normalizeObjectToError(input as ErrorRecord, opts, depth, seen);

    if (isObject(input)) {
        const normalized: ErrorRecord = {};
        copyPropertiesTo(input as object, normalized, {
            excludeKeys: new Set(),
            skipFunctions: true,
            convertSymbolKeys: true,
            maxProperties: opts.maxProperties,
            maxArrayLength: opts.maxArrayLength,
            normalizeValue: v => (!isPrimitive(v) ? normalizeUnknown(v, opts, depth + 1, seen) : isSymbol(v) ? v.toString() : v),
        });
        return normalized;
    }
    /* node:coverage ignore next 2 - should be unreachable */
    return unknownToString(input);
};

const convertToErrorShape = (value: unknown, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape => {
    const normalized = normalizeUnknown(value, opts, depth + 1, seen);
    if (isErrorShaped(normalized)) return normalized;
    if (isPrimitive(normalized)) return primitiveToError(normalized);
    if (isObject(normalized)) return normalizeObjectToError(normalized as ErrorRecord, opts, depth + 1, seen);
    /* node:coverage ignore next - should be unreachable */
    return new StdError(unknownToString(value) ?? 'Unknown', { maxDepth: opts.maxDepth });
};

const normalizeObjectToError = (input: ErrorRecord, opts: NormalizeOptionsInternal, depth: number, seen: WeakSet<object>): ErrorShape => {
    const depthCheck = checkDepthLimit(depth, opts.maxDepth);
    /* node:coverage ignore next 1 - failsafe, will always be caught before this point */
    if (depthCheck) return new StdError(depthCheck, { maxDepth: opts.maxDepth });

    const normalizedCause = input.cause ? convertToErrorShape(input.cause, opts, depth, seen) : undefined;

    let normalizedErrors: ErrorShape[] | ErrorRecord | undefined;
    let isSingleErrorAggregate = false;
    let truncationInfo: string | undefined;

    // Simplified errors handling
    if (input.errors) {
        if (isArray(input.errors)) {
            const originalLength = input.errors.length;
            const bounded = input.errors.slice(0, opts.maxArrayLength);
            normalizedErrors = bounded.map(e => convertToErrorShape(e, opts, depth, seen));

            // Track truncation info
            if (originalLength > opts.maxArrayLength) {
                truncationInfo = `Array length (${originalLength}) exceeds limit (${opts.maxArrayLength}), showing first ${opts.maxArrayLength}`;
            }
        } else if (isObject(input.errors) && !isErrorShaped(input.errors)) {
            // Map of errors
            const errObj = input.errors as ErrorRecord;
            const normObj: ErrorRecord = {};
            const allKeys = getCustomKeys(errObj, { includeNonEnumerable: true, excludeKeys: new Set() });
            const boundedKeys = allKeys.slice(0, opts.maxProperties);

            for (const key of boundedKeys) {
                normObj[key.toString()] = convertToErrorShape(errObj[key], opts, depth, seen);
            }

            // Add truncation marker if needed
            if (allKeys.length > opts.maxProperties) {
                normObj._truncated = `Property count (${allKeys.length}) exceeds limit (${opts.maxProperties}), showing first ${opts.maxProperties}`;
            }
            normalizedErrors = normObj;
        } else {
            // Single error treated as aggregate (Error instance or other object)
            isSingleErrorAggregate = true;
            normalizedErrors = [convertToErrorShape(input.errors, opts, depth, seen)];
        }
    }

    const finalName = input.name ? unknownToString(input.name) : isSingleErrorAggregate ? 'AggregateError' : 'Error';

    let finalMessage = '';
    if (isSingleErrorAggregate) {
        finalMessage = 'AggregateError';
    } else if (input.message !== undefined && input.message !== null) {
        finalMessage = isObject(input.message) ? unknownToString(normalizeUnknown(input.message, opts, depth + 1, seen)) : unknownToString(input.message);
    }

    const e = new StdError(finalMessage, {
        name: finalName,
        maxDepth: opts.maxDepth,
        cause: normalizedCause,
        errors: normalizedErrors,
    });

    // Add truncation info to the error itself if array was truncated
    if (truncationInfo) {
        e._truncated = truncationInfo;
    }

    copyPropertiesTo(input, e, {
        skipFunctions: true,
        convertSymbolKeys: true,
        maxProperties: opts.maxProperties,
        maxArrayLength: opts.maxArrayLength,
        normalizeValue: v => (!isPrimitive(v) ? normalizeUnknown(v, opts, depth + 1, seen) : isSymbol(v) ? v.toString() : v),
    });

    return e;
};

/**
 * Normalize any input into a StdError instance
 * @param input - Input to normalize
 * @param options - Normalization options
 * @returns Normalized StdError instance
 */
const stderr = (input: unknown, options: NormalizeOptions = {}): StdError => {
    validateOption('maxDepth', options.maxDepth, 1, 1000);
    validateOption('maxProperties', options.maxProperties, 1, 100000);
    validateOption('maxArrayLength', options.maxArrayLength, 1, 1000000);

    const opts: NormalizeOptionsInternal = {
        maxDepth: _maxDepth,
        maxProperties: MAX_PROPERTIES,
        maxArrayLength: MAX_ARRAY_LENGTH,
        ...options,
    };
    const seen = new WeakSet<object>();

    let e: ErrorShape;
    const originalStack = isErrorShaped(input) ? input.stack : undefined;

    if (isPrimitive(input)) {
        e = primitiveToError(input);
    } else {
        seen.add(input as object);
        if (isFunction(input)) {
            e = primitiveToError(unknownToString(input));
        } else if (isArray(input)) {
            e = normalizeObjectToError({ errors: input, name: 'AggregateError', message: 'AggregateError' }, opts, 0, seen);
        } else if (isObject(input)) {
            e = normalizeObjectToError(input as ErrorRecord, opts, 0, seen);
        } /* node:coverage ignore next 3 - impossible, but TypeScript doesn't know that */ else {
            throw new TypeError(`Cannot normalize value to StdError: ${typeof input}`);
        }
    }

    if (originalStack) e.stack = originalStack;
    return e as StdError;
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

export { stderr };
