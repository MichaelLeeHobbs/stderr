// src/tryCatchStdErr.ts
import { stderr } from './stderr';
import type { ErrorShape } from './types';

/**
 * Represents a successful outcome with data
 */
type Success<T> = { ok: true; data: T; error: null };

/**
 * Represents a failed outcome with a standardized Error
 */
type Failure = { ok: false; data: null; error: ErrorShape };

/**
 * Result discriminated union that always has Error type for failures
 */
type Result<T> = Success<T> | Failure;

/**
 * Wraps a function (sync or async) to always return a Result object with standardized errors.
 * Unlike `tryCatch`, failures are always normalized via `stderr()` with patched `toString()` for rich inspection.
 *
 * Overloads provide precise typing: synchronous functions yield a synchronous Result, while
 * asynchronous functions yield a Promise<Result>.
 *
 * @example
 * // Synchronous usage
 * const r1 = tryCatchStdErr(() => 42);
 * if (r1.ok) {
 *   console.log(r1.data); // 42
 * } else {
 *   console.error(r1.error);
 * }
 *
 * @example
 * // Asynchronous usage
 * const r2 = await tryCatchStdErr(async () => fetchValue());
 * if (!r2.ok) {
 *   console.error(r2.error.toString());
 * }
 */
export function tryCatchStdErr<T>(fn: () => T): Result<T>;
export function tryCatchStdErr<T>(fn: () => Promise<T>): Promise<Result<T>>;
export function tryCatchStdErr<T>(fn: () => T | Promise<T>): Result<T> | Promise<Result<T>> {
    try {
        const value = fn();
        // Detect promise-like (duck-typing for thenable)
        if (value && typeof (value as { then?: unknown }).then === 'function') {
            // Wrap in async IIFE to preserve literal discriminants
            return (async (): Promise<Result<T>> => {
                try {
                    const data = (await value) as Promise<T> as T;
                    return { ok: true as const, data, error: null };
                } catch (error) {
                    const finalError = stderr(error);
                    return { ok: false as const, data: null, error: finalError };
                }
            })();
        }
        // Sync success path
        return { ok: true as const, data: value as T, error: null };
    } catch (error) {
        const finalError = stderr(error);
        return { ok: false as const, data: null, error: finalError };
    }
}
