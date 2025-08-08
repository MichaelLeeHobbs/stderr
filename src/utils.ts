// src/utils.ts
import { ErrorShape, isErrorShaped, isObject, isPrimitive, isString, Primitive } from './types';

export const unknownToString = (input: unknown): string => {
    if (isString(input)) return input;

    if (isPrimitive(input)) return String(input);

    if (isObject(input)) {
        try {
            // Avoid JSON.stringify({}) for errors; prefer their message/name if present.
            if (isErrorShaped(input)) {
                const msg = (input as ErrorShape).message;
                if (typeof msg === 'string') return msg;
                if (msg != null) return String(msg);

                const nm = (input as ErrorShape).name;
                if (nm != null) return String(nm);
            }

            return Object.prototype.toString.call(input); // Safer fallback
        } /* node:coverage ignore next 2 */ catch {
            return String(input);
        }
    }
    return String(input);
};

export const primitiveToError = (input: Primitive): ErrorShape => {
    /* node:coverage ignore next */
    if (!isPrimitive(input)) throw new TypeError('Input must be a primitive value');

    if (input === undefined) return new Error('Unknown error (Undefined)') as ErrorShape;

    if (input === null) return new Error('Unknown error (Null)') as ErrorShape;

    // Use Error constructor for primitives
    return new Error(String(input)) as ErrorShape;
};
