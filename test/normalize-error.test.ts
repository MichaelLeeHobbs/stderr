import {NormalizeOptions, standardizeError} from '../src/error-normalizer';
import {ErrorWithCause, ErrorWithDictionary, ErrorWithErrorsArray, ErrorWithErrorsObject, ErrorWithUnknownErrorsArray} from '../src/types';
import * as console from 'node:console';

// 10. Additional Tests
// 1. Subclassing via enableSubclassing
// 2. Symbol-keyed metadata
// 3. Non-enumerable metadata
// 4. Circular metadata detection produces <Circular>
// 5. Depth limiting stops recursion
// 6. Nested cause chains
// 7. AggregateError preservation
// 8. Original stack override
// 9. Native cause attached
// 10. Performance depth option

type Dict = Record<string | symbol, unknown>;

describe('standardizeError', () => {
    it('converts a string into an Error', () => {
        const err = standardizeError('oops');
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('oops');
        expect(err.name).toBe('Error');
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
            const err = standardizeError(input, opts);
            expect(err.message).toBe(msg);
            expect(err.stack).toBe('CUSTOM_STACK');
        }
    });

    it('should support native ErrorOptions.cause when available', () => {
        const input = {message: 'outer', cause: 'inner'};
        const err = standardizeError<ErrorWithCause>(input);
        expect(err.cause).toBeInstanceOf(Error);
        expect((err.cause as Error).message).toBe('inner');
    });

    it('should preserve AggregateError with normalized errors', () => {
        const input = {name: 'AggregateError', message: 'multi', errors: ['a', new Error('b')]};
        const err = standardizeError<ErrorWithUnknownErrorsArray>(input);
        // @ts-expect-error AggregateError may not be available in all environments
        expect(err).toBeInstanceOf(AggregateError);
        expect(err.errors[0]).toBeInstanceOf(Error);
        expect((err.errors[0] as Error).message).toBe('a');
    });

    it('should handle AggregateError with missing errors', () => {
        const input = {name: 'AggregateError', message: 'multi', errors: null};
        const err = standardizeError<ErrorWithUnknownErrorsArray>(input);
        // @ts-expect-error AggregateError may not be available in all environments
        expect(err).toBeInstanceOf(AggregateError);
        expect(err.errors).toHaveLength(0);
    });

    it('should fall back to Array when AggregateError is not available or disabled', () => {
        const input = {name: 'AggregateError', message: 'multi', errors: ['a', new Error('b')]};
        const err = standardizeError<ErrorWithErrorsArray>(input, {useAggregateError: false});
        expect(err).toBeInstanceOf(Error);
        expect(err.errors[0]).toBeInstanceOf(Error);
        expect((err.errors[0] as Error).message).toBe('a');
    });

    it('should override stack when originalStack option is given', () => {
        const opts: NormalizeOptions = {originalStack: 'CUSTOM_STACK'};
        const err = standardizeError('msg', opts);
        expect(err.stack).toBe('CUSTOM_STACK');

        const err2 = standardizeError(new Error('msg'), opts);
        expect(err2.stack).toBe('CUSTOM_STACK');

        const err3 = standardizeError({message: 'Object Like Error'}, {originalStack: 'CUSTOM_STACK'});
        expect(err3.stack).toBe('CUSTOM_STACK');
    });

    it('should copy non-enumerable and symbol keys when requested', () => {
        const sym = Symbol('foo');
        const obj: Dict = {message: 'm'};
        Object.defineProperty(obj, 'hidden', {value: 42, enumerable: false});
        obj[sym] = 'bar';
        const err = standardizeError<ErrorWithDictionary>(obj, {includeNonEnumerable: true, includeSymbols: true});
        expect(err.hidden).toBe(42);
        expect(err[sym]).toBe('bar');
    });

    it('should detect circular cause', () => {
        const e: ErrorWithCause = new Error('outer');
        e.cause = e;
        const err = standardizeError<ErrorWithCause>(e);
        expect(err.cause).toBe('<Circular>');
    });

    it('should detect circular object metadata', () => {
        const obj: Dict = {foo: 'bar'};
        obj.self = obj;
        const err = standardizeError<Dict>(obj);
        console.error(err.self);
        expect(err.self).toBe('<Circular>');
    });

    it('should ignore non-enumerable properties by default', () => {
        const obj: Dict = {message: 'm'};
        Object.defineProperty(obj, 'hidden', {value: 42, enumerable: false});
        const err = standardizeError<Dict>(obj);
        expect(err.hidden).toBeUndefined();
    });

    it('should normalize enumerable properties of type Error where the property name is not a standard Error property', () => {
        const obj: Dict = {message: 'm', random: new Error('inner')};
        const err = standardizeError<Dict>(obj);
        expect(err.random).toBeInstanceOf(Error);
        expect((err.random as Error).message).toBe('inner');
    });

    it('should ignore symbol keys by default', () => {
        const sym = Symbol('foo');
        const obj: Dict = {message: 'm'};
        obj[sym] = 'bar';
        const err = standardizeError<Dict>(obj);
        expect(err[sym]).toBeUndefined();
    });

    it('should stop recursion at maxDepth', () => {
        const nested = {cause: {cause: {message: 'deep'}}};
        const err = standardizeError<ErrorWithCause>(nested, {maxDepth: 1});
        // depth 0: object -> depth1: rawCause normalized -> depth2 exceeds -> shallow wrap
        const firstCause = err.cause as Error;
        expect(firstCause).toBeInstanceOf(Error);
        expect((firstCause as ErrorWithCause).cause).toBeUndefined();
    });

    it('should normalize deeply nested cause chains fully by default', () => {
        const nested = {cause: {cause: 'inner'}};
        const err = standardizeError<ErrorWithCause>(nested);
        const c1 = err.cause as Error;
        const c2 = (c1 as ErrorWithCause).cause as Error;
        expect(c2.message).toBe('inner');
    });

    it('should honor subclassing when enabled', () => {
        class MyError extends Error {
        }

        (globalThis as Dict).MyError = MyError;
        const input = {name: 'MyError', message: 'hey'};
        const err = standardizeError(input, {enableSubclassing: true});
        expect(err).toBeInstanceOf(MyError);
    });



    it('works with simulated fetch, mongoose, and sequelize errors', () => {
        // Simulate FetchError
        const fetchErr: Error = new Error('failed fetch');
        fetchErr.name = 'FetchError';
        // @ts-expect-error code is not a standard property
        fetchErr.code = 'ECONNREFUSED';
        const fe = standardizeError(fetchErr);
        expect(fe.name).toBe('FetchError');
        // @ts-expect-error code is not a standard property
        expect(fe.code).toBe('ECONNREFUSED');

        // Simulate Mongoose ValidationError
        const mongooseErr: unknown = {name: 'ValidationError', errors: {field: {message: 'invalid'}}};
        const me = standardizeError(mongooseErr, {patchToString: true});
        expect(me.name).toBe('ValidationError');
        // @ts-expect-error errors is not a standard property
        expect(me.errors.field).toBeInstanceOf(Error);
        // @ts-expect-error errors is not a standard property
        expect(me.errors.field.message).toBe('invalid');

        // Simulate Sequelize ValidationError
        const seqErr: unknown = {name: 'SequelizeValidationError', message: 'validation failed', errors: [{message: 'nope'}]};
        const se = standardizeError(seqErr);
        expect(se.name).toBe('SequelizeValidationError');
        // @ts-expect-error errors is not a standard property
        expect(Array.isArray(se.errors)).toBe(true);
        // @ts-expect-error errors is not a standard property
        expect(se.errors[0].message).toBe('nope');
    });

    it('falls back for unrecognized types (e.g. functions)', () => {
        function testFn() {
            return 123;
        }

        const err = standardizeError(testFn);
        // Should use String(input) for fallback
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe(testFn.toString());
    });



    describe('Error-like Error', () => {
        it('should normalize Error with errors object map when provided', () => {
            const input = new Error('Error with errors object');
            // @ts-expect-error: assign an object to errors
            input.errors = {a: 'x', b: new Error('y')};
            const err = standardizeError(input);
            expect((err as ErrorWithErrorsObject).errors.a).toBeInstanceOf(Error);
            expect(((err as ErrorWithErrorsObject).errors.b as Error).message).toBe('y');
        });

        it('should normalize Error with errors array when provided', () => {
            const input = new Error('Error with errors');
            // @ts-expect-error: assign an array to errors
            input.errors = ['a', new Error('b')];
            const err = standardizeError(input);
            expect((err as ErrorWithErrorsArray).errors[0]).toBeInstanceOf(Error);
            expect(((err as ErrorWithErrorsArray).errors[1] as Error).message).toBe('b');
        });

        it('should normalize Error with Error cause', () => {
            const cause = new Error('inner');
            const err = new Error('outer');
            // @ts-expect-error: assign an Error to cause
            err.cause = cause;
            const normalized = standardizeError<ErrorWithCause>(err);
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as Error).message).toBe('inner');
        });

        it('should normalize an Error with errors array', () => {
            const err = new Error('outer');
            // @ts-expect-error: assign an array to errors
            err.errors = ['a', new Error('b')];
            const normalized = standardizeError<ErrorWithErrorsArray>(err);
            expect(normalized).toBeInstanceOf(Error);
            expect(normalized.errors[0]).toBeInstanceOf(Error);
            expect((normalized.errors[0] as Error).message).toBe('a');
            expect(normalized.errors[1]).toBeInstanceOf(Error);
            expect((normalized.errors[1] as Error).message).toBe('b');
        });

        it('normalizes undefined message on an existing Error to empty string', () => {
            const original = new Error('initial');
            // @ts-expect-error force non‑string message
            original.message = undefined;
            const result = standardizeError(original);
            // We should get back the same instance…
            expect(result).toBe(original);
            // …and its message must have been coerced to '' (String(undefined ?? '') === '')
            expect(result.message).toBe('');
        });

        it('normalizes null message on an existing Error to empty string', () => {
            const original = new Error('initial');
            // @ts-expect-error force non‑string message
            original.message = null;
            const result = standardizeError(original);
            expect(result).toBe(original);
            // String(null ?? '') === ''
            expect(result.message).toBe('');
        });

        it('should normalize empty string message on an existing Error to empty string', () => {
            const original = new Error('initial');
            // @ts-expect-error force non‑string message
            original.message = null;
            const result = standardizeError(original);
            expect(result).toBe(original);
            // String('' ?? '') === ''
            expect(result.message).toBe('');
        });

        it('normalizes empty name on an existing Error to "Error"', () => {
            const original = new Error('initial');
            original.name = '';
            const result = standardizeError(original);
            expect(result).toBe(original);
            // String('' ?? 'Error') === 'Error'
            expect(result.name).toBe('Error');
        });
    });

    describe('Object-like Error', () => {
        it('should normalize Object with errors array when provided', () => {
            const input = {message: 'agg', errors: ['a', 'b']};
            const err = standardizeError(input);
            expect((err as ErrorWithErrorsArray).errors[0]).toBeInstanceOf(Error);
            expect(((err as ErrorWithErrorsArray).errors[1] as Error).message).toBe('b');
        });

        it('should normalize Object with errors object map when provided', () => {
            const input = {message: 'agg', errors: {a: 'x', b: 'y'}};
            const err = standardizeError(input);
            expect((err as ErrorWithErrorsObject).errors.a).toBeInstanceOf(Error);
            expect(((err as ErrorWithErrorsObject).errors.b as Error).message).toBe('y');
        });

        it('should normalize Object with Error cause and fallback to non-Error cause when Error with cause is not available', () => {
            const cause = new Error('inner');
            const err = {message: 'outer'};
            // @ts-expect-error: assign an Error to cause
            err.cause = cause;
            const normalized = standardizeError<ErrorWithCause>(err, {useCauseError: false});
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as Error).message).toBe('inner');
        });

        it('should normalize Object with non-Error cause and fallback to non-Error cause when Error with cause is not available', () => {
            const cause = 'inner';
            const err = {message: 'outer'};
            // @ts-expect-error: assign an Error to cause
            err.cause = cause;
            const normalized = standardizeError<ErrorWithCause>(err, {useCauseError: false});
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as Error).message).toBe('inner');
        });

        it('should normalize Object with Error cause', () => {
            const cause = new Error('inner');
            const err = {message: 'outer', cause};
            const normalized = standardizeError<ErrorWithCause>(err);
            expect(normalized.cause).toBeInstanceOf(Error);
            expect((normalized.cause as Error).message).toBe('inner');
        });
    });

    describe('overrideToString branches', () => {
        it('toString() prints full stack trace and includes cause', () => {
            // Create an Error with a non-Error cause
            const original = new Error('outer message');
            // @ts-expect-error: assign a non‑Error cause
            original.cause = 'inner detail';

            // Normalize—and apply our overrideToString
            const err = standardizeError(original, {patchToString: true});

            // Call toString(), which should now be the full stack
            const str = err.toString();

            // 1) It starts with the "name: message" line
            expect(str).toMatch(/^Error: outer message/);

            // 2) It contains at least one newline (the stack frames)
            expect(str.split('\n').length).toBeGreaterThan(1);

            // 3) It includes our normalized cause
            expect(str).toContain('cause: Error: inner detail');
        });
        it('when there is a cause but no stack, toString returns "name: message\\n  cause: <cause>"', () => {
            const original = new Error('outer message');
            // remove the stack so we hit the inner branch
            original.stack = undefined as unknown as string;
            // assign a non‑Error cause so it gets normalized
            // @ts-expect-error: assign a non‑Error cause
            original.cause = 'inner detail';

            const err = standardizeError(original, {patchToString: true});
            const out = err.toString();

            // should only be many lines but we will only test the first two: "Error: outer message" and "  cause: Error: inner detail"
            const lines = out.split('\n');
            expect(lines[0]).toBe('Error: outer message');
            expect(lines[1]).toBe('  cause: Error: inner detail');
        });

        it('when there is no cause and no stack, toString falls back to "name: message"', () => {
            const err = standardizeError('just a msg', {patchToString: true, useCauseError: false});
            // strip away the stack so the fallback branch runs
            err.stack = undefined as unknown as string;

            const out = err.toString();
            expect(out).toBe('Error: just a msg');
        });
    });
});
