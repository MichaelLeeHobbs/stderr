// src/errorToJson.ts

import {DynamicError, isArray, isError, isErrorsObject, isErrWithCauseError, isString} from "./types";

/**
 * A JSON‑serializable shape for normalized errors.
 */
export interface ErrorJson {
    name: string;
    message: string;
    stack?: string;
    cause?: ErrorJson;
    errors?: ErrorJson[] | Record<string, ErrorJson>;

    [key: string]: unknown;
}

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
    if (isErrWithCauseError(err)) {
        json.cause = errorToJson(err.cause);
    }

    // Handle nested errors if present
    if (isErrorsObject(err)) {
        const raw = err.errors;
        if (isArray(raw)) {
            json.errors = raw.map((e: unknown) => (isError(e) ? errorToJson(e) : {message: String(e)}));
        } else if (raw && typeof raw === 'object') {
            const obj: Record<string, DynamicError> = {};
            for (const [k, v] of Object.entries(raw)) {
                obj[k] = isError(v) ? errorToJson(v) : {message: String(v)};
            }
            json.errors = obj;
        }
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
