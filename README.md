# stderr

> Normalize unknown error values to a standard format with cause chain support

[![npm version](https://img.shields.io/npm/v/stderr.svg)](https://www.npmjs.com/package/stderr)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why stderr?

**The Problem:** JavaScript errors come in all shapes and sizes. A `fetch` error might have a `cause` property. A Mongoose validation error has an `errors` object. A Sequelize error has nested `original` and `parent` properties. When you `console.log` these errors, you often miss critical debugging information hidden in non-enumerable properties or nested structures.

**The Solution:** `stderr` normalizes ANY error-like value into a consistent Error format and ensures you can log EVERYTHING with a simple `.toString()` call.

```javascript
// Before stderr - Missing critical error details
try {
  await problematicOperation();
} catch (e) {
  console.log(e.toString()); // "Error: fetch failed" - Where's the cause? The details?
  console.log(JSON.stringify(e)); // "{}" - Most Error properties aren't enumerable!
}

// After stderr - Complete error visibility
try {
  await problematicOperation();
} catch (e) {
  const err = stderr(e, { patchToString: true });
  console.log(err.toString()); // Full error with cause chain, all properties, nested errors!
  logger.error('Operation failed', err); // Your logger now captures EVERYTHING
}
```

### Real-World Problem Examples

```javascript
// Problem 1: Fetch errors with cause chains (often invisible)
try {
    const res = await fetch('https://api.example.com/data');
} catch (e) {
    console.log(e.message); // "fetch failed"
    // But e.cause contains the actual network error - invisible in logs!
}

// Problem 2: Database ORM errors with nested structures
try {
    await User.create(userData);
} catch (e) {
    // Sequelize: e.errors, e.original, e.parent, e.sql - all hidden
    // Mongoose: e.errors is an object map with validation details - not logged
    console.log(e.toString()); // Just "ValidationError" - useless for debugging!
}

// Problem 3: Unknown error shapes from third-party libraries
someLibrary.doSomething().catch(e => {
    // Is it an Error? An object? A string? Has custom properties?
    console.log(e); // Who knows what you'll get?
});

// Solution: stderr handles ALL of these
import { stderr } from 'stderr-lib';

// Configure once at app startup for convenience
stderr.patchToString = true;  // Enable enhanced toString() globally

// Now just use stderr() - toString() is automatically enhanced!
try {
    await problematicOperation();
} catch (e) {
    const normalizedError = stderr(e);  // No need to pass options every time
    logger.error(normalizedError.toString()); // EVERYTHING is logged!
}

// Or if you prefer per-call configuration
const normalizedError = stderr(weirdError, { patchToString: true });
```

## The Power of toString()

The killer feature of `stderr` is the enhanced `toString()` method when using `patchToString: true`:

```javascript
import { stderr } from 'stderr-lib';

// Option 1: Configure globally (recommended for most apps)
stderr.patchToString = true;  // Set once at app initialization

// Option 2: Configure per-call
// const normalized = stderr(error, { patchToString: true });

// Complex error with cause chain and metadata
const error = {
    name: 'DatabaseError',
    message: 'Failed to save user',
    code: 'ER_DUP_ENTRY',
    statusCode: 409,
    sql: 'INSERT INTO users ...',
    cause: {
        name: 'ConnectionError',
        message: 'Connection lost',
        code: 'ECONNRESET',
        cause: 'Network timeout'
    },
    errors: {
        email: 'Already exists',
        username: 'Too short'
    }
};

// With global config, just call stderr()
const normalized = stderr(error);

// Standard toString() would give you: "DatabaseError: Failed to save user"
// But stderr's toString() gives you EVERYTHING:
console.log(normalized.toString());
/*
DatabaseError: Failed to save user
  at <stack trace>
  code: 'ER_DUP_ENTRY',
  statusCode: 409,
  sql: 'INSERT INTO users ...',
  [cause]: ConnectionError: Connection lost
    code: 'ECONNRESET'
    [cause]: Error: Network timeout
  [errors]: {
    email: Error: Already exists,
    username: Error: Too short
  }
*/

// Perfect for logging - no more hidden error details!
logger.error('Operation failed:', normalized.toString());

// You can also configure other defaults globally
stderr.maxDepth = 10;  // Deeper recursion for complex errors
stderr.includeNonEnumerable = true;  // Include hidden properties
```

## Features

- 🔄 **Normalizes any value to a proper Error instance**
- 🔗 **Preserves error cause chains** (native `cause` support)
- 📦 **Handles AggregateError and nested errors**
- 🏷️ **Preserves custom properties and metadata**
- 🔍 **Circular reference detection**
- 📝 **Enhanced toString() for complete error logging**
- 🎯 **TypeScript support with full type safety**
- 📊 **JSON serialization support**
- 🔧 **Configurable depth limits and behavior**
- 📦 **ESM and CommonJS support**
- 🪶 **Zero dependencies**

## Installation

```bash
npm install stderr-lib
```

```bash
yarn add stderr-lib
```

```bash
pnpm add stderr-lib
```

## Core Usage

### The Main Pattern - Complete Error Logging

```javascript
import { stderr } from 'stderr-lib';

// The pattern you'll use everywhere
function safeErrorLog(error, logger = console) {
  const normalized = stderr(error, { patchToString: true });
  logger.error(normalized.toString());
  return normalized;
}

// Use it anywhere you catch errors
try {
  await riskyOperation();
} catch (e) {
  const err = safeErrorLog(e, logger);
  // err is now a normalized Error with ALL information preserved
}

// Works with any logger
app.use((err, req, res, next) => {
  const normalized = stderr(err, { patchToString: true });
  winston.error('Request failed', {
    error: normalized.toString(),
    stack: normalized.stack,
    metadata: errorToJson(normalized)
  });
});
```

### Basic Error Normalization

```typescript
import { stderr } from 'stderr-lib';

// From string
const err1 = stderr('Something went wrong');
console.log(err1.message); // "Something went wrong"

// From object
const err2 = stderr({ message: 'Failed', code: 'E_FAIL' });
console.log(err2.message); // "Failed"
console.log(err2.code); // "E_FAIL"

// From Error instance (preserves all properties)
const original = new Error('Original');
original.code = 'CUSTOM';
const err3 = stderr(original);
console.log(err3.code); // "CUSTOM"

// From unknown values
stderr(null);        // Error: Unknown error (Null)
stderr(undefined);   // Error: Unknown error (Undefined)
stderr(42);         // Error: 42
stderr({ });        // Error with empty message
```

### Error Cause Chains

```typescript
const err = stderr({
  message: 'Database operation failed',
  cause: {
    message: 'Connection timeout',
    cause: 'Network unreachable'
  }
});

// Walk the cause chain
let current = err;
while (current) {
  console.log(current.message);
  current = current.cause;
}
// Output:
// "Database operation failed"
// "Connection timeout"  
// "Network unreachable"
```

### AggregateError Support

```typescript
// From array (creates AggregateError)
const err = stderr(['error1', new Error('error2')]);
console.log(err.errors); // Array of normalized errors

// From object with errors property
const validationErr = stderr({
  name: 'ValidationError',
  message: 'Multiple fields failed',
  errors: {
    email: 'Invalid format',
    age: 'Must be positive'
  }
});

// Complex ORM-style errors
const mongooseError = {
  name: 'ValidationError',
  message: 'User validation failed',
  errors: {
    email: {
      message: 'Email is required',
      kind: 'required',
      path: 'email'
    },
    age: {
      message: 'Age must be positive',
      kind: 'min',
      path: 'age',
      value: -5
    }
  }
};

const normalized = stderr(mongooseError, { patchToString: true });
// toString() will show ALL nested error details and properties
```

### JSON Serialization

```typescript
import { errorToJson } from 'stderr-lib';

const err = new Error('Failed');
err.cause = new Error('Root cause');
err.customData = { userId: 123 };

const json = errorToJson(err);
// Returns a JSON-safe object with all error properties
console.log(JSON.stringify(json, null, 2));

// Perfect for sending errors to logging services
fetch('/api/log', {
  method: 'POST',
  body: JSON.stringify({
    error: errorToJson(err),
    timestamp: new Date().toISOString()
  })
});
```

### Try-Catch Wrapper with Type Safety

#### Basic Usage with Type Inference

```typescript
import { tryCatch } from 'stderr-lib';

// TypeScript infers the promise type automatically
const result = await tryCatch(fetch('/api/data'));
if (!result.ok) {
  // Safe error logging with stderr
  const err = stderr(result.error, { patchToString: true });
  logger.error(err.toString());
  return;
}
// TypeScript knows result.data is Response type here
console.log('Success:', result.data);
```

#### Explicit Generic Types

```typescript
// Specify both success and error types explicitly
interface User {
  id: number;
  name: string;
  email: string;
}

class ApiError extends Error {
  constructor(message: string, public code: number) {
    super(message);
  }
}

// Explicitly type both T (success) and E (error)
const result = await tryCatch<User, ApiError>(
  fetchUser(userId),
  (err) => new ApiError(String(err), 500)
);

if (!result.ok) {
  // result.error is typed as ApiError
  console.error(`API Error ${result.error.code}: ${result.error.message}`);
} else {
  // result.data is typed as User
  console.log(`User: ${result.data.name} (${result.data.email})`);
}
```

#### Working with Different Error Types

```typescript
// Example 1: Network errors with custom error type
interface NetworkError {
  type: 'network';
  status?: number;
  message: string;
}

const result = await tryCatch<Response, NetworkError>(
  fetch('/api/data'),
  (err) => ({
    type: 'network',
    status: err instanceof Response ? err.status : undefined,
    message: String(err)
  })
);

// Example 2: Validation errors with multiple error types
type ValidationError = {
  type: 'validation';
  fields: Record<string, string>;
};

type AppError = NetworkError | ValidationError | Error;

const result = await tryCatch<User, AppError>(
  createUser(userData),
  (err) => {
    if (isValidationError(err)) {
      return { type: 'validation', fields: err.fields };
    }
    return new Error(String(err));
  }
);

// Example 3: Using unknown (default) for flexible error handling
const result = await tryCatch<User>(
  fetchUser(id)
  // E defaults to unknown when not specified
);

if (!result.ok) {
  // Normalize and log the unknown error
  const err = stderr(result.error, { patchToString: true });
  logger.error(err.toString());
}
```

### Configuration Options

```typescript
const err = stderr(input, {
  // Maximum recursion depth for nested errors (default: 8)
  maxDepth: 8,
  
  // Include non-enumerable properties (default: false)
  includeNonEnumerable: false,
  
  // Preserve Error subclasses (default: false)
  enableSubclassing: false,
  
  // Use native AggregateError when available (default: true)
  useAggregateError: true,
  
  // Use native Error cause when available (default: true)
  useCauseError: true,
  
  // Override toString() for complete error visibility (default: false)
  // THIS IS THE KILLER FEATURE FOR LOGGING!
  patchToString: true
});

// You can also set defaults globally
stderr.patchToString = true; // Always patch toString()
stderr.maxDepth = 10; // Deeper recursion for complex errors
```

## API

### `stderr(input, options?)`

Normalizes any input value to a standard Error instance.

**Parameters:**
- `input: unknown` - Any value to normalize
- `options?: NormalizeOptions` - Optional configuration

**Returns:** `ErrorShape` - Normalized error instance

### `errorToJson(error, options?)`

Converts an Error instance to a JSON-safe object.

**Parameters:**
- `error: ErrorShape` - Error to serialize
- `options?: { maxDepth?: number }` - Optional configuration

**Returns:** `ErrorShape` - JSON-safe error object

### `tryCatch<T, E>(promise, mapError?)`

Wraps a Promise to always resolve with a discriminated union result object for superior type safety.

**Generic Parameters:**
- `T` - The type of the success value (inferred from promise or explicitly set)
- `E` - The type of the error value (defaults to `unknown`)

**Parameters:**
- `promise: Promise<T>` - Promise to wrap
- `mapError?: (error: unknown) => E` - Optional error transformer

**Returns:** `Promise<Result<T, E>>` - Result object with either:
- `{ ok: true, data: T, error: null }` on success
- `{ ok: false, data: null, error: E }` on failure

## Type Definitions

```typescript
// Result type for tryCatch
type Result<T, E = unknown> = 
  | { ok: true; data: T; error: null }    // Success
  | { ok: false; data: null; error: E };  // Failure

// Error shape with optional properties
interface ErrorShape {
  name?: string;
  message?: string;
  stack?: string;
  cause?: unknown;
  errors?: unknown;
  [key: string]: unknown;
}

// Normalization options
interface NormalizeOptions {
  maxDepth?: number;
  includeNonEnumerable?: boolean;
  enableSubclassing?: boolean;
  useAggregateError?: boolean;
  useCauseError?: boolean;
  patchToString?: boolean;
  originalStack?: string;
}
```

## Why "stderr"?

The name "stderr" comes from the standard error stream in Unix-like systems, reflecting this library's purpose of standardizing error handling. Just as stderr provides a consistent channel for error output, this library provides a consistent format for error objects in JavaScript/TypeScript applications.

More importantly, it solves the real-world problem of "standard errors" - the fact that JavaScript errors aren't standard at all. Every library, framework, and API has its own error shape. `stderr` makes them all standard.

## License

MIT © Michael L. Hobbs
