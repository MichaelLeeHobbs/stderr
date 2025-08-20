// src/utils.test.ts
import { unknownToString, primitiveToError } from '../src/utils';

describe('unknownToString', () => {
    it('should handle string inputs', () => {
        expect(unknownToString('hello')).toBe('hello');
        expect(unknownToString('')).toBe('');
    });

    it('should handle non-string primitives', () => {
        // These should hit the isPrimitive(input) return String(input) path
        expect(unknownToString(42)).toBe('42');
        expect(unknownToString(true)).toBe('true');
        expect(unknownToString(false)).toBe('false');
        expect(unknownToString(null)).toBe('null');
        expect(unknownToString(undefined)).toBe('undefined');
        expect(unknownToString(BigInt(123))).toBe('123');
        expect(unknownToString(Symbol.for('test'))).toBe('Symbol(test)');
    });

    it('should handle error-shaped objects with string messages', () => {
        expect(unknownToString({ message: 'error message' })).toBe('error message');
        expect(unknownToString(new Error('test error'))).toBe('test error');
    });

    it('should handle error-shaped objects with non-string messages', () => {
        // This should hit the if (msg != null) return String(msg) path
        expect(unknownToString({ message: 123 })).toBe('123');
        expect(unknownToString({ message: true })).toBe('true');
        expect(unknownToString({ message: { nested: 'object' } })).toBe('[object Object]');
    });

    it('should handle error-shaped objects without message but with name', () => {
        // This should hit the name fallback path
        expect(unknownToString({ name: 'CustomError' })).toBe('CustomError');
        expect(unknownToString({ name: 'TypeError', message: null })).toBe('TypeError');
        expect(unknownToString({ name: 42 })).toBe('42');
    });

    it('should handle error-shaped objects with undefined message', () => {
        expect(unknownToString({ message: undefined, name: 'FallbackName' })).toBe('FallbackName');
    });

    it('should handle plain objects', () => {
        expect(unknownToString({})).toBe('[object Object]');
        expect(unknownToString({ foo: 'bar' })).toBe('[object Object]');
        expect(unknownToString([])).toBe('[object Array]');
        expect(unknownToString([1, 2, 3])).toBe('[object Array]');
    });

    it('should handle objects with custom toString', () => {
        const obj = {
            toString() {
                return 'custom string';
            },
        };
        expect(unknownToString(obj)).toBe('[object Object]');
    });

    it('should handle functions', () => {
        expect(unknownToString(() => {})).toBe('[object Function]');
        expect(unknownToString(function named() {})).toBe('[object Function]');
        expect(unknownToString(async function() {})).toBe('[object AsyncFunction]');
        expect(unknownToString(function* generator() {})).toBe('[object GeneratorFunction]');
    });

    it('should handle dates', () => {
        expect(unknownToString(new Date())).toBe('[object Date]');
    });

    it('should handle regex', () => {
        expect(unknownToString(/test/)).toBe('[object RegExp]');
    });
});

describe('primitiveToError', () => {
    it('should handle undefined', () => {
        const err = primitiveToError(undefined);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Unknown error (Undefined)');
    });

    it('should handle null', () => {
        const err = primitiveToError(null);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Unknown error (Null)');
    });

    it('should handle strings', () => {
        const err = primitiveToError('error message');
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('error message');
    });

    it('should handle numbers', () => {
        const err = primitiveToError(42);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('42');
    });

    it('should handle booleans', () => {
        const err1 = primitiveToError(true);
        expect(err1).toBeInstanceOf(Error);
        expect(err1.message).toBe('true');

        const err2 = primitiveToError(false);
        expect(err2).toBeInstanceOf(Error);
        expect(err2.message).toBe('false');
    });

    it('should handle bigints', () => {
        const err = primitiveToError(BigInt(123));
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('123');
    });

    it('should handle symbols', () => {
        const err = primitiveToError(Symbol.for('test'));
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Symbol(test)');
    });
});
