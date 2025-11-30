/**
 * Default maximum depth for recursive error normalization and serialization.
 * Used as the default value for both `stderr.maxDepth` and `StdError.defaultMaxDepth`.
 * Can be overridden globally or per-instance.
 */
export const MAX_DEPTH = 8;

/**
 * Default maximum number of properties to process when normalizing or serializing objects.
 * Used as the default value for both `stderr.maxProperties` and `StdError.defaultMaxProperties`.
 * Can be overridden globally or per-instance.
 */
export const MAX_PROPERTIES = 1000;

/**
 * Default maximum array length to process when normalizing or serializing arrays.
 * Used as the default value for both `stderr.maxArrayLength` and `StdError.defaultMaxArrayLength`.
 * Can be overridden globally or per-instance.
 */
export const MAX_ARRAY_LENGTH = 10000;

/**
 * Maximum number of items to display inline in arrays/objects in toString() output.
 * Arrays/objects exceeding this limit are summarized (e.g., "[Array(100)]", "{Object with 50 keys}").
 * This is a display-only constant and cannot be overridden.
 */
export const MAX_INLINE_ITEMS = 3;
