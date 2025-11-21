// test/tryCatch.fuzz.test.ts
import fc from 'fast-check';
import { tryCatch } from '../src';
import { StdError } from '../src/StdError';

describe('tryCatch fuzzing tests', () => {
    describe('Property: Always returns Result', () => {
        it('returns Result for any sync function', () => {
            fc.assert(
                fc.property(fc.anything(), value => {
                    const result = tryCatch(() => value);
                    // Must have ok property
                    expect(result).toHaveProperty('ok');
                    expect(typeof result.ok).toBe('boolean');

                    if (result.ok) {
                        expect(result.value).toBe(value);
                        expect(result.error).toBeNull();
                    } else {
                        expect(result.value).toBeNull();
                        expect(result.error).toBeInstanceOf(Error);
                    }
                }),
                { numRuns: 500 }
            );
        });

        it('returns Result for any async function', async () => {
            await fc.assert(
                fc.asyncProperty(fc.anything(), async value => {
                    const result = await tryCatch(async () => value);

                    expect(result).toHaveProperty('ok');
                    expect(typeof result.ok).toBe('boolean');

                    if (result.ok) {
                        expect(result.value).toBe(value);
                        expect(result.error).toBeNull();
                    } else {
                        expect(result.value).toBeNull();
                        expect(result.error).toBeInstanceOf(Error);
                    }
                }),
                { numRuns: 200 }
            );
        });
    });

    describe('Property: Success path', () => {
        it('captures successful sync execution', () => {
            fc.assert(
                fc.property(fc.anything(), value => {
                    const result = tryCatch(() => value);
                    expect(result.ok).toBe(true);
                    if (result.ok) {
                        expect(result.value).toBe(value);
                    }
                })
            );
        });

        it('captures successful async execution', async () => {
            await fc.assert(
                fc.asyncProperty(fc.anything(), async value => {
                    const result = await tryCatch(async () => value);
                    expect(result.ok).toBe(true);
                    if (result.ok) {
                        expect(result.value).toBe(value);
                    }
                }),
                { numRuns: 200 }
            );
        });
    });

    describe('Property: Error path', () => {
        it('captures thrown errors with normalized StdError', () => {
            fc.assert(
                fc.property(fc.anything(), errorValue => {
                    const result = tryCatch(() => {
                        throw errorValue;
                    });

                    expect(result.ok).toBe(false);
                    if (!result.ok) {
                        // Should be an Error instance with StdError properties
                        expect(result.error).toBeInstanceOf(Error);
                        expect(result.error.name).toBeDefined();
                        expect(result.error.message).toBeDefined();
                        expect(result.value).toBeNull();
                    }
                }),
                { numRuns: 500 }
            );
        });

        it('captures async thrown errors with normalized StdError', async () => {
            await fc.assert(
                fc.asyncProperty(fc.anything(), async errorValue => {
                    const result = await tryCatch(async () => {
                        throw errorValue;
                    });

                    expect(result.ok).toBe(false);
                    if (!result.ok) {
                        // Should be an Error instance with StdError properties
                        expect(result.error).toBeInstanceOf(Error);
                        expect(result.error.name).toBeDefined();
                        expect(result.error.message).toBeDefined();
                        expect(result.value).toBeNull();
                    }
                }),
                { numRuns: 200 }
            );
        });

        it('captures rejected promises with normalized StdError', async () => {
            await fc.assert(
                fc.asyncProperty(fc.anything(), async errorValue => {
                    const result = await tryCatch(() => Promise.reject(errorValue));

                    expect(result.ok).toBe(false);
                    if (!result.ok) {
                        // StdError should be an Error instance
                        expect(result.error).toBeInstanceOf(Error);
                        // Should have StdError properties (name, message, etc.)
                        expect(result.error.name).toBeDefined();
                        expect(result.error.message).toBeDefined();
                        expect(result.value).toBeNull();
                    }
                }),
                { numRuns: 200 }
            );
        });
    });

    describe('Property: mapError transformation', () => {
        it('transforms errors via mapError for any error type', () => {
            fc.assert(
                fc.property(fc.anything(), errorValue => {
                    const result = tryCatch(
                        () => {
                            throw errorValue;
                        },
                        stdErr => ({
                            code: stdErr.name || 'UNKNOWN',
                            msg: stdErr.message || '',
                        })
                    );

                    expect(result.ok).toBe(false);
                    if (!result.ok) {
                        expect(result.error).toHaveProperty('code');
                        expect(result.error).toHaveProperty('msg');
                        expect(typeof result.error.code).toBe('string');
                        expect(typeof result.error.msg).toBe('string');
                    }
                }),
                { numRuns: 500 }
            );
        });

        it('transforms async errors via mapError', async () => {
            await fc.assert(
                fc.asyncProperty(fc.anything(), async errorValue => {
                    const result = await tryCatch(
                        async () => {
                            throw errorValue;
                        },
                        stdErr => ({
                            code: stdErr.name || 'UNKNOWN',
                            msg: stdErr.message || '',
                        })
                    );

                    expect(result.ok).toBe(false);
                    if (!result.ok) {
                        expect(result.error).toHaveProperty('code');
                        expect(result.error).toHaveProperty('msg');
                    }
                }),
                { numRuns: 200 }
            );
        });

        it('mapError always receives StdError instance', () => {
            fc.assert(
                fc.property(fc.anything(), errorValue => {
                    let receivedError: unknown;
                    const result = tryCatch(
                        () => {
                            throw errorValue;
                        },
                        stdErr => {
                            receivedError = stdErr;
                            return { transformed: true };
                        }
                    );

                    expect(result.ok).toBe(false);
                    expect(receivedError).toBeInstanceOf(StdError);
                }),
                { numRuns: 300 }
            );
        });
    });

    describe('Property: Type discrimination works correctly', () => {
        it('correctly identifies sync vs async functions', () => {
            fc.assert(
                fc.property(fc.anything(), value => {
                    const syncResult = tryCatch(() => value);
                    const asyncResult = tryCatch(async () => value);

                    // Sync should return Result directly
                    expect(syncResult).toHaveProperty('ok');

                    // Async should return Promise
                    expect(asyncResult).toBeInstanceOf(Promise);
                })
            );
        });

        it('handles functions returning promises', async () => {
            await fc.assert(
                fc.asyncProperty(fc.anything(), async value => {
                    const result = await tryCatch(() => Promise.resolve(value));

                    expect(result.ok).toBe(true);
                    if (result.ok) {
                        expect(result.value).toBe(value);
                    }
                }),
                { numRuns: 200 }
            );
        });
    });

    describe('Property: Handles edge cases', () => {
        it('handles functions that return undefined', () => {
            const result = tryCatch(() => undefined);
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBeUndefined();
            }
        });

        it('handles functions that return null', () => {
            const result = tryCatch(() => null);
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.value).toBeNull();
            }
        });

        it('handles functions throwing null', () => {
            const result = tryCatch(() => {
                throw null;
            });
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(StdError);
            }
        });

        it('handles functions throwing undefined', () => {
            const result = tryCatch(() => {
                throw undefined;
            });
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(StdError);
            }
        });
    });
});
