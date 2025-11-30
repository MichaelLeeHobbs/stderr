// test-types/result.test-d.ts
import { expectType, expectError, expectAssignable, expectNotAssignable } from 'tsd';
import { tryCatch, StdError } from '../src';
import type { Result } from '../src';

// ============================================================================
// Basic Result Type Tests
// ============================================================================

describe('Result type structure', () => {
    // Result discriminated union - TypeScript sees union type even for sync functions
    // This is because the signature accepts () => T | Promise<T>
    const syncResult = tryCatch(() => 42);
    expectType<Result<number, StdError> | Promise<Result<number, StdError>>>(syncResult);

    // At runtime, sync functions return Result directly, but TypeScript can't know
    // Best practice: explicitly check or await if uncertain
    // For type tests, we need to handle the union
});

// ============================================================================
// Async Result Type Tests
// ============================================================================

describe('Async Result types', () => {
    // Async functions - returns union type
    const asyncResult = tryCatch(async () => 'test');
    expectType<Result<string, StdError> | Promise<Result<string, StdError>>>(asyncResult);

    // Promise.resolve wrapped functions - also returns union type
    const promiseResult = tryCatch(() => Promise.resolve(123));
    expectType<Result<number, StdError> | Promise<Result<number, StdError>>>(promiseResult);

    // For precise typing, use await:
    // const result = await tryCatch(async () => 'test');
    // Now TypeScript knows it's Result<string, StdError>
});

// ============================================================================
// mapError Transformation Tests
// ============================================================================

describe('mapError type transformation', () => {
    type CustomError = { code: string; msg: string };

    // Sync with custom error type - still returns union
    const customResult = tryCatch(
        () => {
            throw new Error('test');
        },
        (err): CustomError => ({ code: err.name || 'UNKNOWN', msg: err.message || '' })
    );
    expectType<Result<never, CustomError> | Promise<Result<never, CustomError>>>(customResult);

    // Async with custom error type - returns union
    const asyncCustom = tryCatch(
        async () => {
            throw new Error('test');
        },
        (err): CustomError => ({ code: err.name || '', msg: err.message || '' })
    );
    expectType<Result<never, CustomError> | Promise<Result<never, CustomError>>>(asyncCustom);
});

// ============================================================================
// Promise Detection Tests
// ============================================================================

describe('Promise vs sync detection', () => {
    // All functions return union type at compile time
    // Runtime detection happens inside tryCatch
    const syncFn = () => 42;
    const syncRes = tryCatch(syncFn);
    expectType<Result<number, StdError> | Promise<Result<number, StdError>>>(syncRes);

    // Async function - also union type
    const asyncFn = async () => 42;
    const asyncRes = tryCatch(asyncFn);
    expectType<Result<number, StdError> | Promise<Result<number, StdError>>>(asyncRes);

    // Function returning Promise - also union type
    const promiseFn = () => Promise.resolve(42);
    const promiseRes = tryCatch(promiseFn);
    expectType<Result<number, StdError> | Promise<Result<number, StdError>>>(promiseRes);

    // Best practice: Use await when you know it might be async
    // const result = await tryCatch(asyncFn);
    // Then TypeScript knows result is Result<number, StdError>
});

// ============================================================================
// Generic Type Tests
// ============================================================================

describe('Generic type inference', () => {
    // Infers return type from function - but returns union
    const stringResult = tryCatch(() => 'hello');
    expectType<Result<string, StdError> | Promise<Result<string, StdError>>>(stringResult);

    const numberResult = tryCatch(() => 123);
    expectType<Result<number, StdError> | Promise<Result<number, StdError>>>(numberResult);

    const objectResult = tryCatch(() => ({ key: 'value' }));
    expectType<Result<{ key: string }, StdError> | Promise<Result<{ key: string }, StdError>>>(objectResult);

    // Explicit type parameter only works with mapError
    // Without mapError, you can't specify custom error type
    // @ts-expect-error - E parameter requires mapError
    expectError(tryCatch<number, StdError>(() => 42));
});

// ============================================================================
// Edge Case Type Tests
// ============================================================================

describe('Edge case types', () => {
    // void functions - return union
    const voidResult = tryCatch(() => {
        console.log('side effect');
    });
    expectType<Result<void, StdError> | Promise<Result<void, StdError>>>(voidResult);

    // undefined return - return union
    const undefinedResult = tryCatch(() => undefined);
    expectType<Result<undefined, StdError> | Promise<Result<undefined, StdError>>>(undefinedResult);

    // null return - return union
    const nullResult = tryCatch(() => null);
    expectType<Result<null, StdError> | Promise<Result<null, StdError>>>(nullResult);

    // never type (always throws) - return union
    const neverResult = tryCatch((): never => {
        throw new Error('always fails');
    });
    expectType<Result<never, StdError> | Promise<Result<never, StdError>>>(neverResult);
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
    // When you await, TypeScript resolves the union and knows the exact type

    // Test async function
    (async () => {
        const result = await tryCatch(async () => 42);
        expectType<Result<number, StdError>>(result);

        // Now discriminated union works perfectly
        if (result.ok) {
            expectType<number>(result.value);
            expectType<null>(result.error);
            // Verify literal types
            const okLiteral: true = result.ok;
            expectType<true>(okLiteral);
        } else {
            expectType<null>(result.value);
            expectType<StdError>(result.error);
            // Verify literal types
            const okLiteral: false = result.ok;
            expectType<false>(okLiteral);
        }
    })();

    // Test sync function with await (still works)
    (async () => {
        const result = await tryCatch(() => 'sync');
        expectType<Result<string, StdError>>(result);

        if (result.ok) {
            expectType<string>(result.value);
            expectType<null>(result.error);
        } else {
            expectType<null>(result.value);
            expectType<StdError>(result.error);
        }
    })();

    // Test with Promise.resolve
    (async () => {
        const result = await tryCatch(() => Promise.resolve(true));
        expectType<Result<boolean, StdError>>(result);

        if (result.ok) {
            expectType<boolean>(result.value);
        }
    })();

    // Test with mapError
    (async () => {
        type CustomError = { code: string; msg: string };
        const result = await tryCatch(
            async () => 'test',
            (err): CustomError => ({ code: err.name, msg: err.message })
        );
        expectType<Result<string, CustomError>>(result);

        if (!result.ok) {
            expectType<CustomError>(result.error);
            expectType<string>(result.error.code);
            expectType<string>(result.error.msg);
        }
    })();
});
