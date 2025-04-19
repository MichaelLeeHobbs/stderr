// Type definition combining Error with optional cause and errors properties
// Allows us to attach nested error causes and sub-error collections
// without losing type information.

type ErrorWithCause = Error & {
    cause?: unknown;
    errors?: unknown;
};

// Type definition combining Error with optional cause and errors properties
type ErrorWithDictionary = ErrorWithCause & {
    [key: string]: unknown;
};

// Represents an object shape that carries a non-Error `cause`. We
// detect these to convert the cause into a proper Error instance.
type CauseObject = {
    cause: unknown;
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
 * Type guard that detects if an input is a non-null object
 * (including arrays, functions, and plain object literals).
 */
export function isObjectLike(input: unknown): input is Record<string, unknown> {
    return typeof input === 'object' && input !== null;
}

/**
 * Type guard that specifically checks for a plain string.
 */
export function isPlainString(input: unknown): input is string {
    return typeof input === 'string';
}

/**
 * Type guard that determines if an object has a `cause` property
 * which is not already an Error instance. We use this to normalize
 * nested causes properly.
 */
export function isCauseObject(err: unknown): err is CauseObject {
    return isObjectLike(err) && 'cause' in err && !((err as unknown as ErrorWithCause).cause instanceof Error);
}

/**
 * Type guard to check if an input is already an Error (or subclass).
 * Catches built-in and custom Errors.
 */
export function isError(input: unknown): input is Error {
    return input instanceof Error;
}

/**
 * Main normalizer function: converts *any* thrown value into a standard
 * Error instance.
 *
 * Steps:
 * 1. If it is already an Error, normalize its message/name and nested fields.
 * 2. If it is a string or primitive, wrap it in an Error.
 * 3. If it is an object, extract `name`, `message`, and copy other props.
 * 4. Create a new Error with the final `message` and `name`.
 * 5. Attach any extra metadata properties.
 * 6. Recursively normalize nested `.cause` and `.errors`.
 *
 * This ensures downstream code can always rely on `.message`, `.stack`,
 * and optional fields like `.cause`, `.errors`, or custom metadata.
 *
 * @param input - The unknown value caught (e.g. in `catch (e: unknown)`).
 * @returns A guaranteed Error instance with stable shape.
 */
export function standardizeError(input: unknown): Error {
    // 1. If it's already an Error, normalize and return in-place
    if (isError(input)) {
        normalizeExistingError(input);
        return input;
    }

    // Prepare defaults
    let message: string;
    let name = 'Error';
    const metadata: Record<string, unknown> = {};

    // 2. Handle plain strings directly as messages
    if (isPlainString(input)) {
        message = input;

        // 3. Convert other primitives to their string representation
    } else if (isPrimitive(input)) {
        message = String(input);

        // 4. Handle object-like values: extract name, message, metadata
    } else if (isObjectLike(input)) {
        const obj = input as Record<string, unknown>;

        // Use custom name if provided, otherwise default to 'Error'
        name = isPlainString(obj.name) ? obj.name : 'Error';

        // Use custom message or fallback to JSON/string conversion
        if (isPlainString(obj.message)) {
            message = obj.message;
        } else {
            try {
                message = JSON.stringify(obj);
            } catch {
                // Fallback for circular references
                message = Object.prototype.toString.call(obj);
            }
        }

        // Copy all other enumerable properties for metadata
        for (const key of Object.keys(obj)) {
            if (key !== 'name' && key !== 'message') {
                metadata[key] = obj[key];
            }
        }

        // 5. Fallback for unrecognized types
    } else {
        message = String(input);
    }

    // 6. Create and configure the new Error
    const error = new Error(message);
    try {
        error.name = name;
    } catch {
        // Name could be non-writable or reserved
        // This is more of an artifact of testing than a real-world issue
    }

    // Attach any extracted metadata onto the error object
    for (const [key, value] of Object.entries(metadata)) {
        try {
            (error as ErrorWithDictionary)[key] = value;
        } catch {
            // Non-writable or reserved fields are ignored silently
        }
    }

    // 7. Normalize nested `.cause` and `.errors` structures
    normalizeCause(error as ErrorWithCause);
    normalizeErrorsArrayOrObject(error as ErrorWithCause);

    // 8. Override toString so that `error.toString()` === `console.log(error)`:
    // Also override toString & inspect on newly created errors
    overrideToString(error);

    return error;
}

/**
 * In-place normalization of an existing Error instance:
 * - Ensures `message` is always a string.
 * - Ensures `name` is non-empty.
 * - Recurses into nested `cause` and `errors`.
 *
 * @param err - The Error instance to normalize.
 * @returns The same Error, mutated to a consistent shape.
 */
function normalizeExistingError(err: Error): Error {
    // Coerce non-string messages to string (e.g. if someone set err.message = 123)
    if (!isPlainString(err.message)) {
        err.message = String(err.message ?? '');
    }

    // Guarantee the name property is present
    err.name = err.name || 'Error';

    // Recursively normalize nested data
    normalizeCause(err as ErrorWithCause);
    normalizeErrorsArrayOrObject(err as ErrorWithCause);

    // Also override toString & inspect on newly created errors
    overrideToString(err);

    return err;
}

/**
 * Recursively standardizes the `.cause` property if present
 * and not already an Error instance.
 *
 * After this call, err.cause (if defined) is guaranteed to be Error.
 */
function normalizeCause(err: ErrorWithCause): void {
    if (isCauseObject(err)) {
        err.cause = standardizeError(err.cause);
    }
}

/**
 * Recursively standardizes the `.errors` property if present.
 * Supports both array and object shapes:
 * - Arrays (e.g. AggregateError) become arrays of Error.
 * - Objects (e.g. Mongoose ValidationError.errors) become maps of Error.
 */
function normalizeErrorsArrayOrObject(err: ErrorWithCause): void {
    const raw = err.errors;

    if (Array.isArray(raw)) {
        err.errors = raw.map((e: unknown) => (isError(e) ? normalizeExistingError(e) : standardizeError(e)));
    } else if (isObjectLike(raw)) {
        const normalized: Record<string, Error> = {};
        for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
            normalized[key] = isError(val) ? normalizeExistingError(val) : standardizeError(val);
        }
        err.errors = normalized;
    }
}

/**
 * Monkey‑patches an Error instance so that it returns the same string as `console.log()`.
 */
function overrideToString(error: Error) {
    // Override toString() so err.toString() prints stack if available
    try {
        Object.defineProperty(error, 'toString', {
            value(): string {
                if (this.cause) {
                    if (this.stack) {
                        return `${this.stack}\n  cause: ${this.cause}`;
                    }
                    return `${this.name}: ${this.message}\n  cause: ${this.cause}`;
                }
                return this.stack ?? `${this.name}: ${this.message}`;
            },
            writable: true,
            configurable: true,
        });
    } catch {
        // Ignore errors from defining non-writable properties
        // This is more of an artifact of testing than a real-world issue
    }
}
