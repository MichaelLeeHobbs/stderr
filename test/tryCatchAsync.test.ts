// test/tryCatchAsync.test.ts
import { tryCatchAsync } from '../src/tryCatchAsync';
import { StdError } from '../src/StdError';

describe('tryCatchAsync', () => {
    describe('successful promises', () => {
        it('returns success result for resolved promise', async () => {
            const promise = Promise.resolve(42);
            const result = await tryCatchAsync(promise);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data).toBe(42);
                expect(result.error).toBeNull();
            }
        });

        it('preserves the resolved value type', async () => {
            const promise = Promise.resolve({ value: 'test', count: 123 });
            const result = await tryCatchAsync(promise);

            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.data).toEqual({ value: 'test', count: 123 });
            }
        });
    });

    describe('failed promises', () => {
        it('returns failure result for rejected promise', async () => {
            const expectedError = new Error('failure');
            const promise = Promise.reject(expectedError);
            const result = await tryCatchAsync(promise);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                // Error is normalized via stderr to StdError
                expect(result.error).toBeInstanceOf(StdError);
                expect(result.error.message).toBe('failure');
                expect(result.data).toBeNull();
            }
        });

        it('normalizes string rejection to StdError', async () => {
            const promise = Promise.reject('string error');
            const result = await tryCatchAsync(promise);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(StdError);
                expect(result.error.message).toBe('string error');
            }
        });

        it('normalizes null rejection to StdError', async () => {
            const promise = Promise.reject(null);
            const result = await tryCatchAsync(promise);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(StdError);
                expect(result.error.message).toBe('Unknown error (Null)');
            }
        });

        it('normalizes undefined rejection to StdError', async () => {
            const promise = Promise.reject(undefined);
            const result = await tryCatchAsync(promise);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(StdError);
                expect(result.error.message).toBe('Unknown error (Undefined)');
            }
        });

        it('preserves error properties via stderr normalization', async () => {
            const error = new Error('custom error');
            (error as Error & { code: string }).code = 'E_CUSTOM';
            const promise = Promise.reject(error);
            const result = await tryCatchAsync(promise);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.message).toBe('custom error');
                expect((result.error as StdError & { code: string }).code).toBe('E_CUSTOM');
            }
        });
    });

    describe('error mapping', () => {
        it('mapError receives normalized StdError', async () => {
            interface CustomError {
                code: string;
                details: string;
            }

            const mapError = (stdErr: StdError): CustomError => ({
                code: 'MAPPED',
                details: stdErr.message,
            });

            const promise = Promise.reject('original error');
            const result = await tryCatchAsync<string, CustomError>(promise, mapError);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toEqual({ code: 'MAPPED', details: 'original error' });
            }
        });

        it('mapError can access StdError properties', async () => {
            interface ErrorSummary {
                name: string;
                message: string;
                hasStack: boolean;
            }

            const mapError = (stdErr: StdError): ErrorSummary => ({
                name: stdErr.name,
                message: stdErr.message,
                hasStack: Boolean(stdErr.stack),
            });

            const error = new Error('test error');
            error.name = 'CustomError';
            const promise = Promise.reject(error);
            const result = await tryCatchAsync<string, ErrorSummary>(promise, mapError);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.name).toBe('CustomError');
                expect(result.error.message).toBe('test error');
                expect(result.error.hasStack).toBe(true);
            }
        });

        it('mapError can return non-Error types', async () => {
            const mapError = (stdErr: StdError) => ({
                success: false,
                errorCode: 500,
                errorMessage: stdErr.message,
            });

            const promise = Promise.reject('server error');
            const result = await tryCatchAsync(promise, mapError);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toEqual({
                    success: false,
                    errorCode: 500,
                    errorMessage: 'server error',
                });
            }
        });
    });

    describe('type safety', () => {
        it('narrows types correctly in success branch', async () => {
            const result = await tryCatchAsync(Promise.resolve('test'));

            if (result.ok) {
                // TypeScript knows result.data is string here
                const len: number = result.data.length;
                expect(len).toBe(4);
            }
        });

        it('narrows types correctly in failure branch', async () => {
            const result = await tryCatchAsync(Promise.reject('error'));

            if (!result.ok) {
                // TypeScript knows result.error is StdError here
                const msg: string = result.error.message;
                expect(msg).toBe('error');
            }
        });
    });

    describe('chaining operations', () => {
        it('supports chaining with early returns', async () => {
            const getNumber = () => Promise.resolve(10);
            const double = (n: number) => Promise.resolve(n * 2);
            const square = (n: number) => Promise.resolve(n * n);

            const r1 = await tryCatchAsync(getNumber());
            if (!r1.ok) return;

            const r2 = await tryCatchAsync(double(r1.data));
            if (!r2.ok) return;

            const r3 = await tryCatchAsync(square(r2.data));
            if (!r3.ok) return;

            expect(r3.data).toBe(400); // (10 * 2)^2 = 400
        });

        it('stops chain on first failure', async () => {
            const getNumber = () => Promise.resolve(10);
            const failingOp = () => Promise.reject('operation failed');

            const r1 = await tryCatchAsync(getNumber());
            if (!r1.ok) {
                fail('First operation should succeed');
                return;
            }

            const r2 = await tryCatchAsync(failingOp());
            if (!r2.ok) {
                expect(r2.error.message).toBe('operation failed');
                return; // Chain stops here
            }

            // This should not be reached - fail if we get here
            fail('Should not reach here due to early return');
        });
    });

    describe('comprehensive toString and toJSON', () => {
        it('errors have comprehensive toString via StdError', async () => {
            const error = new Error('detailed error');
            (error as Error & { code: string }).code = 'E_DETAIL';
            const promise = Promise.reject(error);
            const result = await tryCatchAsync(promise);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                const str = result.error.toString();
                expect(str).toContain('detailed error');
                expect(str).toContain('E_DETAIL');
            }
        });

        it('errors are JSON serializable via StdError', async () => {
            const error = new Error('json error');
            (error as Error & { metadata: unknown }).metadata = { key: 'value' };
            const promise = Promise.reject(error);
            const result = await tryCatchAsync(promise);

            expect(result.ok).toBe(false);
            if (!result.ok) {
                const json = JSON.stringify(result.error);
                expect(json).toContain('json error');
                expect(json).toContain('metadata');
                expect(json).toContain('key');
            }
        });
    });
});
