export type Dict = Record<string | symbol, unknown>;

// Type definition combining Error with optional cause and errors properties
// Allows us to attach nested error causes and sub-error collections
// without losing type information.

export type ErrorWithCause = Error & {
    cause?: unknown;
};

export function isErrorWithCause(input: unknown): input is ErrorWithCause {
    return isObjectNonNull(input) && 'cause' in input && (input as unknown as ErrorWithCause).cause !== undefined;
}

export type ErrorWithCauseOld = ErrorWithCause & {
    cause?: unknown;
    errors?: unknown;
};

export type ErrorWithErrorsObject = Error & {
    errors: Dict;
};

export function isErrorWithErrorsObject(input: unknown): input is ErrorWithErrorsObject {
    return isObjectNonNull(input) && 'errors' in input && !Array.isArray((input as unknown as ErrorWithErrorsObject).errors);
}

export type ErrorWithUnknownErrorsArray = Error & {
    errors: unknown[];
};

export type ErrorWithErrorsArray = Error & {
    errors: Error[];
};

export function isErrorWithErrorsArray(input: unknown): input is ErrorWithUnknownErrorsArray {
    return isObjectNonNull(input) && 'errors' in input && Array.isArray((input as unknown as ErrorWithUnknownErrorsArray).errors);
}

export type ErrorWithCauseErrorsArray = ErrorWithCauseOld & {
    errors: unknown[];
};

// Type definition combining Error with optional cause and errors properties
export type ErrorWithDictionary = ErrorWithCauseOld & StringSymbolDictionary;

export type StringSymbolDictionary = {
    [key: string | symbol]: unknown;
};

/**
 * Type guard that checks if the input is a primitive type
 * that can be directly converted into a string message.
 */
export function isPrimitive(input: unknown): input is string | number | boolean | symbol | bigint | null | undefined {
    return (
        input === null ||
        input === undefined ||
        typeof input === 'string' ||
        typeof input === 'number' ||
        typeof input === 'boolean' ||
        typeof input === 'bigint' ||
        typeof input === 'symbol'
    );
}

/**
 * Type guard that specifically checks for a plain string.
 */
export function isString(input: unknown): input is string {
    return typeof input === 'string';
}

export function isSymbol(input: unknown): input is symbol {
    return typeof input === 'symbol';
}

/**
 * Type guard to check if an input is already an Error (or subclass).
 * Catches built-in and custom Errors.
 */
export function isError(input: unknown): input is Error {
    return input instanceof Error;
}

// Represents an object shape that carries a non-Error `cause`. We
// detect these to convert the cause into a proper Error instance.
export type CauseObject = {
    cause: unknown;
};

/**
 * Type guard that detects if an input is a non-null object
 * (including arrays, functions, and plain object literals).
 */
export function isObjectNonNull(input: unknown): input is Record<string, unknown> {
    return typeof input === 'object' && input !== null;
}

export function isObject(input: unknown): input is object {
    return typeof input === 'object';
}


/**
 * Type guard that determines if an object has a `cause` property
 * which is not already an Error instance. We use this to normalize
 * nested causes properly.
 */
export function isCauseObject(err: unknown): err is CauseObject {
    return isObjectNonNull(err) && 'cause' in err && !((err as unknown as ErrorWithCauseOld).cause instanceof Error);
}
