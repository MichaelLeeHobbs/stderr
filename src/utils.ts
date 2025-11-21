// src/utils.ts
import { StdError } from './StdError';
import { isErrorShaped, isObject, isPrimitive, isString, isSymbol, Primitive } from './types';

/**
 * Standard Error property keys that should be excluded when extracting custom properties
 */
export const STANDARD_ERROR_KEYS = new Set(['name', 'message', 'stack', 'cause', 'errors']);

/**
 * Options for extracting custom keys from objects
 */
export interface GetCustomKeysOptions {
    /** Include non-enumerable properties (default: false) */
    includeNonEnumerable?: boolean;
    /** Keys to exclude (default: STANDARD_ERROR_KEYS) */
    excludeKeys?: Set<string>;
}

/**
 * Gets custom property keys from an object, excluding standard error properties.
 * Handles both string and symbol keys, with optional non-enumerable support.
 *
 * @param obj - Object to extract keys from
 * @param options - Options for key extraction
 * @returns Array of string and symbol keys (excluding standard error keys)
 *
 * @example
 * ```typescript
 * const error = { name: 'Error', message: 'test', code: 'E_CUSTOM' };
 * const keys = getCustomKeys(error); // ['code'] - excludes name, message
 * ```
 */
export function getCustomKeys(obj: object, options: GetCustomKeysOptions = {}): (string | symbol)[] {
    const { includeNonEnumerable = false, excludeKeys = STANDARD_ERROR_KEYS } = options;

    if (includeNonEnumerable) {
        // Use Reflect.ownKeys to get all keys including non-enumerable
        return Reflect.ownKeys(obj).filter(key => {
            // Convert symbol keys to string for comparison with excludeKeys Set
            const keyStr: string = isSymbol(key) ? key.toString() : key;
            return !excludeKeys.has(keyStr);
        });
    }

    // Get only enumerable keys
    const keys: (string | symbol)[] = [];

    // String keys
    for (const key of Object.keys(obj)) {
        if (!excludeKeys.has(key)) {
            keys.push(key);
        }
    }

    // Symbol keys (enumerable only)
    for (const sym of Object.getOwnPropertySymbols(obj)) {
        const desc = Object.getOwnPropertyDescriptor(obj, sym);
        if (desc?.enumerable && !excludeKeys.has(sym.toString())) {
            keys.push(sym);
        }
    }

    return keys;
}

/**
 * Checks if we've reached the maximum depth for recursive operations.
 * Returns a standardized depth limit message if exceeded, null otherwise.
 *
 * @param depth - Current depth level
 * @param maxDepth - Maximum allowed depth
 * @param indent - Optional indentation prefix
 * @returns Depth limit message or null
 */
export function checkDepthLimit(depth: number, maxDepth: number, indent = ''): string | null {
    return depth >= maxDepth ? `${indent}[Max depth of ${maxDepth} reached]` : null;
}

/**
 * Checks if an object is circular (already seen).
 * Returns a standardized circular reference message if circular, null otherwise.
 *
 * @param value - Value to check
 * @param seen - WeakSet tracking seen objects
 * @param indent - Optional indentation prefix
 * @returns Circular reference message or null
 */
export function checkCircular(value: unknown, seen: WeakSet<object>, indent = ''): string | null {
    return isObject(value) && seen.has(value as object) ? `${indent}[Circular]` : null;
}

/**
 * Adds an object to the seen set for circular reference tracking.
 * Only adds if the value is actually an object.
 *
 * @param value - Value to track
 * @param seen - WeakSet tracking seen objects
 */
export function trackSeen(value: unknown, seen: WeakSet<object>): void {
    if (isObject(value)) seen.add(value as object);
}

export const unknownToString = (input: unknown): string => {
    if (isString(input)) return input;

    if (isPrimitive(input)) return String(input);

    // Handle functions explicitly before error-shaped check
    // (functions have a 'name' property which could confuse error detection)
    if (typeof input === 'function') return Object.prototype.toString.call(input);

    if (isObject(input)) {
        try {
            // Avoid JSON.stringify({}) for errors; prefer their message/name if present.
            if (isErrorShaped(input)) {
                if (input.message != null) return String(input.message);
                if (input.name != null) return String(input.name);
            }

            return Object.prototype.toString.call(input); // Safer fallback
        } /* node:coverage ignore next 2 */ catch {
            return String(input);
        }
    }
    /* node:coverage ignore next 3 */
    // Fallback for any other type, that somehow isn't caught above
    return String(input);
};

export const primitiveToError = (input: Primitive): StdError => {
    /* node:coverage ignore next */
    if (!isPrimitive(input)) throw new TypeError('Input must be a primitive value');

    if (input === undefined) return new StdError('Unknown error (Undefined)');

    if (input === null) return new StdError('Unknown error (Null)');

    // Use StdError constructor for primitives
    return new StdError(String(input));
};
