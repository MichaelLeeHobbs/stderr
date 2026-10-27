// src/StdError.ts

import { ErrorRecord, ErrorShape, isArray, isErrorLike, isErrorShaped, isInstanceOf, isObject, isPrimitive, isString, isSymbol } from './types';
import {
    addMarker,
    boundKeys,
    buildExcludeKeys,
    checkDepthLimit,
    collectionTruncation,
    copyPropertiesTo,
    formatDate,
    freeKey,
    getCustomKeys,
    isMarkerKey,
    type Limits,
    safeGet,
    setLimit,
    unknownToString,
    validateLimits,
    VisitTracker,
} from './utils';
import { MAX_DEPTH, MAX_ARRAY_LENGTH, MAX_PROPERTIES, MAX_INLINE_ITEMS } from './constants';

/**
 * Per-instance limits are stored OFF-instance in a module-local side table.
 *
 * They must never be own properties of the error. This library defines "user data" as
 * every key `Reflect.ownKeys` returns, including non-enumerable ones (copyPropertiesTo
 * passes includeNonEnumerable: true). On a StdError, "own property" IS "observable output"
 * by construction. A Symbol is a collision-avoidance device, not a privacy device — see ADR-007.
 */
const limitsRegistry = new WeakMap<StdError, Partial<Limits>>();

// Backing values for the validated StdError.default* accessors
const defaults: Limits = { maxDepth: MAX_DEPTH, maxProperties: MAX_PROPERTIES, maxArrayLength: MAX_ARRAY_LENGTH };

/** State for one toString()/toJSON() walk. */
interface WalkContext {
    maxDepth: number;
    maxProperties: number;
    maxArrayLength: number;
    tracker: VisitTracker;
}

/**
 * StdError is a standardized Error class that provides consistent error handling
 * with built-in comprehensive toString() and toJSON() methods.
 *
 * Features:
 * - Automatic comprehensive toString() that shows all properties, cause chains, and nested errors
 * - Built-in toJSON() for JSON serialization with circular reference detection
 * - Cause chain support with recursive display
 * - Handles AggregateError-style errors arrays and error objects
 * - Works consistently across Node.js and browser environments
 * - Extensible for custom error classes
 *
 * @example
 * ```typescript
 * const error = new StdError('Operation failed', {
 *   cause: new Error('Network timeout'),
 *   code: 'ERR_TIMEOUT',
 *   statusCode: 408
 * });
 *
 * console.log(error.toString()); // Shows all properties, cause chain, etc.
 * JSON.stringify(error); // Automatically uses toJSON()
 * ```
 */
export class StdError extends Error implements ErrorShape {
    /** Error name (defaults to 'Error') */
    declare name: string;

    /** Error message */
    declare message: string;

    /** Stack trace */
    declare stack?: string;

    /** Error cause (can be any value, typically another Error) */
    declare cause?: unknown;

    /** Nested errors (AggregateError-style or custom error maps) */
    declare errors?: unknown;

    /** Additional custom properties */
    [key: string]: unknown;

    [key: symbol]: unknown;

    /**
     * Global default maximum depth for recursive operations (integer, 1-1000).
     * Can be overridden per instance. Invalid values throw TypeError/RangeError, as for `stderr.maxDepth`.
     */
    static get defaultMaxDepth(): number {
        return defaults.maxDepth;
    }

    static set defaultMaxDepth(value: number) {
        setLimit(defaults, 'maxDepth', value);
    }

    /**
     * Global default maximum number of properties per object serialized by toJSON()/toString() (integer, 1-100000).
     * Can be overridden per instance. Invalid values throw TypeError/RangeError.
     */
    static get defaultMaxProperties(): number {
        return defaults.maxProperties;
    }

    static set defaultMaxProperties(value: number) {
        setLimit(defaults, 'maxProperties', value);
    }

    /**
     * Global default maximum array length serialized by toJSON()/toString() (integer, 1-1000000).
     * Can be overridden per instance. Invalid values throw TypeError/RangeError.
     */
    static get defaultMaxArrayLength(): number {
        return defaults.maxArrayLength;
    }

    static set defaultMaxArrayLength(value: number) {
        setLimit(defaults, 'maxArrayLength', value);
    }

    /**
     * Creates a new StdError instance
     *
     * @param message - Error message
     * @param options - Optional configuration and properties
     * @param options.cause - Error cause
     * @param options.errors - Nested errors
     * @param options.name - Error name (defaults to 'Error')
     * @param options.maxDepth - Maximum recursion depth for this instance
     * @param options.maxProperties - Maximum properties to copy/serialize for this instance
     * @param options.maxArrayLength - Maximum array length to copy/serialize for this instance
     * @param options.[key] - Any additional custom properties
     * @throws TypeError/RangeError if a limit is not an integer in its valid range (same ranges as stderr())
     *
     * @example
     * ```typescript
     * new StdError('Failed', {
     *   cause: rootError,
     *   code: 'E_FAIL',
     *   maxDepth: 10,
     *   maxProperties: 50,
     *   maxArrayLength: 100
     * });
     * ```
     */
    constructor(
        message?: string,
        options?: { cause?: unknown; errors?: unknown; name?: string; maxDepth?: number; maxProperties?: number; maxArrayLength?: number } & ErrorRecord
    ) {
        // Validate before anything else: an invalid limit would silently break toJSON()/toString()
        if (options) validateLimits(options);

        super(message);
        this.name = (options?.name as string) || 'Error';
        if (!options) return;

        if (options.cause !== undefined) this.cause = options.cause;
        if (options.errors !== undefined) this.errors = options.errors;

        // Limits are stored off-instance; never own properties — see ADR-007
        const { maxDepth, maxProperties, maxArrayLength } = options;
        if (maxDepth !== undefined || maxProperties !== undefined || maxArrayLength !== undefined) {
            limitsRegistry.set(this, { maxDepth, maxProperties, maxArrayLength });
        }

        // Everything else is a custom property. Excluding every key on the prototype chain also keeps out
        // the critical security keys (prototype, __proto__, constructor). Functions are skipped (this is a
        // logging library, not a debugging dump) and symbol keys stay symbols.
        copyPropertiesTo(options, this, {
            excludeKeys: buildExcludeKeys(this, ['cause', 'errors', 'name', 'message', 'maxDepth', 'maxProperties', 'maxArrayLength']),
            maxProperties: maxProperties ?? defaults.maxProperties,
            maxArrayLength: maxArrayLength ?? defaults.maxArrayLength,
        });
    }

    /**
     * Returns a comprehensive string representation of the error
     * including all properties, cause chain, and nested errors.
     *
     * This method provides much more detail than the default Error.toString()
     * and is suitable for logging and debugging.
     *
     * @returns Formatted error string with all details
     *
     * @example
     * ```typescript
     * const error = new StdError('DB Error', {
     *   code: 'E_DB',
     *   cause: new Error('Connection failed')
     * });
     * console.log(error.toString());
     * // Error: DB Error
     * //   at <stack>
     * //   code: 'E_DB'
     * //   [cause]: Error: Connection failed
     * ```
     */
    toString(): string {
        return formatError(this, 0, createWalkContext(this));
    }

    /**
     * Returns a JSON-safe representation of the error.
     * Handles circular references and respects maxDepth, maxProperties and maxArrayLength.
     *
     * This method is automatically called by JSON.stringify().
     *
     * @returns Plain object suitable for JSON serialization
     *
     * @example
     * ```typescript
     * const error = new StdError('Failed', { code: 'E_FAIL' });
     * const json = JSON.stringify(error);
     * // Uses toJSON() automatically
     * ```
     */
    toJSON(): ErrorShape {
        // Always an object: the root is walked at depth 0 with a fresh tracker, and maxDepth is validated to be >= 1
        return serializeError(this, 0, createWalkContext(this)) as ErrorShape;
    }
}

/*
 * Formatting and serialization live at module level, NOT as (private) methods: anything on
 * StdError.prototype is excluded from user properties by the constructor, so every method
 * name would silently swallow a user property of the same name.
 */

const createWalkContext = (error: StdError): WalkContext => {
    const limits = limitsRegistry.get(error);
    return {
        maxDepth: limits?.maxDepth ?? defaults.maxDepth,
        maxProperties: limits?.maxProperties ?? defaults.maxProperties,
        maxArrayLength: limits?.maxArrayLength ?? defaults.maxArrayLength,
        tracker: new VisitTracker(),
    };
};

/**
 * Reads `name`/`message` as a string. Errors not built by stderr() can hold anything there
 * (a bigint, an object); it must not reach the output raw.
 */
const textField = (error: object, key: 'name' | 'message', fallback: string): string => {
    const value = safeGet(error, key);
    if (value === undefined || value === null || value === '') return fallback;
    return isString(value) ? value : unknownToString(value);
};

/**
 * Formats an error for string display with proper indentation.
 * The first line is never indented: callers always place it after a label (`[cause]: `, `[0]: `).
 */
const formatError = (error: ErrorShape, depth: number, ctx: WalkContext): string => {
    const indent = '  '.repeat(depth);

    const depthMsg = checkDepthLimit(depth, ctx.maxDepth);
    if (depthMsg) return depthMsg;

    const marker = ctx.tracker.enter(error);
    if (marker) return marker;

    try {
        const lines: string[] = [];

        // First line: name and message
        const name = textField(error, 'name', 'Error');
        const message = textField(error, 'message', '');
        lines.push(message ? `${name}: ${message}` : name);

        // Stack trace (only first few lines to keep it readable)
        const stack = safeGet(error, 'stack');
        if (depth === 0 && typeof stack === 'string') {
            const stackLines = stack.split('\n').slice(1, 4); // Skip first line (already shown), take next 3
            stackLines.forEach(line => lines.push(`  ${line.trim()}`));
        }

        // Custom properties
        const { keys, truncated } = boundKeys(getCustomKeys(error), ctx.maxProperties);
        for (const key of keys) {
            const formattedValue = formatValue(safeGet(error, key), depth + 1, ctx);
            lines.push(`${indent}  ${String(key)}: ${formattedValue}`);
        }
        if (truncated) lines.push(`${indent}  _truncated: '${truncated}'`);

        // Cause chain
        const cause = safeGet(error, 'cause');
        if (cause !== undefined && cause !== null) {
            lines.push(`${indent}  [cause]: ${formatCause(cause, depth + 1, ctx)}`);
        }

        // Errors (array or object)
        const errors = safeGet(error, 'errors');
        if (errors !== undefined && errors !== null) {
            lines.push(`${indent}  [errors]: ${formatErrors(errors, depth + 1, ctx)}`);
        }

        return lines.join('\n');
    } finally {
        ctx.tracker.leave(error);
    }
};

/**
 * Formats a cause for display
 */
const formatCause = (cause: unknown, depth: number, ctx: WalkContext): string => {
    const depthMsg = checkDepthLimit(depth, ctx.maxDepth);
    if (depthMsg) return depthMsg;

    if (isErrorShaped(cause)) return formatError(cause, depth, ctx);

    return formatValue(cause, depth, ctx);
};

/**
 * Formats the errors property (array or object)
 */
const formatErrors = (errors: unknown, depth: number, ctx: WalkContext): string => guarded(() => formatErrorsUnguarded(errors, depth, ctx));

const formatErrorsUnguarded = (errors: unknown, depth: number, ctx: WalkContext): string => {
    const indent = '  '.repeat(depth);

    const depthMsg = checkDepthLimit(depth, ctx.maxDepth);
    if (depthMsg) return depthMsg;

    // Keep same depth - the container doesn't add a semantic nesting level
    const formatItem = (label: string, value: unknown) =>
        `${indent}  ${label}: ${isErrorShaped(value) ? formatError(value, depth, ctx) : formatValue(value, depth + 1, ctx)}`;

    const list = isInstanceOf(errors, Set) ? Array.from(errors.values()) : isArray(errors) ? errors : undefined;
    if (list) {
        if (list.length === 0) return '[]';
        const items = list.slice(0, ctx.maxArrayLength).map((err, idx) => formatItem(`[${idx}]`, err));
        const cut = collectionTruncation(errors, ctx.maxArrayLength);
        if (cut) items.push(`${indent}  _truncated: '${cut}'`);
        return '[\n' + items.join('\n') + `\n${indent}]`;
    }

    // A Map of errors keyed by field
    if (isInstanceOf(errors, Map)) {
        const entries = Array.from(errors.entries());
        if (entries.length === 0) return '{}';
        const items = entries.slice(0, ctx.maxProperties).map(([key, value]) => formatItem(unknownToString(key), value));
        if (entries.length > ctx.maxProperties) {
            items.push(`${indent}  _truncated: 'Property count (${entries.length}) exceeds limit (${ctx.maxProperties}), showing first ${ctx.maxProperties}'`);
        }
        return '{\n' + items.join('\n') + `\n${indent}}`;
    }

    // A plain object of errors keyed by field, as serializeErrors() reads it
    if (isErrorsMap(errors)) {
        const { keys, truncated } = boundKeys(Object.keys(errors), ctx.maxProperties);
        if (keys.length === 0) return '{}';
        const items = keys.map(key => formatItem(key, safeGet(errors, key)));
        if (truncated) items.push(`${indent}  _truncated: '${truncated}'`);
        return '{\n' + items.join('\n') + `\n${indent}}`;
    }

    // A single error, AggregateError style
    if (isErrorShaped(errors)) return formatError(errors, depth, ctx);
    return formatValue(errors, depth, ctx);
};

/**
 * Formats a generic value for display
 */
const formatValue = (value: unknown, depth: number, ctx: WalkContext): string => guarded(() => formatValueUnguarded(value, depth, ctx));

const formatValueUnguarded = (value: unknown, depth: number, ctx: WalkContext): string => {
    // Primitives are always shown: the depth limit exists to stop recursion, and they do not recurse
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (isSymbol(value)) return value.toString();
    if (isPrimitive(value)) return typeof value === 'string' ? `'${value}'` : String(value);

    const depthMsg = checkDepthLimit(depth, ctx.maxDepth);
    if (depthMsg) return depthMsg;

    if (isInstanceOf(value, Date)) return formatDate(value);
    if (isInstanceOf(value, RegExp)) return value.toString();
    if (isInstanceOf(value, Map)) return `Map(${value.size})`;
    if (isInstanceOf(value, Set)) return `Set(${value.size})`;

    // An error in metadata is shown as an error: Object.keys() would miss its message, which is not enumerable
    if (isErrorLike(value)) return formatError(value, depth, ctx);

    if (!isObject(value)) {
        /* node:coverage ignore next 2 */
        // Should be impossible to reach here (functions are never copied), but just in case
        return unknownToString(value);
    }

    const marker = ctx.tracker.enter(value);
    if (marker) return marker;

    try {
        if (isArray(value)) {
            if (value.length === 0) return '[]';
            if (value.length > MAX_INLINE_ITEMS) return `[Array(${value.length})]`;
            return '[' + value.map(v => formatValue(v, depth + 1, ctx)).join(', ') + ']';
        }

        const keys = Object.keys(value);
        if (keys.length === 0) return '{}';
        if (keys.length > MAX_INLINE_ITEMS) return `{Object with ${keys.length} keys}`;

        const pairs = keys.map(k => `${k}: ${formatValue(safeGet(value, k), depth + 1, ctx)}`);
        return '{ ' + pairs.join(', ') + ' }';
    } finally {
        ctx.tracker.leave(value);
    }
};

/**
 * Recursively serializes an error to a JSON-safe object or string marker
 */
const serializeError = (error: ErrorShape, depth: number, ctx: WalkContext): ErrorRecord | string => {
    const depthMsg = checkDepthLimit(depth, ctx.maxDepth);
    if (depthMsg) return depthMsg;

    const marker = ctx.tracker.enter(error);
    if (marker) return marker;

    try {
        const result: ErrorShape = {
            name: textField(error, 'name', 'Error'),
            message: textField(error, 'message', ''),
        };

        // Include stack if present (only a string: anything else could be circular or a bigint)
        const stack = safeGet(error, 'stack');
        if (isString(stack)) {
            result.stack = stack;
        }

        // Serialize cause
        const cause = safeGet(error, 'cause');
        if (cause !== undefined && cause !== null) {
            // While it might seem logical to not increase depth here as we are going deeper into the structure,
            // We do need to increase depth to avoid cases where cause chains are very deep and could lead to stack overflows.
            // Perhaps we can revisit this decision later if it causes issues.
            result.cause = serializeValue(cause, depth + 1, ctx, true);
        }

        // Serialize errors
        const errors = safeGet(error, 'errors');
        if (errors !== undefined && errors !== null) {
            // Do not increase depth here as we are already increasing it for the array
            result.errors = serializeErrors(errors, depth, ctx);
        }

        // Serialize custom properties
        const { keys, truncated } = boundKeys(getCustomKeys(error), ctx.maxProperties);
        const cuts: [string, string][] = [];
        for (const key of keys) {
            const value = safeGet(error, key);
            // Distinct symbols can share a description: keep both instead of overwriting
            const serializedKey = isSymbol(key) ? freeKey(result, key.toString()) : String(key);
            // Do not increase depth for an array as we are already increasing it for its items
            result[serializedKey] = isArray(value) ? guarded(() => serializeArray(value, depth, ctx, false)) : serializeValue(value, depth + 1, ctx, false);
            const cut = newCut(error, serializedKey, value, ctx);
            if (cut) cuts.push(cut);
        }
        // A long errors list is cut when serialized: mark it, as stderr() does
        const errorsCut = isErrorsMap(errors) ? undefined : collectionTruncation(errors, ctx.maxArrayLength);
        addMarkers(result, keys, ctx, [truncated, errorsCut], cuts);

        return result;
    } finally {
        ctx.tracker.leave(error);
    }
};

/**
 * Serializes the `errors` slot. A plain object there is a map of errors keyed by field, as stderr() reads it:
 * a field called `name` or `message` ({ name: 'required', email: 'invalid' }) does not make the map an error.
 */
const serializeErrors = (errors: unknown, depth: number, ctx: WalkContext): unknown =>
    guarded(() => (isErrorsMap(errors) ? serializeObject(errors, depth, ctx, true) : serializeValue(errors, depth, ctx, true)));

/**
 * Adds the `_truncated` messages, then the `_truncated_<key>` cuts, after the properties are written. Together with
 * the markers carried over in `keptKeys` they stay within maxProperties + 1, as boundKeys() allows: one walk adds
 * at most that many, whatever an input carries. A cut left out is still shown as a shorter array.
 */
const addMarkers = (result: ErrorRecord, keptKeys: (string | symbol)[], ctx: WalkContext, messages: (string | undefined)[], cuts: [string, string][]): void => {
    const all: [string, string][] = [...messages.filter(isString).map((m): [string, string] => ['_truncated', m]), ...cuts];
    const room = ctx.maxProperties + 1 - keptKeys.filter(isMarkerKey).length;
    for (const [key, message] of all.slice(0, Math.max(0, room))) addMarker(result, key, message);
};

/** A plain object in the `errors` slot: a map of errors keyed by field. */
const isErrorsMap = (errors: unknown): errors is object => isObject(errors) && !isArray(errors) && !isErrorLike(errors) && !isBuiltIn(errors);

/**
 * The `_truncated_<key>` marker for a value that serializing cuts (an array, Map or Set over maxArrayLength).
 * None when the source already carries that marker: stderr() and the constructor mark what they cut themselves.
 */
const newCut = (source: object, key: string, value: unknown, ctx: WalkContext): [string, string] | undefined => {
    // A carried marker's value is a library message, not data to mark
    if (isMarkerKey(key)) return undefined;
    const markerKey = `_truncated_${key}`;
    if (Object.prototype.hasOwnProperty.call(source, markerKey)) return undefined;
    const cut = collectionTruncation(value, ctx.maxArrayLength);
    return cut ? [markerKey, cut] : undefined;
};

/** Date, RegExp, Map and Set: objects whose state is not in own properties. */
const isBuiltIn = (value: unknown): boolean => isInstanceOf(value, Date) || isInstanceOf(value, RegExp) || isInstanceOf(value, Map) || isInstanceOf(value, Set);

/**
 * A value that cannot be read at all (a Proxy of a Date, Object.create(Map.prototype), a throwing Proxy trap)
 * becomes this marker instead of making toJSON()/toString() throw.
 */
const UNREADABLE = '[Unreadable value]';

const guarded = <T>(fn: () => T): T | string => {
    try {
        return fn();
    } catch {
        return UNREADABLE;
    }
};

/**
 * Serializes array items at `itemDepth`, bounded by maxArrayLength and guarded against cycles through arrays
 */
const serializeArray = (value: unknown[], itemDepth: number, ctx: WalkContext, lenient: boolean): unknown => {
    const marker = ctx.tracker.enter(value);
    if (marker) return marker;
    try {
        return value.slice(0, ctx.maxArrayLength).map(item => serializeValue(item, itemDepth, ctx, lenient));
    } finally {
        ctx.tracker.leave(value);
    }
};

/**
 * Serializes any value to a JSON-safe format.
 * `lenient` treats any error-shaped object as an error (used for cause/errors, where that is the
 * meaning of the slot); otherwise only real Errors and {message + name|stack} objects are (metadata).
 */
const serializeValue = (value: unknown, depth: number, ctx: WalkContext, lenient: boolean): unknown =>
    guarded(() => serializeValueUnguarded(value, depth, ctx, lenient));

const serializeValueUnguarded = (value: unknown, depth: number, ctx: WalkContext, lenient: boolean): unknown => {
    // Primitives (JSON.stringify cannot handle bigint, so it becomes a string)
    if (value === null || value === undefined) return value;
    if (isSymbol(value) || typeof value === 'bigint') return value.toString();
    if (isPrimitive(value)) return value;

    const depthMsg = checkDepthLimit(depth, ctx.maxDepth);
    if (depthMsg) return depthMsg;

    // Functions
    /* node:coverage ignore next - should never happen */
    if (typeof value === 'function') return undefined; // Functions are not serializable

    if (isInstanceOf(value, Date)) return formatDate(value);
    if (isInstanceOf(value, RegExp)) return value.toString();

    // Error-shaped objects (serializeError does its own cycle tracking)
    if (lenient ? isErrorShaped(value) : isErrorLike(value)) return serializeError(value as ErrorShape, depth, ctx);

    // Arrays
    if (isArray(value)) return serializeArray(value, depth + 1, ctx, lenient);

    if (!isInstanceOf(value, Map) && !isInstanceOf(value, Set)) return serializeObject(value, depth, ctx, false);

    const marker = ctx.tracker.enter(value);
    if (marker) return marker;

    try {
        // Map -> [[key, value], ...], Set -> [value, ...]
        if (isInstanceOf(value, Map)) {
            return Array.from(value.entries())
                .slice(0, ctx.maxArrayLength)
                .map(([k, v]) => [serializeValue(k, depth + 1, ctx, false), serializeValue(v, depth + 1, ctx, false)]);
        }
        return Array.from((value as Set<unknown>).values())
            .slice(0, ctx.maxArrayLength)
            .map(v => serializeValue(v, depth + 1, ctx, false));
    } finally {
        ctx.tracker.leave(value);
    }
};

/**
 * Plain objects: enumerable string and symbol keys, bounded together.
 * `lenientValues` serializes each value as an error slot (used for a map of errors).
 */
const serializeObject = (value: object, depth: number, ctx: WalkContext, lenientValues: boolean): unknown => {
    const depthMsg = checkDepthLimit(depth, ctx.maxDepth);
    if (depthMsg) return depthMsg;

    const marker = ctx.tracker.enter(value);
    if (marker) return marker;

    try {
        const result: ErrorRecord = {};
        const { keys, truncated } = boundKeys(getCustomKeys(value, { excludeKeys: new Set() }), ctx.maxProperties);

        const cuts: [string, string][] = [];
        for (const key of keys) {
            const serializedKey = isSymbol(key) ? freeKey(result, key.toString()) : key;
            const item = safeGet(value, key);
            result[serializedKey] = serializeValue(item, depth + 1, ctx, lenientValues);
            const cut = newCut(value, serializedKey, item, ctx);
            if (cut) cuts.push(cut);
        }
        addMarkers(result, keys, ctx, [truncated], cuts);

        return result;
    } finally {
        ctx.tracker.leave(value);
    }
};

/**
 * Type alias for StdError interface (for backward compatibility and convenience)
 */
export type StdErrorShape = StdError;
