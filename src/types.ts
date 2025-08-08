// src/types.ts

export type ErrorShape = Omit<Error, 'name' | 'message'> & {
    /** Error name - optional to reflect real world */
    name?: string;
    /** Error message - optional to reflect real world */
    message?: string;
    /** Arbitrary nested cause */
    cause?: unknown;
    /** Arbitrary nested sub-errors */
    errors?: unknown;
    /** Additional unknown metadata */
    [key: string | symbol]: unknown;
};

export type ErrorShapeWithErrorsArray = WithRequiredType<ErrorShape, 'errors', ErrorShape[]>;
export type ErrorShapeWithErrorsObject = WithRequiredType<ErrorShape, 'errors', Dictionary>;

export type Dictionary = Record<string | symbol, unknown>;
export type ErrorRecord = Dictionary;
export type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/* Helper Types */
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
export const isFunction = (input: unknown): input is (...args: unknown[]) => unknown => typeof input === 'function';
export const isSymbol = (input: unknown): input is symbol => typeof input === 'symbol';
export const isObject = (value: unknown): value is Record<string | number | symbol, unknown> | object => typeof value === 'object' && value !== null;

export const isPrimitive = (value: unknown): value is string | number | boolean | null | undefined | symbol | bigint => {
    return !isObject(value) && typeof value !== 'function';
};

export const isErrorShaped = (input: unknown): input is ErrorShape => {
    if (!isObject(input)) return false;
    const keys = Object.getOwnPropertyNames(input);
    return keys.includes('name') || keys.includes('message') || keys.includes('cause') || keys.includes('errors') || keys.includes('stack');
};
