// src/utils.test.ts
import { unknownToString, primitiveToError, copyPropertiesTo } from '../src/utils';

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
        expect(unknownToString(async function () {})).toBe('[object AsyncFunction]');
        expect(unknownToString(function* generator() {})).toBe('[object GeneratorFunction]');
    });

    it('should handle edges cases', () => {
        expect(unknownToString(new Date())).toBe('[object Date]');
        expect(unknownToString(/test/)).toBe('[object RegExp]');
        expect(unknownToString(Object.create(null))).toBe('[object Object]');
    });

    it('should handle poisoned objects', () => {
        // Case 1: Poisoned Symbol.toStringTag
        // The function catches the error and falls back to reading constructor.name
        const toxicInput = {
            get [Symbol.toStringTag]() {
                throw new Error('Intentional error to trigger catch block');
            },
        };
        // Since toxicInput is a plain object, constructor.name is 'Object'
        expect(unknownToString(toxicInput)).toBe('[object Object]');

        // Case 2: Poisoned Symbol.toStringTag AND Poisoned Constructor
        // The function catches the first error, attempts to read constructor,
        // catches the second error, and returns the final warning.
        const maliciousInput = {
            get [Symbol.toStringTag]() {
                throw new Error('No toString allowed');
            },
            get constructor() {
                throw new Error('No constructor inspection allowed');
            },
        };
        expect(unknownToString(maliciousInput)).toBe('[Possible Malicious Object]');

        // Case 3: Poisoned function's Symbol.toStringTag
        // Create a standard function
        const toxicFunction = function () {};

        // Poison the Symbol.toStringTag property specifically on this function
        // so that Object.prototype.toString.call(toxicFunction) throws.
        Object.defineProperty(toxicFunction, Symbol.toStringTag, {
            get() {
                throw new Error('Intentional error to trigger catch block');
            },
            configurable: true,
        });

        expect(unknownToString(toxicFunction)).toBe('[Function]');
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

describe('copyPropertiesTo', () => {
    describe('basic property copying', () => {
        it('copies enumerable properties from source to target', () => {
            const source = { foo: 'bar', num: 42, bool: true };
            const target: Record<string, unknown> = {};

            copyPropertiesTo(source, target);

            expect(target.foo).toBe('bar');
            expect(target.num).toBe(42);
            expect(target.bool).toBe(true);
        });

        it('copies non-enumerable properties from source to target', () => {
            const source: Record<string, unknown> = {};
            Object.defineProperty(source, 'hidden', {
                value: 'secret',
                enumerable: false,
            });

            const target: Record<string, unknown> = {};
            copyPropertiesTo(source, target);

            expect(target.hidden).toBe('secret');
        });

        it('copies symbol properties', () => {
            const sym = Symbol('test');
            const source = { [sym]: 'symbol value' };
            const target: Record<string | symbol, unknown> = {};

            copyPropertiesTo(source, target);

            expect(target[sym]).toBe('symbol value');
        });

        it('does not copy undefined values', () => {
            const source = { defined: 'value', undefined: undefined };
            const target: Record<string, unknown> = {};

            copyPropertiesTo(source, target);

            expect(target.defined).toBe('value');
            expect('undefined' in target).toBe(false);
        });
    });

    describe('function skipping', () => {
        it('skips function properties by default', () => {
            const source = {
                value: 42,
                method: () => 'result',
            };
            const target: Record<string, unknown> = {};

            copyPropertiesTo(source, target);

            expect(target.value).toBe(42);
            expect(target.method).toBeUndefined();
        });

        it('copies function properties when skipFunctions is false', () => {
            const fn = () => 'result';
            const source = { method: fn };
            const target: Record<string, unknown> = {};

            copyPropertiesTo(source, target, { skipFunctions: false });

            expect(target.method).toBe(fn);
        });
    });

    describe('symbol key conversion', () => {
        it('keeps symbol keys as symbols by default', () => {
            const sym = Symbol('test');
            const source = { [sym]: 'value' };
            const target: Record<string | symbol, unknown> = {};

            copyPropertiesTo(source, target);

            expect(target[sym]).toBe('value');
            expect(target['Symbol(test)']).toBeUndefined();
        });

        it('converts symbol keys to strings when convertSymbolKeys is true', () => {
            const sym = Symbol('test');
            const source = { [sym]: 'value' };
            const target: Record<string | symbol, unknown> = {};

            copyPropertiesTo(source, target, { convertSymbolKeys: true });

            expect(target[sym]).toBeUndefined();
            expect(target['Symbol(test)']).toBe('value');
        });

        it('converts symbol values to strings when convertSymbolKeys is true', () => {
            const sym = Symbol('test');
            const source = { prop: sym };
            const target: Record<string, unknown> = {};

            copyPropertiesTo(source, target, { convertSymbolKeys: true });

            expect(target.prop).toBe('Symbol(test)');
        });
    });

    describe('property exclusion', () => {
        it('excludes specified keys', () => {
            const source = { foo: 'bar', exclude: 'me', keep: 'this' };
            const target: Record<string, unknown> = {};

            copyPropertiesTo(source, target, {
                excludeKeys: new Set(['exclude']),
            });

            expect(target.foo).toBe('bar');
            expect(target.keep).toBe('this');
            expect(target.exclude).toBeUndefined();
        });

        it('always excludes critical security keys', () => {
            const source: Record<string, unknown> = {
                __proto__: { polluted: true },
                constructor: 'malicious',
                prototype: {},
                normal: 'value',
            };
            const target: Record<string, unknown> = {};

            copyPropertiesTo(source, target);

            expect(target.normal).toBe('value');
            // __proto__ should not be copied as own property
            expect(Object.prototype.hasOwnProperty.call(target, '__proto__')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(target, 'constructor')).toBe(false);
            expect(Object.prototype.hasOwnProperty.call(target, 'prototype')).toBe(false);
        });
    });

    describe('value normalization', () => {
        it('applies normalizeValue transformer when provided', () => {
            const source = { a: 1, b: 2, c: 3 };
            const target: Record<string, unknown> = {};

            copyPropertiesTo(source, target, {
                normalizeValue: value => (typeof value === 'number' ? value * 2 : value),
            });

            expect(target.a).toBe(2);
            expect(target.b).toBe(4);
            expect(target.c).toBe(6);
        });

        it('normalizeValue can return undefined to skip properties', () => {
            const source = { keep: 'yes', skip: 'no' };
            const target: Record<string, unknown> = {};

            copyPropertiesTo(source, target, {
                normalizeValue: value => (value === 'no' ? undefined : value),
            });

            expect(target.keep).toBe('yes');
            expect('skip' in target).toBe(false);
        });

        it('normalizeValue takes precedence over convertSymbolKeys', () => {
            const sym = Symbol('test');
            const source = { prop: sym };
            const target: Record<string, unknown> = {};

            copyPropertiesTo(source, target, {
                convertSymbolKeys: true, // This should be ignored
                normalizeValue: value => (typeof value === 'symbol' ? 'CUSTOM' : value),
            });

            expect(target.prop).toBe('CUSTOM'); // Not 'Symbol(test)'
        });
    });

    describe('maxProperties limit', () => {
        it('truncates properties when maxProperties is exceeded', () => {
            const source = { a: 1, b: 2, c: 3, d: 4, e: 5 };
            const target: Record<string, unknown> = {};

            // Mock console.warn
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

            copyPropertiesTo(source, target, { maxProperties: 3 });

            expect(Object.keys(target).length).toBe(3);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Property count (5) exceeds limit (3), truncating'));

            warnSpy.mockRestore();
        });

        it('does not warn or truncate when within maxProperties limit', () => {
            const source = { a: 1, b: 2 };
            const target: Record<string, unknown> = {};

            const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

            copyPropertiesTo(source, target, { maxProperties: 5 });

            expect(Object.keys(target).length).toBe(2);
            expect(warnSpy).not.toHaveBeenCalled();

            warnSpy.mockRestore();
        });
    });

    describe('error handling', () => {
        it('skips properties with throwing getters', () => {
            const source: Record<string, unknown> = {
                normal: 'value',
            };

            Object.defineProperty(source, 'thrower', {
                get() {
                    throw new Error('Access denied');
                },
                enumerable: true,
            });

            const target: Record<string, unknown> = {};

            // Should not throw
            expect(() => copyPropertiesTo(source, target)).not.toThrow();

            expect(target.normal).toBe('value');
            expect(target.thrower).toBeUndefined();
        });

        it('re-throws RangeError', () => {
            const source: Record<string, unknown> = {};

            Object.defineProperty(source, 'range', {
                get() {
                    throw new RangeError('Range error');
                },
                enumerable: true,
            });

            const target: Record<string, unknown> = {};

            expect(() => copyPropertiesTo(source, target)).toThrow(RangeError);
        });

        it('re-throws ReferenceError', () => {
            const source: Record<string, unknown> = {};

            Object.defineProperty(source, 'ref', {
                get() {
                    throw new ReferenceError('Reference error');
                },
                enumerable: true,
            });

            const target: Record<string, unknown> = {};

            expect(() => copyPropertiesTo(source, target)).toThrow(ReferenceError);
        });
    });

    describe('edge cases', () => {
        it('handles empty source object', () => {
            const source = {};
            const target: Record<string, unknown> = {};

            copyPropertiesTo(source, target);

            expect(Object.keys(target).length).toBe(0);
        });

        it('handles source with only excluded properties', () => {
            const source = { name: 'Error', message: 'test', stack: 'trace' };
            const target: Record<string, unknown> = {};

            copyPropertiesTo(source, target);

            // All standard error keys should be excluded by default
            expect(Object.keys(target).length).toBe(0);
        });

        it('handles source with mixed property types', () => {
            const sym = Symbol('test');
            const fn = () => 'result';
            const source = {
                string: 'value',
                number: 42,
                bool: true,
                null: null,
                undef: undefined,
                obj: { nested: true },
                arr: [1, 2, 3],
                [sym]: 'symbol',
                method: fn,
            };
            const target: Record<string | symbol, unknown> = {};

            copyPropertiesTo(source, target);

            expect(target.string).toBe('value');
            expect(target.number).toBe(42);
            expect(target.bool).toBe(true);
            expect(target.null).toBe(null);
            expect('undef' in target).toBe(false); // undefined not copied
            expect(target.obj).toEqual({ nested: true });
            expect(target.arr).toEqual([1, 2, 3]);
            expect(target[sym]).toBe('symbol');
            expect(target.method).toBeUndefined(); // function skipped by default
        });

        it('works with objects created with Object.create(null)', () => {
            const source = Object.create(null);
            source.foo = 'bar';
            source.num = 42;

            const target: Record<string, unknown> = {};

            copyPropertiesTo(source, target);

            expect(target.foo).toBe('bar');
            expect(target.num).toBe(42);
        });
    });
});
