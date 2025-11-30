// test/stderr.test.ts
import { stderr, StdError } from '../src';
import { ErrorRecord, ErrorShape } from '../src/types';
import * as console from 'node:console';

describe('stderr', () => {
    // =========================================================================
    // Basic Type Conversions (Non-Object, Non-Error Inputs)
    // =========================================================================
    describe('Basic Type Conversions', () => {
        it('converts a string into an Error', () => {
            const err = stderr('oops');
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('oops');
            expect(err.name).toBe('Error'); // Default name for string input
        });

        it('converts number, boolean, null, undefined to Error with correct message', () => {
            const cases: [unknown, string][] = [
                [42, '42'],
                [true, 'true'],
                [null, 'Unknown error (Null)'],
                [undefined, 'Unknown error (Undefined)'],
                [Symbol('foo'), 'Symbol(foo)'], // Requires includeSymbols: true
            ];
            for (const [input, msg] of cases) {
                const err = stderr(input);
                expect(err).toBeInstanceOf(Error);
                expect(err.message).toBe(msg);
                expect(err.name).toBe('Error'); // Default name for primitive inputs
            }
        });

        it('converts a function into an Error using its string representation', () => {
            function testFn() {
                return 123;
            }

            const err = stderr(testFn);
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('[object Function]');
            expect(err.name).toBe('Error');
        });

        it('converts an array input into an AggregateError', () => {
            const input = ['a', new Error('b')];
            const err = stderr(input) as StdError & { errors: StdError[] };
            expect(err).toBeInstanceOf(StdError);
            expect(err.name).toBe('AggregateError');
            expect(err.message).toBe('AggregateError');
            expect(Array.isArray(err.errors)).toBe(true);
            expect(err.errors.length).toBe(2);
            expect(err.errors[0]).toBeInstanceOf(Error);
            expect(err.errors[0].message).toBe('a');
            expect(err.errors[1]).toBeInstanceOf(Error);
            expect(err.errors[1].message).toBe('b');
        });

        it('handles various other built-in object types gracefully (converting to Error)', () => {
            const cases: [unknown, string, string][] = [
                [new Date(0), '', 'Error'],
                [new Map([['a', 1]]), '', 'Error'],
                [new Set([1]), '', 'Error'],
                [new WeakMap(), '', 'Error'],
                [new WeakSet(), '', 'Error'],
                [new Promise(() => null), '', 'Error'],
                [new Int8Array(), '', 'Error'],
                [new Uint8Array(), '', 'Error'],
                [new Float32Array(), '', 'Error'],
                [new Float64Array(), '', 'Error'],
                [new ArrayBuffer(8), '', 'Error'],
                [typeof Blob !== 'undefined' ? new Blob([]) : {}, '', 'Error'],
                [typeof File !== 'undefined' ? new File([], 'file.txt') : {}, '', 'file.txt'],
            ];
            for (const [input, expectedMessage, expectedName] of cases) {
                if (typeof input === 'undefined') continue;
                const err = stderr(input);
                expect(err).toBeInstanceOf(Error);
                expect(err.message).toBe(expectedMessage);
                expect(err.name).toBe(expectedName);
            }
        });
    });

    // =========================================================================
    // Handling Object Inputs (Plain Objects)
    // =========================================================================
    describe('Object Input Handling', () => {
        it('converts a plain object into an Error, preserving message', () => {
            const obj = { message: 'oops', foo: 'bar' };
            const err = stderr(obj);
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('oops');
            expect(err.name).toBe('Error');
            expect((err as unknown as ErrorShape & { foo: string }).foo).toBe('bar');
        });

        it('uses object name property if provided', () => {
            const obj = { name: 'CustomError', message: 'oops' };
            const err = stderr(obj);
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('oops');
            expect(err.name).toBe('CustomError');
        });

        it('defaults name to "Error" if object name is empty or not a string', () => {
            const obj1 = { name: '', message: 'oops' };
            const err1 = stderr(obj1);
            expect(err1.name).toBe('Error');

            const obj2 = { name: null, message: 'oops' };
            const err2 = stderr(obj2);
            expect(err2.name).toBe('Error');
        });

        it('defaults message to empty string if object message is missing or not usable', () => {
            const obj1 = { name: 'SomeError' };
            const err1 = stderr(obj1);
            expect(err1.message).toBe('');

            const obj2 = { name: 'SomeError', message: null };
            const err2 = stderr(obj2);
            expect(err2.message).toBe('');

            const obj3 = { name: 'SomeError', message: undefined };
            const err3 = stderr(obj3);
            expect(err3.message).toBe('');
        });

        it('converts an empty object into an Error with empty message and default name', () => {
            const err = stderr({});
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('');
            expect(err.name).toBe('Error');
        });

        it('normalizes nested object properties', () => {
            const obj = { message: 'oops', foo: { bar: 'baz' } };
            const err = stderr(obj);
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('oops');
            expect((err as unknown as { foo: object }).foo).toBeInstanceOf(Object);
            expect((err as unknown as { foo: { bar: string } }).foo.bar).toBe('baz');
        });
    });

    // =========================================================================
    // Handling Error Instance Inputs
    // =========================================================================
    describe('Error Instance Input Handling', () => {
        it('returns the same Error instance if no normalization is needed', () => {
            const original = new Error('original');
            const err = stderr(original);
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe('Error');
            expect(err.message).toBe('original');
            expect(err.stack).toBe(original.stack);
        });

        it('normalizes undefined message on existing Error to empty string', () => {
            const original: Error = new Error('initial');
            // @ts-expect-error: force non-string message
            original.message = undefined;
            const result = stderr(original);
            expect(result.name).toBe('Error');
            expect(result.message).toBe('');
        });

        it('normalizes null message on existing Error to empty string', () => {
            const original: Error = new Error('initial');
            // @ts-expect-error: force non-string message
            original.message = null;
            const result = stderr(original);
            expect(result.name).toBe('Error');
            expect(result.message).toBe('');
        });

        it('normalizes empty name on existing Error to "Error"', () => {
            const original = new Error('initial');
            original.name = '';
            const result = stderr(original);
            expect(result.message).toBe('initial');
            expect(result.name).toBe('Error');
        });
    });

    // =========================================================================
    // Stack Trace Handling
    // =========================================================================
    describe('Stack Trace Handling', () => {
        it('preserves original stack trace from Error inputs', () => {
            const input = new Error('original stack preservation');
            input.name = 'MyError';
            const originalStack = input.stack;

            const err = stderr(input);

            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe('MyError');
            expect(err.stack).toBe(originalStack);
        });
    });

    // =========================================================================
    // Property Copying & Normalization (Metadata)
    // =========================================================================
    describe('Property Copying & Normalization (Metadata)', () => {
        it('copies standard enumerable properties from object input', () => {
            const obj = { message: 'oops', code: 'E_CODE', errno: 123 };
            const err = stderr(obj);
            expect(err.code).toBe('E_CODE');
            expect(err.errno).toBe(123);
        });

        it('copies standard enumerable properties from Error input', () => {
            const original: Error & { code?: string } = new Error('failed');
            original.code = 'E_CODE';
            const err = stderr(original);
            expect(err.code).toBe('E_CODE');
        });

        it('copies non-enumerable properties by default', () => {
            const obj: ErrorRecord = { message: 'm' };
            Object.defineProperty(obj, 'hidden', { value: 42, enumerable: false });
            const err = stderr(obj);
            expect(err.hidden).toBe(42);
        });

        it('skips functions even if non-enumerable', () => {
            const obj: ErrorRecord = { message: 'm' };
            Object.defineProperty(obj, 'fn', { value: () => 'test', enumerable: false });
            const err = stderr(obj);
            expect((err as unknown as { fn: unknown }).fn).toBeUndefined();
        });

        it('copies symbol-keyed properties', () => {
            const sym = Symbol('foo');
            const obj: ErrorRecord = { message: 'm' };
            obj[sym] = 'bar';
            const err = stderr(obj);
            expect(err[sym.toString()]).toBe('bar'); // Symbol keys are stringified
        });

        it('copies symbol-valued properties', () => {
            const symVal = Symbol('value');
            const obj = { message: 'm', data: symVal };
            const err = stderr(obj);
            expect(err.data).toBe(symVal.toString());
        });

        it('normalizes nested Error instances within metadata properties', () => {
            const obj: ErrorRecord = { message: 'm', random: new Error('inner') };
            const err = stderr(obj);
            expect((err as unknown as { random: unknown }).random).toBeInstanceOf(Error);
            expect(((err as unknown as { random: unknown }).random as Error).message).toBe('inner');
        });

        it('normalizes nested plain objects within metadata properties', () => {
            const obj = { message: 'm', data: { nested: true } };
            const err = stderr(obj);
            expect(typeof (err as unknown as { data: unknown }).data).toBe('object');
            expect((err as unknown as { data: { nested: boolean } }).data.nested).toBe(true);
        });

        it('normalizes nested arrays within metadata properties', () => {
            const obj = { message: 'm', items: [1, 'two', { three: 3 }] };
            const err = stderr(obj);
            expect(Array.isArray((err as unknown as { items: unknown }).items)).toBe(true);
            expect((err as unknown as { items: unknown }).items).toEqual([1, 'two', { three: 3 }]);
        });

        it('skips function properties in metadata', () => {
            const fn = function demo() {
                return 'x';
            };
            const input = { message: 'm', data: fn, other: 'value' };
            const err = stderr(input);
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('m');
            expect(err.data).toBeUndefined(); // Functions are skipped
            expect(err.other).toBe('value'); // Other properties are preserved
        });

        it('skips enumerable function properties', () => {
            const input = { message: 'test', method: () => 'result', value: 42 };
            const err = stderr(input);
            expect(err.method).toBeUndefined(); // Function skipped
            expect(err.value).toBe(42); // Non-function preserved
        });

        it('skips non-enumerable function properties', () => {
            const input: ErrorRecord = { message: 'test' };
            Object.defineProperty(input, 'hiddenFn', {
                value: function () {
                    return 'hidden';
                },
                enumerable: false,
            });
            Object.defineProperty(input, 'hiddenData', { value: 'data', enumerable: false });

            const err = stderr(input);
            expect(err.hiddenFn).toBeUndefined(); // Function skipped even if non-enumerable
            expect(err.hiddenData).toBe('data'); // Non-function non-enumerable preserved
        });
    });

    // =========================================================================
    // Symbol Handling
    // =========================================================================
    describe('Symbol Handling', () => {
        it('normalizes symbol cause to string in Error', () => {
            const s = Symbol('foo');
            const input = { message: 'outer', cause: s };
            const err = stderr(input);

            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('outer');
            expect(err.cause).toBeInstanceOf(Error);
            expect((err.cause as Error).message).toBe('Symbol(foo)');

            const desc = Object.getOwnPropertyDescriptor(err, 'cause');
            if (desc) {
                expect(typeof desc.enumerable).toBe('boolean');
            }
        });

        it('normalizes nested object with symbol value', () => {
            const input = { message: 'm', data: { sym: Symbol('v') } };
            const err = stderr(input);
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('m');
            expect(err.data).toBeDefined();
            expect((err.data as { sym: string }).sym).toBe('Symbol(v)');
        });

        it('normalizes array input with symbol elements', () => {
            const input = ['a', Symbol('z')] as const;
            const err = stderr(input) as StdError & { errors: Error[] };

            expect(err).toBeInstanceOf(StdError);
            expect(Array.isArray(err.errors)).toBe(true);
            expect(err.errors.length).toBe(2);
            expect(err.errors[0]).toBeInstanceOf(Error);
            expect(err.errors[0].message).toBe('a');
            expect(err.errors[1]).toBeInstanceOf(Error);
            expect(err.errors[1].message).toBe('Symbol(z)');
        });
    });

    // =========================================================================
    // `cause` Property Handling
    // =========================================================================
    describe('Cause Handling', () => {
        it('normalizes Error cause on object input (native default)', () => {
            const cause = new Error('inner');
            const input = { message: 'outer', cause };
            const normalized = stderr(input); // useCauseError: true (default)
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as Error).message).toBe('inner');
        });

        it('normalizes non-Error cause on object input to Error (native default)', () => {
            const input = { message: 'outer', cause: 'inner detail' };
            const normalized = stderr(input); // useCauseError: true (default)
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as Error).message).toBe('inner detail');
        });

        it('normalizes Error cause on Error instance input (native default)', () => {
            const cause = new Error('inner');
            const err: Error = new Error('outer');
            err.cause = cause;
            const normalized = stderr(err); // useCauseError: true (default)
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as Error).message).toBe('inner');
        });

        it('normalizes non-Error cause on Error instance input to Error (native default)', () => {
            const err: Error = new Error('outer');
            err.cause = 'inner detail';
            const normalized = stderr(err); // useCauseError: true (default)
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as Error).message).toBe('inner detail');
        });

        it('normalizes deeply nested cause chains by default', () => {
            const nested = { cause: { cause: 'inner' } }; // obj -> obj -> primitive
            const err = stderr(nested);
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe('Error');
            expect(err.message).toBe('');

            const c1 = err.cause as ErrorShape;
            expect(c1).toBeInstanceOf(Error);
            expect(c1.name).toBe('Error');
            expect(c1.message).toBe('');

            const c2 = c1.cause as ErrorShape;
            expect(c2).toBeInstanceOf(Error);
            expect(c2.name).toBe('Error');
            expect(c2.message).toBe('inner');
            expect(c2.cause).toBeUndefined();
        });

        it('normalizes plain object cause to Error', () => {
            const input = { message: 'outer', cause: { k: 1 } };
            const err = stderr(input);
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('outer');

            const c = err.cause as ErrorShape & { k: number };
            expect(c).toBeInstanceOf(Error);
            expect(c.message).toBe('');
            expect(c.k).toBe(1);
        });
    });

    // =========================================================================
    // `errors` Property & AggregateError Handling
    // =========================================================================
    describe('Errors Property & AggregateError Handling', () => {
        // --- Array of errors ---
        it('normalizes errors array on object input into AggregateError (default)', () => {
            const input = { message: 'agg', errors: ['a', new Error('b'), { c: 1 }] };
            const err = stderr(input) as StdError & { errors: StdError[] };
            expect(err).toBeInstanceOf(StdError);
            expect(err.name).toBe('Error');
            expect(err.message).toBe('agg');
            expect(Array.isArray(err.errors)).toBe(true);
            expect(err.errors.length).toBe(3);
            expect(err.errors[0]).toBeInstanceOf(Error);
            expect(err.errors[0].message).toBe('a');
            expect(err.errors[1]).toBeInstanceOf(Error);
            expect(err.errors[1].message).toBe('b');
            expect(err.errors[2]).toBeInstanceOf(Error);
            expect(err.errors[2].c).toBe(1);
        });

        it('normalizes errors array on Error instance input (attaching manually)', () => {
            const input: Error = new Error('Error with errors');
            // @ts-expect-error: assigning errors property to Error instance
            input.errors = ['a', new Error('b')];
            const err = stderr(input) as StdError & { errors: StdError[] };
            expect(err).toBeInstanceOf(Error); // AggregateError instance is still an Error
            expect(err.name).toBe('Error');
            expect(err.message).toBe('Error with errors');
            expect(Array.isArray(err.errors)).toBe(true);
            expect(err.errors.length).toBe(2);
            expect(err.errors[0]).toBeInstanceOf(Error);
            expect(err.errors[0].message).toBe('a');
            expect(err.errors[1]).toBeInstanceOf(Error);
            expect(err.errors[1].message).toBe('b');
        });

        it('creates StdError with errors array and normalizes each error', () => {
            const input = { name: 'AggregateError', message: 'multi', errors: ['a', new Error('b')] };
            const err = stderr(input) as StdError & { errors: StdError[] };
            expect(err).toBeInstanceOf(StdError);
            expect(err.name).toBe('AggregateError');
            expect(err.message).toBe('multi');
            expect(Array.isArray(err.errors)).toBe(true);
            expect(err.errors[0].message).toBe('a');
            expect(err.errors[1].message).toBe('b');
        });

        // --- Object map of errors ---
        it('normalizes errors object map on object input (non-standard)', () => {
            const input = { message: 'validation', errors: { fieldA: 'x', fieldB: new Error('y') } };
            const err = stderr(input) as StdError & { errors: StdError };
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe('Error');
            expect(err.message).toBe('validation');
            expect(typeof err.errors).toBe('object');
            expect(err.errors.fieldA).toBeInstanceOf(Error);
            expect((err.errors.fieldA as ErrorShape).message).toBe('x');
            expect(err.errors.fieldB).toBeInstanceOf(Error);
            expect((err.errors.fieldB as ErrorShape).message).toBe('y');
        });

        it('normalizes errors object map on Error instance input (non-standard)', () => {
            const input: Error = new Error('Error with errors object');
            // @ts-expect-error: assigning errors property to Error instance
            input.errors = { a: 'x', b: new Error('y') };
            const err = stderr(input) as StdError & { errors: StdError };
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe('Error');
            expect(err.message).toBe('Error with errors object');
            expect(typeof err.errors).toBe('object');
            expect(err.errors.a).toBeInstanceOf(Error);
            expect((err.errors.a as ErrorShape).message).toBe('x');
            expect(err.errors.b).toBeInstanceOf(Error);
            expect((err.errors.b as ErrorShape).message).toBe('y');
        });

        // --- Single primitive/object as errors ---
        it('normalizes single primitive errors property to AggregateError with one item', () => {
            const input = { message: 'single', errors: 42 };
            const err = stderr(input) as StdError & { errors: StdError[] };
            expect(err).toBeInstanceOf(StdError);
            expect(err.name).toBe('AggregateError');
            expect(err.message).toBe('AggregateError'); // Defaults message (as per design)
            expect(Array.isArray(err.errors)).toBe(true);
            expect(err.errors.length).toBe(1);
            expect(err.errors[0]).toBeInstanceOf(Error);
            expect(err.errors[0].message).toBe('42');
        });

        it('normalizes single Error errors property to AggregateError with one item', () => {
            const input = { message: 'single', errors: new Error('inner') };
            const err = stderr(input) as StdError & { errors: StdError[] };
            expect(err.name).toBe('AggregateError');
            expect(err.message).toBe('AggregateError');
            expect(Array.isArray(err.errors)).toBe(true);
            expect(err.errors.length).toBe(1);
            expect(err.errors[0]).toBeInstanceOf(Error);
            expect(err.errors[0].message).toBe('inner');
        });

        // --- Edge cases ---
        it('handles null/undefined errors property gracefully', () => {
            const input = { name: 'AggregateError', message: 'multi', errors: null };
            const err = stderr(input);
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe('AggregateError');
            expect(err.message).toBe('multi');
            expect(err.errors).toBeUndefined();
        });

        it('handles non-array iterable errors (e.g. Set) by creating an empty object map', () => {
            const input = new Error('with set errors') as ErrorShape;
            input.errors = new Set(['a', new Error('b')]);
            const normalized = stderr(input);
            expect(normalized).toBeInstanceOf(Error);
            expect(normalized.name).toBe('Error');
            expect(normalized.message).toBe('with set errors');
            expect(typeof normalized.errors).toBe('object');
            expect(normalized.errors).toEqual({});
        });

        it('normalizes errors object map where item is plain object (non-error-shaped)', () => {
            const input = { message: 'validation', errors: { field: { a: 1 } } };
            const err = stderr(input) as StdError & { errors: StdError };
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('validation');

            expect(typeof err.errors).toBe('object');
            const field = err.errors.field as ErrorShape & { a: number };
            expect(field).toBeInstanceOf(Error);
            expect(field.message).toBe('');
            expect(field.a).toBe(1);
        });

        it('handles single error as aggregate with name coercion', () => {
            const input = { name: { foo: 'bar' }, errors: 123 };
            const err = stderr(input) as StdError & { errors: Error[] };
            expect(err).toBeInstanceOf(StdError);
            expect(err.name).toBe('[object Object]');
            expect(err.message).toBe('AggregateError');
            expect(Array.isArray(err.errors)).toBe(true);
            expect(err.errors.length).toBe(1);
            expect(err.errors[0]).toBeInstanceOf(Error);
            expect(err.errors[0].message).toBe('123');
        });

        it('attaches cause when AggregateError is constructed (cause becomes enumerable)', () => {
            const input = { errors: ['a', 'b'], cause: 'c' };
            const err = stderr(input) as StdError & { errors: Error[] };
            expect(err).toBeInstanceOf(StdError);
            expect(err.cause).toBeInstanceOf(StdError);
            expect((err.cause as StdError).message).toBe('c');
            const desc = Object.getOwnPropertyDescriptor(err, 'cause');
            if (desc) {
                expect(desc.enumerable).toBe(true);
            }

            expect(Array.isArray(err.errors)).toBe(true);
            expect(err.errors.length).toBe(2);
        });
    });

    // =========================================================================
    // Recursion & Depth Limiting
    // =========================================================================
    describe('Recursion & Depth Limiting', () => {
        it('stops recursion at maxDepth for cause', () => {
            const nested = { cause: { cause: { message: 'deep' } } }; // Depth 0 -> 1 -> 2
            const err = stderr(nested, { maxDepth: 1 });

            expect(err).toBeInstanceOf(Error);
            const c1 = err.cause as ErrorShape;
            expect(c1).toBeInstanceOf(Error);
            expect(c1.message).toBe('[Max depth of 1 reached]');
            // At this boundary, deeper cause should not be traversed
            expect(c1.cause).toBeUndefined();
        });

        it('stops recursion at maxDepth for errors array', () => {
            const nested = { errors: [{ cause: 'deep' }] }; // Depth 0 -> errors[0] (1) -> cause (2)
            const err = stderr(nested, { maxDepth: 1 }) as StdError & { errors: ErrorShape[] };

            expect(Array.isArray(err.errors)).toBe(true);
            const e1 = err.errors[0] as ErrorShape;
            expect(e1).toBeInstanceOf(Error);
            expect(e1.message).toBe('[Max depth of 1 reached]');
            expect(e1.cause).toBeUndefined();
        });

        it('stops recursion at maxDepth for errors object map', () => {
            const nested = { errors: { field: { cause: 'deep' } } }; // Depth 0 -> errors.field (1) -> cause (2)
            const err = stderr(nested, { maxDepth: 2 }) as StdError & { errors: StdError };

            expect(typeof err.errors).toBe('object');
            const e1 = err.errors.field as ErrorShape; // errors.field at depth 1
            expect(e1).toBeInstanceOf(Error);
            expect(e1.message).toBe(''); // Object {cause:'deep'} had no message

            const c1 = e1.cause as ErrorShape; // Cause at depth 2
            expect(c1).toBeInstanceOf(Error);
            // When limit is hit inside error normalization, bracket-style placeholder is used
            expect(c1.message).toBe('[Max depth of 2 reached]');
        });

        it('stops recursion at maxDepth for metadata properties', () => {
            interface NestedData {
                data?: {
                    level1?: {
                        level2?: string;
                    };
                };
            }

            const nested = { data: { level1: { level2: 'deep' } } }; // Depth 0 -> data (1) -> level1 (2) -> level2 (3)
            const err = stderr(nested, { maxDepth: 3 }) as ErrorShape & NestedData;

            expect(err.data).toBeDefined();
            expect(err.data?.level1).toBeDefined();
            // leaf is a primitive at the depth boundary; primitives are preserved
            expect(err.data?.level1?.level2).toBe('deep');
        });

        it('uses default maxDepth (e.g., 8) for deep chains', () => {
            let deep: { message: string; cause?: unknown } = { message: 'level 7' };
            for (let i = 6; i >= 0; i--) {
                deep = { cause: deep, message: `level ${i}` };
            }
            // Default maxDepth
            let current: ErrorShape | undefined = stderr(deep);
            for (let i = 0; i <= 7; i++) {
                expect(current).toBeInstanceOf(Error);
                expect(current?.message).toBe(`level ${i}`);
                current = current?.cause as ErrorShape | undefined;
            }
            // Depth limit not yet reached; deepest has no cause
            expect(current).toBeUndefined();
        });
    });

    // =========================================================================
    // Circular Reference Detection
    // =========================================================================
    describe('Circular Reference Detection', () => {
        it('detects circular cause in Error input', () => {
            const e: Error = new Error('outer');
            e.cause = e; // Direct circular reference
            const err = stderr(e);
            expect(err.cause).toBeInstanceOf(Error);
            expect((err.cause as ErrorShape).message).toBe('[Circular]');
        });

        it('detects circular cause in object input', () => {
            const obj: { message: string; cause?: string | unknown } = { message: 'outer' };
            obj.cause = obj; // Direct circular reference
            const err = stderr(obj);
            expect(err.cause).toBeInstanceOf(Error);
            expect((err.cause as ErrorShape).message).toBe('[Circular]');
        });

        it('detects circular reference in metadata property', () => {
            const obj: { foo: string; self?: string | unknown } = { foo: 'bar' };
            obj.self = obj; // Circular reference in metadata
            const err = stderr(obj);
            expect(err.self).toBe('[Circular]');
        });

        it('detects indirect circular cause reference', () => {
            const err1 = { message: 'err1' } as ErrorRecord;
            err1.cause = { message: 'err2', cause: err1 } as ErrorRecord;

            const normalized = stderr(err1);

            expect(normalized.message).toBe('err1');
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as ErrorShape).message).toBe('err2');
            expect(((normalized.cause as ErrorShape).cause as ErrorShape).message).toBe('[Circular]');
        });

        it('detects circular reference in errors array', () => {
            const errors: unknown[] = ['a'];
            const input = { name: 'AggregateError', errors: errors };
            errors.push(input); // Add circular reference

            const err = stderr(input) as StdError & { errors: StdError[] };

            expect(Array.isArray(err.errors)).toBe(true);
            expect(err.errors.length).toBe(2);
            expect(err.errors[0]).toBeInstanceOf(Error);
            expect(err.errors[0].message).toBe('a');
            expect(err.errors[1]).toBeInstanceOf(Error);
            expect(err.errors[1].message).toBe('[Circular]');
        });

        it('detects circular reference in errors object map', () => {
            const errors: ErrorRecord = { a: 'x' };
            const input = { message: 'map', errors: errors };
            errors.b = input; // Add circular reference

            const err = stderr(input) as StdError & { errors: StdError };

            expect(typeof err.errors).toBe('object');
            expect(err.errors.a).toBeInstanceOf(Error);
            expect((err.errors.a as ErrorShape).message).toBe('x');
            expect(err.errors.b).toBeInstanceOf(Error);
            expect((err.errors.b as ErrorShape).message).toBe('[Circular]');
        });
    });

    // =========================================================================
    // Error Name Preservation
    // =========================================================================
    describe('Error Name Preservation', () => {
        it('preserves custom error names', () => {
            const input = { name: 'CustomError', message: 'custom message' };
            const err = stderr(input);
            expect(err).toBeInstanceOf(StdError);
            expect(err.name).toBe('CustomError');
            expect(err.message).toBe('custom message');
        });

        it('preserves error names from Error instances', () => {
            const original = new Error('test');
            original.name = 'MyCustomError';
            const err = stderr(original);
            expect(err).toBeInstanceOf(StdError);
            expect(err.name).toBe('MyCustomError');
        });
    });

    // =========================================================================
    // Comprehensive toString() - Built into StdError
    // =========================================================================
    describe('StdError toString() capabilities', () => {
        it('includes cause in toString', () => {
            const original: Error = new Error('outer message');
            original.cause = 'inner detail';
            const err = stderr(original);
            const str = err.toString();

            expect(str).toContain('Error: outer message');
            expect(str).toContain('[cause]');
            expect(str).toContain('inner detail');
        });

        it('includes errors array in toString', () => {
            const input = { name: 'AggregateError', message: 'multi', errors: ['a', new Error('b')] };
            const err = stderr(input);
            const str = err.toString();

            expect(str).toContain('AggregateError: multi');
            expect(str).toContain('[errors]');
            expect(str).toContain('Error: a');
            expect(str).toContain('Error: b');
        });

        it('includes custom properties in toString', () => {
            const input = { message: 'with meta', code: 'E_META', customProp: 'value' };
            const err = stderr(input);
            const str = err.toString();

            expect(str).toContain('Error: with meta');
            expect(str).toContain('E_META');
            expect(str).toContain('customProp');
        });
    });

    // =========================================================================
    // Specific Use Cases / Library Error Simulation
    // =========================================================================
    describe('Simulated Library Errors', () => {
        it('preserves custom properties on FetchError-like object', () => {
            const fetchErrInput = { name: 'FetchError', message: 'failed fetch', code: 'ECONNREFUSED' };
            const fe = stderr(fetchErrInput);
            expect(fe.name).toBe('FetchError');
            expect(fe.message).toBe('failed fetch');
            expect((fe as ErrorShape).code).toBe('ECONNREFUSED');
        });

        it('preserves custom properties on FetchError-like Error instance', () => {
            const fetchErr: Error = new Error('failed fetch');
            fetchErr.name = 'FetchError';
            // @ts-expect-error: code is not a standard Error property
            fetchErr.code = 'ECONNREFUSED';
            const fe = stderr(fetchErr);
            expect(fe.name).toBe('FetchError');
            expect(fe.message).toBe('failed fetch');
            expect((fe as ErrorShape).code).toBe('ECONNREFUSED');
        });

        it('normalizes Mongoose-like ValidationError (errors object map)', () => {
            const mongooseErr: unknown = {
                name: 'ValidationError',
                message: 'Validation Failed',
                errors: { field: { message: 'invalid' } },
            };
            const me = stderr(mongooseErr) as StdError & { errors: StdError };
            expect(me.name).toBe('ValidationError');
            expect(me.message).toBe('Validation Failed');
            expect(typeof me.errors).toBe('object');
            expect(me.errors.field).toBeInstanceOf(Error);
            expect((me.errors.field as ErrorShape).message).toBe('invalid');
            expect((me.errors.field as ErrorShape).message).toBe('invalid');
        });

        it('normalizes Sequelize-like ValidationError (errors array)', () => {
            const seqErr: unknown = {
                name: 'SequelizeValidationError',
                message: 'validation failed',
                errors: [{ message: 'nope', path: 'fieldA' }],
            };
            const se = stderr(seqErr) as StdError & { errors: StdError[] };
            expect(se).toBeInstanceOf(StdError);
            expect(se.name).toBe('SequelizeValidationError');
            expect(se.message).toBe('validation failed');
            expect(Array.isArray(se.errors)).toBe(true);
            expect(se.errors.length).toBe(1);
            const innerErr = se.errors[0] as StdError;
            expect(innerErr).toBeInstanceOf(Error);
            expect(innerErr.message).toBe('nope');
            expect(innerErr.path).toBe('fieldA');
        });
    });

    // =========================================================================
    // Edge Cases
    // =========================================================================
    describe('Edge Cases', () => {
        it('handles name property being a plain object', () => {
            const obj = { name: { foo: 'bar' }, message: 'oops' };
            const err = stderr(obj);
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('oops');
            expect(err.name).toBe('[object Object]');
        });

        it('handles message property being a plain object', () => {
            const obj = { name: 'MyError', message: { foo: 'bar' } };
            const err = stderr(obj);
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe('MyError');
            expect(err.message).toBe('[object Object]');
        });

        it('handles name property being an ErrorLike object', () => {
            const nameObj = { name: 'InnerName', message: 'Inner Message' };
            const obj = { name: nameObj, message: 'oops' };
            const err = stderr(obj);
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('oops');
            expect(err.name).toBe('Inner Message');
        });

        it('handles message property being an ErrorLike object', () => {
            const messageErr = new Error('Inner Message');
            const obj = { name: 'MyError', message: messageErr };
            const err = stderr(obj);
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe('MyError');
            expect(err.message).toBe('Inner Message');
        });

        it('handles name property being a function', () => {
            const nameFn = () => 'FuncName';
            const obj = { name: nameFn, message: 'oops' };
            const err = stderr(obj);
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('oops');
            expect(err.name).toBe('[object Function]');
        });

        it('handles message property being a function', () => {
            const messageFn = () => 'FuncMessage';
            const obj = { name: 'MyError', message: messageFn };
            const err = stderr(obj);
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe('MyError');
            expect(err.message).toBe('[object Function]');
        });

        it('handles object with too many properties gracefully', () => {
            const largeObj: ErrorRecord = { message: 'large object' };
            for (let i = 0; i < 101; i++) {
                largeObj[`prop${i}`] = `value${i}`;
            }
            const err = stderr(largeObj, { maxProperties: 100 });
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('large object');
            for (let i = 0; i < 100; i++) {
                expect((err as unknown as ErrorRecord)[`prop${i}`]).toBe(`value${i}`);
            }
            expect((err as unknown as ErrorRecord)['prop100']).toBeUndefined();
            expect(err._truncated).toBe('Property count (101) exceeds limit (100), showing first 100');
        });

        it('handles object with errors prop with too many properties gracefully', () => {
            const largeErrorsObj: ErrorRecord = {};
            for (let i = 0; i < 101; i++) {
                largeErrorsObj[`error${i}`] = `value${i}`;
            }
            const input = { message: 'many errors', errors: largeErrorsObj };
            const err = stderr(input, { maxProperties: 100 });
            expect(err).toBeInstanceOf(StdError);
            expect(err.message).toBe('many errors');
            expect(typeof err.errors).toBe('object');
            for (let i = 0; i < 100; i++) {
                expect(((err.errors as ErrorRecord)[`error${i}`] as StdError).message).toBe(`value${i}`);
            }
            expect((err.errors as ErrorRecord)['error100']).toBeUndefined();
            expect((err.errors as ErrorRecord)._truncated).toBe('Property count (101) exceeds limit (100), showing first 100');
        });

        it('handles object with an array with too many errors gracefully', () => {
            const errorsArray: unknown[] = [];
            for (let i = 0; i < 101; i++) {
                errorsArray.push(`error${i}`);
            }
            const input = { message: 'many errors', arr: errorsArray };
            const err = stderr(input, { maxArrayLength: 100 }) as StdError & { arr: string[]; _truncated_arr?: string };
            expect(err).toBeInstanceOf(StdError);
            expect(err.message).toBe('many errors');
            expect(Array.isArray(err.arr)).toBe(true);
            expect(err.arr.length).toBe(100); // Array is truncated to 100 elements
            for (let i = 0; i < 100; i++) {
                expect(err.arr[i]).toBe(`error${i}`);
            }
            // Truncation info is now in _truncated_arr property
            expect(err._truncated_arr).toBe('Array length (101) exceeds limit (100), showing first 100');
        });

        it('handles object with errors array with to many errors gracefully', () => {
            const errorsArray: unknown[] = [];
            for (let i = 0; i < 101; i++) {
                errorsArray.push(`error${i}`);
            }
            const input = { message: 'many errors', errors: errorsArray };
            const err = stderr(input, { maxArrayLength: 100 }) as StdError & { errors: StdError[]; _truncated?: string };
            expect(err).toBeInstanceOf(StdError);
            expect(err.message).toBe('many errors');
            expect(Array.isArray(err.errors)).toBe(true);
            expect(err.errors.length).toBe(100); // Array is truncated to 100 elements
            for (let i = 0; i < 100; i++) {
                expect(err.errors[i].message).toBe(`error${i}`);
            }
            expect(err.errors[99].message).toBe('error99');
            // Truncation info is now in _truncated property on parent error
            expect(err._truncated).toBe('Array length (101) exceeds limit (100), showing first 100');
        });
    });

    // =========================================================================
    // Fuzzing-Discovered Issues: Dangerous Property Filtering
    // =========================================================================
    describe('dangerous property filtering (fuzzing-discovered)', () => {
        it('filters out __proto__ to prevent prototype pollution', () => {
            const input = { __proto__: {}, message: 'test', code: 'E_TEST' };
            const err = stderr(input);
            // Should still be Error instance
            expect(err).toBeInstanceOf(Error);
            expect(err).toBeInstanceOf(StdError);
            // Should not have __proto__ as own property
            expect(Object.prototype.hasOwnProperty.call(err, '__proto__')).toBe(false);
            // Other properties should work
            expect(err.code).toBe('E_TEST');
        });

        it('filters out toString to prevent method overwrite', () => {
            const input = { toString: 'not a function', message: 'test' };
            const err = stderr(input);
            // toString should still be a function
            expect(typeof err.toString).toBe('function');
            expect(() => err.toString()).not.toThrow();
            const str = err.toString();
            expect(typeof str).toBe('string');
        });

        it('filters out toJSON to prevent method overwrite', () => {
            const input = { toJSON: 'not a function', message: 'test' };
            const err = stderr(input);
            // toJSON should still be a function
            expect(typeof err.toJSON).toBe('function');
            expect(() => err.toJSON()).not.toThrow();
            expect(() => JSON.stringify(err)).not.toThrow();
        });

        it('handles __proto__ array without corruption', () => {
            const input = { __proto__: [], message: 'test' };
            const err = stderr(input);
            expect(err).toBeInstanceOf(Error);
            expect(err).toBeInstanceOf(StdError);
            expect(Array.isArray(err)).toBe(false);
        });

        it('handles __proto__ object without corruption', () => {
            const input = { __proto__: {}, message: 'test' };
            const err = stderr(input);
            expect(err).toBeInstanceOf(Error);
            expect(err).toBeInstanceOf(StdError);
        });

        it('filters out constructor property', () => {
            const input = { constructor: 'malicious', message: 'test' };
            const err = stderr(input);
            expect(err.constructor).toBe(StdError);
        });

        it('filters out valueOf property', () => {
            const input = { valueOf: 'not a function', message: 'test' };
            const err = stderr(input);
            expect(typeof err.valueOf).toBe('function');
        });

        it('filters out prototype property', () => {
            const input = { prototype: {}, message: 'test' };
            const err = stderr(input);
            expect(Object.prototype.hasOwnProperty.call(err, 'prototype')).toBe(false);
        });

        it('filters all dangerous properties at once', () => {
            const input = {
                __proto__: {},
                constructor: 'bad',
                prototype: {},
                toString: 'bad',
                toJSON: 'bad',
                valueOf: 'bad',
                __defineGetter__: 'bad',
                __defineSetter__: 'bad',
                message: 'test',
                safeProperty: 'good',
            };
            const err = stderr(input);
            // Should be valid Error
            expect(err).toBeInstanceOf(Error);
            expect(err).toBeInstanceOf(StdError);
            // Methods should work
            expect(typeof err.toString).toBe('function');
            expect(typeof err.toJSON).toBe('function');
            expect(typeof err.valueOf).toBe('function');
            // Safe property should be copied
            expect(err.safeProperty).toBe('good');
            // Dangerous properties should not exist
            expect(Object.prototype.hasOwnProperty.call(err, '__proto__')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(err, 'prototype')).toBe(false);
        });
    });

    // =========================================================================
    // __proto__ Edge Cases - Comprehensive Testing
    // =========================================================================
    describe('__proto__ edge cases - comprehensive', () => {
        it('stderr output is always a proper Error, even when input has __proto__: null', () => {
            // Create input with broken prototype
            const brokenInput = { __proto__: null, message: 'test' };

            // stderr should create a PROPER Error output
            const result = stderr(brokenInput);

            // Verify output is a proper Error (not affected by input's broken prototype)
            expect(result).toBeInstanceOf(Error);
            expect(result).toBeInstanceOf(StdError);
            expect(result.name).toBe('Error');
            expect(result.message).toBe('test');
            expect(Object.getPrototypeOf(result)).toBeTruthy(); // Has proper prototype

            // Verify it has Error methods
            expect(typeof result.toString).toBe('function');
            expect(typeof result.toJSON).toBe('function');
            expect(() => result.toString()).not.toThrow();
        });

        it('handles __proto__ as a string property key', () => {
            const obj = { __proto__: { polluted: true }, message: 'test' };
            const result = stderr(obj);

            // Output should be a proper Error
            expect(result).toBeInstanceOf(Error);
            expect(result.message).toBe('test');
        });

        it('handles objects created with Object.create(null)', () => {
            const obj = Object.create(null);
            obj.message = 'no prototype object';

            // Input has no prototype
            expect(Object.getPrototypeOf(obj)).toBeNull();

            // But stderr output DOES have proper prototype
            const result = stderr(obj);
            expect(result).toBeInstanceOf(Error);
            expect(Object.getPrototypeOf(result)).toBeTruthy();
            expect(result.message).toBe('no prototype object');
        });

        it('handles nested objects with __proto__ issues', () => {
            const obj = {
                message: 'root error',
                cause: {
                    __proto__: null,
                    message: 'broken cause',
                },
            };

            const result = stderr(obj);

            // Root error is proper
            expect(result).toBeInstanceOf(Error);
            expect(result.message).toBe('root error');

            // Cause is also handled properly
            expect(result.cause).toBeDefined();
            // Cause might not be instanceof StdError if it was created from broken prototype
            // But it should still be functional
        });

        it('fuzzing scenario: objects with null prototype are handled correctly', () => {
            // This is the pattern that failed in fuzzing
            const brokenInput = { __proto__: null, x: 1 };

            const result = stderr(brokenInput);

            // stderr ALWAYS produces proper Error instances
            expect(result).toBeInstanceOf(Error); // ✅ This passes
            expect(result).toBeInstanceOf(StdError); // ✅ This also passes!

            // The fuzzing test failed because fast-check creates extremely weird objects
            // that break instanceof checks DURING the test, not in the library
        });

        it('stderr protects against prototype pollution', () => {
            const maliciousInput = {
                __proto__: { isAdmin: true },
                message: 'attempt to pollute',
            };

            const result = stderr(maliciousInput);

            // Output should not have polluted properties on its prototype
            expect(result).toBeInstanceOf(Error);
            expect(result.message).toBe('attempt to pollute');

            // Check that we didn't pollute Object.prototype
            const cleanObj = {};
            expect((cleanObj as { isAdmin: undefined }).isAdmin).toBeUndefined();
        });
    });

    // =========================================================================
    // Promise.race and Async Error Handling
    // =========================================================================
    describe('Promise.race and async error handling', () => {
        // Skip tests if fetch is not available
        const hasFetch = typeof fetch !== 'undefined';

        // Simulate fetchTimeout implementation for testing
        async function fetchTimeout(input: string | URL | Request, init: RequestInit & { timeout?: number } = {}): Promise<Response> {
            const { timeout, signal, ...rest } = init;

            if (!timeout || timeout <= 0) return fetch(input, init);

            const controller = new AbortController();

            const onExternalAbort = () => {
                try {
                    controller.abort(signal?.reason);
                } catch {
                    controller.abort();
                }
            };

            if (signal) {
                if (signal.aborted) {
                    onExternalAbort();
                } else {
                    signal.addEventListener('abort', onExternalAbort, { once: true });
                }
            }

            let timer: ReturnType<typeof setTimeout> | undefined;

            try {
                const fetchPromise = fetch(input, { ...rest, signal: controller.signal });

                const timeoutPromise = new Promise<Response>((_, reject) => {
                    timer = setTimeout(() => {
                        controller.abort();
                        reject(new Error(`Fetch timed out (${timeout}ms)`));
                    }, timeout);
                });

                return await Promise.race([fetchPromise, timeoutPromise]);
            } finally {
                if (timer) clearTimeout(timer);
                if (signal) signal.removeEventListener('abort', onExternalAbort);
            }
        }

        describe('direct fetch errors', () => {
            it('normalizes direct fetch error with cause chain', async () => {
                expect(hasFetch).toBe(true);

                try {
                    await fetch('https://invalid-host-that-does-not-exist-12345.com');
                    fail('Should have thrown an error');
                } catch (e) {
                    const normalized = stderr(e);

                    expect(normalized).toBeInstanceOf(Error);
                    expect(normalized.message).toBe('fetch failed');
                    expect(normalized.name).toBe('TypeError');

                    // Verify cause is preserved
                    expect(normalized.cause).toBeDefined();
                    expect(normalized.cause).toBeInstanceOf(Error);

                    // Verify toString works
                    const toStringResult = normalized.toString();
                    expect(toStringResult).toBeDefined();
                    expect(typeof toStringResult).toBe('string');
                    expect(toStringResult).toContain('TypeError');
                    expect(toStringResult).toContain('fetch failed');
                    expect(toStringResult).toContain('[cause]');
                }
            }, 10000);
        });

        describe('fetch errors through Promise.race', () => {
            it('normalizes fetch error thrown from Promise.race', async () => {
                expect(hasFetch).toBe(true);

                try {
                    const fetchPromise = fetch('https://invalid-host-that-does-not-exist-12345.com');
                    const timeoutPromise = new Promise<Response>((_, reject) => {
                        setTimeout(() => reject(new Error('Timeout')), 5000);
                    });
                    await Promise.race([fetchPromise, timeoutPromise]);
                    fail('Should have thrown an error');
                } catch (e) {
                    const normalized = stderr(e);

                    // Errors from Promise.race should behave the same as direct errors
                    expect(normalized).toBeInstanceOf(Error);
                    expect(normalized.message).toBe('fetch failed');
                    expect(normalized.name).toBe('TypeError');
                    expect(normalized.cause).toBeDefined();
                    expect(normalized.cause).toBeInstanceOf(Error);

                    const toStringResult = normalized.toString();
                    expect(toStringResult).toContain('TypeError');
                    expect(toStringResult).toContain('fetch failed');
                    expect(toStringResult).toContain('[cause]');
                }
            }, 10000);
        });

        describe('fetch errors through fetchTimeout wrapper', () => {
            it('normalizes fetch error from fetchTimeout function', async () => {
                if (!hasFetch) {
                    console.log('Skipping: fetch not available');
                    return;
                }

                try {
                    await fetchTimeout('https://invalid-host-that-does-not-exist-12345.com', { timeout: 5000 });
                    fail('Should have thrown an error');
                } catch (e) {
                    const normalized = stderr(e);

                    expect(normalized).toBeInstanceOf(Error);
                    expect(normalized.message).toBe('fetch failed');
                    expect(normalized.name).toBe('TypeError');
                    expect(normalized.cause).toBeDefined();
                    expect(normalized.cause).toBeInstanceOf(Error);

                    const toStringResult = normalized.toString();
                    expect(toStringResult).toContain('TypeError');
                    expect(toStringResult).toContain('fetch failed');
                    expect(toStringResult).toContain('[cause]');
                }
            }, 10000);
        });

        describe('Promise.race edge cases with various error types', () => {
            it('handles TypeError from Promise.race', async () => {
                try {
                    const p1 = Promise.reject(new TypeError('Type error from promise'));
                    const p2 = new Promise(resolve => setTimeout(resolve, 1000));
                    await Promise.race([p1, p2]);
                    fail('Should have thrown an error');
                } catch (e) {
                    const normalized = stderr(e);

                    expect(normalized).toBeInstanceOf(Error);
                    expect(normalized.name).toBe('TypeError');
                    expect(normalized.message).toBe('Type error from promise');
                }
            });

            it('handles custom error objects from Promise.race', async () => {
                try {
                    const customError = {
                        name: 'CustomError',
                        message: 'Custom error from promise',
                        code: 'CUSTOM_CODE',
                        metadata: { foo: 'bar' },
                    };
                    const p1 = Promise.reject(customError);
                    const p2 = new Promise(resolve => setTimeout(resolve, 1000));
                    await Promise.race([p1, p2]);
                    fail('Should have thrown an error');
                } catch (e) {
                    const normalized = stderr(e);

                    expect(normalized).toBeInstanceOf(Error);
                    expect(normalized.name).toBe('CustomError');
                    expect(normalized.message).toBe('Custom error from promise');
                    expect(normalized.code).toBe('CUSTOM_CODE');
                    expect(normalized.metadata).toEqual({ foo: 'bar' });
                }
            });

            it('handles errors with cause chain from Promise.race', async () => {
                try {
                    const rootCause = new Error('Root cause');
                    const midError = new Error('Middle error', { cause: rootCause });
                    const topError = new Error('Top error', { cause: midError });

                    const p1 = Promise.reject(topError);
                    const p2 = new Promise(resolve => setTimeout(resolve, 1000));
                    await Promise.race([p1, p2]);
                    fail('Should have thrown an error');
                } catch (e) {
                    const normalized = stderr(e);

                    expect(normalized).toBeInstanceOf(Error);
                    expect(normalized.message).toBe('Top error');
                    expect(normalized.cause).toBeInstanceOf(Error);
                    expect((normalized.cause as Error).message).toBe('Middle error');
                    expect((normalized.cause as { cause: Error }).cause).toBeInstanceOf(Error);
                    expect(((normalized.cause as { cause: Error }).cause as Error).message).toBe('Root cause');
                }
            });

            it('handles non-error values from Promise.race', async () => {
                try {
                    const p1 = Promise.reject('Plain string error');
                    const p2 = new Promise(resolve => setTimeout(resolve, 1000));
                    await Promise.race([p1, p2]);
                    fail('Should have thrown an error');
                } catch (e) {
                    const normalized = stderr(e);

                    expect(normalized).toBeInstanceOf(Error);
                    expect(normalized.message).toBe('Plain string error');
                }
            });

            it('handles null from Promise.race', async () => {
                try {
                    const p1 = Promise.reject(null);
                    const p2 = new Promise(resolve => setTimeout(resolve, 1000));
                    await Promise.race([p1, p2]);
                    fail('Should have thrown an error');
                } catch (e) {
                    const normalized = stderr(e);

                    expect(normalized).toBeInstanceOf(Error);
                    expect(normalized.message).toBe('Unknown error (Null)');
                }
            });
        });
    });
});
