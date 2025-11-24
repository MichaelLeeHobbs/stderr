// test/stderr.uncovered.test.ts
import { stderr, StdError } from '../src';
import { ErrorRecord, ErrorShape } from '../src/types';

describe('stderr (extra coverage for uncovered branches)', () => {
    it('normalizes a symbol cause via normalizeUnknown (stringified, attached as Error)', () => {
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

    it('normalizes nested plain object with symbol value (metadata path)', () => {
        const input = { message: 'm', data: { sym: Symbol('v') } };
        const err = stderr(input);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('m');
        expect(err.data).toBeDefined();
        expect((err.data as { sym: string }).sym).toBe('Symbol(v)');
    });

    it('normalizes array input with symbol element (errors array path -> normalizeUnknown symbol branch)', () => {
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

    it('normalizes object cause (non-error) via isObject(normalizedCause) branch', () => {
        const input = { message: 'outer', cause: { k: 1 } };
        const err = stderr(input);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('outer');

        const c = err.cause as ErrorShape & { k: number };
        expect(c).toBeInstanceOf(Error);
        expect(c.message).toBe('');
        expect(c.k).toBe(1);
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

    it('uses provided name for "single" aggregate (name coerced) and message overridden to "AggregateError"', () => {
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

    it('attaches cause manually when AggregateError is constructed (cause becomes enumerable)', () => {
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
