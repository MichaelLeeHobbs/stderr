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

/**
 * Keys produced by a historical internal-state leak in stderr-lib <= 2.2.0.
 *
 * Up to 2.2.0, StdError stored maxDepth under `Symbol('stderr_maxDepth')` as an own
 * property. Re-normalizing an already-normalized error copied it through
 * copyPropertiesTo with convertSymbolKeys: true, stringifying it into output as the
 * literal key "Symbol(stderr_maxDepth)". Once such an error reaches a JSON log and is
 * rehydrated the key is a plain STRING and copies forward forever with no symbol involved.
 *
 * These keys are therefore dropped UNCONDITIONALLY on every enumeration, so that
 * corrupted errors heal on normalization — including errors minted by an old copy of
 * this package still loaded in the same process (CJS/ESM dual-package or a transitive dep),
 * whose distinct Symbol() stringifies to the identical text.
 *
 * ACCEPTED TRADE-OFF: a user property literally named "Symbol(stderr_maxDepth)" is dropped.
 * This is not an Error key and not a filter for current internal state — StdError 2.3+ has
 * no internal own property to filter (ADR-007). This list is a LEGACY QUARANTINE and may be
 * deleted once v<=2.2.0 errors have aged out of log stores.
 */
export const LEGACY_LEAK_KEYS: ReadonlySet<string> = new Set<string>(['Symbol(stderr_maxDepth)']);
