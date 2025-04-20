// src/errorToJson.ts

import {DynamicError, hasProp, isArray, isError, isObject, isPrimitive, isString} from './types';

/**
 * A JSON‑serializable shape for normalized errors.
 */
export interface ErrorJson {
    name: string;
    message: string;
    stack?: string;
    cause?: ErrorJson | string;
    errors?: ErrorJson[] | Record<string, ErrorJson>;

    [key: string]: unknown;
}

export interface ErrorToJsonOptions {
    /** Maximum recursion depth (inclusive) */
    maxDepth?: number;
}

/**
 * Recursively converts an Error (or normalized Error) into a plain object
 * suitable for JSON.stringify, including metadata, cause, nested errors,
 * circular detection, and a depth limit.
 *
 * @param err - An Error instance (e.g. from normalizeError).
 * @param options - Optional settings (maxDepth=8).
 * @returns A plain object with name, message, stack, cause, errors, plus any own props.
 */
export function errorToJson(err: DynamicError, options: ErrorToJsonOptions = {}): ErrorJson {
    const {maxDepth = 8} = options;
    const seen = new WeakSet<object>();

    function _toJson(e: DynamicError, depth: number): ErrorJson {
        // Depth check
        if (depth >= maxDepth) {
            return {name: e.name || 'Error', message: '[Max depth reached]'};
        }
        // Circular check
        if (isObject(e) && seen.has(e)) {
            return {name: e.name || 'Error', message: '[Circular]'};
        }
        if (isObject(e)) {
            seen.add(e);
        }

        const json: ErrorJson = {
            name: e.name || 'Error',
            message: e.message || '',
        };
        if (isString(e.stack)) {
            json.stack = e.stack;
        }

        // Handle nested cause
        if (hasProp(e, 'cause')) {
            const c = (e as DynamicError).cause;
            if (isError(c)) {
                json.cause = _toJson(c as DynamicError, depth + 1);
            } else if (isPrimitive(c)) {
                json.cause = String(c);
            } else if (isObject(c)) {
                // We should look at handling Objects here
                try {
                    // This will throw on circular references
                    json.cause = JSON.parse(JSON.stringify(c));
                } catch {
                    // We could probably handle circular references here, but it's not worth the effort
                    json.cause = String(c);
                }
            }
        }

        // Handle nested errors
        if (hasProp(e, 'errors')) {
            const raw = (e as DynamicError).errors;
            if (isArray(raw)) {
                json.errors = raw.map(item => (isError(item) ? _toJson(item as DynamicError, depth + 1) : {name: 'Error', message: String(item)}));
            } else if (isObject(raw)) {
                const out: Record<string, ErrorJson> = {};
                for (const k of Object.keys(raw)) {
                    const v = (raw as Record<string, unknown>)[k];
                    out[k] = isError(v) ? _toJson(v as DynamicError, depth + 1) : {name: 'Error', message: String(v)};
                }
                json.errors = out;
            }
        }

        // Copy metadata
        for (const key of Reflect.ownKeys(e)) {
            if (['name', 'message', 'stack', 'cause', 'errors'].includes(key as string)) {
                continue;
            }
            const val = e[key];
            if (isPrimitive(val)) {
                json[key as string] = val;
            } else if (isObject(val)) {
                if (seen.has(val)) {
                    json[key as string] = '[Circular]';
                } else {
                    seen.add(val);
                    try {
                        json[key as string] = JSON.parse(JSON.stringify(val));
                    } catch {
                        json[key as string] = String(val);
                    }
                }
            }
        }

        return json;
    }

    return _toJson(err, 0);
}
