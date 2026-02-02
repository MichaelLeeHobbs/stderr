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
 * Helper conditional type to precisely determine the return type based on the function's return value.
 *
 * Logic:
 * 1. If T is strictly 'never' (e.g. sync throw), return Result (Sync).
 * 2. If T is a Promise, return Promise<Result> (Async).
 * 3. Otherwise, return Result (Sync).
 */
type TryCatchReturn<T, E> = [T] extends [never] ? Result<T, E> : T extends Promise<infer U> ? Promise<Result<U, E>> : Result<T, E>;

/**
 * Wraps a function (sync or async) or a Promise to always return a Result object with standardized errors.
 *
 * All caught errors are normalized via `stderr()` to StdError.
 * Optionally, provide `mapError` to transform StdError into a custom error type.
 *
 * The function automatically detects the input type:
 * - Sync function: Returns `Result<T, E>` immediately.
 * - Async function: Returns `Promise<Result<Unwrapped<T>, E>>`.
 * - Raw Promise: Returns `Promise<Result<T, E>>`.
 *
 * This follows the Result Pattern (Rule 6.2) and ensures consistent error handling.
 *
 * @template T - The return type of the function or the resolved type of the Promise.
 * @template E - The type of the custom error (only when mapError is provided).
 * @param fn - The function to execute or the raw Promise to await.
 * @param mapError - Optional function to transform StdError into custom type E.
 * @returns Result<T, E> or Promise<Result<T, E>>.
 *
 * @example
 * // 1. Sync function - returns Result immediately
 * const r1 = tryCatch(() => 42);
 * if (!r1.ok) console.error(r1.error);
 *
 * @example
 * // 2. Async function - returns Promise<Result>
 * const r2 = await tryCatch(async () => fetchValue());
 * if (!r2.ok) console.error(r2.error);
 *
 * @example
 * // 3. Raw Promise - returns Promise<Result>
 * const r3 = await tryCatch(Promise.resolve('value'));
 * if (r3.ok) console.log(r3.value);
 *
 * @example
 * // 4. With mapError - transform to custom error type
 * const r4 = tryCatch(
 *   () => riskyOperation(),
 *   (stdErr) => ({ code: stdErr.name, details: stdErr.message })
 * );
 */

// Overload 1: Handle sync functions that never return (always throw)
// Must come before async overload because `never` is assignable to `Promise<T>`
// Uses `T` parameter for compatibility when caller specifies two type parameters
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function tryCatch<T, E = StdError>(fn: () => never, mapError?: (normalizedError: StdError) => E): Result<never, E>;

// Overload 2: Handle raw Promises (e.g. tryCatch(Promise.resolve(1)))
export function tryCatch<T, E = StdError>(fn: Promise<T>, mapError?: (normalizedError: StdError) => E): Promise<Result<T, E>>;

// Overload 3: Handle async functions with explicit unwrapped type T
// This allows tryCatch<MyType>(async () => ...) to work correctly
export function tryCatch<T, E = StdError>(fn: () => Promise<T>, mapError?: (normalizedError: StdError) => E): Promise<Result<T, E>>;

// Overload 4: Handle Functions (Sync or Async with inferred types)
// This overload supports explicit generics like tryCatch<number, CustomError>(() => throw ...)
export function tryCatch<T, E = StdError>(fn: () => T, mapError?: (normalizedError: StdError) => E): TryCatchReturn<T, E>;

// Implementation
export function tryCatch<T, E = StdError>(fn: Promise<T> | (() => T), mapError?: (normalizedError: StdError) => E): Result<T, E> | Promise<Result<T, E>> {
    const succeed = (v: T): Success<T> => ({ ok: true, value: v, error: null });

    const fail = (e: unknown): Failure<E> => {
        const normalized = stderr(e);
        const final = mapError ? mapError(normalized) : (normalized as unknown as E);
        return { ok: false, value: null, error: final };
    };

    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        const result = typeof fn === 'function' ? (fn as Function)() : fn;

        // Check if the result is a Promise
        if (result && typeof result.then === 'function') {
            return result.then(succeed).catch(fail) as Promise<Result<T, E>>;
        }

        return succeed(result as T) as Result<T, E>;
    } catch (error) {
        return fail(error) as Result<T, E>;
    }
}
