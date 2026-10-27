// src/utils.ts
import { StdError } from './StdError';
import { isArray, isErrorShaped, isPrimitive, isString, isSymbol, Primitive } from './types';
import { LEGACY_LEAK_KEYS, MAX_REPEATED_REFERENCES } from './constants';

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
    maxArrayLength?: number;
}

/**
 * Reads a property without letting a throwing getter or a revoked Proxy escape.
 */
export function safeGet(source: unknown, key: string | symbol): unknown {
    try {
        return (source as Record<string | symbol, unknown>)[key];
    } catch {
        return undefined;
    }
}

/**
 * Writes a library marker (e.g. `_truncated`) without overwriting user data.
 * If the key is already taken, the first free `${key}_N` (N >= 2) is used instead.
 */
export function addMarker(target: Record<string | symbol, unknown>, key: string, message: string): void {
    let markerKey = key;
    for (let n = 2; Object.prototype.hasOwnProperty.call(target, markerKey) && n <= MAX_MARKER_SUFFIX; n++) {
        markerKey = `${key}_${n}`;
    }
    target[markerKey] = message;
}

const MAX_MARKER_SUFFIX = 100;

/**
 * Copies properties from source to target with filtering and optional normalization.
 *
 * Errors thrown while READING a property (throwing getters, revoked proxies) are swallowed and the
 * property is skipped. Errors thrown by `normalizeValue` are library errors and propagate.
 */
export function copyPropertiesTo(source: object, target: Record<string | symbol, unknown>, options: CopyPropertiesOptions = {}): void {
    const { excludeKeys = DEFAULT_EXCLUDE_KEYS, skipFunctions = true, convertSymbolKeys = false, normalizeValue, maxProperties, maxArrayLength } = options;

    const keys = getCustomKeys(source, { includeNonEnumerable: true, excludeKeys });
    const limit = maxProperties !== undefined ? maxProperties : keys.length;
    const markers: [string, string][] = [];

    if (keys.length > limit) {
        markers.push(['_truncated', `Property count (${keys.length}) exceeds limit (${limit}), showing first ${limit}`]);
    }

    const boundedKeys = keys.slice(0, limit);

    for (const key of boundedKeys) {
        let value: unknown;
        try {
            value = (source as Record<string | symbol, unknown>)[key];
        } catch {
            continue;
        }

        if (skipFunctions && typeof value === 'function') continue;

        if (maxArrayLength !== undefined && isArray(value) && value.length > maxArrayLength) {
            markers.push([`_truncated_${String(key)}`, `Array length (${value.length}) exceeds limit (${maxArrayLength}), showing first ${maxArrayLength}`]);
            value = value.slice(0, maxArrayLength);
        }

        if (normalizeValue) {
            value = normalizeValue(value);
        } else if (convertSymbolKeys && isSymbol(value)) {
            value = value.toString();
        }

        const targetKey = convertSymbolKeys && isSymbol(key) ? key.toString() : key;
        if (value !== undefined) target[targetKey] = value;
    }

    // Markers go last so they never overwrite (or get overwritten by) a user property of the same name
    for (const [key, message] of markers) addMarker(target, key, message);
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

    let ownKeys: (string | symbol)[];
    try {
        ownKeys = Reflect.ownKeys(obj);
    } catch {
        // Revoked Proxy or a throwing ownKeys trap: nothing readable
        return [];
    }

    return ownKeys.filter(key => {
        const keyStr = key.toString();
        // LEGACY_LEAK_KEYS sits beside CRITICAL_SECURITY_KEYS, NOT inside excludeKeys, because
        // callers pass `excludeKeys: new Set()` (stderr.ts:46, stderr.ts:95) and would opt out.
        if (CRITICAL_SECURITY_KEYS.has(keyStr) || LEGACY_LEAK_KEYS.has(keyStr) || excludeKeys.has(keyStr)) return false;

        // If we only want enumerable keys, check enumerability
        return includeNonEnumerable || Object.prototype.propertyIsEnumerable.call(obj, key);
    });
}

export function checkDepthLimit(depth: number, maxDepth: number, indent = ''): string | null {
    return depth >= maxDepth ? `${indent}[Max depth of ${maxDepth} reached]` : null;
}

/**
 * Tracks objects during a single recursive walk.
 *
 * Circular means "is an ANCESTOR of the current value", so an object referenced twice from different
 * branches (a DAG) is output in full both times. To keep crafted DAGs from blowing up exponentially,
 * repeat visits share a fixed budget; once it is spent, further repeats become `[Repeated reference]`.
 */
export class VisitTracker {
    private readonly ancestors = new WeakSet<object>();
    private readonly visited = new WeakSet<object>();
    private repeats = 0;

    /** Returns a marker string if the value must not be expanded, otherwise records it as an ancestor. */
    enter(value: object): string | null {
        if (this.ancestors.has(value)) return '[Circular]';
        if (this.visited.has(value) && ++this.repeats > MAX_REPEATED_REFERENCES) return '[Repeated reference]';
        this.visited.add(value);
        this.ancestors.add(value);
        return null;
    }

    leave(value: object): void {
        this.ancestors.delete(value);
    }

    /** Marks a value as an ancestor for the rest of the walk (used for the root). */
    hold(value: object): void {
        this.visited.add(value);
        this.ancestors.add(value);
    }
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
