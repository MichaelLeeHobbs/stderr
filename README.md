# stderr-lib

> Type-safe error handling and standardization for TypeScript/JavaScript

[![npm version](https://img.shields.io/npm/v/stderr-lib.svg)](https://www.npmjs.com/package/stderr-lib)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Version 2.0** - Clean, opinionated error handling with explicit patterns.

---

## Overview

`stderr-lib` provides two focused tools:

1. **`stderr()`** - Normalize any error-like value into a standard `StdError` format
2. **`tryCatch()`** - Type-safe error handling with Result pattern

**Philosophy**: Explicit error handling over implicit chaining. Force developers to handle errors properly.

---

## Why stderr-lib?

### The Problem

JavaScript errors are inconsistent and often lose critical information:

```typescript
// Native Error - missing details
try {
    await fetch('https://api.example.com/data');
} catch (error) {
    console.log(error.toString()); // "TypeError: fetch failed"
    // Lost: cause chain, custom properties, nested errors
    console.log(JSON.stringify(error)); // "{}" - Not serializable!
}

// Database errors - complex nested structures
try {
    await User.create(invalidData);
} catch (error) {
    // Mongoose: error.errors is object map (not logged)
    // Sequelize: error.original, error.parent (hidden)
    console.log(error); // Only shows top-level message
}

// Third-party library - unknown error shape
someLibrary.operation().catch(error => {
    // Is it Error? string? object? null? Who knows?
    logger.error(error); // Hope for the best
});
```

### The Solution

```typescript
import { stderr, tryCatch } from 'stderr-lib';

// stderr: Normalize any error for logging
try {
    await operation();
} catch (error) {
    const normalized = stderr(error);
    console.log(normalized.toString()); // Complete error with cause chain, all properties
    logger.error('Failed:', normalized); // Everything captured
}

// tryCatch: Type-safe error handling
const result = await tryCatch(async () => fetchUser(id));
if (!result.ok) {
    // Full stack and details available! No more 'fetch failed' mysteries
    logger.error('Fetch failed:', result.error.toString());
    return null;
}
return result.value; // TypeScript knows this is User type
```

---

## Installation

```bash
npm install stderr-lib
```

```bash
pnpm add stderr-lib
```

```bash
yarn add stderr-lib
```

---

## Quick Start

### Basic Error Normalization

```typescript
import { stderr } from 'stderr-lib';

try {
    await riskyOperation();
} catch (error) {
    const err = stderr(error);

    console.log(err.toString());
    // Complete output with cause chain, custom properties, nested errors

    logger.error('Operation failed', err);
    // Everything is captured for your logging service
}
```

### Type-Safe Error Handling

```typescript
import { tryCatch } from 'stderr-lib';

const result = await tryCatch(async () => {
    const response = await fetch('/api/user/123');
    return response.json();
});

if (!result.ok) {
    // Explicit error handling - you MUST handle this
    console.error('Request failed:', result.error);
    return null;
}

// TypeScript knows result.value is the JSON data
console.log('User:', result.value);
```

---

## API Reference

### `stderr(input, options?)`

Normalizes any value into a `StdError` instance.

```typescript
function stderr<T = ErrorShape>(input: unknown, options?: NormalizeOptions): T & StdError;
```

**Parameters:**

- `input` - Any value (Error, string, object, null, etc.)
- `options` - Optional configuration
    - `maxDepth?: number` - Maximum recursion depth (default: 8, range: 1-1000)

**Returns:** `StdError` instance with comprehensive toString() and toJSON()

**Examples:**

```typescript
// From Error
const err1 = stderr(new Error('Failed'));

// From string
const err2 = stderr('Something went wrong');

// From object
const err3 = stderr({ message: 'DB error', code: 'ER_DUP' });

// From null/undefined
const err4 = stderr(null); // Error: "null"

// With options
const err5 = stderr(deepError, { maxDepth: 15 });
```

### `StdError` Class

All errors returned by `stderr()` are `StdError` instances.

**Properties:**

- `name: string` - Error name
- `message: string` - Error message
- `stack?: string` - Stack trace
- `cause?: unknown` - Error cause (preserved from input)
- `errors?: unknown` - Nested errors (from AggregateError, validation errors, etc.)
- `[key: string]: unknown` - Custom properties preserved

**Methods:**

#### `toString(): string`

Comprehensive string representation including cause chain and all properties.

```typescript
const err = stderr({
    message: 'Database error',
    code: 'ER_DUP_ENTRY',
    cause: new Error('Connection lost'),
});

console.log(err.toString());
/*
Error: Database error
  at <stack>
  code: "ER_DUP_ENTRY"
  [cause]: Error: Connection lost
    at <stack>
*/
```

#### `toJSON(): object`

JSON-serializable representation.

```typescript
const err = stderr(new Error('Failed'));
const json = JSON.stringify(err); // toJSON() called automatically

// Or call directly
const obj = err.toJSON();
```

### `tryCatch(fn, mapError?)`

Type-safe wrapper for operations that might throw.

```typescript
// Sync version
function tryCatch<T, E = StdError>(fn: () => T, mapError?: (error: StdError) => E): Result<T, E>;

// Async version
function tryCatch<T, E = StdError>(fn: () => Promise<T>, mapError?: (error: StdError) => E): Promise<Result<T, E>>;
```

**Parameters:**

- `fn` - Function to execute (sync or async)
- `mapError` - Optional error transformer

**Returns:** `Result<T, E>` - Discriminated union

```typescript
type Result<T, E> = { ok: true; value: T; error: null } | { ok: false; value: null; error: E };
```

**Examples:**

```typescript
// Sync
const result = tryCatch(() => JSON.parse(input));
if (!result.ok) {
    console.error('Parse failed:', result.error);
    return;
}
console.log('Parsed:', result.value);

// Async
const result = await tryCatch(async () => {
    return await fetch('/api/data');
});

// With error transformation
const result = tryCatch(
    () => riskyOperation(),
    error => ({ code: error.name, message: error.message })
);
if (!result.ok) {
    console.log(result.error.code); // Custom error type
}
```

### Global Configuration

```typescript
// Set maximum recursion depth globally
stderr.maxDepth = 10; // Default: 8, Range: 1-1000

// Validation: Throws if invalid
stderr.maxDepth = 2000; // RangeError: maxDepth must be between 1 and 1000
stderr.maxDepth = 3.5; // TypeError: maxDepth must be an integer
```

---

## Usage Examples

### Error Normalization for Logging

```typescript
import { stderr } from 'stderr-lib';

// Normalize any error for consistent logging
function logError(error: unknown, context: Record<string, unknown>) {
    const normalized = stderr(error);

    logger.error('Operation failed', {
        error: normalized, // Full error with cause chain
        errorString: normalized.toString(), // Human-readable
        context,
    });
}

try {
    await processPayment(order);
} catch (error) {
    logError(error, { orderId: order.id, userId: user.id });
}
```

### API Error Handling

```typescript
import { tryCatch } from 'stderr-lib';

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

### Handling Cause Chains

```typescript
const error = {
    message: 'Payment failed',
    cause: {
        message: 'Gateway timeout',
        cause: new Error('Network unreachable'),
    },
};

const normalized = stderr(error);
console.log(normalized.toString());
/*
Error: Payment failed
  [cause]: Error: Gateway timeout
    [cause]: Error: Network unreachable
      at <stack>
*/

// Programmatic access
if (normalized.cause) {
    console.log('Root cause:', normalized.cause);
}
```

### Handling Validation Errors

```typescript
// Mongoose-style validation error
const mongooseError = {
    name: 'ValidationError',
    message: 'User validation failed',
    errors: {
        email: {
            message: 'Email is required',
            path: 'email',
        },
        age: {
            message: 'Must be positive',
            path: 'age',
            value: -5,
        },
    },
};

const normalized = stderr(mongooseError);
console.log(normalized.toString());
/*
ValidationError: User validation failed
  [errors]: {
    email: Error: Email is required (path: "email"),
    age: Error: Must be positive (path: "age", value: -5)
  }
*/

// Access nested errors
if (normalized.errors) {
    Object.entries(normalized.errors).forEach(([field, err]) => {
        console.log(`${field}: ${stderr(err).message}`);
    });
}
```

### Retry Logic with tryCatch

```typescript
async function fetchWithRetry(url: string, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const result = await tryCatch(() => fetch(url));

        if (result.ok) {
            return result;
        }

        logger.warn(`Attempt ${attempt} failed:`, result.error);

        if (attempt < maxRetries) {
            await delay(attempt * 1000); // Exponential backoff
        }
    }

    return await tryCatch(() => fetch(url)); // Final attempt
}
```

### Graceful Degradation

```typescript
async function getData(id: string) {
    // Try cache first
    const cacheResult = await tryCatch(() => fetchFromCache(id));
    if (cacheResult.ok) {
        return cacheResult.value;
    }

    logger.warn('Cache miss, trying database:', cacheResult.error);

    // Fallback to database
    const dbResult = await tryCatch(() => fetchFromDB(id));
    if (dbResult.ok) {
        return dbResult.value;
    }

    logger.error('Both cache and DB failed:', dbResult.error);
    throw dbResult.error;
}
```

---

## Advanced Features

### Deep Nesting with maxDepth

```typescript
const deepError = {
    message: 'Level 0',
    cause: {
        message: 'Level 1',
        cause: {
            message: 'Level 2',
            cause: {
                message: 'Level 3',
                // ... continues
            },
        },
    },
};

// Default depth is 8
const err1 = stderr(deepError);

// Increase for deeper structures
const err2 = stderr(deepError, { maxDepth: 20 });

// Or set globally
stderr.maxDepth = 15;
const err3 = stderr(deepError);
```

### Custom Properties Preservation

```typescript
interface CustomError extends Error {
    code: string;
    statusCode: number;
    metadata: { userId: number };
}
const customError = new Error('Custom') as CustomError;
customError.code = 'ERR_CUSTOM';
customError.statusCode = 500;
customError.metadata = { userId: 123 };

const normalized = stderr(customError);

console.log(normalized.code); // "ERR_CUSTOM"
console.log(normalized.statusCode); // 500
console.log(normalized.metadata); // { userId: 123 }

// All properties included in toString() and toJSON()
```

### AggregateError Support

```typescript
const errors = [new Error('Error 1'), new Error('Error 2'), new Error('Error 3')];

const aggregateError = new AggregateError(errors, 'Multiple failures');
const normalized = stderr(aggregateError);

console.log(normalized.toString());
/*
AggregateError: Multiple failures
  [errors]: [
    Error: Error 1,
    Error: Error 2,
    Error: Error 3
  ]
*/
```

### Circular Reference Handling

```typescript
const obj: any = { message: 'Circular' };
obj.self = obj;
obj.cause = obj;

const normalized = stderr(obj); // Won't throw or hang
console.log(normalized.toString());
/*
Error: Circular
  self: [Circular]
  [cause]: [Circular]
*/
```

---

## TypeScript Support

Full TypeScript support with strict typing.

```typescript
import { stderr, tryCatch, StdError, Result, ErrorShape } from 'stderr-lib';

// Type inference
const result = tryCatch(() => 42);
// result is Result<number, StdError>

// Async inference
const asyncResult = await tryCatch(async () => 'hello');
// asyncResult is Result<string, StdError>

// Custom error type
type CustomError = { code: string; message: string };

const customResult = tryCatch(
    () => riskyOperation(),
    (err): CustomError => ({
        code: err.name || 'UNKNOWN',
        message: err.message || '',
    })
);
// customResult is Result<ReturnType, CustomError>

// Generic Error shape
function processError<T extends ErrorShape>(error: T): StdError {
    return stderr(error);
}
```

---

## Breaking Changes from v1.x

### v2.0 Changes

1. **Result property renamed**: `data` → `value`

    ```typescript
    // v1.x
    if (result.ok) console.log(result.data);

    // v2.0
    if (result.ok) console.log(result.value);
    ```

2. **Removed options**: `originalStack`, `includeNonEnumerable`

    - Stack always preserved from original error
    - Non-enumerable properties always included

3. **Options validation**: Throws on invalid input
    ```typescript
    stderr(error, { maxDepth: 2000 });
    // RangeError: maxDepth must be between 1 and 1000
    ```

---

## Design Philosophy

### Explicit Over Implicit

`tryCatch` forces you to handle errors explicitly:

```typescript
// ✅ GOOD: Explicit error handling
const result = tryCatch(() => compute());
if (!result.ok) {
    logger.error('Failed:', result.error);
    return defaultValue;
}
return result.value;
```

### Simple Over Complex

Minimal API surface with focused purpose:

- `stderr()` - Normalize errors
- `tryCatch()` - Type-safe error handling
- That's it!

### Safe by Default

- Bounded recursion (maxDepth: 1-1000)
- Circular reference detection
- DoS prevention (MAX_PROPERTIES, MAX_ARRAY_LENGTH)
- Input validation with clear errors

---

## Performance

### Benchmarks

```
stderr(string primitive)         ~500,000 ops/sec
stderr(Error instance)            ~450,000 ops/sec
stderr(deep object, depth=3)      ~150,000 ops/sec
stderr(deep object, depth=8)      ~100,000 ops/sec
tryCatch(sync success)            ~2,000,000 ops/sec
tryCatch(sync error)              ~450,000 ops/sec
```

### Tips

- Use lower `maxDepth` for shallow errors (faster)
- Avoid creating errors in hot loops
- Cache normalized errors when possible

---

## Security

### Sanitization

**stderr does NOT sanitize data.** You must sanitize before error creation:

```typescript
// ❌ BAD: Sensitive data in error
throw new Error(`Invalid card: ${creditCard}`);

// ✅ GOOD: Sanitize first
const masked = creditCard.slice(-4).padStart(16, '*');
throw new Error(`Invalid card: ${masked}`);
```

### DoS Protection

Built-in limits prevent malicious inputs:

- `MAX_PROPERTIES = 1000` - Max properties per object
- `MAX_ARRAY_LENGTH = 10000` - Max array length
- `maxDepth` (1-1000) - Max recursion depth

These are **not configurable** to ensure consistent safety.

---

## Use Cases

### ✅ Designed For

- Web applications (frontend/backend)
- Node.js services and APIs
- Business applications
- Non-critical medical software
- Financial applications
- E-commerce platforms
- Logging and monitoring
- Error reporting services

### ❌ NOT Designed For

- Critical real-time systems (hard deadlines)
- Avionics/aerospace systems
- Medical devices (life-critical)
- Automotive safety systems
- Systems requiring DO-178C/IEC 62304 certification

_JavaScript/TypeScript is fundamentally unsuitable for hard real-time due to garbage collection, JIT compilation, and non-deterministic timing._

---

## FAQ

### Why no timeout in tryCatch?

Timeouts should be implemented in your functions, not in the error handler:

```typescript
async function fetchWithTimeout(url: string, ms: number) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

const result = await tryCatch(() => fetchWithTimeout(url, 5000));
```

### Why are StdError properties mutable?

To match standard `Error` behavior. Developers expect to mutate error messages and add properties:

```typescript
const err = stderr('Initial');
err.message = 'Updated with context';
err.customField = additionalData;
```

### Why no Result utility functions?

They encourage implicit error handling, which contradicts the library's philosophy. If you want functional chaining, use libraries designed for that (neverthrow, fp-ts).

### Should I subclass StdError?

**No.** Subclassing StdError doesn't make sense for the library's purpose.

**Why?**

- `StdError` is the **final stop** before logging/console output
- It's for handling errors of **unknown shape**
- If you know your error types, handle them directly with custom error classes

**When to use StdError:**

```typescript
// When logging unknown errors
try {
    await thirdPartyLibrary.doSomething();
} catch (error) {
    const normalized = stderr(error); // Standardize for logging
    logger.error('Operation failed:', normalized);
}

// When you need to serialize custom errors
class PaymentError extends Error {
    constructor(
        message: string,
        public code: string,
        public amount: number
    ) {
        super(message);
    }
}

try {
    throw new PaymentError('Payment failed', 'E_INSUFFICIENT_FUNDS', 100);
} catch (error) {
    const normalized = stderr(error); // All properties preserved
    logger.error(normalized.toString()); // Includes code and amount
}
```

**Use custom error classes directly when you know your types:**

```typescript
class ValidationError extends Error {
    constructor(
        message: string,
        public field: string
    ) {
        super(message);
    }
}

try {
    throw new ValidationError('Invalid email', 'email');
} catch (error) {
    if (error instanceof ValidationError) {
        // Type-safe handling
        console.log(`Field ${error.field} failed validation`);
    }
    // Optional: normalize for logging
    logger.error(stderr(error).toString());
}
```

### Can I use this with my existing logger?

Yes! Most loggers call `toString()` automatically:

```typescript
const err = stderr(error);
logger.error('Failed:', err); // toString() called automatically
```

---

## Documentation

- **[ADR.md](./docs/ADR.md)** - Architecture Decision Records
- **[BEST_PRACTICES.md](./docs/BEST_PRACTICES.md)** - Comprehensive guide with examples
- **[TypeScript Coding Standard](./docs/TypeScript%20Coding%20Standard%20for%20Mission-Critical%20Systems.md)** - Standards reference

---

## Contributing

Contributions welcome! Please:

1. Follow existing code style
2. Add tests for new features
3. Update documentation
4. Run `pnpm lint:fix` and `pnpm test` before submitting

---

## License

MIT © Michael L. Hobbs

---

## Changelog

### v2.0.0 (2025-11-21)

**Breaking Changes:**

- Changed Result pattern: `data` → `value` property
- Removed options: `originalStack`, `includeNonEnumerable`
- Added options validation (throws on invalid input)

**New Features:**

- Bounded loops for DoS prevention
- Validated `maxDepth` getter/setter
- Refactored for modularity (functions ≤40 lines)
- Comprehensive documentation (ADRs + Best Practices)
- Git hooks for quality enforcement

**Improvements:**

- Simpler, more focused API
- Clear, opinionated philosophy
- Better TypeScript inference
- Extensive testing (99%+ coverage + fuzzing + type tests)

---

**Made with ❤️ for better error handling**

/_ node:coverage ignore next 2 _/
