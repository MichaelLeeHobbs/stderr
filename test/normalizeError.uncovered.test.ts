// test/normalizeError.uncovered.test.ts
import { normalizeError } from '../src';
import type {
    Dictionary,
    ErrorRecord,
    ErrorShape,
    ErrorShapeWithErrorsArray,
    ErrorShapeWithErrorsObject,
} from '../src/types';

describe('normalizeError (extra coverage for uncovered branches)', () => {
    it('normalizes a symbol cause via normalizeUnknown (stringified, attached as Error)', () => {
        const s = Symbol('foo');
        const input = { message: 'outer', cause: s };
        const err = normalizeError<ErrorShape>(input);

        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('outer');
        expect(err.cause).toBeInstanceOf(Error);
        expect((err.cause as Error).message).toBe('Symbol(foo)');

        const desc = Object.getOwnPropertyDescriptor(err, 'cause');
        if (desc) {
            expect(typeof desc.enumerable).toBe('boolean');
        }
    });

    it('normalizes nested plain object with symbol value (metadata path)', () => {
        const input = { message: 'm', data: { sym: Symbol('v') } };
        const err = normalizeError<ErrorShape & { data: { sym: string } }>(input);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('m');
        expect(err.data).toBeDefined();
        expect(err.data.sym).toBe('Symbol(v)');
    });

    it('normalizes array input with symbol element (errors array path -> normalizeUnknown symbol branch)', () => {
        const input = ['a', Symbol('z')] as const;
        const err = normalizeError<ErrorShapeWithErrorsArray>(input as unknown as ErrorRecord);
        const expectedCtor = typeof AggregateError !== 'undefined' ? AggregateError : Error;

        expect(err).toBeInstanceOf(expectedCtor);
        expect(Array.isArray(err.errors)).toBe(true);
        expect(err.errors.length).toBe(2);
        expect(err.errors[0]).toBeInstanceOf(Error);
        expect(err.errors[0].message).toBe('a');
        expect(err.errors[1]).toBeInstanceOf(Error);
        expect(err.errors[1].message).toBe('Symbol(z)');
    });

    it('hits normalizeObjectToError depth guard by starting at depth === maxDepth', () => {
        const out = normalizeError<ErrorShape>({ message: 'x' }, { maxDepth: 1 }, 1);
        expect(out).toBeInstanceOf(Error);
        expect(out.message).toBe('[Max depth of 1 reached]');
    });

    it('normalizes object cause (non-error) via isObject(normalizedCause) branch', () => {
        const input = { message: 'outer', cause: { k: 1 } };
        const err = normalizeError<ErrorShape>(input);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('outer');

        const c = err.cause as ErrorShape & { k: number };
        expect(c).toBeInstanceOf(Error);
        expect(c.message).toBe('');
        expect(c.k).toBe(1);
    });

    it('normalizes errors object map where item is plain object (non-error-shaped)', () => {
        const input = { message: 'validation', errors: { field: { a: 1 } } };
        const err = normalizeError<ErrorShapeWithErrorsObject>(input);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('validation');

        expect(typeof err.errors).toBe('object');
        const field = err.errors.field as ErrorShape & { a: number };
        expect(field).toBeInstanceOf(Error);
        expect(field.message).toBe('');
        expect(field.a).toBe(1);
    });

    it('uses provided name for "single" aggregate (name coerced) and message overridden to "AggregateError"', () => {
        const input = { name: { foo: 'bar' }, errors: 123 };
        const err = normalizeError<ErrorShapeWithErrorsArray>(input);
        const expectedCtor = typeof AggregateError !== 'undefined' ? AggregateError : Error;

        expect(err).toBeInstanceOf(expectedCtor);
        expect(err.name).toBe('[object Object]');
        expect(err.message).toBe('AggregateError');
        expect(Array.isArray(err.errors)).toBe(true);
        expect(err.errors.length).toBe(1);
        expect(err.errors[0]).toBeInstanceOf(Error);
        expect(err.errors[0].message).toBe('123');
    });

    it('attaches cause manually when AggregateError is constructed (cause becomes enumerable)', () => {
        const input = { errors: ['a', 'b'], cause: 'c' };
        const err = normalizeError<ErrorShapeWithErrorsArray>(input);

        const expectedCtor = typeof AggregateError !== 'undefined' ? AggregateError : Error;
        expect(err).toBeInstanceOf(expectedCtor);

        expect(err.cause).toBeInstanceOf(Error);
        expect((err.cause as Error).message).toBe('c');
        const desc = Object.getOwnPropertyDescriptor(err, 'cause');
        if (desc) {
            expect(desc.enumerable).toBe(true);
        }

        expect(Array.isArray(err.errors)).toBe(true);
        expect(err.errors.length).toBe(2);
    });

    it('stringifies function values in metadata via normalizeUnknown fallback', () => {
        const fn = function demo() {
            return 'x';
        };
        const input = { message: 'm', data: fn };
        const err = normalizeError<ErrorShape & { data: string }>(input);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('m');
        expect(typeof err.data).toBe('string');
        expect(err.data).toMatch(/function\s+demo|\(\)\s*=>/);
    });
});
