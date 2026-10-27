import { stderr } from './stderr';
import { StdError } from './StdError';
import { isString } from './types';
import { safeGet } from './utils';

type CaptureStackTrace = (target: object, ctor?: unknown) => void;
const captureStackTrace = (Error as ErrorConstructor & { captureStackTrace?: CaptureStackTrace }).captureStackTrace;

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
 * 2. If T is a Promise or another thenable (PromiseLike), return Promise<Result> (Async): tryCatch awaits anything with a `then` method.
 * 3. Otherwise, return Result (Sync).
 */
type TryCatchReturn<T, E> = [T] extends [never] ? Result<T, E> : T extends PromiseLike<infer U> ? Promise<Result<U, E>> : Result<T, E>;

/**
 * Wraps a function (sync or async) or a Promise to always return a Result object with standardized errors.
 *
 * All caught errors are normalized via `stderr()` to StdError.
 * Optionally, provide `mapError` to transform StdError into a custom error type.
 * If `mapError` itself throws, the Result's error is a StdError (not E) with the original
 * error as `cause` and the mapError failure as `mapErrorFailure`; tryCatch never throws or rejects.
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

// Overload 0: Handle functions returning `any` (JSON.parse, untyped libraries)
// Without it `() => any` matches the async overload 3, typing a sync call as Promise<Result> | Result.
// `0 extends 1 & T` is true only for `any`; for any other T the parameter is `never` and the overload is skipped.
export function tryCatch<T, E = StdError>(fn: 0 extends 1 & T ? () => T : never, mapError?: (normalizedError: StdError) => E): Result<T, E>;

// Overload 1: Handle sync functions that never return (always throw)
// Must come before async overload because `never` is assignable to `Promise<T>`
// Uses `T` parameter for compatibility when caller specifies two type parameters
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function tryCatch<T, E = StdError>(fn: () => never, mapError?: (normalizedError: StdError) => E): Result<never, E>;

// Overload 2: Handle raw Promises and other thenables (e.g. tryCatch(Promise.resolve(1)))
export function tryCatch<T, E = StdError>(fn: PromiseLike<T>, mapError?: (normalizedError: StdError) => E): Promise<Result<T, E>>;

// Overload 3: Handle async functions with explicit unwrapped type T
// This allows tryCatch<MyType>(async () => ...) to work correctly
export function tryCatch<T, E = StdError>(fn: () => PromiseLike<T>, mapError?: (normalizedError: StdError) => E): Promise<Result<T, E>>;

// Overload 4: Handle Functions (Sync or Async with inferred types)
// This overload supports explicit generics like tryCatch<number, CustomError>(() => throw ...)
export function tryCatch<T, E = StdError>(fn: () => T, mapError?: (normalizedError: StdError) => E): TryCatchReturn<T, E>;

// Implementation
export function tryCatch<T, E = StdError>(fn: PromiseLike<T> | (() => T), mapError?: (normalizedError: StdError) => E): Result<T, E> | Promise<Result<T, E>> {
    const succeed = (v: T): Success<T> => ({ ok: true, value: v, error: null });

    // `hideFrom` is the innermost library frame: a value thrown without a stack gets a stack that starts at its caller
    const fail = (e: unknown, hideFrom: unknown): Failure<E> => {
        const normalized = stderr(e);
        if (!isString(safeGet(e, 'stack')) && typeof captureStackTrace === 'function') captureStackTrace(normalized, hideFrom);
        if (!mapError) return { ok: false, value: null, error: normalized as unknown as E };
        try {
            return { ok: false, value: null, error: mapError(normalized) };
        } catch (mapErr) {
            // tryCatch always returns a Result, even when mapError itself throws. The error is then a
            // StdError (NOT E): the original error as `cause`, the mapError failure as `mapErrorFailure`.
            const mapFailure = new StdError('mapError threw while mapping an error', { cause: normalized, mapErrorFailure: stderr(mapErr) });
            return { ok: false, value: null, error: mapFailure as unknown as E };
        }
    };

    try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        const result = typeof fn === 'function' ? (fn as Function)() : fn;

        // Check if the result is a Promise
        // Promise.resolve() adopts any thenable, so a then() that does not return a Promise still works
        if (result && typeof result.then === 'function') {
            const failAsync = (e: unknown): Failure<E> => fail(e, failAsync);
            return Promise.resolve(result).then(succeed, failAsync) as Promise<Result<T, E>>;
        }

        return succeed(result as T) as Result<T, E>;
    } catch (error) {
        return fail(error, tryCatch) as Result<T, E>;
    }
}
