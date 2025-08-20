// src/tryCatch.ts
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
 */
type Result<T, E = unknown> = Success<T> | Failure<E>;

/**
 * Wraps a Promise to always resolve with a Result object, preventing rejections from bubbling up.
 *
 * @template T - The type of the success value
 * @template E - The type of the error value (defaults to `unknown`)
 * @param promise - The promise to wrap
 * @param mapError - Optional function to transform caught errors into type E
 * @returns A Promise that always resolves to a Result object with proper type narrowing
 *
 * @example
 * // Basic usage with type narrowing
 * const result = await tryCatch(fetch('/api/data'));
 * if (!result.ok) {
 *   console.error('Failed:', result.error);
 *   return;
 * }
 * // TypeScript knows result.data is the success type here
 * console.log('Success:', result.data);
 *
 * @example
 * // Chaining operations with full type safety
 * const r1 = await tryCatch(getNumber());
 * if (!r1.ok) return;
 *
 * const r2 = await tryCatch(double(r1.data)); // r1.data is number
 * if (!r2.ok) return;
 *
 * console.log(r2.data); // r2.data is number
 */
export async function tryCatch<T, E = unknown>(promise: Promise<T>, mapError?: (caughtError: unknown) => E): Promise<Result<T, E>> {
    try {
        const data = await promise;
        return { ok: true, data, error: null };
    } catch (error) {
        const finalError = mapError ? mapError(error) : (error as E);
        return { ok: false, data: null, error: finalError };
    }
}
