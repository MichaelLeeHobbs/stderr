type ErrorWithCause = Error & {
    cause?: unknown;
};

/**
 * Normalize any unknown thrown value into a proper Error instance with metadata.
 *
 * @param input - The unknown error value caught.
 * @returns A proper Error instance with message, stack, and any metadata.
 */
export function standardizeError(input: unknown): Error {
    // If it's already an Error, normalize its properties and return
    if (input instanceof Error) {
        normalizeExistingError(input);
        return input;
    }

    // Determine message and metadata
    let message: string;
    let name = 'Error';
    const metadata: Record<string, unknown> = {};

    if (typeof input === 'string') {
        message = input;
    } else if (
        input === null ||
        input === undefined ||
        typeof input === 'number' ||
        typeof input === 'boolean' ||
        typeof input === 'bigint' ||
        typeof input === 'symbol'
    ) {
        message = String(input);
    } else if (typeof input === 'object') {
        const obj = input as Record<string, unknown>;
        if (typeof obj.name === 'string') {
            name = obj.name;
        }
        if (typeof obj.message === 'string') {
            message = obj.message;
        } else {
            try {
                message = JSON.stringify(obj);
            } catch {
                message = Object.prototype.toString.call(obj);
            }
        }
        // Copy other properties as metadata
        for (const key of Object.keys(obj)) {
            if (key !== 'name' && key !== 'message') {
                metadata[key] = obj[key];
            }
        }
    } else {
        message = String(input);
    }

    // Create the new Error
    const error = new Error(message);
    error.name = name;

    // Attach metadata properties
    for (const [key, value] of Object.entries(metadata)) {
        try {
            // @ts-expect-error trying to assign metadata properties
            error[key] = value;
        } catch {
            // ignore unwritable fields
        }
    }

    // Normalize nested cause and errors
    normalizeCause(error);
    normalizeErrorsArrayOrObject(error);

    return error;
}

// Helper: normalize an existing Error instance in place
function normalizeExistingError(err: Error) {
    if (typeof err.message !== 'string') {
        err.message = String(err.message);
    }
    if (!err.name) {
        err.name = 'Error';
    }
    normalizeCause(err);
    normalizeErrorsArrayOrObject(err);
}

// Normalize the `cause` property if present
function normalizeCause(err: ErrorWithCause) {
    if ('cause' in err && err.cause !== undefined) {
        const cause = err.cause;
        if (!(cause instanceof Error)) {
            err.cause = standardizeError(cause);
        }
    }
}

// Normalize the `errors` property if present (array or object)
function normalizeErrorsArrayOrObject(err: ErrorWithCause) {
    if ('errors' in err && err.errors !== undefined) {
        const raw = err.errors;
        if (Array.isArray(raw)) {
            err.errors = raw.map(e => (e instanceof Error ? (normalizeExistingError(e), e) : standardizeError(e)));
        } else if (typeof raw === 'object' && raw !== null) {
            const normalized: Record<string, Error> = {};
            for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
                normalized[key] = val instanceof Error ? (normalizeExistingError(val), val) : standardizeError(val);
            }
            err.errors = normalized;
        }
    }
}
