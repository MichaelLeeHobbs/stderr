// src/utils.ts
import { StdError } from './StdError';
import { isErrorShaped, isObject, isPrimitive, isString, isSymbol, Primitive } from './types';

/**
 * Standard Error property keys that should be excluded when extracting custom properties
 */
export const STANDARD_ERROR_KEYS = new Set<string>(['name', 'message', 'stack', 'cause', 'errors']);

/**
 * Critical security keys that must ALWAYS be excluded to prevent security issues.
 */
export const CRITICAL_SECURITY_KEYS = new Set<string>(['prototype', '__proto__', 'constructor']);

export const STANDARD_OBJECT_KEYS = new Set<string>([
    'toString',
    'toJSON',
    'valueOf',
    'toLocaleString',
    ...Object.getOwnPropertyNames(Object.prototype),
    ...Object.getOwnPropertySymbols(Object.prototype).map(sym => sym.toString()),
]);

export const DEFAULT_EXCLUDE_KEYS = new Set<string>([...STANDARD_ERROR_KEYS, ...CRITICAL_SECURITY_KEYS, ...STANDARD_OBJECT_KEYS]);

export interface CopyPropertiesOptions {
    excludeKeys?: Set<string>;
    skipFunctions?: boolean;
    convertSymbolKeys?: boolean;
    normalizeValue?: (value: unknown) => unknown;
    maxProperties?: number;
}

/**
 * Copies properties from source to target with filtering and optional normalization.
 */
export function copyPropertiesTo(source: object, target: Record<string | symbol, unknown>, options: CopyPropertiesOptions = {}): void {
    const { excludeKeys = DEFAULT_EXCLUDE_KEYS, skipFunctions = true, convertSymbolKeys = false, normalizeValue, maxProperties } = options;

    const keys = getCustomKeys(source, { includeNonEnumerable: true, excludeKeys });
    const limit = maxProperties !== undefined ? maxProperties : keys.length;

    // Add truncation marker if needed
    if (keys.length > limit) {
        target['_truncated'] = `Property count (${keys.length}) exceeds limit (${limit}), showing first ${limit}`;
    }

    const boundedKeys = keys.slice(0, limit);

    for (const key of boundedKeys) {
        try {
            let value = (source as Record<string | symbol, unknown>)[key];

            if (skipFunctions && typeof value === 'function') continue;

            if (normalizeValue) {
                value = normalizeValue(value);
            } else if (convertSymbolKeys && isSymbol(value)) {
                value = value.toString();
            }

            const targetKey = convertSymbolKeys && isSymbol(key) ? key.toString() : key;
            if (value !== undefined) target[targetKey] = value;
        } catch (err) {
            // Re-throw critical errors, ignore property access errors
            if (err instanceof RangeError || err instanceof ReferenceError) throw err;
        }
    }
}

/**
 * Builds a comprehensive exclude keys set by walking the prototype chain.
 */
export function buildExcludeKeys(startObj: object, additionalKeys: string[] = []): Set<string> {
    const keysToSkip = new Set<string>([...CRITICAL_SECURITY_KEYS, ...additionalKeys]);
    let currentObj: object | null = startObj;

    while (currentObj) {
        Reflect.ownKeys(currentObj).forEach(key => keysToSkip.add(key.toString()));
        currentObj = Object.getPrototypeOf(currentObj);
    }

    return keysToSkip;
}

export interface GetCustomKeysOptions {
    includeNonEnumerable?: boolean;
    excludeKeys?: Set<string>;
}

/**
 * Gets custom property keys from an object using Reflect.ownKeys for unified handling.
 */
export function getCustomKeys(obj: object, options: GetCustomKeysOptions = {}): (string | symbol)[] {
    const { includeNonEnumerable = false, excludeKeys = DEFAULT_EXCLUDE_KEYS } = options;

    return Reflect.ownKeys(obj).filter(key => {
        const keyStr = key.toString();
        if (CRITICAL_SECURITY_KEYS.has(keyStr) || excludeKeys.has(keyStr)) return false;

        // If we only want enumerable keys, check enumerability
        return !(!includeNonEnumerable && !Object.prototype.propertyIsEnumerable.call(obj, key));
    });
}

export function checkDepthLimit(depth: number, maxDepth: number, indent = ''): string | null {
    return depth >= maxDepth ? `${indent}[Max depth of ${maxDepth} reached]` : null;
}

export function checkCircular(value: unknown, seen: WeakSet<object>, indent = ''): string | null {
    return isObject(value) && seen.has(value) ? `${indent}[Circular]` : null;
}

export function trackSeen(value: unknown, seen: WeakSet<object>): void {
    if (isObject(value)) seen.add(value);
}

/**
 * Converts an unknown input to a string representation safely.
 */
export function unknownToString(input: unknown): string {
    if (isString(input)) return input;
    if (isPrimitive(input)) return String(input);
    if (typeof input === 'function') {
        try {
            return Object.prototype.toString.call(input);
        } catch {
            return '[Function]';
        }
    }

    // Handle Objects
    try {
        if (isErrorShaped(input) && (input.message || input.name)) return String(input.message || input.name);
        const ctorName = (input as object).constructor?.name;
        if (ctorName && ctorName !== 'Object') return `[object ${ctorName}]`;
        return Object.prototype.toString.call(input);
    } catch {
        return '[Possible Malicious Object]';
    }
}

export function primitiveToError(input: Primitive): StdError {
    /* node:coverage ignore next */
    if (!isPrimitive(input)) throw new TypeError('Input must be a primitive value');
    if (input === undefined) return new StdError('Unknown error (Undefined)');
    if (input === null) return new StdError('Unknown error (Null)');
    return new StdError(String(input));
}
