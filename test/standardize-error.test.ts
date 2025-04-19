import {standardizeError} from '../src';

type Dict = Record<string, unknown>;

describe('standardizeError', () => {
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
        const obj: { [key: string]: unknown } = {foo: 'bar'};
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
});
