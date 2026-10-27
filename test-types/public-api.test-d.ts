// test-types/public-api.test-d.ts
// Type-level tests for the public API, checked by `pnpm run typecheck:test-types` (tsc).
//
// Type tests use vitest's expectTypeOf, which compares types exactly under plain tsc, and `// @ts-expect-error` for
// code that must not compile (tsc fails on an unused directive). Not tsd: its expectType/expectError only work under
// the tsd CLI; under tsc, expectType<T>(v) is an assignability check and expectError/expectNotAssignable check nothing.
//
// `// @ts-expect-error KNOWN BUG` marks a line that is wrong today. When the bug is fixed the directive becomes unused,
// tsc fails, and the line should be turned into a plain assertion.
/* eslint-disable @typescript-eslint/no-explicit-any -- `any` is one of the subjects of these tests */
import { expectTypeOf } from 'vitest';
import type { ErrorRecord, ErrorShape, NormalizeOptions, Result, StdErrorShape } from '../src';
import { stderr, StdError, tryCatch } from '../src';

// ============================================================================
// stderr()
// ============================================================================

expectTypeOf(stderr).parameters.toEqualTypeOf<[input: unknown, options?: NormalizeOptions]>();
expectTypeOf(stderr).returns.toEqualTypeOf<StdError>();
expectTypeOf(stderr(new Error('x'))).toEqualTypeOf<StdError>();
expectTypeOf(stderr('x', { maxDepth: 3, maxProperties: 10, maxArrayLength: 10 })).toEqualTypeOf<StdError>();
expectTypeOf<NormalizeOptions>().toEqualTypeOf<{ maxDepth?: number; maxProperties?: number; maxArrayLength?: number }>();

// @ts-expect-error unknown option
stderr('x', { maxDepht: 3 });
// @ts-expect-error limits are numbers
stderr('x', { maxDepth: '3' });

// T1: the README documents `stderr.maxDepth = 10`, so the global limits are part of stderr's type
stderr.maxDepth = 10;
expectTypeOf(stderr.maxDepth).toEqualTypeOf<number>();
expectTypeOf(stderr.maxProperties).toEqualTypeOf<number>();
expectTypeOf(stderr.maxArrayLength).toEqualTypeOf<number>();

// ============================================================================
// StdError
// ============================================================================

const e = new StdError('msg', { code: 'E_X', cause: new Error('c'), errors: [], name: 'MyError', maxDepth: 3 });
expectTypeOf(e).toExtend<Error>();
expectTypeOf(e).toExtend<ErrorShape>();
expectTypeOf(e.name).toEqualTypeOf<string>();
expectTypeOf(e.message).toEqualTypeOf<string>();
expectTypeOf(e.stack).toEqualTypeOf<string | undefined>();
expectTypeOf(e.cause).toEqualTypeOf<unknown>();
expectTypeOf(e.errors).toEqualTypeOf<unknown>();
expectTypeOf(e.code).toEqualTypeOf<unknown>();
expectTypeOf(e[Symbol('k')]).toEqualTypeOf<unknown>();
expectTypeOf(e.toString()).toEqualTypeOf<string>();
expectTypeOf(e.toJSON()).toEqualTypeOf<ErrorShape>();
expectTypeOf(StdError.defaultMaxDepth).toEqualTypeOf<number>();
expectTypeOf(StdError.defaultMaxProperties).toEqualTypeOf<number>();
expectTypeOf(StdError.defaultMaxArrayLength).toEqualTypeOf<number>();
expectTypeOf<StdErrorShape>().toEqualTypeOf<StdError>();
expectTypeOf(new StdError()).toEqualTypeOf<StdError>();

// @ts-expect-error the message is a string
new StdError(42);
// @ts-expect-error name must be a string
new StdError('x', { name: 42 });
// @ts-expect-error limits are numbers
new StdError('x', { maxDepth: '3' });

class HttpError extends StdError {
    constructor(
        message: string,
        public status: number
    ) {
        super(message, { name: 'HttpError' });
    }
}
expectTypeOf(new HttpError('x', 404).status).toEqualTypeOf<number>();
expectTypeOf(new HttpError('x', 404)).toExtend<StdError>();

// ============================================================================
// ErrorShape / ErrorRecord
// ============================================================================

expectTypeOf<ErrorRecord>().toEqualTypeOf<Record<string | symbol, unknown>>();
expectTypeOf<{ name: 'E'; message: 'm' }>().toExtend<ErrorShape>();
expectTypeOf<{ message: 'only a message' }>().toExtend<ErrorShape>();
expectTypeOf<{ name: 42 }>().not.toExtend<ErrorShape>();

// ============================================================================
// Result
// ============================================================================

expectTypeOf<Result<number>>().toEqualTypeOf<{ ok: true; value: number; error: null } | { ok: false; value: null; error: StdError }>();
expectTypeOf<Result<number, string>>().toEqualTypeOf<{ ok: true; value: number; error: null } | { ok: false; value: null; error: string }>();

declare const res: Result<number>;
if (res.ok) {
    expectTypeOf(res.value).toEqualTypeOf<number>();
    expectTypeOf(res.error).toEqualTypeOf<null>();
} else {
    expectTypeOf(res.value).toEqualTypeOf<null>();
    expectTypeOf(res.error).toEqualTypeOf<StdError>();
}
if (res.error === null) expectTypeOf(res.value).toEqualTypeOf<number>();

// ============================================================================
// tryCatch() overloads, compared exactly
// ============================================================================

type Custom = { code: string };
const toCustom = (err: StdError): Custom => ({ code: err.name });

// Sync
expectTypeOf(tryCatch(() => 42)).toEqualTypeOf<Result<number>>();
expectTypeOf(tryCatch(() => 'x' as const)).toEqualTypeOf<Result<'x'>>();
expectTypeOf(tryCatch(() => undefined)).toEqualTypeOf<Result<undefined>>();
expectTypeOf(tryCatch(() => {})).toEqualTypeOf<Result<void>>();
expectTypeOf(tryCatch(() => 42, toCustom)).toEqualTypeOf<Result<number, Custom>>();
expectTypeOf(tryCatch(() => null as unknown)).toEqualTypeOf<Result<unknown>>();

// Never returns
const throws = (): never => {
    throw new Error('x');
};
expectTypeOf(tryCatch(throws)).toEqualTypeOf<Result<never>>();
expectTypeOf(tryCatch(throws, toCustom)).toEqualTypeOf<Result<never, Custom>>();

// Async functions and raw Promises
expectTypeOf(tryCatch(async () => 42)).toEqualTypeOf<Promise<Result<number>>>();
expectTypeOf(tryCatch(async () => 42, toCustom)).toEqualTypeOf<Promise<Result<number, Custom>>>();
expectTypeOf(tryCatch(() => Promise.resolve('s'))).toEqualTypeOf<Promise<Result<string>>>();
expectTypeOf(tryCatch(Promise.resolve(42))).toEqualTypeOf<Promise<Result<number>>>();
expectTypeOf(tryCatch(Promise.resolve(42), toCustom)).toEqualTypeOf<Promise<Result<number, Custom>>>();
expectTypeOf(tryCatch(async (): Promise<never> => throws())).toEqualTypeOf<Promise<Result<never>>>();

// Explicit type arguments
expectTypeOf(tryCatch<number>(() => 42)).toEqualTypeOf<Result<number>>();
expectTypeOf(tryCatch<number>(async () => 42)).toEqualTypeOf<Promise<Result<number>>>();
expectTypeOf(tryCatch<number, Custom>(() => 42, toCustom)).toEqualTypeOf<Result<number, Custom>>();

// A function that may or may not return a Promise gives both outcomes
declare const maybeAsync: () => number | Promise<number>;
expectTypeOf(tryCatch(maybeAsync)).toEqualTypeOf<Result<number> | Promise<Result<number>>>();

// any (B2): a sync Result, not Promise<Result> | Result
declare const anyFn: () => any;
expectTypeOf(tryCatch(anyFn)).toEqualTypeOf<Result<any>>();
expectTypeOf(tryCatch(() => JSON.parse('1'))).toEqualTypeOf<Result<any>>();
expectTypeOf(tryCatch(async () => JSON.parse('1'))).toEqualTypeOf<Promise<Result<any>>>();

// A function returning a thenable that is not a Promise (PromiseLike, a query builder) is awaited too (T2)
declare const thenable: PromiseLike<number>;
expectTypeOf(tryCatch(() => thenable)).toEqualTypeOf<Promise<Result<number>>>();
expectTypeOf(tryCatch(thenable)).toEqualTypeOf<Promise<Result<number>>>();
expectTypeOf(tryCatch(() => thenable, toCustom)).toEqualTypeOf<Promise<Result<number, Custom>>>();

// Invalid calls
// @ts-expect-error not a function or Promise
tryCatch(42);
// @ts-expect-error functions take no arguments
tryCatch((a: number) => a);
const numberMapper = (err: number) => err;
// @ts-expect-error mapError receives a StdError
tryCatch(() => 1, numberMapper);
