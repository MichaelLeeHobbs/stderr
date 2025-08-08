// src/types.ts

export type Dictionary = {
    [key: string]: unknown;
    [key: symbol]: unknown;
};

export type ErrorRecord = Dictionary;

export type Primitive = string | number | boolean | bigint | symbol | null | undefined;

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
    [key: string]: unknown;
    [key: symbol]: unknown;
};

export type ErrorShapeWithErrorsArray = WithRequiredType<ErrorShape, 'errors', ErrorShape[]>;
export type ErrorShapeWithErrorsObject = WithRequiredType<ErrorShape, 'errors', Dictionary>;

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

/** Narrow object-only values (not functions). */
export const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;

/** Alias for clarity in some places. */
export const isObjectLike = isObject;

export const isErrorInstance = (v: unknown): v is Error => v instanceof Error;

export const isPrimitive = (value: unknown): value is string | number | boolean | null | undefined | symbol | bigint => {
    return !isObject(value) && typeof value !== 'function';
};

export const isErrorShaped = (input: unknown): input is ErrorShape => {
    if (!isObjectLike(input)) return false;
    if (isErrorInstance(input)) return true; // fast path for real Error
    const keys = Reflect.ownKeys(input);
    // Any of the common Error-ish fields present counts as "error-shaped"
    return keys.some(k => k === 'name' || k === 'message' || k === 'cause' || k === 'errors' || k === 'stack');
};
