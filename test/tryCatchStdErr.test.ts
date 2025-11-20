// test/tryCatchStdErr.test.ts
import { tryCatchStdErr } from '../src/tryCatchStdErr';

describe('tryCatchStdErr', () => {
    describe('synchronous', () => {
        it('should return success result when function succeeds', () => {
            const result = tryCatchStdErr(() => 42);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data).toBe(42);
                expect(result.error).toBeNull();
            }
        });

        it('should return standardized error when function throws Error', () => {
            const originalError = new Error('Test error');
            const result = tryCatchStdErr(() => {
                throw originalError;
            });

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.data).toBeNull();
                expect(result.error).toBeInstanceOf(Error);
                expect(result.error.message).toBe('Test error');
                expect(result.error.toString()).toContain('Error: Test error');
            }
        });

        it('should standardize string errors', () => {
            const result = tryCatchStdErr(() => {
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
            const result = tryCatchStdErr(() => {
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
            const result = tryCatchStdErr(() => {
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
            const result = tryCatchStdErr(() => {
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
            const result = tryCatchStdErr(() => {
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
            const result = tryCatchStdErr(() => undefined);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data).toBeUndefined();
                expect(result.error).toBeNull();
            }
        });

        it('should preserve type narrowing', () => {
            const result = tryCatchStdErr(() => 'test string');

            if (result.ok) {
                // TypeScript should know result.data is string
                const upperCase: string = result.data.toUpperCase();
                expect(upperCase).toBe('TEST STRING');
            } else {
                // TypeScript should know result.error is ErrorShape with optional message
                const { message } = result.error; // message may be undefined
                expect(message).toBeDefined();
            }
        });
    });

    describe('asynchronous', () => {
        it('should return success result when async function resolves', async () => {
            const result = await tryCatchStdErr(async () => {
                return Promise.resolve(123);
            });
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data).toBe(123);
                expect(result.error).toBeNull();
            }
        });

        it('should return standardized error when async function throws', async () => {
            const result = await tryCatchStdErr(async () => {
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
            const result = await tryCatchStdErr(() => Promise.reject('Rejected value'));
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(Error);
                expect(result.error.message).toBe('Rejected value');
                expect(result.error.toString()).toContain('Error: Rejected value');
            }
        });
    });
});
