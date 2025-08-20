// test/tryCatch.test.ts
import { tryCatch } from '../src';

describe('tryCatch', () => {
    describe('successful promises', () => {
        it('returns success result for resolved promise', async () => {
            const promise = Promise.resolve('success');
            const result = await tryCatch(promise);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data).toBe('success');
                expect(result.error).toBeNull();
            }
        });

        it('handles complex data types', async () => {
            const complexData = { id: 1, items: ['a', 'b'], nested: { value: true } };
            const promise = Promise.resolve(complexData);
            const result = await tryCatch(promise);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data).toEqual(complexData);
            }
        });

        it('handles null as valid data', async () => {
            const promise = Promise.resolve(null);
            const result = await tryCatch(promise);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data).toBeNull();
            }
        });

        it('handles undefined as valid data', async () => {
            const promise = Promise.resolve(undefined);
            const result = await tryCatch(promise);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data).toBeUndefined();
            }
        });
    });

    describe('failed promises', () => {
        it('returns failure result for rejected promise', async () => {
            const expectedError = new Error('failure');
            const promise = Promise.reject(expectedError);
            const result = await tryCatch(promise);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBe(expectedError);
                expect(result.data).toBeNull();
            }
        });

        it('handles string rejection', async () => {
            const promise = Promise.reject('string error');
            const result = await tryCatch(promise);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBe('string error');
            }
        });

        it('handles null rejection', async () => {
            const promise = Promise.reject(null);
            const result = await tryCatch(promise);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeNull();
            }
        });

        it('handles undefined rejection', async () => {
            const promise = Promise.reject(undefined);
            const result = await tryCatch(promise);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeUndefined();
            }
        });
    });

    describe('error mapping', () => {
        it('transforms error using mapError function', async () => {
            const originalError = new Error('original');
            const mappedError = new Error('mapped');
            const mapError = jest.fn(() => mappedError);

            const promise = Promise.reject(originalError);
            const result = await tryCatch(promise, mapError);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBe(mappedError);
                expect(mapError).toHaveBeenCalledWith(originalError);
                expect(mapError).toHaveBeenCalledTimes(1);
            }
        });

        it('mapError receives unknown type', async () => {
            const mapError = jest.fn((err: unknown) => {
                if (err instanceof Error) {
                    return new Error(`Wrapped: ${err.message}`);
                }
                return new Error(`Unknown: ${String(err)}`);
            });

            const promise = Promise.reject(new Error('test'));
            const result = await tryCatch(promise, mapError);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(Error);
                expect(result.error.message).toBe('Wrapped: test');
            }
        });

        it('mapError can return non-Error types', async () => {
            interface CustomError {
                code: string;
                details: string;
            }

            const mapError = (err: unknown): CustomError => ({
                code: 'CUSTOM',
                details: String(err),
            });

            const promise = Promise.reject('something went wrong');
            const result = await tryCatch<string, CustomError>(promise, mapError);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toEqual({ code: 'CUSTOM', details: 'something went wrong' });
            }
        });

        it('handles mapError that throws', async () => {
            const mapError = () => {
                throw new Error('mapError failed');
            };

            const promise = Promise.reject('original error');

            // The error from mapError will propagate
            await expect(tryCatch(promise, mapError)).rejects.toThrow('mapError failed');
        });
    });

    describe('type safety', () => {
        it('works with generic type parameters', async () => {
            interface User {
                id: number;
                name: string;
            }

            class ApiError extends Error {
                constructor(
                    message: string,
                    public statusCode: number
                ) {
                    super(message);
                    this.name = 'ApiError';
                }
            }

            const fetchUser = async (): Promise<User> => {
                return { id: 1, name: 'John' };
            };

            const result = await tryCatch<User, ApiError>(fetchUser(), err => new ApiError(String(err), 500));

            if (!result.ok) {
                expect(result.error).toBeInstanceOf(ApiError);
                expect(result.error.statusCode).toBe(500);
            } else {
                expect(result.data).toEqual({ id: 1, name: 'John' });
            }
        });
    });

    describe('real-world scenarios', () => {
        it('handles fetch-like operations', async () => {
            const mockFetch = (shouldFail: boolean) => {
                if (shouldFail) {
                    return Promise.reject(new Error('Network error'));
                }
                return Promise.resolve({ ok: true, data: 'response' });
            };

            // Success case
            const result1 = await tryCatch(mockFetch(false));
            expect(result1.ok).toBe(true);
            if (result1.ok) {
                expect(result1.data).toEqual({ ok: true, data: 'response' });
            }

            // Failure case
            const result2 = await tryCatch(mockFetch(true));
            expect(result2.ok).toBe(false);
            if (!result2.ok) {
                expect(result2.error).toBeInstanceOf(Error);
                expect((result2.error as Error).message).toBe('Network error');
            }
        });

        it('works with async/await in the promise', async () => {
            const asyncOperation = async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return 'delayed result';
            };

            const result = await tryCatch(asyncOperation());
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data).toBe('delayed result');
            }
        });

        it('chains multiple operations with proper type narrowing', async () => {
            const operation1 = () => Promise.resolve(5);
            const operation2 = (n: number) => Promise.resolve(n * 2);
            const operation3 = (n: number) => Promise.resolve(n + 3);

            const result1 = await tryCatch(operation1());
            if (!result1.ok) {
                fail('Operation 1 should not fail');
            }

            // TypeScript knows result1.data is number here
            const result2 = await tryCatch(operation2(result1.data));
            if (!result2.ok) {
                fail('Operation 2 should not fail');
            }

            // TypeScript knows result2.data is number here
            const result3 = await tryCatch(operation3(result2.data));
            expect(result3.ok).toBe(true);
            if (result3.ok) {
                expect(result3.data).toBe(13); // (5 * 2) + 3
            }
        });
    });
});
