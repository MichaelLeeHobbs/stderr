// src/errorToJson.ts

import {DynamicError, hasProp, isArray, isError, isNonNullObject, isPrimitive, isString} from './types';

/**
 * Recursively converts an Error (or normalized Error) into a plain object
 * suitable for JSON.stringify, including metadata, cause, and nested errors.
 *
 * @param err - An Error instance (e.g. from normalizeError).
 * @returns A plain object with name, message, stack, cause, errors, plus any own props.
 */
export function errorToJson(err: DynamicError): DynamicError {
    const json: DynamicError = {
        name: err.name,
        message: err.message,
    };

    if (isString(err.stack)) {
        json.stack = err.stack;
    }

    // Handle nested cause if present
    if (hasProp(err, 'cause')) {
        if (isError(err.cause)) {
            json.cause = errorToJson(err.cause);
        } else if (isPrimitive(err.cause)) {
            json.cause = String(err.cause);
        } // TODO: handle non-primitive cause
    }

    // Handle nested errors if present
    if (isError(err)) {
        const raw = err.errors;
        if (isArray(raw)) {
            json.errors = raw.map((e: unknown) => (isError(e) ? errorToJson(e) : {message: String(e)}));
        } else if (isNonNullObject(raw)) {
            const obj: Record<string, DynamicError> = {};
            for (const [k, v] of Object.entries(raw)) {
                obj[k] = isError(v) ? errorToJson(v) : {message: String(v)};
            }
            json.errors = obj;
        } // TODO: handle non-array, non-object errors
    }

    // Copy any other own enumerable properties (metadata)
    for (const key of Object.keys(err)) {
        if (key === 'name' || key === 'message' || key === 'stack' || key === 'cause' || key === 'errors') {
            continue;
        }
        json[key] = err[key];
    }

    return json;
}
