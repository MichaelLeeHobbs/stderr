// src/types.ts

export type DynamicError = Omit<Error, 'name' | 'message'> & {
    /** Error name - omitted and replaced with an optional name to reflect the real world */
    name?: string;
    /** Error message - omitted and replaced with an optional message to reflect the real world */
    message?: string;
    /** Arbitrary nested cause */
    cause?: unknown;
    /** Arbitrary nested sub-errors */
    errors?: unknown;
    /** Additional unknown metadata */
    [key: string | symbol]: unknown;
};

export type DynamicErrorWithErrorsArray = WithRequiredType<DynamicError, 'errors', DynamicError[]>;
export type DynamicErrorWithErrorsObject = WithRequiredType<DynamicError, 'errors', Dictionary>;

export type Dictionary = Record<string | symbol, unknown>;
export type ErrorRecord = Dictionary;

/* Helper Types */

// /**
//  * Makes the keys K of type T required.
//  *
//  * @typeParam T - The base object type.
//  * @typeParam K - The keys of T to make required.
//  */
// type WithRequired<T, K extends keyof T> = T & {
//     [P in K]-?: T[P];
// };

/**
 * Makes the keys K of type T required and enforces them to be of type V.
 *
 * @typeParam T - The base object type.
 * @typeParam K - The keys of T to make required and type-enforced.
 * @typeParam V - The type to enforce on the keys in K.
 */
type WithRequiredType<T, K extends keyof T, V> = Omit<T, K> & {
    [P in K]-?: V;
};

/* Basic Type Guards */
export const isString = (input: unknown): input is string => typeof input === 'string';
export const isArray = Array.isArray as (input: unknown) => input is unknown[];
export const isError = (input: unknown): input is DynamicError => input instanceof Error;
export const isFunction = (input: unknown): input is (...args: unknown[]) => unknown => typeof input === 'function';
export const isSymbol = (input: unknown): input is symbol => typeof input === 'symbol';
export const isObject = (input: unknown): input is object => typeof input === 'object';
export const isNonNullObject = (input: unknown): input is object => isObject(input) && input !== null;
export const isUndefined = (input: unknown): input is undefined => input === undefined;
export const isPrimitive = (input: unknown): input is string | number | boolean | bigint | symbol | null | undefined => {
    return input == null || ['string', 'number', 'boolean', 'bigint', 'symbol'].includes(typeof input);
};

export const hasProp = <T extends object, K extends PropertyKey>(obj: T, prop: K): obj is T & Record<K, unknown> => {
    return Object.prototype.hasOwnProperty.call(obj, prop);
};
