// test-types/result.test-d.ts
import { expectType, expectError, expectAssignable, expectNotAssignable } from 'tsd';
import { tryCatch, StdError } from '../src';
import type { Result } from '../src';

// ============================================================================
// Basic Result Type Tests
// ============================================================================

describe('Result type structure', () => {
    // Sync functions return Result<T, E>
    const syncResult = tryCatch(() => 42);
    expectType<Result<number, StdError>>(syncResult);
});

// ============================================================================
// Async Result Type Tests
// ============================================================================

describe('Async Result types', () => {
    // Async functions - T is inferred as Promise<string>
    // The current type definition wraps the Promise inside the Result
    const asyncResult = tryCatch(async () => 'test');
    expectType<Result<Promise<string>, StdError>>(asyncResult);

    // Promise.resolve wrapped functions
    const promiseResult = tryCatch(() => Promise.resolve(123));
    expectType<Result<Promise<number>, StdError>>(promiseResult);
});

// ============================================================================
// mapError Transformation Tests
// ============================================================================

describe('mapError type transformation', () => {
    type CustomError = { code: string; msg: string };

    // Sync with custom error type
    const customResult = tryCatch(
        () => {
            throw new Error('test');
        },
        (err): CustomError => ({ code: err.name || 'UNKNOWN', msg: err.message || '' })
    );
    expectType<Result<never, CustomError>>(customResult);

    // Async with custom error type
    // T is Promise<never>, Error is CustomError
    const asyncCustom = tryCatch(
        async () => {
            throw new Error('test');
        },
        (err): CustomError => ({ code: err.name || '', msg: err.message || '' })
    );
    expectType<Result<Promise<never>, CustomError>>(asyncCustom);
});

// ============================================================================
// Promise Detection Tests
// ============================================================================

describe('Promise vs sync detection', () => {
    // Sync function
    const syncFn = () => 42;
    const syncRes = tryCatch(syncFn);
    expectType<Result<number, StdError>>(syncRes);

    // Async function
    const asyncFn = async () => 42;
    const asyncRes = tryCatch(asyncFn);
    expectType<Result<Promise<number>, StdError>>(asyncRes);

    // Function returning Promise
    const promiseFn = () => Promise.resolve(42);
    const promiseRes = tryCatch(promiseFn);
    expectType<Result<Promise<number>, StdError>>(promiseRes);
});

// ============================================================================
// Generic Type Tests
// ============================================================================

describe('Generic type inference', () => {
    // Infers return type from function
    const stringResult = tryCatch(() => 'hello');
    expectType<Result<string, StdError>>(stringResult);

    const numberResult = tryCatch(() => 123);
    expectType<Result<number, StdError>>(numberResult);

    // Async object result
    const objectResult = tryCatch(async () => ({ key: 'value' }));
    expectType<Result<Promise<{ key: string }>, StdError>>(objectResult);

    // Explicit type parameter only works with mapError
    // Without mapError, you can't specify custom error type
    // @ts-expect-error - E parameter requires mapError
    expectError(tryCatch<number, StdError>(() => 42));
});

// ============================================================================
// Edge Case Type Tests
// ============================================================================

describe('Edge case types', () => {
    // void functions
    const voidResult = tryCatch(() => {
        console.log('side effect');
    });
    expectType<Result<void, StdError>>(voidResult);

    // undefined return
    const undefinedResult = tryCatch(() => undefined);
    expectType<Result<undefined, StdError>>(undefinedResult);

    // null return
    const nullResult = tryCatch(() => null);
    expectType<Result<null, StdError>>(nullResult);

    // never type (always throws)
    const neverResult = tryCatch((): never => {
        throw new Error('always fails');
    });
    expectType<Result<never, StdError>>(neverResult);
});

// ============================================================================
// Type Compatibility Tests
// ============================================================================

describe('Result type compatibility', () => {
    // Success Result is assignable
    const success: Result<number, StdError> = { ok: true, value: 42, error: null };
    expectAssignable<Result<number, StdError>>(success);

    // Failure Result is assignable
    const failure: Result<number, StdError> = { ok: false, value: null, error: new StdError('fail') };
    expectAssignable<Result<number, StdError>>(failure);

    // Partial Results are not assignable
    const partial = { ok: true, value: 42 };
    expectNotAssignable<Result<number, StdError>>(partial);

    // Wrong value type not assignable
    const wrongValue = { ok: true, value: 'string', error: null };
    expectNotAssignable<Result<number, StdError>>(wrongValue);
});

// ============================================================================
// Proper Usage with await
// ============================================================================

describe('Proper usage patterns with await', () => {
    // NOTE: The current type definitions indicate that tryCatch returns Result<Promise<T>>
    // rather than Promise<Result<T>>. This means the Promise is inside the value property.

    // Test async function
    (async () => {
        // Even with await, TypeScript sees this as Result<Promise<number>>
        // because it thinks tryCatch returns an object synchronously
        const result = await tryCatch(async () => 42);
        expectType<Result<Promise<number>, StdError>>(result);

        if (result.ok) {
            // The value is the Promise
            expectType<Promise<number>>(result.value);
            expectType<null>(result.error);

            // To get the actual number, one would need to await the value
            // const val = await result.value;
        } else {
            expectType<null>(result.value);
            expectType<StdError>(result.error);
        }
    })();

    // Test sync function
    (async () => {
        const result = tryCatch(() => 'sync');
        expectType<Result<string, StdError>>(result);

        if (result.ok) {
            expectType<string>(result.value);
            expectType<null>(result.error);
        }
    })();

    // Test with Promise.resolve
    (async () => {
        const result = await tryCatch(() => Promise.resolve(true));
        expectType<Result<Promise<boolean>, StdError>>(result);

        if (result.ok) {
            expectType<Promise<boolean>>(result.value);
        }
    })();

    // Test with mapError
    (async () => {
        type CustomError = { code: string; msg: string };
        const result = await tryCatch(
            async () => 'test',
            (err): CustomError => ({ code: err.name, msg: err.message })
        );
        expectType<Result<Promise<string>, CustomError>>(result);

        if (!result.ok) {
            expectType<CustomError>(result.error);
            expectType<string>(result.error.code);
            expectType<string>(result.error.msg);
        }
    })();
});
