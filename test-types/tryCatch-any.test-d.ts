// test-types/tryCatch-any.test-d.ts
// B2 (pre-3.0.0 review): a function returning `any` must give a sync Result, not Promise<Result> | Result.
/* eslint-disable @typescript-eslint/no-explicit-any -- `any` is the subject of these tests */
import { expectType } from 'tsd';
import type { Result } from '../src';
import { StdError, tryCatch } from '../src';

declare const text: string;
const parsed = tryCatch(() => JSON.parse(text));
expectType<Result<any, StdError>>(parsed);
if (parsed.ok) console.log(parsed.value);

declare const anyFn: () => any;
expectType<Result<any, StdError>>(tryCatch(anyFn));
expectType<Result<any, { code: string }>>(tryCatch(anyFn, e => ({ code: e.name })));

// Unchanged behaviour around it
expectType<Result<number, StdError>>(tryCatch(() => 42));
expectType<Promise<Result<any, StdError>>>(tryCatch(async () => JSON.parse(text)));
expectType<Result<number, StdError>>(tryCatch<number>(() => 42));
expectType<Promise<Result<number, StdError>>>(tryCatch<number>(async () => 42));

// Promises of any stay async
declare const anyPromise: Promise<any>;
expectType<Promise<Result<any, StdError>>>(tryCatch(anyPromise));
declare const asyncAnyFn: () => Promise<any>;
expectType<Promise<Result<any, StdError>>>(tryCatch(asyncAnyFn));
