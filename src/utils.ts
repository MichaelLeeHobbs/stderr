// src/utils.ts
import { StdError } from './StdError';
import { isErrorShaped, isObject, isPrimitive, isString, isSymbol, Primitive } from './types';

/**
 * Standard Error property keys that should be excluded when extracting custom properties
 */
export const STANDARD_ERROR_KEYS = new Set<string>(['name', 'message', 'stack', 'cause', 'errors']);

/**
 * Critical security keys that must ALWAYS be excluded to prevent security issues.
 * These are always added regardless of prototype chain walking.
 */
export const CRITICAL_SECURITY_KEYS = new Set<string>([
    'prototype', // Prevent prototype property overwrite
    '__proto__', // Security: prevent prototype pollution
    'constructor', // Prevent overwriting the link to the class
]);

export const STANDARD_OBJECT_KEYS = new Set<string>([
    'toString',
    'toJSON',
    'defineGetter',
    'defineSetter',
    'hasOwnProperty',
    'lookupGetter',
    'lookupSetter',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'valueOf',
    'proto',
    'toLocaleString',
    ...Object.getOwnPropertyNames(Object.prototype),
    ...Object.getOwnPropertySymbols(Object.prototype).map(sym => sym.toString()),
]);

export const DEFAULT_EXCLUDE_KEYS = new Set<string>([...STANDARD_ERROR_KEYS, ...CRITICAL_SECURITY_KEYS, ...STANDARD_OBJECT_KEYS]);

/**
 * Options for copying properties between objects
 */
export interface CopyPropertiesOptions {
    /** Additional keys to exclude beyond defaults */
    excludeKeys?: Set<string>;
    /** Skip function-valued properties */
    skipFunctions?: boolean;
    /** Convert symbol keys to strings (for serialization) */
    convertSymbolKeys?: boolean;
    /** Transform/normalize values during copy */
    normalizeValue?: (value: unknown) => unknown;
    /** Maximum number of properties to copy (for DoS prevention) */
    maxProperties?: number;
}

/**
 * Copies properties from source to target with filtering and optional normalization.
 * Always excludes CRITICAL_SECURITY_KEYS for safety.
 * Optionally walks prototype chain to exclude all inherited properties.
 *
 * @param source - Source object to copy from
 * @param target - Target object to copy to
 * @param options - Copy options
 */
export function copyPropertiesTo(source: object, target: Record<string | symbol, unknown>, options: CopyPropertiesOptions = {}): void {
    const { excludeKeys = DEFAULT_EXCLUDE_KEYS, skipFunctions = true, convertSymbolKeys = false, normalizeValue, maxProperties } = options;

    // Get custom keys (always includes non-enumerable, always excludes critical security keys)
    const keys = getCustomKeys(source, { includeNonEnumerable: true, excludeKeys });

    // Apply bounds if maxProperties specified
    const boundedKeys = maxProperties !== undefined && keys.length > maxProperties ? keys.slice(0, maxProperties) : keys;

    if (maxProperties !== undefined && keys.length > maxProperties) {
        console.warn(`Property count (${keys.length}) exceeds limit (${maxProperties}), truncating`);
    }

    for (const key of boundedKeys) {
        try {
            let value = (source as Record<string | symbol, unknown>)[key];

            // Skip functions if requested
            if (skipFunctions && typeof value === 'function') continue;

            // Normalize value if transformer provided
            if (normalizeValue) {
                value = normalizeValue(value);
            }
            // Convert symbols to strings if requested (for serialization)
            else if (convertSymbolKeys && isSymbol(value)) {
                value = value.toString();
            }

            // Determine the key to use (convert symbol keys to strings if requested)
            const targetKey = convertSymbolKeys && isSymbol(key) ? key.toString() : key;

            if (value !== undefined) target[targetKey] = value;
        } catch (err) {
            // Only ignore property access errors (getters that throw, etc.)
            // Re-throw serious errors like out-of-memory
            if (err instanceof RangeError || err instanceof ReferenceError) throw err;
            // Silently skip properties that can't be accessed
        }
    }
}

/**
 * Builds a comprehensive exclude keys set by walking the prototype chain.
 * Always includes CRITICAL_SECURITY_KEYS even if not found in prototype chain.
 * This is future-proof - picks up all inherited properties automatically.
 *
 * @param startObj - Object to start walking from (typically `this` in constructor)
 * @param additionalKeys - Additional keys to exclude beyond prototype chain
 * @returns Set of all keys to exclude
 */
export function buildExcludeKeys(startObj: object, additionalKeys: string[] = []): Set<string> {
    const keysToSkip = new Set<string>([
        ...CRITICAL_SECURITY_KEYS, // Always include these first
        ...additionalKeys,
    ]);

    let currentObj: object | null = startObj;

    // Walk the prototype chain
    while (currentObj) {
        // Get all property names (strings) of the current level
        Object.getOwnPropertyNames(currentObj).forEach(key => keysToSkip.add(key));

        // Get all symbols of the current level
        Object.getOwnPropertySymbols(currentObj).forEach(sym => keysToSkip.add(sym.toString()));

        // Move up to the next prototype
        currentObj = Object.getPrototypeOf(currentObj);
    }

    return keysToSkip;
}

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
 * Always excludes CRITICAL_SECURITY_KEYS for safety.
 *
 * @param obj - Object to extract keys from
 * @param options - Options for key extraction
 * @returns Array of string and symbol keys (excluding standard error keys and critical security keys)
 *
 * @example
 * ```typescript
 * const error = { name: 'Error', message: 'test', code: 'E_CUSTOM' };
 * const keys = getCustomKeys(error); // ['code'] - excludes name, message
 * ```
 */
export function getCustomKeys(obj: object, options: GetCustomKeysOptions = {}): (string | symbol)[] {
    const { includeNonEnumerable = false, excludeKeys = DEFAULT_EXCLUDE_KEYS } = options;

    if (includeNonEnumerable) {
        // Use Reflect.ownKeys to get all keys including non-enumerable
        return Reflect.ownKeys(obj).filter(key => {
            // Convert symbol keys to string for comparison with excludeKeys Set
            const keyStr: string = isSymbol(key) ? key.toString() : key;
            // Always exclude critical security keys + provided excludeKeys
            return !CRITICAL_SECURITY_KEYS.has(keyStr) && !excludeKeys.has(keyStr);
        });
    }

    // Get only enumerable keys
    const keys: (string | symbol)[] = [];

    // String keys
    for (const key of Object.keys(obj)) {
        // Always exclude critical security keys + provided excludeKeys
        if (!CRITICAL_SECURITY_KEYS.has(key) && !excludeKeys.has(key)) {
            keys.push(key);
        }
    }

    // Symbol keys (enumerable only)
    for (const sym of Object.getOwnPropertySymbols(obj)) {
        const desc = Object.getOwnPropertyDescriptor(obj, sym);
        const symStr = sym.toString();
        if (desc?.enumerable && !CRITICAL_SECURITY_KEYS.has(symStr) && !excludeKeys.has(symStr)) {
            keys.push(sym);
        }
    }

    return keys;
}

/**
 * Checks if the current depth exceeds the maximum allowed depth.
 * Returns a standardized depth limit message if exceeded, null otherwise.
 *
 * maxDepth is EXCLUSIVE: means "show this many levels"
 * - maxDepth: 1 shows depth 0 only (root)
 * - maxDepth: 2 shows depths 0, 1 (root + 1 level)
 * - maxDepth: 3 shows depths 0, 1, 2 (root + 2 levels)
 *
 * @param depth - Current depth level (0-based)
 * @param maxDepth - Maximum number of levels to show (exclusive)
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
    // 1. Handle Strings
    if (isString(input)) return input;

    // 2. Handle Primitives (number, boolean, symbol, undefined, null)
    if (isPrimitive(input)) return String(input);

    // 3. Handle Functions explicitly
    // (functions have a 'name' property which could confuse error detection)
    if (typeof input === 'function') {
        // Function.prototype.toString returns the source code of the function
        // usually safe, but we wrap it just in case
        try {
            return Object.prototype.toString.call(input);
        } catch {
            return '[Function]';
        }
    }

    if (isObject(input)) {
        try {
            // 4. Handle Error Objects (prefer message/name over generic object string)
            if (isErrorShaped(input)) {
                if (input.message != null) return String(input.message);
                if (input.name != null) return String(input.name);
            }

            // 5. Standard Object Stringification
            // This throws if [Symbol.toStringTag] is poisoned
            return Object.prototype.toString.call(input);
        } catch {
            // --- MALICIOUS / BROKEN OBJECT HANDLING ---

            // Attempt to salvage some information safely
            try {
                // Try to read the constructor name.
                // This avoids the Symbol.toStringTag trap.
                const constructorName = (input as object).constructor?.name;

                if (constructorName) {
                    return `[object ${constructorName}]`;
                }
            } catch {
                // Accessing .constructor failed.
                // The object is aggressively toxic (e.g., throwing getters on all properties).
            }

            // Final fallback for objects that refuse all inspection
            return '[Possible Malicious Object]';
        }
    }
    /* node:coverage ignore next 3 */
    // This should be impossible to reach
    return `Unknown type: ${typeof input}`;
};

export const primitiveToError = (input: Primitive): StdError => {
    /* node:coverage ignore next */
    if (!isPrimitive(input)) throw new TypeError('Input must be a primitive value');

    if (input === undefined) return new StdError('Unknown error (Undefined)');

    if (input === null) return new StdError('Unknown error (Null)');

    // Use StdError constructor for primitives
    return new StdError(String(input));
};
