// src/utils.ts
import { StdError } from './StdError';
import { ErrorShape, isErrorShaped, isObject, isPrimitive, isString, Primitive } from './types';

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
                const msg = input.message;
                if (msg != null) return String(msg);

                const nm = input.name;
                if (nm != null) return String(nm);
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

export const primitiveToError = (input: Primitive): ErrorShape => {
    /* node:coverage ignore next */
    if (!isPrimitive(input)) throw new TypeError('Input must be a primitive value');

    if (input === undefined) return new StdError('Unknown error (Undefined)');

    if (input === null) return new StdError('Unknown error (Null)');

    // Use StdError constructor for primitives
    return new StdError(String(input));
};
