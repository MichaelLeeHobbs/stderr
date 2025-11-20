// test/stderr.promiserace.test.ts
// Test script to reproduce the fetch error handling issue with Promise.race

import { stderr } from '../src';

// Enable toString patching for these tests
// stderr.patchToString = true; // use stderr(e, {patchToString: true}) to avoid global side effects

// Simulate fetchTimeout implementation
async function fetchTimeout(input: string | URL | Request, init: RequestInit & { timeout?: number } = {}): Promise<Response> {
    const { timeout, signal, ...rest } = init;

    if (!timeout || timeout <= 0) return fetch(input, init);

    const controller = new AbortController();

    const onExternalAbort = () => {
        try {
            controller.abort(signal?.reason);
        } catch {
            controller.abort();
        }
    };

    if (signal) {
        if (signal.aborted) {
            onExternalAbort();
        } else {
            signal.addEventListener('abort', onExternalAbort, { once: true });
        }
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
        const fetchPromise = fetch(input, { ...rest, signal: controller.signal });

        const timeoutPromise = new Promise<Response>((_, reject) => {
            timer = setTimeout(() => {
                controller.abort();
                reject(new Error(`Fetch timed out (${timeout}ms)`));
            }, timeout);
        });

        return await Promise.race([fetchPromise, timeoutPromise]);
    } finally {
        if (timer) clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onExternalAbort);
    }
}

describe('stderr with Promise.race and fetch errors', () => {
    // Skip tests if fetch is not available
    const hasFetch = typeof fetch !== 'undefined';

    describe('Direct fetch error', () => {
        it('should properly normalize a direct fetch error', async () => {
            if (!hasFetch) {
                console.log('Skipping: fetch not available');
                return;
            }

            try {
                await fetch('https://invalid-host-that-does-not-exist-12345.com');
                fail('Should have thrown an error');
            } catch (e) {
                console.log('\n=== Test 1: Direct fetch error ===');
                console.log('Original error type:', (e as Error)?.constructor?.name);
                console.log('Original error message:', (e as Error).message);

                const normalized = stderr(e, { patchToString: true });

                // Assertions
                expect(normalized).toBeInstanceOf(Error);
                expect(normalized.message).toBeDefined();
                expect(normalized.message).toBe('fetch failed');
                expect(normalized.name).toBe('TypeError');

                // Verify cause is preserved
                expect(normalized.cause).toBeDefined();
                expect(normalized.cause).toBeInstanceOf(Error);

                // toString should return something meaningful with patchToString
                expect(typeof normalized.toString).toBe('function');
                const toStringResult = normalized.toString();
                expect(toStringResult).toBeDefined();
                expect(typeof toStringResult).toBe('string');
                expect(toStringResult.length).toBeGreaterThan(0);

                // Verify toString includes error details when patched
                expect(toStringResult).toContain('TypeError');
                expect(toStringResult).toContain('fetch failed');
                // Verify cause chain is shown in toString
                expect(toStringResult).toContain('[cause]');

                console.log('✓ toString() includes error name and message');
                console.log('✓ toString() includes cause chain');
                console.log('✓ toString() length:', toStringResult.length, 'characters');
            }
        }, 10000);
    });

    describe('Fetch error through Promise.race', () => {
        it('should properly normalize a fetch error thrown from Promise.race', async () => {
            if (!hasFetch) {
                console.log('Skipping: fetch not available');
                return;
            }

            try {
                const fetchPromise = fetch('https://invalid-host-that-does-not-exist-12345.com');
                const timeoutPromise = new Promise<Response>((_, reject) => {
                    setTimeout(() => reject(new Error('Timeout')), 5000);
                });
                await Promise.race([fetchPromise, timeoutPromise]);
                fail('Should have thrown an error');
            } catch (e) {
                console.log('\n=== Test 2: Fetch error through Promise.race ===');
                console.log('Original error type:', (e as Error)?.constructor?.name);
                console.log('Original error message:', (e as Error).message);

                const normalized = stderr(e, { patchToString: true });

                // Assertions - errors from Promise.race should behave the same as direct errors
                expect(normalized).toBeInstanceOf(Error);
                expect(normalized.message).toBeDefined();
                expect(normalized.message).toBe('fetch failed');
                expect(normalized.name).toBe('TypeError');

                // Verify cause is preserved
                expect(normalized.cause).toBeDefined();
                expect(normalized.cause).toBeInstanceOf(Error);

                // toString should return something meaningful
                expect(typeof normalized.toString).toBe('function');
                const toStringResult = normalized.toString();
                expect(toStringResult).toBeDefined();
                expect(typeof toStringResult).toBe('string');
                expect(toStringResult.length).toBeGreaterThan(0);

                // Verify toString includes error details
                expect(toStringResult).toContain('TypeError');
                expect(toStringResult).toContain('fetch failed');
                expect(toStringResult).toContain('[cause]');

                console.log('✓ Error from Promise.race normalized correctly');
                console.log('✓ toString() works correctly with Promise.race errors');
            }
        }, 10000);
    });

    describe('Fetch error through fetchTimeout', () => {
        it('should properly normalize a fetch error from fetchTimeout function', async () => {
            if (!hasFetch) {
                console.log('Skipping: fetch not available');
                return;
            }

            try {
                await fetchTimeout('https://invalid-host-that-does-not-exist-12345.com', { timeout: 5000 });
                fail('Should have thrown an error');
            } catch (e) {
                console.log('\n=== Test 3: Fetch error through fetchTimeout ===');
                console.log('Original error type:', (e as Error)?.constructor?.name);
                console.log('Original error message:', (e as Error).message);

                const normalized = stderr(e, { patchToString: true });

                // Assertions - same as other fetch error tests
                expect(normalized).toBeInstanceOf(Error);
                expect(normalized.message).toBeDefined();
                expect(normalized.message).toBe('fetch failed');
                expect(normalized.name).toBe('TypeError');

                // Verify cause is preserved
                expect(normalized.cause).toBeDefined();
                expect(normalized.cause).toBeInstanceOf(Error);

                // toString should return something meaningful
                expect(typeof normalized.toString).toBe('function');
                const toStringResult = normalized.toString();
                expect(toStringResult).toBeDefined();
                expect(typeof toStringResult).toBe('string');
                expect(toStringResult.length).toBeGreaterThan(0);

                // Verify toString includes error details
                expect(toStringResult).toContain('TypeError');
                expect(toStringResult).toContain('fetch failed');
                expect(toStringResult).toContain('[cause]');

                console.log('✓ Error from fetchTimeout normalized correctly');
                console.log('✓ toString() works correctly with fetchTimeout errors');
            }
        }, 10000);
    });

    describe('Edge cases with Promise.race and various error types', () => {
        it('should handle TypeError from Promise.race', async () => {
            try {
                const p1 = Promise.reject(new TypeError('Type error from promise'));
                const p2 = new Promise(resolve => setTimeout(resolve, 1000));
                await Promise.race([p1, p2]);
                fail('Should have thrown an error');
            } catch (e) {
                const normalized = stderr(e, { patchToString: true });
                console.log('\n=== TypeError from Promise.race ===');
                console.log('normalized.toString():', normalized.toString());

                expect(normalized).toBeInstanceOf(Error);
                expect(normalized.name).toBe('TypeError');
                expect(normalized.message).toBe('Type error from promise');
            }
        });

        it('should handle custom error objects from Promise.race', async () => {
            try {
                const customError = {
                    name: 'CustomError',
                    message: 'Custom error from promise',
                    code: 'CUSTOM_CODE',
                    metadata: { foo: 'bar' },
                };
                const p1 = Promise.reject(customError);
                const p2 = new Promise(resolve => setTimeout(resolve, 1000));
                await Promise.race([p1, p2]);
                fail('Should have thrown an error');
            } catch (e) {
                const normalized = stderr(e, { patchToString: true });
                console.log('\n=== Custom error from Promise.race ===');
                console.log('normalized.toString():', normalized.toString());
                console.log('normalized:', JSON.stringify(normalized, null, 2));

                expect(normalized).toBeInstanceOf(Error);
                expect(normalized.name).toBe('CustomError');
                expect(normalized.message).toBe('Custom error from promise');
                expect((normalized as { code: string }).code).toBe('CUSTOM_CODE');
                expect((normalized as { metadata: { foo: string } }).metadata).toEqual({ foo: 'bar' });
            }
        });

        it('should handle errors with cause chain from Promise.race', async () => {
            try {
                const rootCause = new Error('Root cause');
                const midError = new Error('Middle error', { cause: rootCause });
                const topError = new Error('Top error', { cause: midError });

                const p1 = Promise.reject(topError);
                const p2 = new Promise(resolve => setTimeout(resolve, 1000));
                await Promise.race([p1, p2]);
                fail('Should have thrown an error');
            } catch (e) {
                const normalized = stderr(e, { patchToString: true });
                console.log('\n=== Error with cause chain from Promise.race ===');
                console.log('normalized.toString():', normalized.toString());

                expect(normalized).toBeInstanceOf(Error);
                expect(normalized.message).toBe('Top error');
                expect(normalized.cause).toBeInstanceOf(Error);
                expect((normalized.cause as Error).message).toBe('Middle error');
                expect((normalized.cause as { cause: Error }).cause).toBeInstanceOf(Error);
                expect(((normalized.cause as { cause: Error }).cause as Error).message).toBe('Root cause');
            }
        });

        it('should handle non-error values from Promise.race', async () => {
            try {
                const p1 = Promise.reject('Plain string error');
                const p2 = new Promise(resolve => setTimeout(resolve, 1000));
                await Promise.race([p1, p2]);
                fail('Should have thrown an error');
            } catch (e) {
                const normalized = stderr(e, { patchToString: true });
                console.log('\n=== Plain string from Promise.race ===');
                console.log('normalized.toString():', normalized.toString());

                expect(normalized).toBeInstanceOf(Error);
                expect(normalized.message).toBe('Plain string error');
            }
        });

        it('should handle null/undefined from Promise.race', async () => {
            try {
                const p1 = Promise.reject(null);
                const p2 = new Promise(resolve => setTimeout(resolve, 1000));
                await Promise.race([p1, p2]);
                fail('Should have thrown an error');
            } catch (e) {
                const normalized = stderr(e, { patchToString: true });
                console.log('\n=== Null from Promise.race ===');
                console.log('normalized.toString():', normalized.toString());

                expect(normalized).toBeInstanceOf(Error);
                expect(normalized.message).toBe('Unknown error (Null)');
            }
        });
    });
});
