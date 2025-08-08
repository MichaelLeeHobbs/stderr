// src/serializer.ts
import type { ErrorShape, Dictionary } from './types';
import { isArray, isErrorShaped, isObject, isPrimitive, isSymbol } from './types';

// JSON-like serialization types with markers used by this serializer
type JsonPrimitive = string | number | boolean | null;

// Markers used by this serializer
type CircularMark = '[Circular]';
type MaxDepthMark<N extends number = number> = `[Max depth of ${N} reached]`;
type Marker = CircularMark | MaxDepthMark;

// Recursive serializable structure that can include markers and undefined
type SerializableObject = { [k: string]: Serializable };
type SerializableArray = Serializable[];
type Serializable = JsonPrimitive | SerializableObject | SerializableArray | Marker | undefined;

const CIRCULAR_MARK: CircularMark = '[Circular]';
const MAX_DEPTH = <N extends number>(n: N): MaxDepthMark<N> => `[Max depth of ${n} reached]` as const;

const EXCLUDED_ERROR_KEYS = new Set(['name', 'message', 'stack', 'code', 'cause', 'errors']);

function onError(value: ErrorShape, maxDepth: number = 8, seen: WeakSet<object>, depth: number): SerializableObject {
    // do not check for maxDepth here, as unknownToJson will do that
    const err: SerializableObject = {
        name: (unknownToJson(value.name, maxDepth, seen, depth + 1) || 'Error') as string,
        message: (unknownToJson(value.message, maxDepth, seen, depth + 1) || 'Unknown Error') as string,
    };

    // Handle common Error properties explicitly
    const stackVal = unknownToJson(value.stack, maxDepth, seen, depth + 1);
    if (stackVal !== undefined) err.stack = typeof stackVal === 'string' ? stackVal : String(stackVal);
    if (value.code !== undefined) err.code = unknownToJson(value.code, maxDepth, seen, depth + 1);
    if (value.cause !== undefined) err.cause = unknownToJson(value.cause, maxDepth, seen, depth + 1);
    if (value.errors !== undefined) err.errors = unknownToJson(value.errors, maxDepth, seen, depth + 1);

    // Handle any additional enumerable properties
    Reflect.ownKeys(value).forEach(key => {
        const keyStr = key.toString();
        if (EXCLUDED_ERROR_KEYS.has(keyStr)) return;
        // value has both string and symbol index signatures
        err[keyStr] = unknownToJson((value as Dictionary)[key], maxDepth, seen, depth + 1);
    });

    return err;
}

export function unknownToJson(value: unknown, maxDepth: number = 8, seen: WeakSet<object> = new WeakSet<object>(), depth = 0): Serializable {
    maxDepth = Math.max(maxDepth, 0);

    // Max depth reached
    if (depth >= maxDepth) return MAX_DEPTH(maxDepth);

    // null or undefined
    if (value == undefined) return value;

    // Symbols
    if (isSymbol(value)) return value.toString();

    // primitives
    if (isPrimitive(value)) return value as JsonPrimitive;

    // Circular detection
    if (isObject(value)) {
        if (seen.has(value as object)) return CIRCULAR_MARK;
        seen.add(value as object);
    }

    // Error-like
    if (isErrorShaped(value)) return onError(value as ErrorShape, maxDepth, seen, depth);

    // Array
    if (isArray(value)) {
        return value.map(item => unknownToJson(item, maxDepth, seen, depth + 1)) as SerializableArray;
    }

    // Plain object
    if (isObject(value)) {
        return Reflect.ownKeys(value).reduce((acc, key) => {
            const v = (value as Dictionary)[key];
            acc[key.toString()] = unknownToJson(v, maxDepth, seen, depth + 1);
            return acc;
        }, {} as SerializableObject);
    }

    // fallback
    return String(value);
}
