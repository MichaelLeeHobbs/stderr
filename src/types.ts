// src/types.ts

/**
 * Dictionary type for objects with string or symbol keys and unknown values.
 * More specific than the previous version with separate index signatures.
 */
export type Dictionary = Record<string | symbol, unknown>;

export type ErrorRecord = Dictionary;

export type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/**
 * ErrorShape represents the structural interface for standardized errors.
 * This type defines what error-like objects should look like, regardless of their actual class.
 *
 * ErrorShape is intentionally kept as a structural type (not just StdError) because:
 * - It allows duck-typing: any object with these properties is error-shaped
 * - Internal methods can format/serialize Error, StdError, or plain error objects uniformly
 * - The isErrorShaped() type guard works structurally, not via instanceof
 * - Provides flexibility when working with errors from external sources
 *
 * @see StdError - The concrete class implementation that implements ErrorShape
 * @see isErrorShaped - Type guard to check if an object matches this shape
 *
 * @example
 * ```typescript
 * // All of these are ErrorShape:
 * const stdErr: ErrorShape = new StdError('message');
 * const nativeErr: ErrorShape = new Error('message');
 * const plainErr: ErrorShape = { name: 'Error', message: 'msg' };
 * ```
 */
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

/**
 * ErrorShape with errors guaranteed to be an array of ErrorShape objects.
 * Used for AggregateError-style errors with multiple sub-errors.
 */
export type ErrorShapeWithErrorsArray = WithRequiredType<ErrorShape, 'errors', ErrorShape[]>;

/**
 * ErrorShape with errors as a keyed object/dictionary of errors.
 * Used for non-standard error collections with named errors.
 */
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

export const isErrorInstance = (v: unknown): v is Error => v instanceof Error;

export const isPrimitive = (value: unknown): value is string | number | boolean | null | undefined | symbol | bigint => {
    return !isObject(value) && typeof value !== 'function';
};

export const isErrorShaped = (input: unknown): input is ErrorShape => {
    if (!isObject(input)) return false;
    if (isErrorInstance(input)) return true; // fast path for real Error
    const keys = Reflect.ownKeys(input);
    // Any of the common Error-ish fields present counts as "error-shaped"
    return keys.some(k => k === 'name' || k === 'message' || k === 'cause' || k === 'errors' || k === 'stack');
};
