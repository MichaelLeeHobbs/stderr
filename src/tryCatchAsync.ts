// src/tryCatchAsync.ts
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
 * Wraps a Promise to always resolve with a Result object, preventing rejections from bubbling up.
 *
 * All caught errors are first normalized via `stderr()` to ensure consistent error handling,
 * then optionally transformed via `mapError`.
 *
 * This follows the Result Pattern (Rule 6.2) and ensures no floating promises (Rule 4.1).
 *
 * @template T - The type of the success value
 * @template E - The type of the error value (defaults to `StdError`)
 * @param promise - The promise to wrap
 * @param mapError - Optional function to transform normalized StdError into type E
 * @returns A Promise that always resolves to a Result object with proper type narrowing
 *
 * @example
 * // Basic usage with type narrowing
 * const result = await tryCatchAsync(fetch('/api/data'));
 * if (!result.ok) {
 *   console.error('Failed:', result.error.toString());
 *   return;
 * }
 * // TypeScript knows result.data is the success type here
 * console.log('Success:', result.data);
 *
 * @example
 * // With error transformation
 * const result = await tryCatchAsync(
 *   fetch('/api/data'),
 *   (stdErr) => ({ code: stdErr.name, message: stdErr.message })
 * );
 * if (!result.ok) {
 *   console.error('Code:', result.error.code);
 *   return;
 * }
 *
 * @example
 * // Chaining operations with full type safety
 * const r1 = await tryCatchAsync(getNumber());
 * if (!r1.ok) return;
 *
 * const r2 = await tryCatchAsync(double(r1.data)); // r1.data is number
 * if (!r2.ok) return;
 *
 * console.log(r2.data); // r2.data is number
 */
export async function tryCatchAsync<T, E = StdError>(promise: Promise<T>, mapError?: (normalizedError: StdError) => E): Promise<Result<T, E>> {
    try {
        const data = await promise;
        return { ok: true, data, error: null };
    } catch (error) {
        // Always normalize via stderr first
        const normalizedError = stderr(error);
        // Then optionally transform
        const finalError = mapError ? mapError(normalizedError) : (normalizedError as E);
        return { ok: false, data: null, error: finalError };
    }
}
