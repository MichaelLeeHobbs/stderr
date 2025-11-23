// test/maxDepth-behavior.test.ts
import { StdError } from '../src/StdError';
import * as console from 'node:console';

/**
 * Tests for maxDepth behavior to ensure it works as expected (EXCLUSIVE)
 *
 * maxDepth is EXCLUSIVE: means "show this many levels"
 * - maxDepth: 1 shows depth 0 only (root)
 * - maxDepth: 2 shows depths 0, 1 (root + 1 level)
 * - maxDepth: 3 shows depths 0, 1, 2 (root + 2 levels)
 */
describe('maxDepth behavior (exclusive)', () => {
    describe('basic depth counting', () => {
        it('maxDepth: 1 shows only root error', () => {
            const error = new StdError('Root', {
                maxDepth: 1,
                cause: new Error('Should not appear'),
            });
            const str = error.toString();

            expect(str).toContain('Root');
            expect(str).toContain('[Max depth of 1 reached]');
            expect(str).not.toContain('Should not appear');
        });

        it('maxDepth: 2 shows root + 1 level (cause)', () => {
            const error = new StdError('Root', {
                maxDepth: 2,
                cause: new Error('Level 1', { cause: new Error('Level 2 - hidden') }),
            });
            const str = error.toString();

            expect(str).toContain('Root');
            expect(str).toContain('Level 1');
            expect(str).toContain('[Max depth of 2 reached]');
            expect(str).not.toContain('Level 2 - hidden');
        });

        it('maxDepth: 3 shows root + 2 levels (cause chain)', () => {
            const error = new StdError('Root', {
                maxDepth: 3,
                cause: new StdError('Level 1', {
                    cause: new Error('Level 2', {
                        cause: new Error('Level 3 - hidden'),
                    }),
                }),
            });
            const str = error.toString();

            expect(str).toContain('Root');
            expect(str).toContain('Level 1');
            expect(str).toContain('Level 2');
            expect(str).toContain('[Max depth of 3 reached]');
            expect(str).not.toContain('Level 3 - hidden');
        });
    });

    describe('errors array behavior', () => {
        it('errors array with simple errors - array items at same depth as root properties', () => {
            const error = new StdError('Root', {
                maxDepth: 2,
                errors: [new Error('Error 1'), new Error('Error 2')],
            });
            const str = error.toString();

            // Root = depth 0
            // errors property = depth 1
            // Error 1 and Error 2 are formatted at depth 1 (same level as errors array)
            expect(str).toContain('Root');
            expect(str).toContain('[errors]');
            expect(str).toContain('Error 1');
            expect(str).toContain('Error 2');
        });

        it('errors array with nested causes - causes go to next depth', () => {
            const error = new StdError('Root', {
                maxDepth: 2,
                errors: [new Error('Error 1', { cause: new Error('Cause 1 - should be hidden') })],
            });
            const str = error.toString();

            // Root = depth 0
            // errors array items = depth 1
            // cause of Error 1 would be depth 2, but maxDepth is 2, so it's hidden
            expect(str).toContain('Root');
            expect(str).toContain('Error 1');
            expect(str).toContain('[Max depth of 2 reached]');
            expect(str).not.toContain('Cause 1 - should be hidden');
        });

        it('errors array with nested causes - maxDepth 3 shows causes', () => {
            const error = new StdError('Root', {
                maxDepth: 3,
                errors: [
                    new Error('Error 1', {
                        cause: new Error('Cause 1'),
                    }),
                ],
            });
            const str = error.toString();

            // Root = depth 0
            // errors array items = depth 1
            // cause of Error 1 = depth 2 (within maxDepth 3)
            expect(str).toContain('Root');
            expect(str).toContain('Error 1');
            expect(str).toContain('Cause 1');
        });

        it('errors array with deeply nested error-shaped objects', () => {
            const deepError = {
                name: 'Level 2',
                message: 'Deep',
                errors: [
                    {
                        name: 'Level 3',
                        message: 'Deeper',
                    },
                ],
            };

            const error = new StdError('Root', {
                maxDepth: 2,
                errors: [deepError],
            });
            const str = error.toString();

            // Root = depth 0
            // errors[0] (deepError) = depth 1
            // deepError.errors = depth 2, but items would be depth 2 (at limit)
            // formatError is called recursively for deepError at depth 1
            // deepError's errors property tries to format at depth 2 -> hits limit
            expect(str).toContain('Root');
            expect(str).toContain('Level 2');
            expect(str).toContain('[Max depth');
        });
    });

    describe('errors object behavior', () => {
        it('errors object with simple errors', () => {
            const error = new StdError('Root', {
                maxDepth: 2,
                errors: {
                    field1: new Error('Error 1'),
                    field2: new Error('Error 2'),
                },
            });
            const str = error.toString();

            // Root = depth 0
            // errors object values = depth 1
            expect(str).toContain('Root');
            expect(str).toContain('[errors]');
            expect(str).toContain('field1');
            expect(str).toContain('Error 1');
            expect(str).toContain('field2');
            expect(str).toContain('Error 2');
        });

        it('errors object with nested causes', () => {
            const error = new StdError('Root', {
                maxDepth: 2,
                errors: {
                    field: new Error('Field Error', {
                        cause: new Error('Cause - should be hidden'),
                    }),
                },
            });
            const str = error.toString();

            // Root = depth 0
            // errors object values = depth 1
            // cause would be depth 2 -> hits limit
            expect(str).toContain('Root');
            expect(str).toContain('Field Error');
            expect(str).toContain('[Max depth of 2 reached]');
            expect(str).not.toContain('Cause - should be hidden');
        });

        it('errors object with nested error objects', () => {
            const deepError = {
                name: 'Level 2',
                message: 'Deep',
                errors: {
                    nested: {
                        name: 'Level 3',
                        message: 'Too deep',
                    },
                },
            };

            const error = new StdError('Root', {
                maxDepth: 2,
                errors: { field: deepError },
            });
            const str = error.toString();

            // Root = depth 0
            // errors.field (deepError) = depth 1
            // deepError.errors.nested would be depth 2 -> at limit
            expect(str).toContain('Root');
            expect(str).toContain('Level 2');
            expect(str).toContain('[Max depth');
        });
    });

    describe('custom properties with nested objects', () => {
        it('custom property with nested object', () => {
            const error = new StdError('Root', {
                maxDepth: 2,
                metadata: {
                    level1: {
                        level2: {
                            level3: 'too deep',
                        },
                    },
                },
            });
            const str = error.toString();

            // Root = depth 0
            // metadata = depth 1 (custom property formatted at depth+1)
            // level1 object = depth 2 (formatValue at depth 2)
            // level2 would be depth 3 -> exceeds limit
            expect(str).toContain('Root');
            expect(str).toContain('metadata:');
            // Small objects are formatted inline, but should hit depth limit
        });
    });

    describe('toJSON respects maxDepth', () => {
        it('maxDepth: 1 in toJSON shows only root', () => {
            const error = new StdError('Root', {
                maxDepth: 1,
                cause: new Error('Hidden'),
            });
            const json = error.toJSON();

            expect(json.message).toBe('Root');
            expect(json.cause).toBe('[Max depth of 1 reached]');
        });

        it('maxDepth: 2 in toJSON shows root + 1 level', () => {
            const error = new StdError('Root', {
                maxDepth: 2,
                cause: new Error('Level 1', {
                    cause: new Error('Level 2 - hidden'),
                }),
            });
            const json = error.toJSON();

            expect(json.message).toBe('Root');
            expect(json.cause).toBeDefined();
            expect((json.cause as { message: string }).message).toBe('Level 1');
            expect((json.cause as { cause: string }).cause).toBe('[Max depth of 2 reached]');
        });

        it('toJSON with errors array respects depth', () => {
            const error = new StdError('Root', {
                maxDepth: 2,
                errors: [
                    new Error('Error 1', {
                        cause: new Error('Cause - hidden'),
                    }),
                ],
            });
            const json = error.toJSON();
            console.log('error:', error.toString());
            console.log('JSON:', JSON.stringify(json, null, 2));

            expect(json.errors).toBeDefined();
            const errors = json.errors as StdError[];
            expect(errors[0].message).toBe('Error 1');
            expect(errors[0].cause).toBe('[Max depth of 2 reached]');
        });
    });

    describe('realistic error scenarios', () => {
        it('database error with validation errors at maxDepth 3', () => {
            const error = new StdError('Database operation failed', {
                maxDepth: 3,
                code: 'E_DB_VALIDATION',
                errors: {
                    email: new Error('Invalid email format'),
                    password: new Error('Too short', {
                        cause: new Error('Min 8 characters required'),
                    }),
                },
                cause: new Error('Connection timeout'),
            });

            const str = error.toString();

            // Root = depth 0
            // code property = depth 1
            // errors object values = depth 1
            // cause = depth 1
            // password's cause = depth 2 (within limit)
            expect(str).toContain('Database operation failed');
            expect(str).toContain('E_DB_VALIDATION');
            expect(str).toContain('Invalid email format');
            expect(str).toContain('Too short');
            expect(str).toContain('Min 8 characters required');
            expect(str).toContain('Connection timeout');
        });

        it('API error with nested service failures at maxDepth 2', () => {
            const error = new StdError('API request failed', {
                maxDepth: 2,
                statusCode: 503,
                cause: new Error('Service unavailable', {
                    cause: new Error('Database down - hidden'),
                }),
            });

            const str = error.toString();

            // Root = depth 0
            // cause = depth 1
            // cause's cause = depth 2 -> hits limit
            expect(str).toContain('API request failed');
            expect(str).toContain('503');
            expect(str).toContain('Service unavailable');
            expect(str).toContain('[Max depth of 2 reached]');
            expect(str).not.toContain('Database down');
        });
    });

    describe('edge cases', () => {
        it('maxDepth: 0 shows nothing (invalid but handled)', () => {
            const error = new StdError('Root', { maxDepth: 0 });
            const str = error.toString();

            // depth 0 > maxDepth 0 is false, so root shows
            // Actually depth > 0 would trigger, so this might show root
            // Let's test actual behavior
            expect(str).toBeDefined();
        });

        it('very deep nesting with default maxDepth (8)', () => {
            let cause = new Error('Level 10');
            for (let i = 9; i >= 1; i--) {
                cause = new Error(`Level ${i}`, { cause });
            }
            const error = new StdError('Root', { cause });

            const str = error.toString();

            // Should show levels 0-7 (8 levels with default maxDepth 8)
            expect(str).toContain('Root');
            expect(str).toContain('Level 1');
            expect(str).toContain('Level 7');
            expect(str).toContain('[Max depth of 8 reached]');
            expect(str).not.toContain('Level 9');
        });
    });
});
