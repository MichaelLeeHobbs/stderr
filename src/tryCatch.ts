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
 * const r1 = tryCatch(() => 42);
 * if (r1.ok) {
 *   console.log(r1.value); // 42
 * } else {
 *   console.error(r1.error.toString());
 * }
 *
 * @example
 * // Asynchronous usage
 * const r2 = await tryCatch(async () => fetchValue());
 * if (!r2.ok) {
 *   console.error(r2.error.toString());
 * }
 *
 * @example
 * // With error transformation
 * const r3 = tryCatch(
 *   () => riskyOperation(),
 *   (stdErr) => ({ code: stdErr.name, details: stdErr.message })
 * );
 * if (!r3.ok) {
 *   console.error('Code:', r3.error.code);
 * }
 */
export function tryCatch<T, E = StdError>(fn: () => T, mapError?: (normalizedError: StdError) => E): Result<T, E>;
export function tryCatch<T, E = StdError>(fn: () => Promise<T>, mapError?: (normalizedError: StdError) => E): Promise<Result<T, E>>;
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
                    const normalizedError = stderr<StdError>(error);
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
        const normalizedError = stderr<StdError>(error);
        // Then optionally transform
        const finalError = mapError ? mapError(normalizedError) : (normalizedError as E);
        return { ok: false as const, value: null, error: finalError };
    }
}

/**
 * Maps a Result's success value to a new value using the provided function.
 * If the Result is an error, returns the error unchanged.
 *
 * @template T - Original success type
 * @template U - New success type
 * @template E - Error type
 * @param result - The Result to map
 * @param fn - Function to transform the success value
 * @returns New Result with transformed value or original error
 *
 * @example
 * ```typescript
 * const result = tryCatch(() => 42);
 * const doubled = mapResult(result, x => x * 2);
 * if (doubled.ok) console.log(doubled.value); // 84
 * ```
 */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
    return result.ok ? { ok: true, value: fn(result.value), error: null } : (result as unknown as Result<U, E>);
}

/**
 * Unwraps a Result, returning the success value or a default value if error.
 *
 * @template T - Success type
 * @template E - Error type
 * @param result - The Result to unwrap
 * @param defaultValue - Value to return if Result is an error
 * @returns The success value or default value
 *
 * @example
 * ```typescript
 * const result = tryCatch(() => riskyOperation());
 * const value = unwrapOr(result, 'default'); // Safe unwrap
 * ```
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
    return result.ok ? result.value : defaultValue;
}

/**
 * Chains Results together, allowing sequential operations that may fail.
 * If the input Result is an error, returns that error without calling fn.
 *
 * @template T - Original success type
 * @template U - New success type
 * @template E - Error type
 * @param result - The Result to chain from
 * @param fn - Function that returns a new Result
 * @returns New Result from fn or original error
 *
 * @example
 * ```typescript
 * const result = tryCatch(() => readFile('config.json'))
 *     .then(r => andThen(r, content => tryCatch(() => JSON.parse(content))))
 *     .then(r => andThen(r, config => validateConfig(config)));
 * ```
 */
export function andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
    return result.ok ? fn(result.value) : (result as unknown as Result<U, E>);
}

/**
 * Handles a Result's error by attempting recovery.
 * If the Result is successful, returns it unchanged.
 *
 * @template T - Success type
 * @template E - Original error type
 * @template F - New error type
 * @param result - The Result to handle
 * @param fn - Function to recover from error
 * @returns New Result from fn or original success
 *
 * @example
 * ```typescript
 * const result = tryCatch(() => fetchFromCache())
 *   |> (r => orElse(r, () => tryCatch(() => fetchFromDB())));
 * ```
 */
export function orElse<T, E, F>(result: Result<T, E>, fn: (error: E) => Result<T, F>): Result<T, F> {
    return result.ok ? (result as unknown as Result<T, F>) : fn(result.error);
}
