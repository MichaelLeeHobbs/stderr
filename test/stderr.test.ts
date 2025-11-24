// test/stderr.test.ts
import { stderr, StdError } from '../src';
import { ErrorRecord, ErrorShape, ErrorShapeWithErrorsArray, ErrorShapeWithErrorsObject } from '../src/types';

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
            const err = stderr<ErrorShapeWithErrorsArray>(input);
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
            const err = stderr<ErrorShape & { code: string; errno: number }>(obj);
            expect(err.code).toBe('E_CODE');
            expect(err.errno).toBe(123);
        });

        it('copies standard enumerable properties from Error input', () => {
            const original: Error & { code?: string } = new Error('failed');
            original.code = 'E_CODE';
            const err = stderr<ErrorShape & { code: string }>(original);
            expect(err.code).toBe('E_CODE');
        });

        it('copies non-enumerable properties by default', () => {
            const obj: ErrorRecord = { message: 'm' };
            Object.defineProperty(obj, 'hidden', { value: 42, enumerable: false });
            const err = stderr<ErrorRecord>(obj);
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
            const err = stderr<ErrorRecord>(obj);
            expect(err[sym.toString()]).toBe('bar'); // Symbol keys are stringified
        });

        it('copies symbol-valued properties', () => {
            const symVal = Symbol('value');
            const obj = { message: 'm', data: symVal };
            const err = stderr<ErrorRecord>(obj);
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
    });

    // =========================================================================
    // `cause` Property Handling
    // =========================================================================
    describe('Cause Handling', () => {
        it('normalizes Error cause on object input (native default)', () => {
            const cause = new Error('inner');
            const input = { message: 'outer', cause };
            const normalized = stderr<ErrorShape>(input); // useCauseError: true (default)
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as Error).message).toBe('inner');
        });

        it('normalizes non-Error cause on object input to Error (native default)', () => {
            const input = { message: 'outer', cause: 'inner detail' };
            const normalized = stderr<ErrorShape>(input); // useCauseError: true (default)
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as Error).message).toBe('inner detail');
        });

        it('normalizes Error cause on Error instance input (native default)', () => {
            const cause = new Error('inner');
            const err: Error = new Error('outer');
            err.cause = cause;
            const normalized = stderr<ErrorShape>(err); // useCauseError: true (default)
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as Error).message).toBe('inner');
        });

        it('normalizes non-Error cause on Error instance input to Error (native default)', () => {
            const err: Error = new Error('outer');
            err.cause = 'inner detail';
            const normalized = stderr<ErrorShape>(err); // useCauseError: true (default)
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as Error).message).toBe('inner detail');
        });

        it('normalizes deeply nested cause chains by default', () => {
            const nested = { cause: { cause: 'inner' } }; // obj -> obj -> primitive
            const err = stderr<ErrorShape>(nested);
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
    });

    // =========================================================================
    // `errors` Property & AggregateError Handling
    // =========================================================================
    describe('Errors Property & AggregateError Handling', () => {
        // --- Array of errors ---
        it('normalizes errors array on object input into AggregateError (default)', () => {
            const input = { message: 'agg', errors: ['a', new Error('b'), { c: 1 }] };
            const err = stderr<ErrorShapeWithErrorsArray>(input); // useAggregateError: true (default)
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
            expect((err.errors[2] as { c: number }).c).toBe(1);
        });

        it('normalizes errors array on Error instance input (attaching manually)', () => {
            const input: Error = new Error('Error with errors');
            // @ts-expect-error: assigning errors property to Error instance
            input.errors = ['a', new Error('b')];
            const err = stderr<ErrorShapeWithErrorsArray>(input);
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
            const err = stderr<ErrorShapeWithErrorsArray>(input);
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
            const err = stderr<ErrorShapeWithErrorsObject>(input);
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
            const err = stderr<ErrorShapeWithErrorsObject>(input);
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
            const err = stderr<ErrorShapeWithErrorsArray>(input);
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
            const err = stderr<ErrorShapeWithErrorsArray>(input);
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
            const err = stderr<ErrorShape>(input);
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe('AggregateError');
            expect(err.message).toBe('multi');
            expect(err.errors).toBeUndefined();
        });

        it('handles non-array iterable errors (e.g. Set) by creating an empty object map', () => {
            const input = new Error('with set errors') as ErrorShape;
            input.errors = new Set(['a', new Error('b')]);
            const normalized = stderr<ErrorShape>(input);
            expect(normalized).toBeInstanceOf(Error);
            expect(normalized.name).toBe('Error');
            expect(normalized.message).toBe('with set errors');
            expect(typeof normalized.errors).toBe('object');
            expect(normalized.errors).toEqual({});
        });
    });

    // =========================================================================
    // Recursion & Depth Limiting
    // =========================================================================
    describe('Recursion & Depth Limiting', () => {
        it('stops recursion at maxDepth for cause', () => {
            const nested = { cause: { cause: { message: 'deep' } } }; // Depth 0 -> 1 -> 2
            const err = stderr<ErrorShape>(nested, { maxDepth: 1 });

            expect(err).toBeInstanceOf(Error);
            const c1 = err.cause as ErrorShape;
            expect(c1).toBeInstanceOf(Error);
            expect(c1.message).toBe('[Max depth of 1 reached]');
            // At this boundary, deeper cause should not be traversed
            expect(c1.cause).toBeUndefined();
        });

        it('stops recursion at maxDepth for errors array', () => {
            const nested = { errors: [{ cause: 'deep' }] }; // Depth 0 -> errors[0] (1) -> cause (2)
            const err = stderr<ErrorShapeWithErrorsArray>(nested, { maxDepth: 1 });

            expect(Array.isArray(err.errors)).toBe(true);
            const e1 = err.errors[0] as ErrorShape;
            expect(e1).toBeInstanceOf(Error);
            expect(e1.message).toBe('[Max depth of 1 reached]');
            expect(e1.cause).toBeUndefined();
        });

        it('stops recursion at maxDepth for errors object map', () => {
            const nested = { errors: { field: { cause: 'deep' } } }; // Depth 0 -> errors.field (1) -> cause (2)
            const err = stderr<ErrorShapeWithErrorsObject>(nested, { maxDepth: 2 });

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
            const err = stderr<ErrorShape & NestedData>(nested, { maxDepth: 3 });

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
            let current: ErrorShape | undefined = stderr<ErrorShape>(deep);
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
            const err = stderr<ErrorShape>(e);
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
            const err = stderr<ErrorShape & { self: string }>(obj);
            expect(err.self).toBe('[Circular]');
        });

        it('detects indirect circular cause reference', () => {
            const err1 = { message: 'err1' } as ErrorRecord;
            err1.cause = { message: 'err2', cause: err1 } as ErrorRecord;

            const normalized = stderr<ErrorShape>(err1);

            expect(normalized.message).toBe('err1');
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as ErrorShape).message).toBe('err2');
            expect(((normalized.cause as ErrorShape).cause as ErrorShape).message).toBe('[Circular]');
        });

        it('detects circular reference in errors array', () => {
            const errors: unknown[] = ['a'];
            const input = { name: 'AggregateError', errors: errors };
            errors.push(input); // Add circular reference

            const err = stderr<ErrorShapeWithErrorsArray>(input);

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

            const err = stderr<ErrorShapeWithErrorsObject>(input);

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
            const me = stderr<ErrorShapeWithErrorsObject>(mongooseErr);
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
            const se = stderr<ErrorShapeWithErrorsArray>(seqErr);
            expect(se).toBeInstanceOf(StdError);
            expect(se.name).toBe('SequelizeValidationError');
            expect(se.message).toBe('validation failed');
            expect(Array.isArray(se.errors)).toBe(true);
            expect(se.errors.length).toBe(1);
            const innerErr = se.errors[0] as ErrorShape & { path: string };
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

        // it('handles object with too many properties gracefully', () => {
        //     const largeObj: ErrorRecord = { message: 'large object' };
        //     for (let i = 0; i < 1001; i++) {
        //         largeObj[`prop${i}`] = `value${i}`;
        //     }
        //     const err = stderr(largeObj);
        //     expect(err).toBeInstanceOf(Error);
        //     expect(err.message).toBe('large object');
        //     for (let i = 0; i < 1000; i++) {
        //         expect((err as unknown as ErrorRecord)[`prop${i}`]).toBe(`value${i}`);
        //     }
        //     expect((err as unknown as ErrorRecord)['prop1000']).toBeUndefined();
        // });
        //
        // it('handles object with errors prop with too many properties gracefully', () => {
        //     const largeErrorsObj: ErrorRecord = {};
        //     for (let i = 0; i < 1001; i++) {
        //         largeErrorsObj[`error${i}`] = `value${i}`;
        //     }
        //     const input = { message: 'many errors', errors: largeErrorsObj };
        //     const err = stderr<ErrorShapeWithErrorsObject>(input);
        //     expect(err).toBeInstanceOf(StdError);
        //     expect(err.message).toBe('many errors');
        //     expect(typeof err.errors).toBe('object');
        //     for (let i = 0; i < 1000; i++) {
        //         expect(((err.errors as ErrorRecord)[`error${i}`] as StdError).message).toBe(`value${i}`);
        //     }
        //     expect((err.errors as ErrorRecord)['error1000']).toBeUndefined();
        // });

        // it('handles object with an array with too many errors gracefully', () => {
        //     const errorsArray: unknown[] = [];
        //     for (let i = 0; i < 10001; i++) {
        //         errorsArray.push(`error${i}`);
        //     }
        //     const input = { message: 'many errors', errors: errorsArray };
        //     const err = stderr<ErrorShapeWithErrorsArray>(input);
        //     expect(err).toBeInstanceOf(StdError);
        //     expect(err.message).toBe('many errors');
        //     expect(Array.isArray(err.errors)).toBe(true);
        //     expect(err.errors.length).toBe(10000);
        //     for (let i = 0; i < 10000; i++) {
        //         expect(err.errors[i].message).toBe(`error${i}`);
        //     }
        // });

        // it('handles object with errors array with to many errors gracefully', () => {
        //     const errorsArray: unknown[] = [];
        //     for (let i = 0; i < 10001; i++) {
        //         errorsArray.push(`error${i}`);
        //     }
        //     const input = { message: 'many errors', errors: errorsArray };
        //     const err = stderr<ErrorShapeWithErrorsArray>(input);
        //     expect(err).toBeInstanceOf(StdError);
        //     expect(err.message).toBe('many errors');
        //     expect(Array.isArray(err.errors)).toBe(true);
        //     expect(err.errors.length).toBe(10000);
        // });
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
});
