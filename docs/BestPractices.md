# Best Practices Guide

**Project**: stderr-lib v2.0  
**Last Updated**: 2025-11-30

This guide builds on the quick introduction in `README.md` and goes deep into
patterns, limits, security, performance, and testing.

---

## Table of Contents

1. [Promise Handling](#promise-handling)
2. [Exception Usage](#exception-usage)
3. [Error Immutability](#error-immutability)
4. [Security Considerations](#security-considerations)
5. [Performance Tips](#performance-tips)
6. [Testing Recommendations](#testing-recommendations)
7. [Custom Error Classes vs StdError](#custom-error-classes-vs-stderror)
8. [Common Patterns](#common-patterns)
9. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)

---

## Promise Handling

### Always Use tryCatch with Async Operations

```ts
import { tryCatch } from 'stderr-lib';

interface UserDto {
    id: string;
    name: string;
}

async function fetchUser(userId: string): Promise<UserDto> {
    const response = await fetch(`/api/users/${userId}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch user: ${response.status}`);
    }
    return response.json() as Promise<UserDto>;
}

// ✅ GOOD: Explicit error handling
const result = await tryCatch(fetchUser(userId));

if (!result.ok) {
    logger.error('User fetch failed', result.error);
    return res.status(500).json({ error: 'Failed to fetch user' });
}

return res.json(result.value);
```

```ts
// ❌ BAD: Uncaught promise rejections
const user = await fetchUser(userId); // Can throw!
```

### Implement Timeouts in Your Functions (Not in tryCatch)

`tryCatch` deliberately does **not** implement timeouts. Implement them at the
operation level instead:

```ts
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

const result = await tryCatch(async () => fetchWithTimeout(url, 5_000));
if (!result.ok) {
    if (result.error.name === 'AbortError') {
        logger.error('Request timeout', { url, timeoutMs: 5_000 });
    }
}
```

### Handle Floating Promises

```ts
// ❌ BAD: Floating promise (no await)
function processUser(userId: string): void {
    void tryCatch(updateUser(userId)); // Fire-and-forget with no handling
}

// ✅ GOOD: Properly await
async function processUser(userId: string): Promise<void> {
    const result = await tryCatch(updateUser(userId));
    if (!result.ok) {
        logger.error('Update failed', result.error);
    }
}

// ✅ ALSO GOOD: Intentional fire-and-forget with explicit handling
function processUserInBackground(userId: string): void {
    void tryCatch(updateUser(userId)).then(result => {
        if (!result.ok) {
            logger.error('Background update failed', result.error);
        }
    });
}
```

---

## Exception Usage

### When to Use stderr vs tryCatch

**Use `stderr()`** for:

- ✅ Normalizing caught errors for logging
- ✅ Converting unknown error types to `StdError`
- ✅ Standardizing error format for serialization

```ts
import { stderr } from 'stderr-lib';

async function handleJob(jobId: string): Promise<void> {
    try {
        await processJob(jobId);
    } catch (error: unknown) {
        const standardized = stderr(error);

        logger.error('Job processing failed', {
            jobId,
            error: standardized,
        });

        throw standardized; // Re-throw if upstream needs to know
    }
}
```

**Use `tryCatch()`** for:

- ✅ Wrapping operations that might throw
- ✅ Type-safe error handling with the Result pattern
- ✅ Avoiding repetitive `try/catch` boilerplate

```ts
import { tryCatch } from 'stderr-lib';

function parseConfig(raw: string): Result<Config> {
    return tryCatch(() => JSON.parse(raw) as Config);
}

const configResult = parseConfig(env.CONFIG_JSON);
if (!configResult.ok) {
    logger.error('Invalid configuration', configResult.error);
    process.exitCode = 1;
} else {
    boot(configResult.value);
}
```

### Exception Safety Guidelines

1. **Never swallow errors silently**

    ```ts
    // ❌ BAD
    const result = tryCatch(() => operation());
    // Error not handled!

    // ✅ GOOD
    const safeResult = tryCatch(() => operation());
    if (!safeResult.ok) {
        logger.error('Operation failed', safeResult.error);
        // Decide: return, throw, or continue
    }
    ```

2. **Log with context before throwing**

    ```ts
    // ✅ GOOD: Log with context before throwing
    const paymentResult = await tryCatch(async () => chargeCard(requestBody));

    if (!paymentResult.ok) {
        logger.error('Payment failure', {
            error: paymentResult.error,
            userId: requestUser.id,
            endpoint: '/payments',
        });
        throw paymentResult.error;
    }
    ```

3. **Avoid throwing in finally blocks**

    ```ts
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

`StdError` behaves like native `Error`: properties are mutable.

```ts
import { stderr, StdError } from 'stderr-lib';

const err: StdError = stderr('Initial message');
err.message = 'Updated message'; // ✅ Allowed
(err as Record<string, unknown>).correlationId = correlationId; // ✅ Allowed
```

### Best Practices for Mutation

1. **Avoid mutation after logging**

    ```ts
    const err = stderr(error);
    logger.error('Error occurred', err); // Logged
    err.message = 'Different message'; // ⚠️ Logger has old message!
    ```

2. **Clone if sharing across boundaries**

    ```ts
    const original = stderr(error);
    const cloned = stderr(original); // Creates new StdError instance

    cloned.message = 'Modified for UI';
    // original.message unchanged
    ```

3. **Document mutation expectations**

    ```ts
    /**
     * Logs and rethrows an error, marking it as already logged.
     */
    function logAndRethrow(error: StdError): never {
        (error as Record<string, unknown>).logged = true; // Document mutation
        logger.error(error);
        throw error;
    }
    ```

### When Immutability Matters

If your application requires immutability:

```ts
import { stderr } from 'stderr-lib';
import deepFreeze from 'deep-freeze-strict';

// Option 1: Object.freeze (shallow)
const shallowFrozen = Object.freeze(stderr(error));
// shallowFrozen.message = 'new'; // ❌ Throws in strict mode

// Option 2: Deep freeze library
const deeplyFrozen = deepFreeze(stderr(error));

// Option 3: Use a different library (e.g., fp-ts, neverthrow) for fully immutable error flows
```

---

## Security Considerations

### Sanitize Sensitive Data

`stderr` does **not** sanitize; you must.

```ts
// ❌ BAD: Sensitive data in error
function processPayment(creditCardNumber: string): void {
    if (!isValidCard(creditCardNumber)) {
        throw new Error(`Invalid card: ${creditCardNumber}`); // Leaks card!
    }
}

// ✅ GOOD: Sanitize before error
function processPaymentSafe(creditCardNumber: string): void {
    if (!isValidCard(creditCardNumber)) {
        const masked = creditCardNumber.slice(-4).padStart(creditCardNumber.length, '*');
        throw new Error(`Invalid card: ${masked}`);
    }
}
```

### Sanitization Strategies

1. **Before error creation**

    ```ts
    const sanitizedId = sanitizeUserId(userId);
    throw new Error(`Failed for user: ${sanitizedId}`);
    ```

2. **During logging**

    ```ts
    logger.error('Operation failed', {
        error: stderr(err),
        user: sanitizeForLogging(user), // Sanitize here
    });
    ```

3. **At serialization boundary**

    ```ts
    import type { StdError } from 'stderr-lib';

    interface PublicError {
        message: string | undefined;
        code: string | undefined;
        stack?: string;
    }

    function toPublicError(err: StdError): PublicError {
        return {
            message: err.message,
            code: err.name,
            // Omit stack in production
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
        };
    }
    ```

### DoS Protection and Limits

The library has built‑in DoS protection with validated limits:

```ts
import { stderr } from 'stderr-lib';

// Defaults
stderr.maxDepth = 8; // Range: 1–1000
stderr.maxProperties = 1000; // Range: 1–100000
stderr.maxArrayLength = 10000; // Range: 1–1000000
```

**Valid adjustments:**

```ts
stderr.maxDepth = 5; // Performance optimization
stderr.maxProperties = 2_000; // Large validation errors
stderr.maxArrayLength = 50_000; // Batch operations
```

**Invalid adjustments (throw):**

```ts
stderr.maxDepth = 2_000; // RangeError: exceeds max
stderr.maxDepth = 0; // RangeError: below min

// @ts-expect-error
stderr.maxProperties = 'high'; // TypeError: must be integer
```

**Environment-specific strategy:**

```ts
if (process.env.NODE_ENV === 'production') {
    stderr.maxDepth = 5;
    stderr.maxProperties = 500;
    stderr.maxArrayLength = 1_000;
} else {
    // Development: generous for debugging
    stderr.maxDepth = 20;
    stderr.maxProperties = 5_000;
    stderr.maxArrayLength = 50_000;
}
```

Monitor truncation metadata such as `_truncated` and `_truncated_<field>` in
production logs to detect when data is being cut off.

---

## Performance Tips

### Minimize Error Creation in Hot Paths

```ts
// ❌ SLOW: Creating errors in a tight loop
for (let i = 0; i < 1_000_000; i += 1) {
    const result = tryCatch(() => processItem(items[i]));
    // Creates new Error objects on every iteration
}

// ✅ FAST: Validate before processing
const validItems = items.filter(isItemValid);
for (const item of validItems) {
    const result = tryCatch(() => processItem(item));
    if (!result.ok) {
        logger.warn('Item processing failed', result.error);
    }
}
```

### Tune maxDepth for Deep Structures

```ts
const deepError = {
    message: 'Level 0',
    cause: {
        message: 'Level 1',
        cause: {
            message: 'Level 2',
            cause: {
                message: 'Level 3',
            },
        },
    },
};

// Default maxDepth = 8 (sufficient for most cases)
const defaultErr = stderr(deepError);

// For known shallow errors
const shallowErr = stderr(deepError, { maxDepth: 3 }); // Faster

// For very deep structures
const deepErr = stderr(deepError, { maxDepth: 20 }); // Slower but more complete
```

### Tune maxProperties for Large Objects

```ts
// Default maxProperties = 1000
const validationError = {
    message: 'Validation failed',
    errors: {
        email: { message: 'Invalid email' },
        password: { message: 'Too short' },
    },
};

const defaultValidationErr = stderr(validationError);

// For small objects
const smallErr = stderr(validationError, { maxProperties: 50 }); // Faster

// For large validation errors
const largeValidationErr = stderr(validationError, { maxProperties: 2_000 });

// ❌ AVOID: Massive metadata attached directly to errors
const badErr = stderr({
    message: 'Failed',
    metadata: buildVeryLargeMetadata(), // 10,000+ properties
});

// ✅ BETTER: Summarize metadata
const betterErr = stderr({
    message: 'Failed',
    metadataSummary: summarizeMetadata(buildVeryLargeMetadata()),
    topIssues: topIssuesFromMetadata(buildVeryLargeMetadata(), 10),
});
```

### Tune maxArrayLength for Large Arrays

```ts
interface ItemFailure {
    id: string;
    reason: string;
}

const hugeFailures: ItemFailure[] = buildHugeFailuresArray();

// Default maxArrayLength = 10000
const defaultBatchErr = stderr({
    message: 'Batch failed',
    errors: hugeFailures,
});

// For small arrays
const smallBatchErr = stderr(
    {
        message: 'Batch failed',
        errors: hugeFailures,
    },
    { maxArrayLength: 100 }
);

// For batch operations with many failures
const largeBatchErr = stderr(
    {
        message: 'Batch failed',
        errors: hugeFailures,
    },
    { maxArrayLength: 50_000 }
);

// ❌ AVOID: Processing every individual failure downstream if you only need aggregates

// ✅ BETTER: Summarize or group failures before logging/transport
const groupedByReason: Record<string, number> = hugeFailures.reduce<Record<string, number>>((acc, failure) => {
    acc[failure.reason] = (acc[failure.reason] ?? 0) + 1;
    return acc;
}, {});

const summarizedErr = stderr({
    message: 'Batch failed',
    failureCount: hugeFailures.length,
    failuresByReason: groupedByReason,
});
```

### Normalization Limits vs Display Constants

Important distinction:

- **Normalization limits** (`maxDepth`, `maxProperties`, `maxArrayLength`)
    - Control what data is **processed and stored**
- **Display constant** (`MAX_INLINE_ITEMS = 3`)
    - Controls how data is **rendered** in `toString()` output only

```ts
// Example: Array with 100 items
const err = stderr({
    data: Array.from({ length: 100 }, (_, index) => index),
});

// Normalization: all 100 items are processed
console.log(err.data.length); // 100

// Display: summarized in toString() (exceeds MAX_INLINE_ITEMS)
console.log(err.toString()); // data: [Array(100)]

// JSON: includes all items
console.log(JSON.stringify(err).includes('"data":[0,1,2')); // true
```

---

## Testing Recommendations

### Test Both Success and Error Paths

```ts
import { tryCatch } from 'stderr-lib';

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

```ts
import { stderr } from 'stderr-lib';

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

### Test Truncation Behavior

```ts
import { stderr } from 'stderr-lib';

describe('truncation metadata', () => {
    it('adds _truncated for arrays exceeding limit', () => {
        const largeArray = Array.from({ length: 101 }, (_, index) => `item${index}`);
        const err = stderr({ message: 'test', data: largeArray }, { maxArrayLength: 100 });

        const data = (err as Record<string, unknown>).data as unknown[];
        const truncatedMessage = (err as Record<string, unknown>)._truncated_data as string;

        expect(data).toHaveLength(100);
        expect(truncatedMessage).toContain('exceeds limit (100)');
    });

    it('adds _truncated for errors array exceeding limit', () => {
        const manyErrors = Array.from({ length: 101 }, (_, index) => `error${index}`);
        const err = stderr({ message: 'test', errors: manyErrors }, { maxArrayLength: 100 });

        const errors = (err as Record<string, unknown>).errors as unknown[];
        const truncatedMessage = (err as Record<string, unknown>)._truncated as string;

        expect(errors).toHaveLength(100);
        expect(truncatedMessage).toContain('Array length (101)');
    });

    it('adds _truncated for errors object exceeding limit', () => {
        const manyProps: Record<string, string> = {};
        for (let index = 0; index < 101; index += 1) {
            manyProps[`field${index}`] = `error${index}`;
        }

        const err = stderr({ message: 'test', errors: manyProps }, { maxProperties: 100 });

        const errors = (err as Record<string, unknown>).errors as Record<string, unknown>;

        expect(Object.keys(errors).length).toBe(101); // 100 + _truncated
        expect(String(errors._truncated)).toContain('Property count (101)');
    });
});
```

### Test with Different Limits

```ts
import { stderr } from 'stderr-lib';

describe('configurable limits', () => {
    it('respects custom maxDepth', () => {
        const deep = {
            message: 'L0',
            cause: { message: 'L1', cause: { message: 'L2' } },
        };

        const err = stderr(deep, { maxDepth: 2 });
        expect(err.cause).toBeDefined();
        const cause = err.cause as Record<string, unknown>;
        expect(String(cause.cause)).toContain('[Max depth');
    });

    it('respects custom maxProperties', () => {
        const manyProps: Record<string, string> = {};
        for (let index = 0; index < 50; index += 1) {
            manyProps[`field${index}`] = `value${index}`;
        }

        const err = stderr({ message: 'test', ...manyProps }, { maxProperties: 25 });

        const keys = Object.keys(err as Record<string, unknown>);
        // message + 25 props + _truncated (implementation detail bound)
        expect(keys.length).toBeLessThanOrEqual(27);
    });
});
```

### Property-Based Testing

```ts
import fc from 'fast-check';
import { stderr } from 'stderr-lib';

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

Use custom classes when you **know your error types** and want domain‑specific
handling:

```ts
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

try {
    processPayment(order);
} catch (error) {
    if (error instanceof ValidationError) {
        return res.status(400).json({
            error: 'Validation failed',
            field: error.field,
        });
    }

    if (error instanceof PaymentError) {
        return res.status(402).json({
            error: 'Payment failed',
            code: error.code,
        });
    }

    // Unknown error - normalize for logging
    logger.error('Unexpected error:', stderr(error));
}
```

### When to Use StdError

Use `stderr()` when dealing with **unknown shapes** or when you need consistent
logging/serialization:

1. **Third‑party library errors**

    ```ts
    try {
        await externalAPI.doSomething();
    } catch (error) {
        const normalized = stderr(error);
        logger.error('API call failed:', normalized);
    }
    ```

2. **Generic logging helper**

    ```ts
    function logError(error: unknown): void {
        const normalized = stderr(error);
        logger.error(normalized.toString());
    }
    ```

3. **Serializing errors for transport**

    ```ts
    try {
        await operation();
    } catch (error) {
        const normalized = stderr(error);
        await errorTracker.report({
            error: normalized.toJSON(),
            timestamp: Date.now(),
        });
    }
    ```

### Combining Both Approaches

```ts
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

async function saveUser(user: User): Promise<User> {
    try {
        return await db.users.insert(user);
    } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as Record<string, unknown>).code) : 'UNKNOWN';

        throw new DatabaseError('Failed to save user', JSON.stringify(user), code);
    }
}

try {
    await saveUser(newUser);
} catch (error) {
    if (error instanceof DatabaseError) {
        logger.error('DB error:', {
            query: error.query,
            code: error.code,
        });
    }

    logger.error('Full error:', stderr(error).toString());
}
```

### Key Principle

**Do not subclass `StdError`.**

- ✅ Custom classes → domain errors inside your app
- ✅ `stderr()` / `StdError` → final form for logging/serialization
- ❌ `class MyError extends StdError` → fights the library’s purpose

---

## Common Patterns

### API Error Handling

```ts
import { tryCatch } from 'stderr-lib';

app.post('/users', async (req, res) => {
    const result = await tryCatch(async () => {
        const validated = validateUser(req.body);
        return db.users.create(validated);
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

### Retry Logic with Backoff

```ts
import { tryCatch } from 'stderr-lib';

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Result<Response>> {
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        const result = await tryCatch(() => fetch(url));

        if (result.ok) {
            return result;
        }

        logger.warn(`Fetch attempt ${attempt} failed`, result.error);

        if (attempt < maxRetries) {
            await delay(attempt * 1_000); // Simple backoff
        }
    }

    return tryCatch(() => fetch(url)); // Final attempt
}
```

### Graceful Degradation (Cache → DB Fallback)

```ts
import { tryCatch, type Result } from 'stderr-lib';

async function getUser(userId: string): Promise<Result<User>> {
    // Pass Promise directly
    const cacheResult = await tryCatch(fetchFromCache(userId));

    if (!cacheResult.ok) {
        logger.warn('Cache miss, falling back to DB', cacheResult.error);

        // Pass Promise directly
        const dbResult = await tryCatch(fetchFromDB(userId));

        if (!dbResult.ok) {
            logger.error('DB fetch failed', dbResult.error);
            return { ok: false, value: null, error: dbResult.error };
        }

        return dbResult;
    }

    return cacheResult;
}
```

---

## Anti-Patterns to Avoid

### ❌ Silent Failures

```ts
// BAD: Error completely ignored
const result = tryCatch(() => operation());
if (result.ok) {
    return result.value;
}

// Missing logging/handling here
return someDefaultValue;
```

### ❌ Limits Too Low for Your Data

```ts
// BAD: Limits don't match data structure
stderr.maxDepth = 2; // But errors have 10-level cause chains
stderr.maxProperties = 10; // But validation errors have 50 fields

// GOOD: Set based on actual data
stderr.maxDepth = 15; // Deep cause chains
stderr.maxProperties = 100; // Typical validation errors
```

### ❌ Overly Generic Error Messages

```ts
// BAD: No context
throw new Error('Failed');

// GOOD: Descriptive with context
throw new Error(`Failed to process payment for user ${userId}: Invalid card`);
```

### ❌ Leaking Internal Details to Users

```ts
// BAD: Internal details exposed
res.status(500).send(error.stack);

// GOOD: User-friendly message, internal logging
logger.error('Internal error', error);
res.status(500).json({ error: 'An unexpected error occurred' });
```

### ❌ Throwing in Constructors/Getters

```ts
// BAD: Exceptions in constructor
class User {
    constructor(data: unknown) {
        this.validate(data); // Might throw
    }

    private validate(_data: unknown): void {
        // Implementation omitted
    }
}

// GOOD: Factory with Result
class SafeUser {
    private constructor(private readonly data: UserData) {}

    static create(data: unknown): Result<SafeUser> {
        return tryCatch(() => {
            const validated = validateUserData(data);
            return new SafeUser(validated);
        });
    }
}
```

---

## Summary

Key takeaways:

1. ✅ Use `tryCatch` for explicit, type‑safe error handling
2. ✅ Normalize unknown errors with `stderr()` before logging or serializing
3. ✅ Implement timeouts and policies inside your operations
4. ✅ Sanitize sensitive data yourself; the library will not
5. ✅ Tune limits (`maxDepth`, `maxProperties`, `maxArrayLength`) per environment
6. ✅ Watch truncation metadata to detect when logs are incomplete
7. ✅ Use custom domain errors where types are known; `StdError` as the final form
8. ❌ Avoid silent failures, generic messages, and leaking internal details

These practices complement the high‑level overview in `README.md` and are
intended for engineers integrating `stderr-lib` into real systems.
