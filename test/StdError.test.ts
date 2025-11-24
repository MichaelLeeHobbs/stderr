// test/StdError.test.ts
import { StdError } from '../src/StdError';
import * as console from 'node:console';

describe('StdError', () => {
    describe('constructor', () => {
        it('creates basic error with message', () => {
            const error = new StdError('Test error');
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(StdError);
            expect(error.message).toBe('Test error');
            expect(error.name).toBe('Error');
        });

        it('creates error with custom name', () => {
            const error = new StdError('Test error', { name: 'CustomError' });
            expect(error.name).toBe('CustomError');
            expect(error.message).toBe('Test error');
        });

        it('creates error with cause', () => {
            const cause = new Error('Root cause');
            const error = new StdError('Test error', { cause });
            expect(error.cause).toBe(cause);
        });

        it('creates error with errors array', () => {
            const errors = [new Error('Error 1'), new Error('Error 2')];
            const error = new StdError('Multiple errors', { errors });
            expect(error.errors).toBe(errors);
        });

        it('creates error with custom properties', () => {
            const error = new StdError('Test error', {
                code: 'E_TEST',
                statusCode: 500,
                details: { foo: 'bar' },
            });
            expect((error as Record<string, unknown>).code).toBe('E_TEST');
            expect((error as Record<string, unknown>).statusCode).toBe(500);
            expect((error as Record<string, unknown>).details).toEqual({ foo: 'bar' });
        });

        it('creates error with symbol properties', () => {
            const sym = Symbol('test');
            const error = new StdError('Test error', { [sym]: 'value' });
            expect((error as Record<symbol, unknown>)[sym]).toBe('value');
        });

        // It is impossible to test private Symbol fields directly
        // it('creates error with maxDepth option', () => {
        //     const error = new StdError('Test error', { maxDepth: 5 });
        //     expect((error as Record<string, unknown>)._maxDepth).toBe(5);
        // });

        it('handles empty message', () => {
            const error = new StdError();
            expect(error.message).toBe('');
            expect(error.name).toBe('Error');
        });
    });

    describe('toString()', () => {
        it('formats basic error', () => {
            const error = new StdError('Test error');
            const str = error.toString();
            expect(str).toContain('Error: Test error');
        });

        it('formats error with custom name', () => {
            const error = new StdError('Test error', { name: 'CustomError' });
            const str = error.toString();
            expect(str).toContain('CustomError: Test error');
        });

        it('includes custom properties', () => {
            const error = new StdError('Test error', {
                code: 'E_TEST',
                statusCode: 500,
            });
            const str = error.toString();
            expect(str).toContain("code: 'E_TEST'");
            expect(str).toContain('statusCode: 500');
        });

        it('formats cause chain', () => {
            const rootCause = new Error('Root cause');
            const cause = new StdError('Middle cause', { cause: rootCause });
            const error = new StdError('Top error', { cause });
            const str = error.toString();
            expect(str).toContain('Top error');
            expect(str).toContain('[cause]');
            expect(str).toContain('Middle cause');
            expect(str).toContain('Root cause');
        });

        it('formats errors array', () => {
            const errors = [new Error('Error 1'), new Error('Error 2')];
            const error = new StdError('Multiple errors', { errors });
            const str = error.toString();
            expect(str).toContain('[errors]');
            expect(str).toContain('Error 1');
            expect(str).toContain('Error 2');
        });

        it('formats errors object', () => {
            const errors = {
                email: new Error('Invalid email'),
                password: new Error('Too short'),
            };
            const error = new StdError('Validation failed', { errors });
            const str = error.toString();
            expect(str).toContain('[errors]');
            expect(str).toContain('email:');
            expect(str).toContain('Invalid email');
            expect(str).toContain('password:');
            expect(str).toContain('Too short');
        });

        it('handles circular references', () => {
            const error = new StdError('Circular error');
            (error as Record<string, unknown>).circular = error;
            const str = error.toString();
            expect(str).toContain('[Circular]');
        });

        it('respects maxDepth', () => {
            const deep3 = new StdError('Level 3');
            const deep2 = new StdError('Level 2', { cause: deep3 });
            const deep1 = new StdError('Level 1', { cause: deep2 });
            const error = new StdError('Level 0', { cause: deep1, maxDepth: 2 });
            const str = error.toString();
            expect(str).toContain('Level 0');
            expect(str).toContain('Level 1');
            expect(str).toContain('[Max depth of 2 reached]');
        });

        it('respects global maxDepth', () => {
            const originalMaxDepth = StdError.defaultMaxDepth;
            StdError.defaultMaxDepth = 2;

            const deep3 = new StdError('Level 3');
            const deep2 = new StdError('Level 2', { cause: deep3 });
            const deep1 = new StdError('Level 1', { cause: deep2 });
            const error = new StdError('Level 0', { cause: deep1 });
            const str = error.toString();

            expect(str).toContain('[Max depth of 2 reached]');

            StdError.defaultMaxDepth = originalMaxDepth;
        });

        it('includes stack trace snippet', () => {
            const error = new StdError('Test error');
            const str = error.toString();
            // Stack should be present (at least in Node.js)
            if (error.stack) {
                expect(str).toBeTruthy();
            }
        });

        it('handles primitive cause', () => {
            const error = new StdError('Test error', { cause: 'string cause' });
            const str = error.toString();
            expect(str).toContain("[cause]: 'string cause'");
        });

        it('handles object cause that is not error-shaped', () => {
            const error = new StdError('Test error', {
                cause: { code: 'E_CUSTOM', details: 'info' },
            });
            const str = error.toString();
            expect(str).toContain('[cause]');
        });

        it('formats empty errors array', () => {
            const error = new StdError('Test error', { errors: [] });
            const str = error.toString();
            expect(str).toContain('[]');
        });

        it('formats empty errors object', () => {
            const error = new StdError('Test error', { errors: {} });
            const str = error.toString();
            expect(str).toContain('{}');
        });

        it('defaults to "Error" when name is falsy', () => {
            const error = new StdError('Test error', { name: 'CustomError' });
            // Mutate name to undefined to test the fallback
            // @ts-expect-error - Testing runtime behavior when name is undefined
            error.name = undefined;
            const str = error.toString();
            expect(str).toContain('Error: Test error');
            expect(str).not.toContain('CustomError');
        });

        it('formats undefined property values as "undefined"', () => {
            const error = new StdError('Test error');
            // Add a property with undefined value
            error.customProp = undefined;
            const str = error.toString();
            expect(str).toContain('customProp: undefined');
        });

        it('handles maxDepth in nested errors array with error-shaped values', () => {
            // Create deeply nested error-shaped objects in errors array
            const deepError = {
                name: 'Level3',
                message: 'Deep',
                errors: [
                    {
                        name: 'Level4',
                        message: 'Deeper',
                        errors: [{ name: 'Level5', message: 'Too deep' }],
                    },
                ],
            };
            const error = new StdError('Root', {
                maxDepth: 2,
                errors: [deepError],
            });
            const str = error.toString();
            expect(str).toContain('[Max depth');
        });

        it('handles maxDepth in nested errors object with error-shaped values', () => {
            // Create deeply nested error-shaped objects in errors object
            const deepError = {
                name: 'Level3',
                message: 'Deep',
                errors: {
                    nested: {
                        name: 'Level4',
                        message: 'Deeper',
                        errors: { deep: { name: 'Level5', message: 'Too deep' } },
                    },
                },
            };
            const error = new StdError('Root', {
                maxDepth: 2,
                errors: { field: deepError },
            });
            const str = error.toString();
            expect(str).toContain('[Max depth');
        });

        it('detects circular reference in nested errors array', () => {
            const circular: { name: string; message: string; errors?: unknown } = { name: 'Circular', message: 'Test' };
            circular.errors = [circular]; // Self-reference in errors array
            const error = new StdError('Root', { errors: [circular] });
            const str = error.toString();
            expect(str).toContain('[Circular]');
        });

        it('detects circular reference in nested errors object', () => {
            const circular: { name: string; message: string; errors?: unknown } = { name: 'Circular', message: 'Test' };
            circular.errors = { self: circular }; // Self-reference in errors object
            const error = new StdError('Root', { errors: { field: circular } });
            const str = error.toString();
            expect(str).toContain('[Circular]');
        });
    });

    describe('toJSON()', () => {
        it('serializes basic error', () => {
            const error = new StdError('Test error');
            const json = error.toJSON();
            expect(json.name).toBe('Error');
            expect(json.message).toBe('Test error');
            expect(typeof json.stack).toBe('string');
        });

        it('serializes error with custom properties', () => {
            const error = new StdError('Test error', {
                code: 'E_TEST',
                statusCode: 500,
            });
            const json = error.toJSON();
            expect(json.code).toBe('E_TEST');
            expect(json.statusCode).toBe(500);
        });

        it('serializes cause chain', () => {
            const rootCause = new Error('Root cause');
            const cause = new StdError('Middle cause', { cause: rootCause });
            const error = new StdError('Top error', { cause });
            const json = error.toJSON();
            expect(json.cause).toBeDefined();
            expect((json.cause as Record<string, unknown>).message).toBe('Middle cause');
            expect((json.cause as Record<string, unknown>).cause).toBeDefined();
            expect(((json.cause as Record<string, unknown>).cause as Record<string, unknown>).message).toBe('Root cause');
        });

        it('serializes errors array', () => {
            const errors = [new Error('Error 1'), new Error('Error 2')];
            const error = new StdError('Multiple errors', { errors });
            const json = error.toJSON();
            expect(Array.isArray(json.errors)).toBe(true);
            expect((json.errors as Record<string, unknown>[])[0].message).toBe('Error 1');
            expect((json.errors as Record<string, unknown>[])[1].message).toBe('Error 2');
        });

        it('serializes errors object', () => {
            const errors = {
                email: new Error('Invalid email'),
                password: new Error('Too short'),
            };
            const error = new StdError('Validation failed', { errors });
            const json = error.toJSON();
            expect(json.errors).toBeDefined();
            expect((json.errors as Record<string, Record<string, unknown>>).email.message).toBe('Invalid email');
            expect((json.errors as Record<string, Record<string, unknown>>).password.message).toBe('Too short');
        });

        it('handles circular references', () => {
            const error = new StdError('Circular error');
            (error as Record<string, unknown>).circular = error;
            const json = error.toJSON();
            expect(json.circular).toBe('[Circular]');
        });

        it('respects maxDepth', () => {
            const deep3 = new StdError('Level 3');
            const deep2 = new StdError('Level 2', { cause: deep3 });
            const deep1 = new StdError('Level 1', { cause: deep2 });
            const error = new StdError('Level 0', { cause: deep1, maxDepth: 2 });
            const json = error.toJSON();
            console.log(json);
            expect(json.message).toBe('Level 0');
            expect((json.cause as Record<string, unknown>).message).toBe('Level 1');
            expect((json.cause as Record<string, unknown>).cause).toBe('[Max depth of 2 reached]');
        });

        it('works with JSON.stringify', () => {
            const error = new StdError('Test error', {
                code: 'E_TEST',
                cause: new Error('Root cause'),
            });
            const jsonString = JSON.stringify(error, null, 2);
            const parsed = JSON.parse(jsonString);
            expect(parsed.name).toBe('Error');
            expect(parsed.message).toBe('Test error');
            expect(parsed.code).toBe('E_TEST');
            expect(parsed.cause.message).toBe('Root cause');
        });

        it('handles primitive cause', () => {
            const error = new StdError('Test error', { cause: 'string cause' });
            const json = error.toJSON();
            expect(json.cause).toBe('string cause');
        });

        it('handles null cause', () => {
            const error = new StdError('Test error', { cause: null });
            const json = error.toJSON();
            expect(json.cause).toBeUndefined(); // null/undefined causes are not included
        });

        it('serializes symbol properties', () => {
            const sym = Symbol('test');
            const error = new StdError('Test error', { [sym]: 'value' });
            const json = error.toJSON();
            // Symbols are converted to strings in JSON
            expect(json['Symbol(test)']).toBe('value');
        });

        it('handles nested objects', () => {
            const error = new StdError('Test error', {
                metadata: {
                    user: { id: 123, name: 'John' },
                    timestamp: new Date('2025-01-01'),
                },
            });
            const json = error.toJSON();
            expect((json.metadata as Record<string, Record<string, unknown>>).user.id).toBe(123);
        });

        it('handles arrays in properties', () => {
            const error = new StdError('Test error', {
                tags: ['error', 'critical'],
                codes: [500, 503],
            });
            const json = error.toJSON();
            expect(json.tags).toEqual(['error', 'critical']);
            expect(json.codes).toEqual([500, 503]);
        });

        it('handles maxDepth in nested errors array with error-shaped values', () => {
            // Create deeply nested error-shaped objects in errors array
            const deepError = {
                name: 'Level3',
                message: 'Deep',
                errors: [
                    {
                        name: 'Level4',
                        message: 'Deeper',
                        errors: [{ name: 'Level5', message: 'Too deep' }],
                    },
                ],
            };
            const error = new StdError('Root', {
                maxDepth: 2,
                errors: [deepError],
            });
            const json = error.toJSON();
            expect(json.errors).toHaveLength(1);
            interface ErrorShape {
                name: string;
                message: string;
                errors: Array<ErrorShape>;
            }
            const err = (json.errors as Array<ErrorShape>)[0];
            expect(err.name).toBe('Level3');
            expect(err.errors).toHaveLength(1);
            expect(err.errors[0]).toBe('[Max depth of 2 reached]');
        });

        it('detects circular reference in nested errors array', () => {
            const circular: { name: string; message: string; errors?: unknown } = { name: 'Circular', message: 'Test' };
            circular.errors = [circular]; // Self-reference in errors array
            const error = new StdError('Root', { errors: [circular] });
            const json = error.toJSON();
            console.log(JSON.stringify(json, null, 2));
            interface ErrorShape {
                name: string;
                message: string;
                errors: Array<ErrorShape>;
            }
            expect(json.errors).toHaveLength(1);
            expect((json.errors as Array<ErrorShape>)[0].errors[0]).toBe('[Circular]');
        });

        it('detects circular reference in nested errors object', () => {
            const circular: { name: string; message: string; errors?: unknown } = { name: 'Circular', message: 'Test' };
            circular.errors = { self: circular }; // Self-reference in errors object
            const error = new StdError('Root', { errors: { field: circular } });
            const json = error.toJSON();
            console.log(JSON.stringify(json, null, 2));

            interface ErrorShape {
                name: string;
                message: string;
                errors: Record<string, ErrorShape>;
            }

            expect(json.errors).toBeDefined();
            expect((json.errors as Record<string, ErrorShape>).field.errors.self).toBe('[Circular]');
        });

        it('defaults to "Error" when name is falsy', () => {
            const error = new StdError('Test error', { name: 'CustomError' });
            // Mutate name to undefined to test the fallback
            // @ts-expect-error - Testing runtime behavior when name is undefined
            error.name = undefined;
            const json = error.toJSON();
            expect(json.name).toBe('Error');
        });
    });

    describe('inheritance', () => {
        it('can be extended', () => {
            class CustomError extends StdError {
                constructor(
                    message: string,
                    public code: string
                ) {
                    super(message, { name: 'CustomError', code });
                }
            }

            const error = new CustomError('Test', 'E_TEST');
            expect(error).toBeInstanceOf(StdError);
            expect(error).toBeInstanceOf(CustomError);
            expect(error.code).toBe('E_TEST');
            expect(error.name).toBe('CustomError');
        });

        it('instanceof checks work correctly', () => {
            const error = new StdError('Test');
            expect(error instanceof StdError).toBe(true);
            expect(error instanceof Error).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('handles undefined message', () => {
            const error = new StdError(undefined);
            expect(error.message).toBe('');
        });

        it('handles null in options', () => {
            const error = new StdError('Test', {
                cause: null,
                errors: null,
                custom: null,
            });
            expect(error.cause).toBeNull();
            expect(error.errors).toBeNull();
            expect((error as Record<string, unknown>).custom).toBeNull();
        });

        it('handles undefined in options', () => {
            const error = new StdError('Test', {
                code: undefined,
            });
            expect((error as Record<string, unknown>).code).toBeUndefined();
        });

        it('handles complex nested structures', () => {
            const error = new StdError('Test', {
                data: {
                    array: [1, 2, { nested: true }],
                    map: new Map([['key', 'value']]),
                    set: new Set([1, 2, 3]),
                },
            });
            const json = error.toJSON();
            expect(json.data).toBeDefined();
        });

        it('handles very deep nesting with default maxDepth', () => {
            let current: Record<string, unknown> = { value: 'bottom' };
            for (let i = 0; i < 20; i++) {
                current = { nested: current };
            }
            const error = new StdError('Test', { data: current });
            const json = error.toJSON();
            expect(json.data).toBeDefined();
        });

        // Fuzzing-discovered issues: dangerous property filtering
        describe('dangerous property filtering (fuzzing-discovered)', () => {
            it('filters out __proto__ property to prevent prototype pollution', () => {
                const error = new StdError('Test', {
                    __proto__: {},
                    safeProperty: 'safe',
                });
                // Should still be Error instance (not corrupted)
                expect(error).toBeInstanceOf(Error);
                expect(error).toBeInstanceOf(StdError);
                // Should not have __proto__ as own property
                expect(Object.prototype.hasOwnProperty.call(error, '__proto__')).toBe(false);
                // Safe property should work
                expect(error.safeProperty).toBe('safe');
            });

            it('filters out toString property to prevent method overwrite', () => {
                const error = new StdError('Test', {
                    toString: 'not a function',
                    code: 'E_TEST',
                });
                // toString should still be a function
                expect(typeof error.toString).toBe('function');
                // Should be able to call it
                expect(() => error.toString()).not.toThrow();
                const str = error.toString();
                expect(typeof str).toBe('string');
                expect(str).toContain('Test');
                // Other property should work
                expect(error.code).toBe('E_TEST');
            });

            it('filters out toJSON property to prevent method overwrite', () => {
                const error = new StdError('Test', {
                    toJSON: 'not a function',
                    data: 'some data',
                });
                // toJSON should still be a function
                expect(typeof error.toJSON).toBe('function');
                // Should be able to call it
                expect(() => error.toJSON()).not.toThrow();
                expect(() => JSON.stringify(error)).not.toThrow();
                // Other property should work
                expect(error.data).toBe('some data');
            });

            it('filters out constructor property', () => {
                const error = new StdError('Test', {
                    constructor: 'malicious',
                    value: 'safe',
                });
                // Constructor should still be StdError
                expect(error.constructor).toBe(StdError);
                expect(error.value).toBe('safe');
            });

            it('filters out valueOf property', () => {
                const error = new StdError('Test', {
                    valueOf: 'not a function',
                });
                expect(typeof error.valueOf).toBe('function');
            });

            it('filters out prototype property', () => {
                const error = new StdError('Test', {
                    prototype: {},
                });
                // Should not have prototype as own property
                expect(Object.prototype.hasOwnProperty.call(error, 'prototype')).toBe(false);
            });

            it('filters out __defineGetter__ and similar dangerous properties', () => {
                const error = new StdError('Test', {
                    __defineGetter__: 'bad',
                    __defineSetter__: 'bad',
                    __lookupGetter__: 'bad',
                    __lookupSetter__: 'bad',
                    normalProp: 'good',
                });
                expect(error.normalProp).toBe('good');
                // Dangerous properties should be filtered
                expect(Object.prototype.hasOwnProperty.call(error, '__defineGetter__')).toBe(false);
            });

            it('handles object with __proto__ set to array without corruption', () => {
                const input = { __proto__: [], message: 'test' };
                const error = new StdError('Wrapper', input);
                // Should still be Error instance
                expect(error).toBeInstanceOf(Error);
                expect(error).toBeInstanceOf(StdError);
                expect(Array.isArray(error)).toBe(false);
            });

            it('handles object with __proto__ set to object without corruption', () => {
                const input = { __proto__: {}, message: 'test' };
                const error = new StdError('Wrapper', input);
                // Should still be Error instance
                expect(error).toBeInstanceOf(Error);
                expect(error).toBeInstanceOf(StdError);
            });
        });
    });

    // =========================================================================
    // Coverage Tests for Uncovered Branches
    // =========================================================================
    describe('uncovered branch coverage', () => {
        describe('max depth limit tests', () => {
            it('toString() hits max depth limit', () => {
                const error = new StdError('Test', { maxDepth: 1 });
                const deepCause = new StdError('Level 1', {
                    cause: new StdError('Level 2', {
                        cause: new StdError('Level 3'),
                    }),
                });
                (error as StdError & { cause: unknown }).cause = deepCause;

                const str = error.toString();
                expect(str).toContain('[Max depth of 1 reached]');
            });

            it('formatErrors hits max depth for array', () => {
                const error = new StdError('Test', {
                    maxDepth: 1,
                    errors: [
                        new StdError('Error 1', {
                            errors: [new StdError('Nested')],
                        }),
                    ],
                });
                const str = error.toString();
                expect(str).toContain('[Max depth of 1 reached]');
            });

            it('toJSON hits max depth limit', () => {
                const error = new StdError('Test', { maxDepth: 1 });
                let deep: Record<string, unknown> = { value: 'deep' };
                for (let i = 0; i < 5; i++) {
                    deep = { nested: deep };
                }
                (error as StdError & { data: unknown }).data = deep;

                const json = error.toJSON();
                const jsonStr = JSON.stringify(json);
                expect(jsonStr).toContain('[Max depth of 1 reached]');
            });
        });

        describe('circular reference tests (lines 183-184, 287, 385-386)', () => {
            it('toString() detects circular reference', () => {
                const error = new StdError('Test');
                (error as StdError & { self: unknown }).self = error;

                const str = error.toString();
                expect(str).toContain('[Circular]');
            });

            it('toJSON detects circular reference', () => {
                const error = new StdError('Test');
                (error as StdError & { self: unknown }).self = error;

                const json = error.toJSON();
                const jsonStr = JSON.stringify(json);
                expect(jsonStr).toContain('[Circular]');
            });
        });

        describe('name fallback tests (lines 190, 349)', () => {
            it('toString uses default Error name when name is empty', () => {
                const error = new StdError('Test', { name: '' });
                const str = error.toString();
                expect(str).toContain('Error: Test');
            });

            it('toJSON uses default Error name when name is empty', () => {
                const error = new StdError('Test', { name: '' });
                const json = error.toJSON();
                expect(json.name).toBe('Error');
            });
        });

        describe('formatValue edge cases (lines 303, 335-338)', () => {
            it('formats null value', () => {
                const error = new StdError('Test', { nullValue: null });
                const str = error.toString();
                expect(str).toContain('nullValue: null');
            });

            it('formats symbol value', () => {
                const sym = Symbol('testSymbol');
                const error = new StdError('Test', { symValue: sym });
                const str = error.toString();
                expect(str).toContain('Symbol(testSymbol)');
            });

            it('formats array with length 0', () => {
                const error = new StdError('Test', { emptyArray: [] });
                const str = error.toString();
                expect(str).toContain('emptyArray: []');
            });

            it('formats array with length > 3', () => {
                const error = new StdError('Test', { longArray: [1, 2, 3, 4, 5] });
                const str = error.toString();
                expect(str).toContain('[Array(5)]');
            });

            it('formats array with length <= 3', () => {
                const error = new StdError('Test', { shortArray: [1, 2, 3] });
                const str = error.toString();
                expect(str).toContain('[1, 2, 3]');
            });

            it('formats object with 0 keys', () => {
                const error = new StdError('Test', { emptyObj: {} });
                const str = error.toString();
                expect(str).toContain('emptyObj: {}');
            });

            it('formats object with > 3 keys', () => {
                const error = new StdError('Test', {
                    bigObj: { a: 1, b: 2, c: 3, d: 4, e: 5 },
                });
                const str = error.toString();
                expect(str).toContain('{Object with 5 keys}');
            });

            it('filters out function properties', () => {
                const func = function testFunc() {
                    return 42;
                };
                const error = new StdError('Test', { funcValue: func, normalProp: 'value' });

                // Functions should NOT be copied (logging library, not debugging dump)
                expect((error as Record<string, unknown>).funcValue).toBeUndefined();

                // Other properties should work
                expect((error as Record<string, unknown>).normalProp).toBe('value');
            });
        });

        describe('formatErrors with non-error items (lines 318, 331)', () => {
            it('formats errors array with non-error-shaped items', () => {
                const error = new StdError('Test', {
                    errors: [new Error('Real error'), 'string error', 42, { notAnError: true }],
                });
                const str = error.toString();
                expect(str).toContain('[errors]');
                expect(str).toContain('string error');
                expect(str).toContain('42');
            });

            it('formats errors object with non-error-shaped values', () => {
                const error = new StdError('Test', {
                    errors: {
                        err1: new Error('Real error'),
                        err2: 'string value',
                        err3: 123,
                        err4: { data: 'value' },
                    },
                });
                const str = error.toString();
                expect(str).toContain('[errors]');
                expect(str).toContain('err2:');
                expect(str).toContain('err3:');
            });

            it('formats errors as non-array non-object (fallback)', () => {
                const error = new StdError('Test', { errors: 'not an array or object' });
                const str = error.toString();
                expect(str).toContain('[errors]');
            });
        });

        describe('toJSON edge cases (lines 372-373, 390-391, 470-474, 478-481)', () => {
            it('toJSON wraps string result from serializeError', () => {
                const error = new StdError('Test', { maxDepth: 0 });
                const json = error.toJSON();
                expect(json).toHaveProperty('name');
                expect(json).toHaveProperty('message');
            });

            it('serializeValue handles symbols', () => {
                const sym = Symbol('test');
                const error = new StdError('Test', { symProp: sym });
                const json = error.toJSON();
                expect(json.symProp).toBe('Symbol(test)');
            });

            it('serializeValue handles fallback for unknown types', () => {
                const func = () => 42;
                const error = new StdError('Test', { funcProp: func });
                const json = error.toJSON();
                expect(typeof json.funcProp).toEqual('undefined');
            });

            it('serializeValue handles symbol keys in objects', () => {
                const sym = Symbol('key');
                const objWithSymbol = { [sym]: 'value', normal: 'data' };
                const error = new StdError('Test', { data: objWithSymbol });
                const json = error.toJSON();
                expect(json.data).toHaveProperty('normal');
            });

            it('handles enumerable symbol properties', () => {
                const sym = Symbol('enumSym');
                const obj = {};
                Object.defineProperty(obj, sym, {
                    value: 'symbolValue',
                    enumerable: true,
                });
                const error = new StdError('Test', { data: obj });
                const json = error.toJSON();
                expect(json.data).toBeDefined();
            });
        });

        describe('static defaultMaxDepth', () => {
            it('can set global defaultMaxDepth', () => {
                const originalDefault = StdError.defaultMaxDepth;
                try {
                    StdError.defaultMaxDepth = 3;
                    const error = new StdError('Test');
                    let deep: Record<string, unknown> = { value: 'bottom' };
                    for (let i = 0; i < 10; i++) {
                        deep = { nested: deep };
                    }
                    (error as StdError & { data: unknown }).data = deep;

                    const str = error.toString();
                    expect(str).toContain('[Max depth of 3 reached]');
                } finally {
                    StdError.defaultMaxDepth = originalDefault;
                }
            });

            it('instance maxDepth overrides global default', () => {
                const originalDefault = StdError.defaultMaxDepth;
                try {
                    StdError.defaultMaxDepth = 10;
                    const error = new StdError('Test', { maxDepth: 2 });
                    let deep: Record<string, unknown> = { value: 'bottom' };
                    for (let i = 0; i < 10; i++) {
                        deep = { nested: deep };
                    }
                    (error as StdError & { data: unknown }).data = deep;

                    const str = error.toString();
                    expect(str).toContain('[Max depth of 2 reached]');
                } finally {
                    StdError.defaultMaxDepth = originalDefault;
                }
            });
        });
    });
});
