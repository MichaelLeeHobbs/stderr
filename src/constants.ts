/**
 * Maximum depth for recursive error display in toString() and toJSON()
 * Can be overridden per instance or globally via StdError.defaultMaxDepth
 */
export const MAX_DEPTH = 8;

/**
 * Maximum number of properties to display/serialize
 * Can be overridden per instance or globally via StdError.defaultMaxProperties
 */
export const MAX_PROPERTIES = 1000;

/**
 * Maximum array length to display/serialize
 * Can be overridden per instance or globally via StdError.defaultMaxArrayLength
 */
export const MAX_ARRAY_LENGTH = 10000;

/**
 * Maximum number of items to display inline in arrays/objects before summarizing
 */
export const MAX_INLINE_ITEMS = 3;
