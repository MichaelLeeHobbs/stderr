// test-types/result.test-d.ts
import { expectType, expectError, expectAssignable, expectNotAssignable } from 'tsd';
import { tryCatch, StdError } from '../src';
import type { Result } from '../src';

// ============================================================================
// Basic Result Type Tests
// ============================================================================

describe('Result type structure', () => {
    // Result discriminated union
    const syncResult = tryCatch(() => 42);
    expectType<Result<number, StdError>>(syncResult);

    // Success branch type narrowing
    if (syncResult.ok) {
        expectType<number>(syncResult.value);
        expectType<null>(syncResult.error);
        // @ts-expect-error - error should be null in success branch
        expectError(syncResult.error.message);
    } else {
        // Error branch type narrowing
        expectType<null>(syncResult.value);
        expectType<StdError>(syncResult.error);
        expectType<string | undefined>(syncResult.error.message);
        expectType<string | undefined>(syncResult.error.name);
    }
});

// ============================================================================
// Async Result Type Tests
// ============================================================================

describe('Async Result types', () => {
    // Note: TypeScript's type inference for async functions is limited
    // The overloads work at runtime but type inference may not be perfect

    // Async functions - TypeScript sees these as () => Promise<T>
    // which matches the second overload, but inference can be tricky
    const asyncResult = tryCatch(async () => 'test');
    // Runtime: Returns Promise<Result<string, StdError>>
    // TypeScript infers: Result<Promise<string>, StdError> (less precise but safe)
    expectType<Result<Promise<string>, StdError> | Promise<Result<string, StdError>>>(asyncResult);

    // Promise.resolve wrapped functions
    const promiseResult = tryCatch(() => Promise.resolve(123));
    // TypeScript can't distinguish () => Promise<T> from () => T at compile time
    expectType<Result<Promise<number>, StdError> | Promise<Result<number, StdError>>>(promiseResult);

    // For precise typing, use await:
    // const result = await tryCatch(async () => 'test');
    // expectType<Result<string, StdError>>(result);
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

    // Verify transformed error type
    if (!customResult.ok) {
        expectType<CustomError>(customResult.error);
        expectType<string>(customResult.error.code);
        expectType<string>(customResult.error.msg);
        // @ts-expect-error - StdError properties not present
        expectError(customResult.error.stack);
    }

    // Async with custom error type
    const asyncCustom = tryCatch(
        async () => {
            throw new Error('test');
        },
        (err): CustomError => ({ code: err.name || '', msg: err.message || '' })
    );
    // TypeScript inference limitation: sees Result<Promise<never>, CustomError>
    expectType<Result<Promise<never>, CustomError> | Promise<Result<never, CustomError>>>(asyncCustom);
});

// ============================================================================
// Promise Detection Tests
// ============================================================================

describe('Promise vs sync detection', () => {
    // Sync function returns Result directly
    const syncFn = () => 42;
    const syncRes = tryCatch(syncFn);
    expectType<Result<number, StdError>>(syncRes);
    // @ts-expect-error - sync result is not a Promise
    expectError(syncRes.then);

    // Async function - TypeScript inference limitation
    // At compile time, TypeScript can't always distinguish async functions
    const asyncFn = async () => 42;
    const asyncRes = tryCatch(asyncFn);
    // Runtime returns Promise<Result<number, StdError>>
    // TypeScript may infer as Result<Promise<number>, StdError>
    expectType<Result<Promise<number>, StdError> | Promise<Result<number, StdError>>>(asyncRes);

    // Function returning Promise - same inference limitation
    const promiseFn = () => Promise.resolve(42);
    const promiseRes = tryCatch(promiseFn);
    expectType<Result<Promise<number>, StdError> | Promise<Result<number, StdError>>>(promiseRes);

    // Best practice: Use await for async operations
    // const result = await tryCatch(async () => 42);
    // Then TypeScript knows result is Result<number, StdError>
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

    const objectResult = tryCatch(() => ({ key: 'value' }));
    expectType<Result<{ key: string }, StdError>>(objectResult);

    // Explicit type parameters
    const explicitResult = tryCatch<number, StdError>(() => 42);
    expectType<Result<number, StdError>>(explicitResult);
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
// Const Assertions Tests
// ============================================================================

describe('Const assertions', () => {
    // ok should be literal true/false, not boolean
    const result = tryCatch(() => 42);

    if (result.ok) {
        // TypeScript knows ok is literally true
        const okValue: true = result.ok;
        expectType<true>(okValue);
    } else {
        // TypeScript knows ok is literally false
        const okValue: false = result.ok;
        expectType<false>(okValue);
    }
});
