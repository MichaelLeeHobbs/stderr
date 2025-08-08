// src/utils.ts
import { ErrorShape, isErrorShaped, isObject, isPrimitive, isString, Primitive } from './types';

export const unknownToString = (input: unknown): string => {
    if (isString(input)) return input;

    if (isPrimitive(input)) return String(input);

    if (isObject(input)) {
        try {
            // Avoid relying on JSON.stringify for Errors as it often yields {}
            if (isErrorShaped(input) && input.message) return input.message;

            /* node:coverage ignore next */
            if (isErrorShaped(input) && input.name) return input.name;

            return Object.prototype.toString.call(input); // Safer fallback
        } catch {
            /* node:coverage ignore next 2 */
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
