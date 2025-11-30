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

// 1. Sync function -> Result
export function tryCatch<T>(fn: () => T): Result<T, StdError>;

// 2. Async function or Promise -> Promise<Result>
export function tryCatch<T>(fn: Promise<T> | (() => Promise<T>)): Promise<Result<T, StdError>>;

// 3. Sync function with custom error -> Result
export function tryCatch<T, E>(fn: () => T, mapError: (err: StdError) => E): Result<T, E>;

// 4. Async function or Promise with custom error -> Promise<Result>
export function tryCatch<T, E>(fn: Promise<T> | (() => Promise<T>), mapError: (err: StdError) => E): Promise<Result<T, E>>;

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
export function tryCatch<T, E = StdError>(
    fn: (() => T | Promise<T>) | Promise<T>,
    mapError?: (normalizedError: StdError) => E
): Result<T, E> | Promise<Result<T, E>> {
    // 1. Define unified helpers to ensure consistent return shapes
    const succeed = (v: T): Success<T> => ({ ok: true, value: v, error: null });

    const fail = (e: unknown): Failure<E> => {
        const normalized = stderr(e);
        const final = mapError ? mapError(normalized) : (normalized as unknown as E);
        return { ok: false, value: null, error: final };
    };

    try {
        // 2. Unwrap the value if it's a function, otherwise use as is
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        const result = typeof fn === 'function' ? (fn as Function)() : fn;

        // 3. Handle Async (Promise)
        if (result && typeof result.then === 'function') {
            return result.then(succeed).catch(fail) as Promise<Result<T, E>>;
        }

        // 4. Handle Sync
        return succeed(result as T);
    } catch (error) {
        // 5. Handle Sync Errors (e.g., function threw immediately)
        return fail(error);
    }
}
