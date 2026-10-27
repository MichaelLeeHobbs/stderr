// test-types/result.test-d.ts
import { describe, expectTypeOf } from 'vitest';
import type { Result } from '../src';
import { StdError, tryCatch } from '../src';

// ============================================================================
// Basic Result Type Tests
// ============================================================================

describe('Result type structure', () => {
    // Sync functions return Result<T, E>
    const syncResult = tryCatch(() => 42);
    expectTypeOf(syncResult).toEqualTypeOf<Result<number, StdError>>();
});

// ============================================================================
// Async Result Type Tests
// ============================================================================

describe('Async Result types', () => {
    // Async functions - T is inferred as Promise<string>
    // The current type definition wraps the Promise inside the Result
    const asyncResult = tryCatch(async () => 'test');
    expectTypeOf(asyncResult).toEqualTypeOf<Promise<Result<string, StdError>>>();

    // Promise.resolve wrapped functions
    const promiseResult = tryCatch(() => Promise.resolve(123));
    expectTypeOf(promiseResult).toEqualTypeOf<Promise<Result<number, StdError>>>();
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
    expectTypeOf(customResult).toEqualTypeOf<Result<never, CustomError>>();

    // Async with custom error type
    // T is Promise<never>, Error is CustomError
    const asyncCustom = tryCatch(
        async () => {
            throw new Error('test');
        },
        (err): CustomError => ({ code: err.name || '', msg: err.message || '' })
    );
    expectTypeOf(asyncCustom).toEqualTypeOf<Promise<Result<never, CustomError>>>();
});

// ============================================================================
// Promise Detection Tests
// ============================================================================

describe('Promise vs sync detection', () => {
    // Sync function
    const syncFn = () => 42;
    const syncRes = tryCatch(syncFn);
    expectTypeOf(syncRes).toEqualTypeOf<Result<number, StdError>>();

    // Async function
    const asyncFn = async () => 42;
    const asyncRes = tryCatch(asyncFn);
    expectTypeOf(asyncRes).toEqualTypeOf<Promise<Result<number, StdError>>>();

    // Function returning Promise
    const promiseFn = () => Promise.resolve(42);
    const promiseRes = tryCatch(promiseFn);
    expectTypeOf(promiseRes).toEqualTypeOf<Promise<Result<number, StdError>>>();
});

// ============================================================================
// Generic Type Tests
// ============================================================================

describe('Generic type inference', () => {
    // Infers return type from function
    const stringResult = tryCatch(() => 'hello');
    expectTypeOf(stringResult).toEqualTypeOf<Result<string, StdError>>();

    const numberResult = tryCatch(() => 123);
    expectTypeOf(numberResult).toEqualTypeOf<Result<number, StdError>>();

    // Async object result
    const objectResult = tryCatch(async () => ({ key: 'value' }));
    expectTypeOf(objectResult).toEqualTypeOf<Promise<Result<{ key: string }, StdError>>>();

    // Both type parameters can be given without mapError (this was asserted as an error, but tsc never checked it)
    expectTypeOf(tryCatch<number, StdError>(() => 42)).toEqualTypeOf<Result<number, StdError>>();
});

// ============================================================================
// Edge Case Type Tests
// ============================================================================

describe('Edge case types', () => {
    // void functions
    const voidResult = tryCatch(() => {
        console.log('side effect');
    });
    expectTypeOf(voidResult).toEqualTypeOf<Result<void, StdError>>();

    // undefined return
    const undefinedResult = tryCatch(() => undefined);
    expectTypeOf(undefinedResult).toEqualTypeOf<Result<undefined, StdError>>();

    // null return
    const nullResult = tryCatch(() => null);
    expectTypeOf(nullResult).toEqualTypeOf<Result<null, StdError>>();

    // never type (always throws)
    const neverResult = tryCatch((): never => {
        throw new Error('always fails');
    });
    expectTypeOf(neverResult).toEqualTypeOf<Result<never, StdError>>();
});

// ============================================================================
// Type Compatibility Tests
// ============================================================================

describe('Result type compatibility', () => {
    // Success Result is assignable
    const success: Result<number, StdError> = { ok: true, value: 42, error: null };
    expectTypeOf(success).toExtend<Result<number, StdError>>();

    // Failure Result is assignable
    const failure: Result<number, StdError> = { ok: false, value: null, error: new StdError('fail') };
    expectTypeOf(failure).toExtend<Result<number, StdError>>();

    // Partial Results are not assignable
    const partial = { ok: true, value: 42 };
    expectTypeOf(partial).not.toExtend<Result<number, StdError>>();

    // Wrong value type not assignable
    const wrongValue = { ok: true, value: 'string', error: null };
    expectTypeOf(wrongValue).not.toExtend<Result<number, StdError>>();
});

// ============================================================================
// Method Return Type Assignment Tests (Bug Fix Verification)
// ============================================================================

describe('Method return type assignment - async function inference', () => {
    // This tests the exact bug scenario from real-world usage
    // A method declares Promise<Result<T>> and uses tryCatch(async () => {...})
    // TypeScript should correctly infer Promise<Result<T>> without explicit generics

    // TODO: why is this here?
    // type UploadResult = { key: string; url: string; size: number };

    // TODO: why is this here?
    // Simulate the upload method pattern
    // async function upload(): Promise<Result<UploadResult, StdError>> {
    //     return tryCatch(async () => {
    //         const key = 'test-key';
    //         const url = 'https://example.com/test';
    //         const size = 1024;
    //         return { key, url, size };
    //     });
    // }

    // The return type of tryCatch(async () => {...}) should be Promise<Result<T>>
    const asyncUploadResult = tryCatch(async () => {
        return { key: 'k', url: 'u', size: 1 };
    });
    expectTypeOf(asyncUploadResult).toEqualTypeOf<Promise<Result<{ key: string; url: string; size: number }, StdError>>>();

    // With explicit generic should also work (current workaround)
    // Note: When using explicit generic with async, you must specify the unwrapped type
    // and the function return type will be checked against Promise<T>
    const explicitResult = tryCatch<Promise<{ key: string }>>(async () => {
        return { key: 'test' };
    });
    expectTypeOf(explicitResult).toEqualTypeOf<Promise<Result<{ key: string }, StdError>>>();

    // Async arrow function returning object
    const arrowAsyncResult = tryCatch(async () => ({ id: 1, name: 'test' }));
    expectTypeOf(arrowAsyncResult).toEqualTypeOf<Promise<Result<{ id: number; name: string }, StdError>>>();
});

// ============================================================================
// Proper Usage with await
// ============================================================================

describe('Proper usage patterns with await', () => {
    // NOTE: The current type definitions indicate that tryCatch returns Result<Promise<T>>
    // rather than Promise<Result<T>>. This means the Promise is inside the value property.

    // Test async function
    (async () => {
        const result = await tryCatch(async () => 42);
        expectTypeOf(result).toEqualTypeOf<Result<number, StdError>>();

        if (result.ok) {
            expectTypeOf(result.value).toEqualTypeOf<number>();
            expectTypeOf(result.error).toEqualTypeOf<null>();
        } else {
            expectTypeOf(result.value).toEqualTypeOf<null>();
            expectTypeOf(result.error).toEqualTypeOf<StdError>();
        }
    })();

    // Test sync function
    (async () => {
        const result = tryCatch(() => 'sync');
        expectTypeOf(result).toEqualTypeOf<Result<string, StdError>>();

        if (result.ok) {
            expectTypeOf(result.value).toEqualTypeOf<string>();
            expectTypeOf(result.error).toEqualTypeOf<null>();
        }
    })();

    // Test with Promise.resolve
    (async () => {
        const result = await tryCatch(() => Promise.resolve(true));
        expectTypeOf(result).toEqualTypeOf<Result<boolean, StdError>>();

        if (result.ok) {
            expectTypeOf(result.value).toEqualTypeOf<boolean>();
        }
    })();

    // Test with mapError
    (async () => {
        type CustomError = { code: string; msg: string };
        const result = await tryCatch(
            async () => 'test',
            (err): CustomError => ({ code: err.name, msg: err.message })
        );
        expectTypeOf(result).toEqualTypeOf<Result<string, CustomError>>();

        if (!result.ok) {
            expectTypeOf(result.error).toEqualTypeOf<CustomError>();
            expectTypeOf(result.error.code).toEqualTypeOf<string>();
            expectTypeOf(result.error.msg).toEqualTypeOf<string>();
        }
    })();
});

describe('Bug: Type Error when using tryCatch with non-inferred types', () => {
    type MyResultType = { data: string };

    async function myFunction(): Promise<MyResultType> {
        return { data: 'hello' };
    }

    // Using tryCatch without explicit generics
    (async () => {
        const result = await tryCatch(myFunction());
        expectTypeOf(result).toEqualTypeOf<Result<MyResultType, StdError>>();

        if (result.ok) {
            expectTypeOf(result.value).toEqualTypeOf<MyResultType>();
        }
    })();

    // Using tryCatch with explicit generics
    (async () => {
        const result = await tryCatch<MyResultType>(myFunction());
        expectTypeOf(result).toEqualTypeOf<Result<MyResultType, StdError>>();

        if (result.ok) {
            expectTypeOf(result.value).toEqualTypeOf<MyResultType>();
        }
    })();

    // Using tryCatch with async arrow function
    (async () => {
        const result = await tryCatch(async () => {
            return { data: 'world' };
        });
        expectTypeOf(result).toEqualTypeOf<Result<MyResultType, StdError>>();

        if (result.ok) {
            expectTypeOf(result.value).toEqualTypeOf<MyResultType>();
        }
    })();

    // Using tryCatch with async arrow function and explicit generics
    (async () => {
        const result = await tryCatch<MyResultType>(async () => {
            return { data: 'typescript' };
        });
        expectTypeOf(result).toEqualTypeOf<Result<MyResultType, StdError>>();

        if (result.ok) {
            expectTypeOf(result.value).toEqualTypeOf<MyResultType>();
        }
    })();
});
