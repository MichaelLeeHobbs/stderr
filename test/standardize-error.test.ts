import {standardizeError} from '../src';

type Dict = Record<string, unknown>;

describe('standardizeError', () => {
    describe('metadata‑assignment catch block', () => {
        let RealError: typeof Error;

        beforeAll(() => {
            // Swap out the global Error constructor so every new Error() is frozen
            RealError = global.Error;
            // @ts-expect-error global is not a standard property
            (global as unknown).Error = function (this: unknown, message?: string) {
                const e = new RealError(message);
                return Object.freeze(e);
            } as unknown;
            // @ts-expect-error global is not a standard property
            global.Error.prototype = RealError.prototype;
        });

        afterAll(() => {
            // Restore the real Error
            global.Error = RealError;
        });

        it('should swallow assignment failures in the catch block', () => {
            // Input object with a metadata key
            const input = {someKey: 'someValue'};
            // Now, because our Error instances are frozen,
            // assigning error['someKey'] = 'someValue' will throw
            const err = standardizeError(input);
            // The catch block ran, so no exception escapes, and we get an Error back
            expect(err).toBeInstanceOf(Error);
            // And since assignment failed, err.someKey is still undefined
            // @ts-expect-error someKey is not a standard property
            expect(err.someKey).toBeUndefined();
        });
    });

    it('converts a string into an Error', () => {
        const err = standardizeError('oops');
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('oops');
        expect(err.name).toBe('Error');
    });

    it('converts number, boolean, null, undefined to Error with correct message', () => {
        const cases: [unknown, string][] = [
            [42, '42'],
            [true, 'true'],
            [null, 'null'],
            [undefined, 'undefined'],
        ];
        for (const [input, msg] of cases) {
            const err = standardizeError(input);
            expect(err.message).toBe(msg);
        }
    });

    it('returns the same Error instance and normalizes it', () => {
        const original = new Error();
        // @ts-expect-error assign non-string message
        original.message = 123;
        original.name = '';
        const result = standardizeError(original);
        expect(result).toBe(original);
        expect(result.message).toBe('123');
        expect(result.name).toBe('Error');
    });

    it('converts object with name, message, and extra properties', () => {
        const obj = {name: 'MyError', message: 'fail', code: 500};
        const err = standardizeError(obj);
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe('MyError');
        expect(err.message).toBe('fail');
        // @ts-expect-error code is not a standard property
        expect(err.code).toBe(500);
    });

    it('converts object without message to JSON string', () => {
        const obj: Dict = {foo: 'bar'};
        const err = standardizeError(obj);
        expect(err.message).toBe(JSON.stringify(obj));
    });

    it('handles circular object without throwing', () => {
        const obj: Dict = {a: 1};
        obj.self = obj;
        const err = standardizeError(obj);
        expect(err).toBeInstanceOf(Error);
        expect(typeof err.message).toBe('string');
    });

    it('normalizes cause when cause is not an Error', () => {
        const original: Error = new Error('outer');
        // @ts-expect-error assign non-Error cause
        original.cause = 'inner';
        const err = standardizeError(original);
        // @ts-expect-error cause is not a standard property
        expect(err.cause).toBeInstanceOf(Error);
        // @ts-expect-error cause is not a standard property
        expect((err.cause as Error).message).toBe('inner');
        // console.log('err', err);
        // console.log('err.toString()', err.toString());
    });

    it('leaves cause when it is already an Error', () => {
        const original: Error = new Error('outer');
        const inner = new Error('inner');
        // @ts-expect-error cause is not a standard property
        original.cause = inner;
        const err = standardizeError(original);
        // @ts-expect-error cause is not a standard property
        expect(err.cause).toBe(inner);
    });

    it('normalizes errors array elements', () => {
        const inputs = ['one', new Error('two')];
        const obj: Dict = {errors: inputs, message: 'agg'};
        const err = standardizeError(obj);
        // @ts-expect-error errors is not a standard property
        expect(Array.isArray(err.errors)).toBe(true);
        // @ts-expect-error errors is not a standard property
        expect(err.errors[0]).toBeInstanceOf(Error);
        // @ts-expect-error errors is not a standard property
        expect(err.errors[0].message).toBe('one');
        // @ts-expect-error errors is not a standard property
        expect(err.errors[1]).toBe(inputs[1]);
    });

    it('normalizes errors object values', () => {
        const inputs = {a: 'foo', b: new Error('bar')};
        const obj: Dict = {errors: inputs, message: 'agg'};
        const err = standardizeError(obj);
        // @ts-expect-error errors is not a standard property
        expect(err.errors.a).toBeInstanceOf(Error);
        // @ts-expect-error errors is not a standard property
        expect(err.errors.a.message).toBe('foo');
        // @ts-expect-error errors is not a standard property
        expect(err.errors.b).toBe(inputs.b);
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
        const me = standardizeError(mongooseErr);
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

    describe('overrideToString branches', () => {
        it('toString() prints full stack trace and includes cause', () => {
            // Create an Error with a non-Error cause
            const original = new Error('outer message');
            // @ts-expect-error: assign a non‑Error cause
            original.cause = 'inner detail';

            // Normalize—and apply our overrideToString
            const err = standardizeError(original);

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

            const err = standardizeError(original);
            const out = err.toString();

            // should only be many lines but we will only test the first two: "Error: outer message" and "  cause: Error: inner detail"
            const lines = out.split('\n');
            expect(lines[0]).toBe('Error: outer message');
            expect(lines[1]).toBe('  cause: Error: inner detail');
        });

        it('when there is no cause and no stack, toString falls back to "name: message"', () => {
            const err = standardizeError('just a msg');
            // strip away the stack so the fallback branch runs
            err.stack = undefined as unknown as string;

            const out = err.toString();
            expect(out).toBe('Error: just a msg');
        });
    });
});
