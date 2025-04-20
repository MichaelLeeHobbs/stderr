// src/types.ts
export type DynamicError = Omit<Error, 'name'> & {
    name?: string;
    cause?: unknown | DynamicError;
    errors?: unknown | DynamicError[];

    [key: string | symbol]: unknown;
};

export type Dictionary = Record<string | symbol, unknown>;
export type ErrorRecord = Dictionary;

// Represents an object shape that carries a non-Error `cause`. We
// detect these to convert the cause into a proper Error instance.
export type CauseObject = {
    cause?: unknown;
};

export type ErrorsObject = {
    errors?: unknown; // TODO: should this me unknown || unknown[]?
};

export type ErrorsArray = {
    errors: unknown[];
};

// Type definition combining Error with optional cause and errors properties
// Allows us to attach nested error causes and sub-error collections
// without losing type information.

export type ErrWithUnkCause = Error & CauseObject;
export type ErrWithUnkErrors = Error & ErrorsObject;
export type ErrWithUnkErrorsArr = Error & ErrorsArray;
export type ErrWithRecords = Error & {
    [key: string | symbol]: unknown;
};
export type ErrWithCauseError = ErrWithRecords & {
    cause: ErrWithRecords;
};

export type ErrWithErrorsObj = Error & {
    errors: ErrorRecord;
};

export type ErrWithErrorsArr = Error & {
    errors: Error[];
};

/* Error type guards */
export const isErrorsObject = (input: unknown): input is ErrorsObject => isNonNullObject(input) && 'errors' in input;
export const isErrWithUnkCause = (input: unknown): input is ErrWithUnkCause => isNonNullObject(input) && hasOwnProperty(input, 'cause');
export const isErrWithCauseError = (input: unknown): input is ErrWithCauseError => isErrWithUnkCause(input) && isError(input.cause);
export const isErrWithErrorsObj = (input: unknown): input is ErrWithErrorsObj => isErrorsObject(input) && !isArray(input.errors);
export const isErrWithErrorsArr = (input: unknown): input is ErrWithUnkErrorsArr => isErrorsObject(input) && isArray(input.errors);

/* Basic Type Guards */
export const isString = (input: unknown): input is string => typeof input === 'string';
export const isSymbol = (input: unknown): input is symbol => typeof input === 'symbol';
export const isArray = (input: unknown): input is unknown[] => Array.isArray(input);
export const isError = (input: unknown): input is DynamicError => input instanceof Error;
export const isFunction = (input: unknown): input is (...args: unknown[]) => unknown => typeof input === 'function';
export const isObject = (input: unknown): input is object => typeof input === 'object';
export const isNonNullObject = (input: unknown): input is object => isObject(input) && input !== null;
export const isNull = (input: unknown): input is null => input === null;
export const isUndefined = (input: unknown): input is undefined => typeof input === 'undefined';
export const isPrimitive = (input: unknown): input is string | number | boolean | symbol | bigint | null | undefined => {
    return isNull(input) || isUndefined(input) || ['string', 'number', 'boolean', 'bigint', 'symbol'].includes(typeof input);
};
/**
 * Type-safe and prototype-safe check to determine whether an object has a property as its own (not inherited).
 *
 * @param obj - The object to check.
 * @param prop - The property key to check for.
 * @returns True if the object has the property as its own key.
 */
export const hasOwnProperty = <T extends object, K extends PropertyKey>(obj: T, prop: K): obj is T & Record<K, unknown> => {
    return Object.prototype.hasOwnProperty.call(obj, prop);
};
