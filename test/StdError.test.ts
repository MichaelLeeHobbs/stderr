// test/StdError.test.ts
import { StdError } from '../src/StdError';

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

        it('creates error with maxDepth option', () => {
            const error = new StdError('Test error', { maxDepth: 5 });
            expect((error as Record<string, unknown>)._maxDepth).toBe(5);
        });

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
    });
});
