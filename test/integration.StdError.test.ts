// test/integration.StdError.test.ts
/**
 * Integration tests showing how StdError works with the rest of the library
 */
import { StdError } from '../src/StdError';
import { stderr } from '../src/stderr';

describe('StdError Integration', () => {
    describe('Direct Usage', () => {
        it('creates comprehensive error with automatic toString', () => {
            const error = new StdError('Database operation failed', {
                code: 'E_DB_FAIL',
                statusCode: 500,
                cause: new Error('Connection timeout'),
                metadata: {
                    query: 'SELECT * FROM users',
                    timeout: 5000,
                },
            });

            // toString() automatically shows everything
            const str = error.toString();
            expect(str).toContain('Database operation failed');
            expect(str).toContain("code: 'E_DB_FAIL'");
            expect(str).toContain('statusCode: 500');
            expect(str).toContain('[cause]');
            expect(str).toContain('Connection timeout');
            expect(str).toContain('metadata:');
        });

        it('serializes to JSON automatically', () => {
            const error = new StdError('API Error', {
                code: 'E_API',
                statusCode: 404,
                cause: new Error('Resource not found'),
            });

            // JSON.stringify automatically uses toJSON()
            const json = JSON.parse(JSON.stringify(error));
            expect(json.name).toBe('Error');
            expect(json.message).toBe('API Error');
            expect(json.code).toBe('E_API');
            expect(json.statusCode).toBe(404);
            expect(json.cause.message).toBe('Resource not found');
        });

        it('handles AggregateError-style errors', () => {
            const error = new StdError('Validation failed', {
                errors: {
                    email: new Error('Invalid email format'),
                    password: new Error('Password too short'),
                    username: new Error('Username already taken'),
                },
            });

            const str = error.toString();
            expect(str).toContain('[errors]');
            expect(str).toContain('email:');
            expect(str).toContain('Invalid email format');
            expect(str).toContain('password:');
            expect(str).toContain('Password too short');
        });

        it('handles complex nested structures', () => {
            const rootCause = new Error('Network timeout');
            const dbError = new StdError('Database query failed', {
                cause: rootCause,
                query: 'SELECT * FROM users WHERE id = ?',
                params: [123],
            });
            const apiError = new StdError('API request failed', {
                cause: dbError,
                endpoint: '/api/users/123',
                method: 'GET',
                statusCode: 500,
            });

            const str = apiError.toString();
            expect(str).toContain('API request failed');
            expect(str).toContain('Database query failed');
            expect(str).toContain('Network timeout');

            const json = JSON.parse(JSON.stringify(apiError));
            expect(json.message).toBe('API request failed');
            expect(json.cause.message).toBe('Database query failed');
            expect(json.cause.cause.message).toBe('Network timeout');
        });
    });

    describe('Comparison with current stderr', () => {
        it('StdError vs stderr with patchToString', () => {
            // Old way: need to remember patchToString
            const oldError = stderr({
                message: 'Database error',
                code: 'E_DB',
                cause: new Error('Connection failed'),
            });

            // New way: automatic comprehensive toString
            const newError = new StdError('Database error', {
                code: 'E_DB',
                cause: new Error('Connection failed'),
            });

            // Both should show the details
            const oldStr = oldError.toString();
            const newStr = newError.toString();

            expect(oldStr).toContain('E_DB');
            expect(newStr).toContain('E_DB');
            expect(newStr).toContain('[cause]');
        });

        it('demonstrates the simplification', () => {
            // Old: Multiple steps
            const oldWay = stderr('Error occurred');
            JSON.stringify(oldWay); // Need custom handling

            // New: Built-in
            const newWay = new StdError('Error occurred');
            const newStr = newWay.toString(); // Comprehensive automatically
            const newJson = JSON.stringify(newWay); // Automatic toJSON()

            expect(newStr).toContain('Error occurred');
            expect(newJson).toContain('Error occurred');
        });
    });

    describe('Extensibility', () => {
        class HttpError extends StdError {
            constructor(
                message: string,
                public statusCode: number,
                options?: { cause?: unknown; details?: unknown }
            ) {
                super(message, {
                    name: 'HttpError',
                    statusCode,
                    ...options,
                });
            }
        }

        class ValidationError extends StdError {
            constructor(
                message: string,
                public fields: Record<string, string>
            ) {
                super(message, {
                    name: 'ValidationError',
                    errors: Object.entries(fields).reduce(
                        (acc, [key, msg]) => {
                            acc[key] = new Error(msg);
                            return acc;
                        },
                        {} as Record<string, Error>
                    ),
                });
            }
        }

        it('supports custom error classes', () => {
            const error = new HttpError('Not found', 404, {
                details: { resource: 'user', id: 123 },
            });

            expect(error).toBeInstanceOf(StdError);
            expect(error).toBeInstanceOf(HttpError);
            expect(error.name).toBe('HttpError');
            expect(error.statusCode).toBe(404);

            const str = error.toString();
            expect(str).toContain('HttpError');
            expect(str).toContain('statusCode: 404');
        });

        it('supports validation error class', () => {
            const error = new ValidationError('Invalid input', {
                email: 'Invalid format',
                age: 'Must be positive',
            });

            expect(error.name).toBe('ValidationError');
            expect(error.fields).toEqual({
                email: 'Invalid format',
                age: 'Must be positive',
            });

            const str = error.toString();
            expect(str).toContain('ValidationError');
            expect(str).toContain('[errors]');
            expect(str).toContain('email:');
            expect(str).toContain('Invalid format');
        });
    });

    describe('Real-world scenarios', () => {
        it('handles fetch error with cause chain', () => {
            // Simulating a real fetch error scenario
            const networkError = new Error('ECONNREFUSED');
            const fetchError = new StdError('fetch failed', {
                cause: networkError,
                url: 'https://api.example.com/data',
                method: 'GET',
            });
            const appError = new StdError('Failed to load user data', {
                cause: fetchError,
                userId: 123,
                operation: 'loadUserProfile',
            });

            const str = appError.toString();
            expect(str).toContain('Failed to load user data');
            expect(str).toContain('fetch failed');
            expect(str).toContain('ECONNREFUSED');
            expect(str).toContain('userId: 123');

            const json = JSON.parse(JSON.stringify(appError));
            expect(json.userId).toBe(123);
            expect(json.cause.url).toBe('https://api.example.com/data');
            expect(json.cause.cause.message).toBe('ECONNREFUSED');
        });

        it('handles database ORM error', () => {
            // Simulating a Sequelize/Mongoose style error
            const error = new StdError('User validation failed', {
                name: 'ValidationError',
                errors: {
                    email: new StdError('Email is required', {
                        kind: 'required',
                        path: 'email',
                    }),
                    age: new StdError('Age must be positive', {
                        kind: 'min',
                        path: 'age',
                        value: -5,
                    }),
                },
            });

            const str = error.toString();
            expect(str).toContain('ValidationError');
            expect(str).toContain('email:');
            expect(str).toContain('Email is required');
            expect(str).toContain("kind: 'required'");
            expect(str).toContain('age:');
            expect(str).toContain('value: -5');
        });

        it('handles concurrent operation errors', () => {
            const errors = [
                new StdError('Failed to process item 1', { itemId: 1 }),
                new StdError('Failed to process item 2', { itemId: 2 }),
                new StdError('Failed to process item 3', { itemId: 3 }),
            ];

            const aggregateError = new StdError('Batch operation failed', {
                errors,
                totalItems: 10,
                failedItems: 3,
                successItems: 7,
            });

            const str = aggregateError.toString();
            expect(str).toContain('Batch operation failed');
            expect(str).toContain('totalItems: 10');
            expect(str).toContain('[errors]');
            expect(str).toContain('Failed to process item 1');

            const json = JSON.parse(JSON.stringify(aggregateError));
            expect(json.totalItems).toBe(10);
            expect(Array.isArray(json.errors)).toBe(true);
            expect(json.errors[0].message).toBe('Failed to process item 1');
        });
    });
});
