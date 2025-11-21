// test/stderr.fuzz.test.ts
import fc from 'fast-check';
import { stderr } from '../src';
import { StdError } from '../src/StdError';

describe('stderr fuzzing tests', () => {
    describe('Property: Never throws for any input', () => {
        it('handles any primitive value without throwing', () => {
            fc.assert(
                fc.property(fc.anything(), input => {
                    expect(() => stderr(input)).not.toThrow();
                }),
                { numRuns: 1000 }
            );
        });

        it('handles any array without throwing', () => {
            fc.assert(
                fc.property(fc.array(fc.anything()), input => {
                    expect(() => stderr(input)).not.toThrow();
                }),
                { numRuns: 500 }
            );
        });

        it('handles any object without throwing', () => {
            fc.assert(
                fc.property(fc.object(), input => {
                    expect(() => stderr(input)).not.toThrow();
                }),
                { numRuns: 500 }
            );
        });
    });

    describe('Property: Always returns Error instance', () => {
        it('returns Error instance for any input', () => {
            fc.assert(
                fc.property(fc.anything(), input => {
                    const result = stderr(input);
                    expect(result).toBeInstanceOf(Error);
                    expect(result).toBeInstanceOf(StdError);
                })
            );
        });

        it('returns Error with name property', () => {
            fc.assert(
                fc.property(fc.anything(), input => {
                    const result = stderr(input);
                    expect(typeof result.name).toBe('string');
                    expect((result.name as string).length).toBeGreaterThan(0);
                })
            );
        });

        it('returns Error with message property', () => {
            fc.assert(
                fc.property(fc.anything(), input => {
                    const result = stderr(input);
                    expect(result.message).toBeDefined();
                    // Message can be empty string, but must exist
                    expect(typeof result.message).toBe('string');
                })
            );
        });
    });

    describe('Property: Respects maxDepth bounds', () => {
        it('respects maxDepth option', () => {
            fc.assert(
                fc.property(fc.object({ maxDepth: 3 }), fc.integer({ min: 1, max: 10 }), (obj, maxDepth) => {
                    const result = stderr(obj, { maxDepth });
                    expect(result).toBeInstanceOf(Error);
                    // Should not throw even with custom maxDepth
                }),
                { numRuns: 200 }
            );
        });

        it('handles deeply nested structures with maxDepth', () => {
            // Create a nested structure generator
            const deepObject = fc.letrec(tie => ({
                leaf: fc.record({ value: fc.string() }),
                node: fc.record({
                    value: fc.string(),
                    child: fc.oneof(tie('leaf'), tie('node')),
                }),
            }));

            fc.assert(
                fc.property(deepObject.node, obj => {
                    const result = stderr(obj, { maxDepth: 5 });
                    expect(result).toBeInstanceOf(Error);
                    // toString should not throw
                    expect(() => result.toString()).not.toThrow();
                }),
                { numRuns: 200 }
            );
        });
    });

    describe('Property: Handles circular references', () => {
        it('detects and handles circular references gracefully', () => {
            const createCircular = () => {
                interface CircularObj {
                    message: string;
                    self?: CircularObj;
                }
                const obj: CircularObj = { message: 'circular' };
                obj.self = obj;
                return obj;
            };

            const obj = createCircular();
            expect(() => stderr(obj)).not.toThrow();
            const result = stderr(obj);
            expect(result).toBeInstanceOf(Error);
        });

        it('handles circular references at various depths', () => {
            fc.assert(
                fc.property(fc.integer({ min: 1, max: 5 }), depth => {
                    interface NestedObj {
                        message: string;
                        child?: NestedObj;
                        circular?: NestedObj;
                    }
                    const obj: NestedObj = { message: 'root' };
                    let current = obj;

                    // Create chain of specified depth
                    for (let i = 0; i < depth; i++) {
                        current.child = { message: `level-${i}` };
                        current = current.child;
                    }

                    // Create circular reference
                    current.circular = obj;

                    const result = stderr(obj);
                    expect(result).toBeInstanceOf(Error);
                }),
                { numRuns: 100 }
            );
        });
    });

    describe('Property: toString and toJSON never throw', () => {
        it('toString never throws for any input', () => {
            fc.assert(
                fc.property(fc.anything(), input => {
                    const result = stderr(input);
                    expect(() => result.toString()).not.toThrow();
                    expect(typeof result.toString()).toBe('string');
                })
            );
        });

        it('toJSON never throws for any input', () => {
            fc.assert(
                fc.property(fc.anything(), input => {
                    const result = stderr(input);
                    expect(() => result.toJSON()).not.toThrow();
                    expect(() => JSON.stringify(result)).not.toThrow();
                })
            );
        });
    });

    describe('Property: Handles extreme inputs', () => {
        it('handles very large arrays', () => {
            fc.assert(
                fc.property(fc.array(fc.string(), { minLength: 1000, maxLength: 5000 }), arr => {
                    const result = stderr(arr);
                    expect(result).toBeInstanceOf(Error);
                    // Should handle or truncate large arrays
                }),
                { numRuns: 10 } // Fewer runs for performance
            );
        });

        it('handles objects with many properties', () => {
            fc.assert(
                fc.property(
                    fc.dictionary(fc.string(), fc.anything(), { minKeys: 100, maxKeys: 500 }).filter(obj => {
                        // Filter out objects with __proto__ key to avoid prototype issues
                        return !Object.prototype.hasOwnProperty.call(obj, '__proto__');
                    }),
                    obj => {
                        const result = stderr(obj);
                        expect(result).toBeInstanceOf(Error);
                        // Should handle or truncate large objects
                    }
                ),
                { numRuns: 10 } // Fewer runs for performance
            );
        });

        it('handles very long strings', () => {
            fc.assert(
                fc.property(fc.string({ minLength: 1000, maxLength: 10000 }), str => {
                    const result = stderr(str);
                    expect(result).toBeInstanceOf(Error);
                    expect(result.message).toBeTruthy();
                }),
                { numRuns: 50 }
            );
        });
    });

    describe('Property: Error properties preservation', () => {
        it('preserves error name when present', () => {
            fc.assert(
                fc.property(fc.string({ minLength: 1 }), fc.string(), (name, message) => {
                    const result = stderr({ name, message });
                    expect(result.name).toBe(name);
                }),
                { numRuns: 200 }
            );
        });

        it('preserves error message when present', () => {
            fc.assert(
                fc.property(fc.string(), message => {
                    const result = stderr({ message });
                    expect(result.message).toBe(message);
                }),
                { numRuns: 200 }
            );
        });

        it('preserves cause property when present', () => {
            fc.assert(
                fc.property(fc.string(), fc.string(), (message, causeMessage) => {
                    const cause = new Error(causeMessage);
                    const result = stderr({ message, cause });
                    expect(result.cause).toBeDefined();
                }),
                { numRuns: 200 }
            );
        });
    });

    describe('Property: Options validation', () => {
        it('rejects invalid maxDepth (non-integer)', () => {
            fc.assert(
                fc.property(fc.double(), maxDepth => {
                    if (!Number.isInteger(maxDepth)) {
                        expect(() => stderr('test', { maxDepth })).toThrow(TypeError);
                    }
                }),
                { numRuns: 100 }
            );
        });

        it('rejects maxDepth out of range', () => {
            fc.assert(
                fc.property(fc.integer(), maxDepth => {
                    if (maxDepth < 1 || maxDepth > 1000) {
                        expect(() => stderr('test', { maxDepth })).toThrow(RangeError);
                    } else {
                        expect(() => stderr('test', { maxDepth })).not.toThrow();
                    }
                }),
                { numRuns: 200 }
            );
        });
    });

    describe('Property: Idempotency', () => {
        it('normalizing twice produces equivalent results', () => {
            fc.assert(
                fc.property(fc.anything(), input => {
                    const result1 = stderr(input);
                    const result2 = stderr(result1);

                    // Both should be StdError instances
                    expect(result1).toBeInstanceOf(StdError);
                    expect(result2).toBeInstanceOf(StdError);

                    // Names should match (might be different from input if input was primitive)
                    expect(result2.name).toBe(result1.name);
                    expect(result2.message).toBe(result1.message);
                }),
                { numRuns: 200 }
            );
        });
    });
});
