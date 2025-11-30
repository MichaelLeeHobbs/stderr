import { stderr } from './stderr';
import { StdError } from './StdError';

/**
 * Represents a successful outcome with value
 */
type Success<T> = { ok: true; value: T; error: null };

/**
 * Represents a failed outcome with error
 */
type Failure<E> = { ok: false; value: null; error: E };

/**
 * Result discriminated union that represents either success or failure.
 * Follows the Result Pattern from TypeScript Coding Standards (Rule 6.2).
 */
export type Result<T, E = StdError> = Success<T> | Failure<E>;

/**
 * Wraps a function (sync or async) to always return a Result object with standardized errors.
 *
 * All caught errors are normalized via `stderr()` to StdError.
 * Optionally, provide `mapError` to transform StdError into a custom error type.
 *
 * The function automatically detects if `fn` returns a Promise and handles accordingly:
 * - Sync return: Returns Result<T, E> immediately
 * - Async return: Returns Promise<Result<T, E>>
 *
 * This follows the Result Pattern (Rule 6.2) and ensures consistent error handling.
 *
 * @template T - The type of the success value
 * @template E - The type of the custom error (only when mapError is provided)
 * @param fn - Function that returns T or Promise<T>
 * @param mapError - Optional function to transform StdError into custom type E
 * @returns Result<T, StdError> or Promise<Result<T, StdError>> (depending on fn's return)
 *
 * @example
 * // Sync function - returns Result immediately
 * const r1 = tryCatch(() => 42);
 * if (!r1.ok) {
 *   console.error(r1.error.toString()); // r1.error is StdError
 * }
 *
 * @example
 * // Async function - returns Promise<Result>
 * const r2 = await tryCatch(async () => fetchValue());
 * if (!r2.ok) {
 *   console.error(r2.error.toString()); // r2.error is StdError
 * }
 *
 * @example
 * // Function returning Promise - returns Promise<Result>
 * const r3 = await tryCatch(() => Promise.resolve('value'));
 * if (r3.ok) {
 *   console.log(r3.value); // 'value'
 * }
 *
 * @example
 * // With mapError - transform to custom error type
 * const r4 = tryCatch(
 *   () => riskyOperation(),
 *   (stdErr) => ({ code: stdErr.name, details: stdErr.message })
 * );
 * if (!r4.ok) {
 *   console.error('Code:', r4.error.code); // r4.error is custom type
 * }
 */
// Without mapError - error is always StdError
export function tryCatch<T>(fn: () => T | Promise<T>): Result<T, StdError> | Promise<Result<T, StdError>>;
// With mapError - error is transformed to E
export function tryCatch<T, E>(fn: () => T | Promise<T>, mapError: (normalizedError: StdError) => E): Result<T, E> | Promise<Result<T, E>>;
// Implementation
export function tryCatch<T, E = StdError>(fn: () => T | Promise<T>, mapError?: (normalizedError: StdError) => E): Result<T, E> | Promise<Result<T, E>> {
    try {
        const value = fn();
        // Detect promise-like (duck-typing for thenable)
        if (value && typeof (value as { then?: unknown }).then === 'function') {
            // Wrap in async IIFE to preserve literal discriminants
            return (async (): Promise<Result<T, E>> => {
                try {
                    // Double cast needed: Promise<T> resolves to T
                    const resolvedValue = (await value) as Promise<T> as T;
                    return { ok: true as const, value: resolvedValue, error: null };
                } catch (error) {
                    // Always normalize via stderr first
                    const normalizedError = stderr(error);
                    // Then optionally transform
                    const finalError = mapError ? mapError(normalizedError) : (normalizedError as E);
                    return { ok: false as const, value: null, error: finalError };
                }
            })();
        }
        // Sync success path - cast to T for Result type
        return { ok: true as const, value: value as T, error: null };
    } catch (error) {
        // Always normalize via stderr first
        const normalizedError = stderr(error);
        // Then optionally transform
        const finalError = mapError ? mapError(normalizedError) : (normalizedError as E);
        return { ok: false as const, value: null, error: finalError };
    }
}
