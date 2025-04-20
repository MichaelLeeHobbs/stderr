import {normalizeError, NormalizeOptions} from '../src/normalizeError';
import {Dictionary, DynamicError, DynamicErrorWithErrorsArray, DynamicErrorWithErrorsObject, ErrorRecord} from '../src/types';

describe('standardizeError', () => {
    // Basic fallback behavior
    describe('Basic conversions', () => {
        it('converts a string into an Error', () => {
            const err = normalizeError('oops');
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('oops');
            expect(err.name).toBe('Error');
        });

        it('converts a string into an Error with custom stack', () => {
            const err = normalizeError('oops', {originalStack: 'CUSTOM_STACK'});
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('oops');
            expect(err.name).toBe('Error');
            expect(err.stack).toBe('CUSTOM_STACK');
        });

        it('converts number, boolean, null, undefined to Error with correct message and original stack', () => {
            const opts: NormalizeOptions = {originalStack: 'CUSTOM_STACK'};
            const cases: [unknown, string][] = [
                [42, '42'],
                [true, 'true'],
                [null, 'null'],
                [undefined, 'undefined'],
            ];
            for (const [input, msg] of cases) {
                const err = normalizeError(input, opts);
                expect(err.message).toBe(msg);
                expect(err.stack).toBe('CUSTOM_STACK');
            }
        });

        it('falls back for unrecognized types (e.g. functions)', () => {
            function testFn() {
                return 123;
            }

            const err = normalizeError(testFn);
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe(testFn.toString());
        });

        it('should handle unexpected types gracefully', () => {
            const cases: [unknown, string][] = [
                [[], '[]'],
                [{}, '{}'],
                [new Date(0), '"1970-01-01T00:00:00.000Z"'],
                [new Map(), '{}'],
                [new Set(), '{}'],
                [new WeakMap(), '{}'],
                [new WeakSet(), '{}'],
                [new Promise(() => null), '{}'],
                [new Int8Array(), '{}'],
                [new Uint8Array(), '{}'],
                [new Float32Array(), '{}'],
                [new Float64Array(), '{}'],
                [new ArrayBuffer(8), '{}'],
                // @ts-expect-error: Blob and File are not standard types
                [new Blob(), '{}'],
                [new File([], 'file.txt'), '{}'],
                [Symbol('foo'), 'Symbol(foo)'],
            ];
            for (const [input, expected] of cases) {
                const err = normalizeError(input);
                expect(err).toBeInstanceOf(Error);
                expect(err.message).toBe(expected);
            }
        });
    });

    // AggregateError behavior
    describe('AggregateError handling', () => {
        it('preserves AggregateError with normalized errors', () => {
            const input = {name: 'AggregateError', message: 'multi', errors: ['a', new Error('b')]};
            // A DynamicErrorWithErrorsArray is effectively an AggregateError
            const err = normalizeError<DynamicErrorWithErrorsArray>(input);
            // @ts-expect-error: AggregateError may not be available in this environment
            expect(err).toBeInstanceOf(AggregateError);
            expect(err.errors[0]).toBeInstanceOf(Error);
            expect((err.errors[0] as DynamicError).message).toBe('a');
        });

        it('handles AggregateError with missing errors', () => {
            const input = {name: 'AggregateError', message: 'multi', errors: null};
            // A DynamicErrorWithErrorsArray is effectively an AggregateError
            const err = normalizeError<DynamicErrorWithErrorsArray>(input);
            // @ts-expect-error: AggregateError may not be available in this environment
            expect(err).toBeInstanceOf(AggregateError);
            expect(err.errors).toHaveLength(0);
        });

        it('falls back to plain Error when useAggregateError is disabled', () => {
            const input = {name: 'AggregateError', message: 'multi', errors: ['a', new Error('b')]};
            const err = normalizeError<DynamicErrorWithErrorsArray>(input, {useAggregateError: false});
            expect(err).toBeInstanceOf(Error);
            expect(err.errors[0]).toBeInstanceOf(Error);
            expect((err.errors[0] as Error).message).toBe('a');
        });
    });

    // Property and metadata copying
    describe('Property copying and normalization', () => {
        it('copies non-enumerable and symbol keys when requested', () => {
            const sym = Symbol('foo');
            const obj: ErrorRecord = {message: 'm'};
            Object.defineProperty(obj, 'hidden', {value: 42, enumerable: false});
            obj[sym] = 'bar';
            const err = normalizeError<ErrorRecord>(obj, {includeNonEnumerable: true, includeSymbols: true});
            expect(err.hidden).toBe(42);
            expect(err[sym]).toBe('bar');
        });

        it('ignores non-enumerable properties by default', () => {
            const obj: ErrorRecord = {message: 'm'};
            Object.defineProperty(obj, 'hidden', {value: 42, enumerable: false});
            const err = normalizeError(obj);
            expect(err.hidden).toBeUndefined();
        });

        it('ignores symbol keys by default', () => {
            const sym = Symbol('foo');
            const obj: ErrorRecord = {message: 'm'};
            obj[sym] = 'bar';
            const err = normalizeError(obj);
            expect(err[sym]).toBeUndefined();
        });

        it('normalizes enumerable Error properties not part of standard Error', () => {
            const obj: ErrorRecord = {message: 'm', random: new Error('inner')};
            const err = normalizeError(obj);
            expect(err.random).toBeInstanceOf(Error);
            expect((err.random as Error).message).toBe('inner');
        });
    });

    // Recursion and depth limiting
    describe('Recursion and maxDepth', () => {
        it('stops recursion at maxDepth', () => {
            const nested = {cause: {cause: {message: 'deep'}}};
            const err = normalizeError<DynamicError>(nested, {maxDepth: 1, patchToString: true});
            const firstCause = err.cause as Error;
            expect(firstCause).toBeInstanceOf(Error);
            expect((firstCause as DynamicError).cause).toBeUndefined();
            // TODO: I think we can do a better output here
            expect(err.toString()).toContain('Error: {"cause":{"cause":{"message":"deep"}}}');
        });

        it('normalizes deeply nested cause chains by default', () => {
            const nested = {cause: {cause: 'inner'}};
            const err = normalizeError<DynamicError>(nested);
            const c1 = err.cause as Error;
            const c2 = (c1 as DynamicError).cause as Error;
            expect(c2.message).toBe('inner');
        });
    });

    // Subclassing support
    describe('Subclassing', () => {
        it('honors subclassing when enabled', () => {
            class MyError extends Error {
            }

            (globalThis as Dictionary).MyError = MyError;
            const input = {name: 'MyError', message: 'hey'};
            const err = normalizeError(input, {enableSubclassing: true});
            expect(err).toBeInstanceOf(MyError);
        });
        it('should handle when subclassing throws', () => {
            class MyError extends Error {
                constructor() {
                    super('my error');
                    throw new Error('oops');
                }
            }

            (globalThis as Dictionary).MyError = MyError;
            const input = {name: 'MyError', message: 'hey'};
            const err = normalizeError(input, {enableSubclassing: true});
            expect(err).toBeInstanceOf(Error);
            expect(err.name).toBe('MyError');
        });
    });

    // Simulated library errors
    describe('Simulated fetch, mongoose, and sequelize errors', () => {
        it('preserves custom Error properties on FetchError', () => {
            const fetchErr: Error = new Error('failed fetch');
            fetchErr.name = 'FetchError';
            // @ts-expect-error: code is not a standard Error property
            fetchErr.code = 'ECONNREFUSED';
            const fe = normalizeError(fetchErr, {patchToString: true});
            expect(fe.name).toBe('FetchError');
            expect(fe.code).toBe('ECONNREFUSED');
        });

        it('normalizes Mongoose ValidationError', () => {
            const mongooseErr: unknown = {name: 'ValidationError', errors: {field: {message: 'invalid'}}};
            const me = normalizeError(mongooseErr, {patchToString: true});
            expect(me.name).toBe('ValidationError');
            // @ts-expect-error: errors field added dynamically
            expect(me.errors.field).toBeInstanceOf(Error);
            // @ts-expect-error: errors field added dynamically
            expect(me.errors.field.message).toBe('invalid');
        });

        it('normalizes Sequelize ValidationError', () => {
            const seqErr: unknown = {name: 'SequelizeValidationError', message: 'validation failed', errors: [{message: 'nope'}]};
            const se = normalizeError(seqErr);
            expect(se.name).toBe('SequelizeValidationError');
            expect(Array.isArray(se.errors)).toBe(true);
            // @ts-expect-error: errors field added dynamically
            expect(se.errors[0].message).toBe('nope');
        });
    });

    // Override toString behaviors
    describe('overrideToString branches', () => {
        it('toString() prints full stack trace and includes cause', () => {
            const original: Error = new Error('outer message');
            // @ts-expect-error: cause is added dynamically
            original.cause = 'inner detail';
            const err = normalizeError(original, {patchToString: true});
            const str = err.toString();
            expect(str).toMatch(/^Error: outer message/);
            expect(str.split('\n').length).toBeGreaterThan(1);
            expect(str).toContain('cause: Error: inner detail');
        });

        it('toString() with cause but no stack prints name, message, and cause', () => {
            const original: Error = new Error('outer message');
            original.stack = undefined;
            // @ts-expect-error: cause is added dynamically
            original.cause = 'inner detail';
            const err = normalizeError(original, {patchToString: true});
            const lines = err.toString().split('\n');
            expect(lines[0]).toBe('[Error: outer message] {');
            expect(lines[1]).toBe('  cause: Error: inner detail');
        });

        it('toString() with no cause and no stack falls back to "name: message"', () => {
            const err = normalizeError('just a msg', {patchToString: true, useCauseError: false});
            err.stack = undefined;
            expect(err.toString()).toBe('[Error: just a msg]');
        });
    });

    // Object-like vs Error-like groups
    describe('Error-like Error', () => {
        it('normalizes errors object map on Error instance', () => {
            const input: Error = new Error('Error with errors object');
            // @ts-expect-error: assigning errors property to Error instance
            input.errors = {a: 'x', b: new Error('y')};
            const err = normalizeError<DynamicErrorWithErrorsObject>(input);
            expect(err.errors.a).toBeInstanceOf(Error);
            expect((err.errors.b as DynamicError).message).toBe('y');
        });

        it('normalizes errors array on Error instance', () => {
            const input: Error = new Error('Error with errors');
            // @ts-expect-error: assigning errors property to Error instance
            input.errors = ['a', new Error('b')];
            const err = normalizeError<DynamicErrorWithErrorsArray>(input);
            expect(err.errors[0]).toBeInstanceOf(Error);
            expect(err.errors[1].message).toBe('b');
        });

        it('normalizes Error cause on Error instance', () => {
            const cause = new Error('inner');
            const err: Error = new Error('outer');
            // @ts-expect-error: assigning cause to Error instance
            err.cause = cause;
            const normalized = normalizeError<DynamicError>(err);
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as DynamicError).message).toBe('inner');
        });

        it('normalizes undefined message on existing Error to empty string', () => {
            const original: Error = new Error('initial');
            // @ts-expect-error: force non-string message
            original.message = undefined;
            const result = normalizeError(original);
            expect(result).toBe(original);
            expect(result.message).toBe('');
        });

        it('normalizes null message on existing Error to empty string', () => {
            const original: Error = new Error('initial');
            // @ts-expect-error: force non-string message
            original.message = null;
            const result = normalizeError(original);
            expect(result).toBe(original);
            expect(result.message).toBe('');
        });

        it('normalizes empty name on existing Error to "Error"', () => {
            const original = new Error('initial');
            original.name = '';
            const result = normalizeError(original);
            expect(result).toBe(original);
            expect(result.name).toBe('Error');
        });

        it('normalizes Error with custom stack', () => {
            const original: Error = new Error('initial');
            const result = normalizeError(original, {originalStack: 'CUSTOM_STACK'});
            expect(result).toBe(original);
            expect(result.stack).toBe('CUSTOM_STACK');
        });

        it('normalizes non-array iterable errors (e.g. Set) into an object map', () => {
            const input = new Error('with set errors') as DynamicError;
            input.errors = new Set(['a', new Error('b')]);
            const normalized = normalizeError<DynamicError>(input);
            // Since Set has no own enumerable string-keyed entries, we end up with {}
            expect(typeof normalized.errors).toBe('object');
            expect(normalized.errors).toEqual({});
        });

        it('leaves non-object, non-iterable errors untouched', () => {
            const input = new Error('with primitive errors') as DynamicError;
            input.errors = 42;
            const normalized = normalizeError<DynamicError>(input);
            // Non-array, non-object should pass through unchanged
            expect(normalized.errors).toBe(42);
        });
    });

    describe('Object-like Error', () => {
        it('normalizes errors array on object input', () => {
            const input = {message: 'agg', errors: ['a', new Error('b')]};
            const err = normalizeError<DynamicErrorWithErrorsArray>(input);
            expect(err.errors[0]).toBeInstanceOf(Error);
            expect(err.errors[1]).toBeInstanceOf(Error);
            expect(err.errors[1].message).toBe('b');
        });

        it('normalizes errors object map on object input', () => {
            const input = {message: 'agg', errors: {a: 'x', b: new Error('y')}};
            const err = normalizeError<DynamicErrorWithErrorsObject>(input);
            expect(err.errors.a).toBeInstanceOf(Error);
            expect((err.errors.a as DynamicError).message).toBe('x');
            expect(err.errors.b).toBeInstanceOf(Error);
            expect((err.errors.b as DynamicError).message).toBe('y');
        });

        it('normalizes Error cause on object input with useCauseError disabled', () => {
            const cause = new Error('inner');
            const input: unknown = {message: 'outer'};
            // @ts-expect-error: assigning cause property to object
            input.cause = cause;
            const normalized = normalizeError<DynamicError>(input, {useCauseError: false});
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as Error).message).toBe('inner');
        });

        it('normalizes non-Error cause on object input with useCauseError disabled', () => {
            const input: unknown = {message: 'outer'};
            // @ts-expect-error: assigning cause property to object
            input.cause = 'inner';
            const normalized = normalizeError<DynamicError>(input, {useCauseError: false});
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as Error).message).toBe('inner');
        });

        it('normalizes Error cause on object input', () => {
            const cause = new Error('inner');
            const input = {message: 'outer', cause};
            const normalized = normalizeError<DynamicError>(input);
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as Error).message).toBe('inner');
        });

        it('converts an Object into an Error with custom stack', () => {
            const obj = {message: 'oops'};
            const err = normalizeError(obj, {originalStack: 'CUSTOM_STACK'});
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('oops');
            expect(err.name).toBe('Error');
            expect(err.stack).toBe('CUSTOM_STACK');
        });
    });

    describe('Unusual shaped Errors', () => {
        it('normalizes ["a", "b"] into an Error with message  ["a","b"]', () => {
            const input = ['a', 'b'];
            const err = normalizeError(input);
            expect(err).toBeInstanceOf(Error);
            // Future improvement: we should probably do something more useful here but we can't handle every possible case
            expect(err.message).toBe('["a","b"]');
        });
    });

    // Circular detection
    describe('Circular detection', () => {
        it('detects circular cause in Error', () => {
            const e: Error = new Error('outer');
            // @ts-expect-error: cause is added dynamically
            e.cause = e;
            const err = normalizeError<DynamicError>(e);
            expect((err.cause as DynamicError).message).toBe('<Circular>');
        });

        it('detects circular cause in object', () => {
            const obj: unknown = {message: 'outer'};
            // @ts-expect-error: cause is added dynamically
            obj.cause = obj;
            const err = normalizeError(obj);
            expect((err.cause as DynamicError).message).toBe('<Circular>');
        });

        it('detects circular metadata', () => {
            const obj: unknown = {foo: 'bar'};
            // @ts-expect-error: self is added dynamically
            obj.self = obj;
            const err = normalizeError<DynamicError>(obj);
            expect(err.self).toBe('<Circular>');
        });
    });
});
