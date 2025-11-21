// test/tryCatch.test.ts
import { tryCatch } from '../src/tryCatch';

describe('tryCatch', () => {
    describe('synchronous', () => {
        it('should return success result when function succeeds', () => {
            const result = tryCatch(() => 42);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(42);
                expect(result.error).toBeNull();
            }
        });

        it('should return standardized error when function throws Error', () => {
            const originalError = new Error('Test error');
            const result = tryCatch(() => {
                throw originalError;
            });

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.value).toBeNull();
                expect(result.error).toBeInstanceOf(Error);
                expect(result.error.message).toBe('Test error');
                expect(result.error.toString()).toContain('Error: Test error');
            }
        });

        it('should standardize string errors', () => {
            const result = tryCatch(() => {
                throw 'String error';
            });

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(Error);
                expect(result.error.message).toBe('String error');
                expect(result.error.toString()).toContain('Error: String error');
            }
        });

        it('should standardize number errors', () => {
            const result = tryCatch(() => {
                throw 404;
            });

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(Error);
                expect(result.error.message).toBe('404');
                expect(result.error.toString()).toContain('Error: 404');
            }
        });

        it('should standardize object errors and patch toString', () => {
            const objError = { code: 'ERR_001', details: 'Something failed' };
            const result = tryCatch(() => {
                throw objError;
            });

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(Error);
                expect(result.error.message).toBe('');
                // toString should be patched to show JSON
                expect(result.error.toString()).toContain(`code: 'ERR_001'`);
                expect(result.error.toString()).toContain(`details: 'Something failed'`);
            }
        });

        it('should standardize null errors', () => {
            const result = tryCatch(() => {
                throw null;
            });

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(Error);
                expect(result.error.message).toBe('Unknown error (Null)');
                expect(result.error.toString()).toContain('Error: Unknown error (Null)');
            }
        });

        it('should standardize undefined errors', () => {
            const result = tryCatch(() => {
                throw undefined;
            });

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(Error);
                expect(result.error.message).toBe('Unknown error (Undefined)');
                expect(result.error.toString()).toContain('Error: Unknown error (Undefined)');
            }
        });

        it('should handle functions that return undefined', () => {
            const result = tryCatch(() => undefined);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBeUndefined();
                expect(result.error).toBeNull();
            }
        });

        it('should preserve type narrowing', () => {
            const result = tryCatch(() => 'test string');

            if (result.ok) {
                // TypeScript should know result.value is string
                const upperCase: string = result.value.toUpperCase();
                expect(upperCase).toBe('TEST STRING');
            } else {
                // TypeScript should know result.error is ErrorShape with optional message
                const { message } = result.error; // message may be undefined
                expect(message).toBeDefined();
            }
        });

        it('should transform error using mapError function', () => {
            type CustomError = { code: string; details: string };
            const result = tryCatch<number, CustomError>(
                () => {
                    throw new Error('Original error');
                },
                stdErr => ({
                    code: stdErr.name || 'UNKNOWN',
                    details: stdErr.message || 'No details',
                })
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.code).toBe('Error');
                expect(result.error.details).toBe('Original error');
            }
        });

        it('should transform string error using mapError', () => {
            type SimpleError = { msg: string };
            const result = tryCatch<number, SimpleError>(
                () => {
                    throw 'Something went wrong';
                },
                stdErr => ({ msg: stdErr.message || 'Unknown' })
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.msg).toBe('Something went wrong');
            }
        });

        it('should pass normalized StdError to mapError function', () => {
            const mapErrorFn = jest.fn(stdErr => ({
                transformed: true,
                originalName: stdErr.name,
                originalMessage: stdErr.message,
            }));

            const result = tryCatch(() => {
                throw new Error('Test');
            }, mapErrorFn);

            expect(mapErrorFn).toHaveBeenCalledTimes(1);
            expect(mapErrorFn.mock.calls[0][0]).toBeInstanceOf(Error);
            expect(mapErrorFn.mock.calls[0][0].name).toBe('Error');
            expect(mapErrorFn.mock.calls[0][0].message).toBe('Test');

            if (!result.ok) {
                expect(result.error.transformed).toBe(true);
                expect(result.error.originalName).toBe('Error');
                expect(result.error.originalMessage).toBe('Test');
            }
        });
    });

    describe('asynchronous', () => {
        it('should return success result when async function resolves', async () => {
            const result = await tryCatch(async () => {
                return Promise.resolve(123);
            });
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBe(123);
                expect(result.error).toBeNull();
            }
        });

        it('should return standardized error when async function throws', async () => {
            const result = await tryCatch(async () => {
                throw new Error('Async boom');
            });
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(Error);
                expect(result.error.message).toBe('Async boom');
                expect(result.error.toString()).toContain('Error: Async boom');
            }
        });

        it('should standardize rejection from returned promise', async () => {
            const result = await tryCatch(() => Promise.reject('Rejected value'));
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(Error);
                expect(result.error.message).toBe('Rejected value');
                expect(result.error.toString()).toContain('Error: Rejected value');
            }
        });

        it('should transform async error using mapError function', async () => {
            type CustomError = { code: string; details: string };
            const result = await tryCatch<number, CustomError>(
                async () => {
                    throw new Error('Async error');
                },
                stdErr => ({
                    code: stdErr.name || 'UNKNOWN',
                    details: stdErr.message || 'No details',
                })
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.code).toBe('Error');
                expect(result.error.details).toBe('Async error');
            }
        });

        it('should transform promise rejection using mapError', async () => {
            type SimpleError = { msg: string };
            const result = await tryCatch<number, SimpleError>(
                () => Promise.reject('Rejected'),
                stdErr => ({ msg: stdErr.message || 'Unknown' })
            );

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.msg).toBe('Rejected');
            }
        });

        it('should pass normalized StdError to mapError function in async context', async () => {
            const mapErrorFn = jest.fn(stdErr => ({
                transformed: true,
                originalName: stdErr.name,
                originalMessage: stdErr.message,
            }));

            const result = await tryCatch(async () => {
                throw new Error('Async test');
            }, mapErrorFn);

            expect(mapErrorFn).toHaveBeenCalledTimes(1);
            expect(mapErrorFn.mock.calls[0][0]).toBeInstanceOf(Error);
            expect(mapErrorFn.mock.calls[0][0].name).toBe('Error');
            expect(mapErrorFn.mock.calls[0][0].message).toBe('Async test');

            if (!result.ok) {
                expect(result.error.transformed).toBe(true);
                expect(result.error.originalName).toBe('Error');
                expect(result.error.originalMessage).toBe('Async test');
            }
        });
    });
});
