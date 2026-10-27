// test-types/tryCatch-any.test-d.ts
// B2 (pre-3.0.0 review): a function returning `any` must give a sync Result, not Promise<Result> | Result.
/* eslint-disable @typescript-eslint/no-explicit-any -- `any` is the subject of these tests */
import { expectTypeOf } from 'vitest';
import type { Result } from '../src';
import { StdError, tryCatch } from '../src';

declare const text: string;
const parsed = tryCatch(() => JSON.parse(text));
expectTypeOf(parsed).toEqualTypeOf<Result<any, StdError>>();
if (parsed.ok) console.log(parsed.value);

declare const anyFn: () => any;
expectTypeOf(tryCatch(anyFn)).toEqualTypeOf<Result<any, StdError>>();
expectTypeOf(tryCatch(anyFn, e => ({ code: e.name }))).toEqualTypeOf<Result<any, { code: string }>>();

// Unchanged behaviour around it
expectTypeOf(tryCatch(() => 42)).toEqualTypeOf<Result<number, StdError>>();
expectTypeOf(tryCatch(async () => JSON.parse(text))).toEqualTypeOf<Promise<Result<any, StdError>>>();
expectTypeOf(tryCatch<number>(() => 42)).toEqualTypeOf<Result<number, StdError>>();
expectTypeOf(tryCatch<number>(async () => 42)).toEqualTypeOf<Promise<Result<number, StdError>>>();

// Promises of any stay async
declare const anyPromise: Promise<any>;
expectTypeOf(tryCatch(anyPromise)).toEqualTypeOf<Promise<Result<any, StdError>>>();
declare const asyncAnyFn: () => Promise<any>;
expectTypeOf(tryCatch(asyncAnyFn)).toEqualTypeOf<Promise<Result<any, StdError>>>();
