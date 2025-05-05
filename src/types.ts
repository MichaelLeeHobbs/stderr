// src/types.ts

export type ErrorShape = Omit<Error, 'name' | 'message'> & {
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
export const isError = (input: unknown): input is Error => input instanceof Error;
export const isErrorLike = (value: unknown): value is ErrorShape => isObject(value) && ('message' in value || 'name' in value);
export const isFunction = (input: unknown): input is (...args: unknown[]) => unknown => typeof input === 'function';
export const isSymbol = (input: unknown): input is symbol => typeof input === 'symbol';
//export const isObject = (input: unknown): input is object => typeof input === 'object' && input != null;
export const isObject = (value: unknown): value is Record<string | number | symbol, unknown> | object => typeof value === 'object' && value !== null;
export const isUndefined = (input: unknown): input is undefined => input === undefined;
export const isPrimitive = (value: unknown): value is string | number | boolean | null | undefined | symbol | bigint => {
    return !isObject(value) && typeof value !== 'function';
};
// export const isPrimitive = (input: unknown): input is string | number | boolean | bigint | symbol | null | undefined => {
//     return input == null || ['string', 'number', 'boolean', 'bigint', 'symbol'].includes(typeof input);
// };

export const hasProp = <T extends object, K extends PropertyKey>(obj: T, prop: K): obj is T & Record<K, unknown> => {
    return Object.prototype.hasOwnProperty.call(obj, prop);
};

export const isErrorShaped = (input: unknown): input is ErrorShape => {
    if (!isObject(input)) {
        return false;
    }
    const keys = Object.getOwnPropertyNames(input);
    // TODO: I'm not sure if 'name' or 'message' alone should be enough to be considered an object error shaped
    // TODO: what about code? Should we include it?
    return keys.includes('name') || keys.includes('message') || keys.includes('cause') || keys.includes('errors') || keys.includes('stack');
};

/* Copy of Node.js util InspectOptions as we can't import this and be compatible with browsers */
export interface InspectOptions {
    /**
     * If `true`, object's non-enumerable symbols and properties are included in the formatted result.
     * `WeakMap` and `WeakSet` entries are also included as well as user defined prototype properties (excluding method properties).
     * @default false
     */
    showHidden?: boolean | undefined;
    /**
     * Specifies the number of times to recurse while formatting object.
     * This is useful for inspecting large objects.
     * To recurse up to the maximum call stack size pass `Infinity` or `null`.
     * @default 2
     */
    depth?: number | null | undefined;
    /**
     * If `true`, the output is styled with ANSI color codes. Colors are customizable.
     */
    colors?: boolean | undefined;
    /**
     * If `false`, `[util.inspect.custom](depth, opts, inspect)` functions are not invoked.
     * @default true
     */
    customInspect?: boolean | undefined;
    /**
     * If `true`, `Proxy` inspection includes the target and handler objects.
     * @default false
     */
    showProxy?: boolean | undefined;
    /**
     * Specifies the maximum number of `Array`, `TypedArray`, `WeakMap`, and `WeakSet` elements
     * to include when formatting. Set to `null` or `Infinity` to show all elements.
     * Set to `0` or negative to show no elements.
     * @default 100
     */
    maxArrayLength?: number | null | undefined;
    /**
     * Specifies the maximum number of characters to
     * include when formatting. Set to `null` or `Infinity` to show all elements.
     * Set to `0` or negative to show no characters.
     * @default 10000
     */
    maxStringLength?: number | null | undefined;
    /**
     * The length at which input values are split across multiple lines.
     * Set to `Infinity` to format the input as a single line
     * (in combination with `compact` set to `true` or any number >= `1`).
     * @default 80
     */
    breakLength?: number | undefined;
    /**
     * Setting this to `false` causes each object key
     * to be displayed on a new line. It will also add new lines to text that is
     * longer than `breakLength`. If set to a number, the most `n` inner elements
     * are united on a single line as long as all properties fit into
     * `breakLength`. Short array elements are also grouped together. Note that no
     * text will be reduced below 16 characters, no matter the `breakLength` size.
     * For more information, see the example below.
     * @default true
     */
    compact?: boolean | number | undefined;
    /**
     * If set to `true` or a function, all properties of an object, and `Set` and `Map`
     * entries are sorted in the resulting string.
     * If set to `true` the default sort is used.
     * If set to a function, it is used as a compare function.
     */
    sorted?: boolean | ((a: string, b: string) => number) | undefined;
    /**
     * If set to `true`, getters are going to be
     * inspected as well. If set to `'get'` only getters without setter are going
     * to be inspected. If set to `'set'` only getters having a corresponding
     * setter are going to be inspected. This might cause side effects depending on
     * the getter function.
     * @default false
     */
    getters?: 'get' | 'set' | boolean | undefined;
    /**
     * If set to `true`, an underscore is used to separate every three digits in all bigints and numbers.
     * @default false
     */
    numericSeparator?: boolean | undefined;
}
