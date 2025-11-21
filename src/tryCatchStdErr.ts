// src/tryCatchStdErr.ts
import { stderr } from './stderr';
import { StdError } from './StdError';

/**
 * Represents a successful outcome with data
 */
type Success<T> = { ok: true; data: T; error: null };

/**
 * Represents a failed outcome with error
 */
type Failure<E> = { ok: false; data: null; error: E };

/**
 * Result discriminated union that represents either success or failure.
 * Follows the Result Pattern from TypeScript Coding Standards (Rule 6.2).
 */
export type Result<T, E = StdError> = Success<T> | Failure<E>;

/**
 * Wraps a function (sync or async) to always return a Result object with standardized errors.
 *
 * All caught errors are first normalized via `stderr()` to StdError,
 * then optionally transformed via `mapError`.
 *
 * Overloads provide precise typing: synchronous functions yield a synchronous Result, while
 * asynchronous functions yield a Promise<Result>.
 *
 * This follows the Result Pattern (Rule 6.2) and ensures consistent error handling.
 *
 * @template T - The type of the success value
 * @template E - The type of the error value (defaults to `StdError`)
 * @param fn - The function to execute (sync or async)
 * @param mapError - Optional function to transform normalized StdError into type E
 * @returns Result<T, E> for sync functions, Promise<Result<T, E>> for async functions
 *
 * @example
 * // Synchronous usage
 * const r1 = tryCatchStdErr(() => 42);
 * if (r1.ok) {
 *   console.log(r1.data); // 42
 * } else {
 *   console.error(r1.error.toString());
 * }
 *
 * @example
 * // Asynchronous usage
 * const r2 = await tryCatchStdErr(async () => fetchValue());
 * if (!r2.ok) {
 *   console.error(r2.error.toString());
 * }
 *
 * @example
 * // With error transformation
 * const r3 = tryCatchStdErr(
 *   () => riskyOperation(),
 *   (stdErr) => ({ code: stdErr.name, details: stdErr.message })
 * );
 * if (!r3.ok) {
 *   console.error('Code:', r3.error.code);
 * }
 */
export function tryCatchStdErr<T, E = StdError>(fn: () => T, mapError?: (normalizedError: StdError) => E): Result<T, E>;
export function tryCatchStdErr<T, E = StdError>(fn: () => Promise<T>, mapError?: (normalizedError: StdError) => E): Promise<Result<T, E>>;
export function tryCatchStdErr<T, E = StdError>(fn: () => T | Promise<T>, mapError?: (normalizedError: StdError) => E): Result<T, E> | Promise<Result<T, E>> {
    try {
        const value = fn();
        // Detect promise-like (duck-typing for thenable)
        if (value && typeof (value as { then?: unknown }).then === 'function') {
            // Wrap in async IIFE to preserve literal discriminants
            return (async (): Promise<Result<T, E>> => {
                try {
                    const data = (await value) as Promise<T> as T;
                    return { ok: true as const, data, error: null };
                } catch (error) {
                    // Always normalize via stderr first
                    const normalizedError = stderr(error);
                    // Then optionally transform
                    const finalError = mapError ? mapError(normalizedError) : (normalizedError as E);
                    return { ok: false as const, data: null, error: finalError };
                }
            })();
        }
        // Sync success path
        return { ok: true as const, data: value as T, error: null };
    } catch (error) {
        // Always normalize via stderr first
        const normalizedError = stderr(error);
        // Then optionally transform
        const finalError = mapError ? mapError(normalizedError) : (normalizedError as E);
        return { ok: false as const, data: null, error: finalError };
    }
}
