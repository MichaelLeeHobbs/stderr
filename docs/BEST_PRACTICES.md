# Best Practices Guide

**Project**: stderr-lib v2.0  
**Last Updated**: 2025-11-21

---

## Table of Contents

1. [Promise Handling](#promise-handling)
2. [Exception Usage](#exception-usage)
3. [Error Immutability](#error-immutability)
4. [Security Considerations](#security-considerations)
5. [Performance Tips](#performance-tips)
6. [Testing Recommendations](#testing-recommendations)

---

## Promise Handling

### Always Use tryCatch with Async Operations

```typescript
// ✅ GOOD: Explicit error handling
const result = await tryCatch(async () => {
    return await fetchUser(userId);
});

if (!result.ok) {
    logger.error('User fetch failed', result.error);
    return res.status(500).json({ error: 'Failed to fetch user' });
}

return res.json(result.value);
```

```typescript
// ❌ BAD: Uncaught promise rejections
const user = await fetchUser(userId); // Can throw!
```

### Implement Timeouts in Your Functions

tryCatch does not implement timeouts. Add them in your code:

```typescript
async function fetchWithTimeout(url: string, timeoutMs: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { signal: controller.signal });
        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

// Use with tryCatch
const result = await tryCatch(() => fetchWithTimeout(url, 5000));
if (!result.ok) {
    if (result.error.name === 'AbortError') {
        logger.error('Request timeout');
    }
}
```

### Handle Floating Promises

```typescript
// ❌ BAD: Floating promise (no await)
function processUser(id: string) {
    tryCatch(() => updateUser(id)); // Returns Promise, not awaited!
}

// ✅ GOOD: Properly await
async function processUser(id: string) {
    const result = await tryCatch(async () => updateUser(id));
    if (!result.ok) {
        logger.error('Update failed', result.error);
    }
}

// ✅ ALSO GOOD: Intentional fire-and-forget with error handling
function processUser(id: string) {
    tryCatch(async () => updateUser(id)).then(result => {
        if (!result.ok) {
            logger.error('Update failed', result.error);
        }
    });
}
```

---

## Exception Usage

### When to Use stderr vs tryCatch

**Use `stderr()`** for:

- ✅ Normalizing caught errors for logging
- ✅ Converting unknown error types to StdError
- ✅ Standardizing error format for serialization

```typescript
try {
    await riskyOperation();
} catch (error) {
    const standardized = stderr(error);
    logger.error('Operation failed', standardized);
    throw standardized; // Re-throw if needed
}
```

**Use `tryCatch()`** for:

- ✅ Wrapping operations that might throw
- ✅ Type-safe error handling with Result pattern
- ✅ Avoiding try-catch boilerplate

```typescript
const result = tryCatch(() => parseJSON(input));
if (!result.ok) {
    // Handle error without try-catch
}
```

### Exception Safety Guidelines

1. **Never swallow errors silently**

    ```typescript
    // ❌ BAD
    const result = tryCatch(() => operation());
    // Error not handled!

    // ✅ GOOD
    const result = tryCatch(() => operation());
    if (!result.ok) {
        logger.error('Operation failed', result.error);
        // Decide: return, throw, or continue
    }
    ```

2. **Log before throwing**

    ```typescript
    // ✅ GOOD: Log with context before throwing
    if (!result.ok) {
        logger.error('Critical failure', {
            error: result.error,
            context: { userId, operation: 'payment' },
        });
        throw result.error;
    }
    ```

3. **Don't throw in finally blocks**

    ```typescript
    // ❌ BAD: Throwing in finally masks original error
    try {
        await operation();
    } finally {
        cleanup(); // If this throws, original error is lost!
    }

    // ✅ GOOD: Wrap cleanup with tryCatch
    try {
        await operation();
    } finally {
        const cleanupResult = tryCatch(() => cleanup());
        if (!cleanupResult.ok) {
            logger.warn('Cleanup failed', cleanupResult.error);
        }
    }
    ```

---

## Error Immutability

### StdError is Mutable (By Design)

StdError properties are mutable to match standard Error behavior:

```typescript
const err = stderr('Initial message');
err.message = 'Updated message'; // ✅ Allowed
err.customField = 'extra data'; // ✅ Allowed
```

### Best Practices for Mutation

1. **Avoid mutation after logging**

    ```typescript
    const err = stderr(error);
    logger.error('Error occurred', err); // Logged
    err.message = 'Different message'; // ⚠️ Logger has old message!
    ```

2. **Clone if sharing across boundaries**

    ```typescript
    const err = stderr(error);
    const cloned = stderr(err); // Creates new instance
    cloned.message = 'Modified';
    // Original err.message unchanged
    ```

3. **Document mutation expectations**
    ```typescript
    /**
     * @param error - Error object (may be mutated)
     */
    function logAndRethrow(error: StdError) {
        error.logged = true; // Document mutation
        logger.error(error);
        throw error;
    }
    ```

### When Immutability Matters

If your application requires immutable errors:

```typescript
// Option 1: Object.freeze (shallow)
const err = Object.freeze(stderr(error));
err.message = 'new'; // ❌ Throws in strict mode

// Option 2: Deep freeze library
import deepFreeze from 'deep-freeze';
const err = deepFreeze(stderr(error));

// Option 3: Use a different library (fp-ts, neverthrow)
```

---

## Security Considerations

### Sanitize Sensitive Data

**stderr does not sanitize automatically.** You must sanitize:

```typescript
// ❌ BAD: Sensitive data in error
function processPayment(creditCard: string) {
    if (!isValid(creditCard)) {
        throw new Error(`Invalid card: ${creditCard}`); // Leaks card!
    }
}

// ✅ GOOD: Sanitize before error
function processPayment(creditCard: string) {
    if (!isValid(creditCard)) {
        const masked = creditCard.slice(-4).padStart(creditCard.length, '*');
        throw new Error(`Invalid card: ${masked}`);
    }
}
```

### Sanitization Strategies

1. **Before error creation**

    ```typescript
    const sanitizedData = sanitize(userData);
    throw new Error(`Failed for user: ${sanitizedData}`);
    ```

2. **During logging**

    ```typescript
    logger.error('Operation failed', {
        error: stderr(err),
        user: sanitizeForLogging(user), // Sanitize here
    });
    ```

3. **At serialization boundary**
    ```typescript
    function toPublicError(err: StdError) {
        return {
            message: err.message,
            code: err.name,
            // Omit sensitive fields like stack in production
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        };
    }
    ```

### Security Limits

Library has built-in DoS protection:

- `MAX_PROPERTIES = 1000`: Limits properties per object
- `MAX_ARRAY_LENGTH = 10000`: Limits array processing
- `maxDepth` (default 8): Limits recursion depth

These are **not configurable** to ensure consistent safety.

---

## Performance Tips

### Minimize Error Creation in Hot Paths

```typescript
// ❌ SLOW: Creating errors in tight loop
for (let i = 0; i < 1000000; i++) {
    const result = tryCatch(() => process(i));
    // Creates new Error objects on every iteration
}

// ✅ FAST: Validate before processing
const validated = items.filter(isValid);
for (const item of validated) {
    const result = tryCatch(() => process(item));
    // Fewer error creations
}
```

### Adjust maxDepth for Deep Structures

```typescript
// Default maxDepth = 8 (sufficient for most cases)
const err = stderr(error);

// For known shallow errors
const err = stderr(error, { maxDepth: 3 }); // Faster

// For very deep structures
const err = stderr(deepError, { maxDepth: 20 }); // Slower but complete
```

### Avoid Excessive Metadata

```typescript
// ❌ SLOW: Thousands of properties
const err = stderr({
    message: 'Failed',
    ...generateHugeMetadata(), // 10,000 properties
});

// ✅ FAST: Summarize metadata
const err = stderr({
    message: 'Failed',
    summaryStats: summarize(hugeMetadata),
});
```

---

## Testing Recommendations

### Test Both Success and Error Paths

```typescript
describe('fetchUser', () => {
    it('returns user on success', async () => {
        const result = await tryCatch(() => fetchUser('123'));
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value).toHaveProperty('id', '123');
        }
    });

    it('returns error on failure', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));
        const result = await tryCatch(() => fetchUser('123'));
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.message).toContain('Network error');
        }
    });
});
```

### Test Error Normalization

```typescript
describe('error normalization', () => {
    it('handles string errors', () => {
        const err = stderr('string error');
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('string error');
    });

    it('preserves cause chain', () => {
        const cause = new Error('root cause');
        const err = stderr({ message: 'wrapper', cause });
        expect(err.cause).toBeDefined();
        expect((err.cause as Error).message).toBe('root cause');
    });
});
```

### Property-Based Testing

Use fast-check for comprehensive testing:

```typescript
import fc from 'fast-check';

it('never throws for any input', () => {
    fc.assert(
        fc.property(fc.anything(), input => {
            expect(() => stderr(input)).not.toThrow();
        })
    );
});
```

---

## Custom Error Classes vs StdError

### When to Use Custom Error Classes

Use custom error classes when you **know your error types** and need type-safe handling:

```typescript
class ValidationError extends Error {
    constructor(
        message: string,
        public field: string,
        public value: unknown
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}

class PaymentError extends Error {
    constructor(
        message: string,
        public code: string,
        public amount: number
    ) {
        super(message);
        this.name = 'PaymentError';
    }
}

// Type-safe error handling
try {
    processPayment(order);
} catch (error) {
    if (error instanceof ValidationError) {
        // TypeScript knows about field and value
        return res.status(400).json({
            error: 'Validation failed',
            field: error.field,
        });
    }
    if (error instanceof PaymentError) {
        // TypeScript knows about code and amount
        return res.status(402).json({
            error: 'Payment failed',
            code: error.code,
        });
    }
    // Unknown error - use stderr for logging
    logger.error('Unexpected error:', stderr(error));
}
```

### When to Use StdError

Use `stderr()` when dealing with **unknown error shapes**:

1. **Third-party library errors**

    ```typescript
    try {
        await externalAPI.doSomething();
    } catch (error) {
        // Don't know what shape error is
        const normalized = stderr(error);
        logger.error('API call failed:', normalized);
    }
    ```

2. **Logging any error consistently**

    ```typescript
    function logError(error: unknown) {
        // stderr handles any input
        const normalized = stderr(error);
        logger.error(normalized.toString()); // Complete details
    }
    ```

3. **Serializing errors for transport**
    ```typescript
    try {
        await operation();
    } catch (error) {
        const normalized = stderr(error);
        // Send to error tracking service
        await errorTracker.report({
            error: normalized.toJSON(),
            timestamp: Date.now(),
        });
    }
    ```

### Combining Both Approaches

```typescript
class DatabaseError extends Error {
    constructor(
        message: string,
        public query: string,
        public code: string
    ) {
        super(message);
        this.name = 'DatabaseError';
    }
}

async function saveUser(user: User) {
    try {
        return await db.users.insert(user);
    } catch (error) {
        // Wrap in typed error
        throw new DatabaseError('Failed to save user', JSON.stringify(user), (error as any).code || 'UNKNOWN');
    }
}

// Usage
try {
    await saveUser(newUser);
} catch (error) {
    if (error instanceof DatabaseError) {
        // Handle specifically
        logger.error('DB error:', {
            query: error.query,
            code: error.code,
        });
    }
    // Also log complete error details
    logger.error('Full error:', stderr(error).toString());
}
```

### Key Principle

**Don't subclass StdError.** It's the final step for logging/serialization, not a base class for your error hierarchy.

- ✅ **Custom classes** → Type-safe error handling in your code
- ✅ **stderr()** → Standardize for logging/serialization
- ❌ **Subclassing StdError** → Doesn't make sense for the library's purpose

---

## Common Patterns

### API Error Handling

```typescript
app.post('/users', async (req, res) => {
    const result = await tryCatch(async () => {
        const validated = validateUser(req.body);
        return await db.users.create(validated);
    });

    if (!result.ok) {
        logger.error('User creation failed', {
            error: result.error,
            body: sanitize(req.body),
        });

        return res.status(500).json({
            error: 'Failed to create user',
            message: result.error.message,
        });
    }

    return res.status(201).json(result.value);
});
```

### Retry Logic

```typescript
async function fetchWithRetry(url: string, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const result = await tryCatch(() => fetch(url));

        if (result.ok) {
            return result;
        }

        logger.warn(`Fetch attempt ${attempt} failed`, result.error);

        if (attempt < maxRetries) {
            await delay(attempt * 1000); // Exponential backoff
        }
    }

    return tryCatch(() => fetch(url)); // Final attempt
}
```

### Graceful Degradation

```typescript
const result = await tryCatch(() => fetchFromCache());

if (!result.ok) {
    logger.warn('Cache miss, falling back to DB', result.error);

    const dbResult = await tryCatch(() => fetchFromDB());

    if (!dbResult.ok) {
        logger.error('DB fetch failed', dbResult.error);
        return { ok: false, value: null, error: dbResult.error };
    }

    return dbResult;
}

return result;
```

---

## Anti-Patterns to Avoid

### ❌ Silent Failures

```typescript
// BAD: Error completely ignored
const result = tryCatch(() => operation());
return someDefaultValue;
```

### ❌ Overly Generic Error Messages

```typescript
// BAD: No context
throw new Error('Failed');

// GOOD: Descriptive with context
throw new Error(`Failed to process payment for user ${userId}: Invalid card`);
```

### ❌ Leaking Errors to Users

```typescript
// BAD: Internal details exposed
res.status(500).send(error.stack);

// GOOD: User-friendly message, internal logging
logger.error('Internal error', error);
res.status(500).json({ error: 'An unexpected error occurred' });
```

### ❌ Throwing in Constructors/Getters

```typescript
// BAD: Exceptions in constructor
class User {
    constructor(data: unknown) {
        this.validate(data); // Might throw
    }
}

// GOOD: Factory with error handling
class User {
    static create(data: unknown): Result<User, StdError> {
        return tryCatch(() => {
            const validated = validate(data);
            return new User(validated);
        });
    }
}
```

---

## Summary

**Key Takeaways**:

1. ✅ Always handle errors explicitly with `tryCatch`
2. ✅ Log errors with context before throwing/returning
3. ✅ Implement timeouts in your functions, not in tryCatch
4. ✅ Sanitize sensitive data before creating errors
5. ✅ Test both success and error paths
6. ✅ Document mutation expectations
7. ✅ Use appropriate maxDepth for your data structures

**Philosophy**: Explicit error handling leads to more maintainable, debuggable code.
