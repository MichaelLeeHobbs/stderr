// src/errorToJson.ts

import {Dictionary, DynamicError, hasProp, isArray, isError, isObject, isPrimitive, isString, isSymbol} from './types';

export interface ErrorJson {
    name: string;
    message: string;
    stack?: string;
    cause?: ErrorJson | string;
    errors?: ErrorJson[] | Record<string, ErrorJson>;

    [key: string]: unknown;
}

export interface ErrorToJsonOptions {
    /** How deep to recurse (default: 8) */
    maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 8;

export function errorToJson(err: DynamicError, options: ErrorToJsonOptions = {}): ErrorJson {
    const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    const seen = new WeakSet<object>();

    function serialize(e: DynamicError, depth: number): ErrorJson {
        // 1) depth guard
        if (depth >= maxDepth) {
            return {name: e.name || 'Error', message: '[Max depth reached]'};
        }
        // 2) circular guard
        if (isObject(e)) {
            if (seen.has(e)) {
                return {name: e.name || 'Error', message: '[Circular]'};
            }
            seen.add(e);
        }

        // 3) base shape
        const out: ErrorJson = {
            name: e.name || 'Error',
            message: e.message ?? '',
        };
        if (isString(e.stack)) {
            out.stack = e.stack;
        }

        // 4) cause
        if (hasProp(e, 'cause')) {
            const c = e.cause;
            out.cause = isError(c) ? serialize(c, depth + 1) : String(c);
        }

        // 5) errors array or map
        if (hasProp(e, 'errors')) {
            const raw = e.errors;
            if (isArray(raw)) {
                out.errors = raw.map(item => (isError(item) ? serialize(item, depth + 1) : {name: 'Error', message: String(item)}));
            } else if (isObject(raw)) {
                const map: Record<string, ErrorJson> = {};
                for (const key of Object.keys(raw as object)) {
                    const v = (raw as Dictionary)[key];
                    map[key] = isError(v) ? serialize(v, depth + 1) : {name: 'Error', message: String(v)};
                }
                out.errors = map;
            }
        }

        // 6) any other own‑props: only primitives, symbols or errors, else string‑ify
        for (const key of Reflect.ownKeys(e)) {
            const k = key.toString();
            if (['name', 'message', 'stack', 'cause', 'errors'].includes(k)) {
                continue;
            }
            const val = (e as Dictionary)[key];
            if (isPrimitive(val) || isSymbol(val)) {
                out[k] = val;
            } else if (isError(val)) {
                out[k] = serialize(val, depth + 1);
            } else {
                // dump everything else to String() rather than deep‑clone
                out[k] = String(val);
            }
        }

        return out;
    }

    return serialize(err, 0);
}
