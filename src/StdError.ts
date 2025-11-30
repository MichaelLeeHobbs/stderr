// src/StdError.ts

import { ErrorRecord, ErrorShape, isArray, isErrorShaped, isObject, isPrimitive, isSymbol } from './types';
import { checkCircular, checkDepthLimit, getCustomKeys, trackSeen, unknownToString, buildExcludeKeys, copyPropertiesTo } from './utils';
import { MAX_DEPTH, MAX_ARRAY_LENGTH, MAX_PROPERTIES, MAX_INLINE_ITEMS } from './constants';

/**
 * Symbol for storing maxDepth on StdError instances
 * Using a Symbol ensures it won't collide with real-world error properties
 * and won't appear in normal property enumeration (Object.keys, for...in, etc.)
 */
const MAX_DEPTH_SYMBOL = Symbol('stderr_maxDepth');

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

    /** Maximum depth for recursive operations (stored via Symbol to prevent property collision) */
    private readonly [MAX_DEPTH_SYMBOL]?: number;

    /** Additional custom properties */
    [key: string]: unknown;

    [key: symbol]: unknown;

    /**
     * Global default maximum depth for recursive operations
     * Can be overridden per instance
     */
    static defaultMaxDepth: number = MAX_DEPTH;

    /**
     * Creates a new StdError instance
     *
     * @param message - Error message
     * @param options - Optional configuration and properties
     * @param options.cause - Error cause
     * @param options.errors - Nested errors
     * @param options.name - Error name (defaults to 'Error')
     * @param options.maxDepth - Maximum recursion depth for this instance
     * @param options.maxProperties - Maximum properties to display/serialize for this instance
     * @param options.maxArrayLength - Maximum array length to display/serialize for this instance
     * @param options.[key] - Any additional custom properties
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
        super(message);

        // Set name
        this.name = (options?.name as string) || 'Error';

        // Set cause if provided and supported
        if (options?.cause !== undefined) {
            this.cause = options.cause;
        }

        // Set errors if provided
        if (options?.errors !== undefined) {
            this.errors = options.errors;
        }

        // Set maxDepth if provided (stored via Symbol to prevent property collision)
        if (options?.maxDepth !== undefined) {
            this[MAX_DEPTH_SYMBOL] = options.maxDepth;
        }

        // Copy any additional properties
        if (options) {
            // Build comprehensive exclude keys by walking prototype chain
            // Always includes critical security keys (prototype, __proto__, constructor)
            const excludeKeys = buildExcludeKeys(this, ['cause', 'errors', 'name', 'message', 'maxDepth', 'maxProperties', 'maxArrayLength']);

            // Use unified property copy utility
            // Skip functions - this is a logging library, not a debugging dump
            // Don't convert symbol keys - keep them as symbols
            copyPropertiesTo(options, this, {
                excludeKeys,
                maxProperties: options.maxProperties ?? MAX_PROPERTIES,
                maxArrayLength: options.maxArrayLength ?? MAX_ARRAY_LENGTH,
                skipFunctions: true,
                convertSymbolKeys: false,
            });
        }
    }

    /**
     * Gets the effective max depth for this instance
     */
    private getMaxDepth(): number {
        return this[MAX_DEPTH_SYMBOL] ?? StdError.defaultMaxDepth;
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
        return this.formatError(this, 0, new WeakSet());
    }

    /**
     * Formats an error for string display with proper indentation
     */
    private formatError(error: ErrorShape, depth: number, seen: WeakSet<object>): string {
        const maxDepth = this.getMaxDepth();
        const indent = '  '.repeat(depth);

        // Check depth limit
        const depthMsg = checkDepthLimit(depth, maxDepth, indent);
        if (depthMsg) return depthMsg;
        // console.log({ depth, depthMsg, error });

        // Check circular reference
        const circularMsg = checkCircular(error, seen, indent);
        if (circularMsg) return circularMsg;

        trackSeen(error, seen);

        const lines: string[] = [];

        // First line: name and message
        const name = error.name || 'Error';
        const message = error.message || '';
        const firstLine = message ? `${name}: ${message}` : name;
        lines.push(depth === 0 ? firstLine : `${indent}${firstLine}`);

        // Stack trace (only first few lines to keep it readable)
        if (depth === 0 && error.stack) {
            const stackLines = error.stack.split('\n').slice(1, 4); // Skip first line (already shown), take next 3
            stackLines.forEach(line => lines.push(`  ${line.trim()}`));
        }

        // Custom properties
        const customProps = this.getCustomProperties(error);
        if (customProps.length > 0) {
            customProps.forEach(key => {
                if (isSymbol(key) && key === MAX_DEPTH_SYMBOL) return; // Skip maxDepth symbol property
                const value = error[key];
                const formattedValue = this.formatValue(value, depth + 1, seen);
                lines.push(`${indent}  ${String(key)}: ${formattedValue}`);
            });
        }

        // Cause chain
        if (error.cause !== undefined && error.cause !== null) {
            lines.push(`${indent}  [cause]: ${this.formatCause(error.cause, depth + 1, seen)}`);
        }

        // Errors (array or object)
        if (error.errors !== undefined && error.errors !== null) {
            lines.push(`${indent}  [errors]: ${this.formatErrors(error.errors, depth + 1, seen)}`);
        }

        return lines.join('\n');
    }

    /**
     * Gets custom property keys (excluding standard Error properties)
     */
    private getCustomProperties(error: ErrorShape): (string | symbol)[] {
        return getCustomKeys(error);
    }

    /**
     * Formats a cause for display
     */
    private formatCause(cause: unknown, depth: number, seen: WeakSet<object>): string {
        const maxDepth = this.getMaxDepth();

        const depthMsg = checkDepthLimit(depth, maxDepth);
        if (depthMsg) return depthMsg;

        if (isErrorShaped(cause)) return this.formatError(cause as ErrorShape, depth, seen);

        return this.formatValue(cause, depth, seen);
    }

    /**
     * Formats the errors property (array or object)
     */
    private formatErrors(errors: unknown, depth: number, seen: WeakSet<object>): string {
        const maxDepth = this.getMaxDepth();
        const indent = '  '.repeat(depth);

        const depthMsg = checkDepthLimit(depth, maxDepth);
        if (depthMsg) return depthMsg;

        if (isArray(errors)) {
            if (errors.length === 0) return '[]';

            const items = errors.map((err, idx) => {
                if (isErrorShaped(err)) {
                    // Keep same depth - array container doesn't add semantic nesting level
                    const formatted = this.formatError(err as ErrorShape, depth, seen);
                    return `${indent}  [${idx}]: ${formatted.trim()}`;
                }
                // Keep same depth - array container doesn't add semantic nesting level
                return `${indent}  [${idx}]: ${this.formatValue(err, depth, seen)}`;
            });

            return '[\n' + items.join('\n') + `\n${indent}]`;
        }

        if (isObject(errors)) {
            const keys = Object.keys(errors);
            if (keys.length === 0) return '{}';

            const items = keys.map(key => {
                const value = (errors as ErrorRecord)[key];
                if (isErrorShaped(value)) {
                    const formatted = this.formatError(value as ErrorShape, depth, seen);
                    return `${indent}  ${key}: ${formatted.trim()}`;
                }
                return `${indent}  ${key}: ${this.formatValue(value, depth + 1, seen)}`;
            });

            return '{\n' + items.join('\n') + `\n${indent}}`;
        }

        return this.formatValue(errors, depth, seen);
    }

    /**
     * Formats a generic value for display
     */
    private formatValue(value: unknown, depth: number, seen: WeakSet<object>): string {
        const maxDepth = this.getMaxDepth();

        // TODO: I think we should check the depth limit after checking for primitives/symbol and null/undefined
        const depthMsg = checkDepthLimit(depth, maxDepth);
        if (depthMsg) return depthMsg;

        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (isSymbol(value)) return value.toString();
        if (isPrimitive(value)) return typeof value === 'string' ? `'${value}'` : String(value);

        const circularMsg = checkCircular(value, seen);
        if (circularMsg) return circularMsg;

        if (isArray(value)) {
            if (value.length === 0) return '[]';
            if (value.length > MAX_INLINE_ITEMS) return `[Array(${value.length})]`;
            return '[' + value.map(v => this.formatValue(v, depth + 1, seen)).join(', ') + ']';
        }

        if (isObject(value)) {
            trackSeen(value, seen);
            const keys = Object.keys(value);
            if (keys.length === 0) return '{}';
            if (keys.length > MAX_INLINE_ITEMS) return `{Object with ${keys.length} keys}`;

            const pairs = keys.slice(0, MAX_INLINE_ITEMS).map(k => `${k}: ${this.formatValue((value as ErrorRecord)[k], depth + 1, seen)}`);
            return '{ ' + pairs.join(', ') + ' }';
        }
        /* node:coverage ignore next 4 */
        // Should be impossible to reach here, but just in case
        // Fallback for unknown types
        return unknownToString(value);
    }

    /**
     * Returns a JSON-safe representation of the error.
     * Handles circular references and respects maxDepth.
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
        const result = this.serializeError(this, 0, new WeakSet());
        // If serializeError returns a string (maxDepth or circular), wrap it
        if (typeof result === 'string') {
            return { name: 'Error', message: result } as ErrorShape;
        }
        return result as ErrorShape;
    }

    /**
     * Recursively serializes an error to a JSON-safe object or string marker
     */
    private serializeError(error: ErrorShape, depth: number, seen: WeakSet<object>): ErrorRecord | string {
        const maxDepth = this.getMaxDepth();

        // Check depth limit
        const depthMsg = checkDepthLimit(depth, maxDepth);
        if (depthMsg) return depthMsg;

        // Check circular reference
        const circularMsg = checkCircular(error, seen);
        // Unabled to trigger this branch in tests - Leaving this as an edge case backup
        // It's very likely the circular references are always caught in function before reaching here
        /* node:coverage ignore next 1 */
        if (circularMsg) return circularMsg;

        trackSeen(error, seen);

        const result: ErrorShape = {
            name: error.name || 'Error',
            message: error.message || '',
        };

        // Include stack if present
        if (error.stack !== undefined) {
            result.stack = error.stack;
        }

        // Serialize cause
        if (error.cause !== undefined && error.cause !== null) {
            // While it might seem logical to not increase depth here as we are going deeper into the structure,
            // We do need to increase depth to avoid cases where cause chains are very deep and could lead to stack overflows.
            // Perhaps we can revisit this decision later if it causes issues.
            result.cause = this.serializeValue(error.cause, depth + 1, seen);
        }

        // Serialize errors
        if (error.errors !== undefined && error.errors !== null) {
            // Do not increase depth here as we are already increasing it for the array
            result.errors = this.serializeValue(error.errors, depth, seen);
        }

        // Serialize custom properties
        const customProps = this.getCustomProperties(error);
        for (const key of customProps) {
            // Skip internal symbol properties
            if (isSymbol(key) && key === MAX_DEPTH_SYMBOL) {
                continue;
            }
            const value = error[key];
            const serializedKey = isSymbol(key) ? key.toString() : String(key);
            if (isArray(value)) {
                // Do not increase depth here as we are already increasing it for the array
                result[serializedKey] = value.map(item => this.serializeValue(item, depth, seen));
                continue;
            }
            result[serializedKey] = this.serializeValue(value, depth + 1, seen);
        }

        return result;
    }

    /**
     * Serializes any value to a JSON-safe format
     */
    private serializeValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
        const maxDepth = this.getMaxDepth();

        // Check depth limit
        const depthMsg = checkDepthLimit(depth, maxDepth);
        if (depthMsg) return depthMsg;

        // Primitives
        if (value === null || value === undefined) return value;
        if (isSymbol(value)) return value.toString();
        if (isPrimitive(value)) return value;

        // Circular check
        const circularMsg = checkCircular(value, seen);
        if (circularMsg) return circularMsg;

        // Functions
        /* node:coverage ignore next - should never happen */
        if (typeof value === 'function') return undefined; // Functions are not serializable

        // Error-shaped objects
        if (isErrorShaped(value)) return this.serializeError(value as ErrorShape, depth, seen);

        // Arrays
        if (isArray(value)) return value.map(item => this.serializeValue(item, depth + 1, seen));

        // Plain objects
        if (isObject(value)) {
            trackSeen(value, seen);
            const result: ErrorRecord = {};

            for (const key of Object.keys(value)) {
                result[key] = this.serializeValue((value as ErrorRecord)[key], depth + 1, seen);
            }

            // Handle symbol keys
            for (const sym of Object.getOwnPropertySymbols(value)) {
                const desc = Object.getOwnPropertyDescriptor(value, sym);
                if (desc?.enumerable) {
                    result[sym.toString()] = this.serializeValue((value as ErrorRecord)[sym], depth + 1, seen);
                }
            }

            return result;
        }
        /* node:coverage ignore next 4 */
        // Should be impossible to reach here, but just in case
        // Fallback for unknown types
        return unknownToString(value);
    }
}

/**
 * Type alias for StdError interface (for backward compatibility and convenience)
 */
export type StdErrorShape = StdError;
