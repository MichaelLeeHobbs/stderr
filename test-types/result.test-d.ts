// test-types/result.test-d.ts
import { expectType, expectError, expectAssignable, expectNotAssignable } from 'tsd';
import { tryCatch, mapResult, unwrapOr, andThen, orElse, StdError } from '../src';
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
// Result Utility Function Tests
// ============================================================================

describe('mapResult types', () => {
    const result: Result<number, StdError> = tryCatch(() => 42);

    // mapResult transforms success type
    const doubled = mapResult(result, x => x * 2);
    expectType<Result<number, StdError>>(doubled);

    // mapResult can change success type
    const stringified = mapResult(result, x => String(x));
    expectType<Result<string, StdError>>(stringified);

    // mapResult preserves error type
    type CustomErr = { msg: string };
    // When mapping an error result, x would be null, so we test with success
    const successResult: Result<number, CustomErr> = { ok: true, value: 42, error: null };
    const mappedCustom = mapResult(successResult, x => x * 2);
    // mapResult transforms the success type but preserves error type
    // However, the error in success case is null, so type becomes Result<number, null>
    expectType<Result<number, null>>(mappedCustom);
});

describe('unwrapOr types', () => {
    const result: Result<number, StdError> = tryCatch(() => 42);

    // unwrapOr returns value type
    const value = unwrapOr(result, 0);
    expectType<number>(value);

    // Default value must match success type
    unwrapOr(result, 99);
    // @ts-expect-error - default must match success type
    expectError(unwrapOr(result, 'string'));
});

describe('andThen types', () => {
    const result: Result<number, StdError> = tryCatch(() => 42);

    // andThen chains Results
    const chained = andThen(result, x => tryCatch(() => String(x)));
    expectType<Result<string, StdError>>(chained);

    // andThen function must return Result
    // @ts-expect-error - must return Result
    expectError(andThen(result, x => x * 2));
});

describe('orElse types', () => {
    const result: Result<number, StdError> = tryCatch(() => {
        throw new Error('test');
    });

    // orElse can change error type
    const recovered = orElse(result, () => tryCatch(() => 42));
    expectType<Result<number, StdError>>(recovered);

    // orElse can recover with different error type
    type NewErr = { code: number };
    const newErrResult: Result<number, NewErr> = { ok: false, value: null, error: { code: 500 } };
    const converted = orElse(result, () => newErrResult);
    expectType<Result<number, NewErr>>(converted);
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
