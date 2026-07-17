# stderr-lib

> Type-safe, standardized error handling for TypeScript/JavaScript

[![npm version](https://img.shields.io/npm/v/stderr-lib.svg)](https://www.npmjs.com/package/stderr-lib)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Clean, opinionated error handling with **explicit Result pattern** and **structured error normalization**.

---

## Overview

`stderr-lib` gives you two focused tools:

1. **`stderr()`** – normalize any error-like value into a standard `StdError`
2. **`tryCatch()`** – wrap sync/async code in a type-safe `Result` union

Use it when you want:

- Consistent, serializable errors (including cause chains and nested errors)
- Explicit, type-checked error handling instead of ad-hoc `try/catch`
- Built‑in defenses against runaway structures (max depth, properties, array length)

Advanced patterns (timeouts, limit tuning, security, performance, testing) live in
`docs/BestPractices.md`.

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

### Normalize Any Error for Logging

```ts
import { stderr } from 'stderr-lib';

try {
    await riskyOperation();
} catch (error: unknown) {
    const err = stderr(error);

    console.log(err.toString());
    // Includes message, stack (if present), cause chain, custom properties, everything!

    logger.error('Operation failed', err); // Works with typical loggers
}
```

### Type-Safe Error Handling with Result Pattern

```ts
import { tryCatch, type Result } from 'stderr-lib';

interface UserDto {
    id: string;
    name: string;
}

// You can pass an async function - type is inferred as Promise<Result<UserDto>>
const result = await tryCatch<UserDto>(async () => {
    const response = await fetch('/api/user/123');
    if (!response.ok) {
        throw new Error(`Request failed - ${response.status}`); // will be converted to StdError
    }
    return response.json() as Promise<UserDto>;
});

if (!result.ok) {
    // You are forced to handle the error explicitly
    console.error('Request failed:', result.error.toString());
    return null;
}

// In the success branch, value is non-null and correctly typed as UserDto
console.log('User name:', result.value.name);
```

---

## Core API (Surface)

### `stderr(input, options?)`

Normalize any value into a `StdError` instance.

```ts
stderr(input: unknown, options?: NormalizeOptions): StdError;
```

Key points:

- Accepts anything: native `Error`, strings, objects, `null`/`undefined`, arrays, third‑party errors
- Preserves:
    - `name`, `message`, `stack` (if present)
    - `cause`, `errors` (AggregateError / validation errors)
    - Custom properties (e.g., `code`, `statusCode`, metadata)
        - One exception: a property literally named `Symbol(stderr_maxDepth)` is always dropped. Versions `<= 2.2.0` leaked that key into
          output as internal state, so it is quarantined and removed on normalization to heal errors captured by those versions
          (see [ADR-007](./docs/ADR.md#adr-007-internal-state-is-never-an-own-property)).
- Adds safe defaults to avoid DoS:
    - `maxDepth` (default `8`, range `1–1000`)
    - `maxProperties` (default `1000`, range `1–100000`)
    - `maxArrayLength` (default `10000`, range `1–1000000`)

See **[Best Practices – Normalization & Limits](./docs/BestPractices.md#performance-tips)** for detailed guidance and examples.

### `StdError`

All `stderr()` results are instances of `StdError`.

Important properties (non‑exhaustive):

- `name?: string`
- `message?: string`
- `stack?: string`
- `cause?: unknown`
- `errors?: unknown` (arrays or maps of nested errors)
- `[key: string]: unknown` – arbitrary extra metadata

Important methods:

- `toString(): string` – human‑readable, multi‑line representation with cause chain and nested errors
- `toJSON(): object` – JSON‑safe representation suitable for logging systems and transports

Deep dives:

- **[Best Practices – Error Immutability](./docs/BestPractices.md#error-immutability)**
- **[Custom Error Classes vs StdError](./docs/BestPractices.md#custom-error-classes-vs-stderror)**

### `tryCatch(fn, mapError?)`

Wrap a function, async function, or Promise and always get a `Result` instead of thrown exceptions.

```ts
// Sync function -> Result
tryCatch<T>(fn: () => T): Result<T, StdError>;

// Async function or Promise -> Promise<Result>
tryCatch<T>(fn: Promise<T> | (() => Promise<T>)): Promise<Result<T, StdError>>;

// Sync function with custom error -> Result
tryCatch<T, E>(fn: () => T, mapError: (err: StdError) => E): Result<T, E>;

// Async function or Promise with custom error -> Promise<Result>
tryCatch<T, E>(fn: Promise<T> | (() => Promise<T>), mapError: (err: StdError) => E): Promise<Result<T, E>>;
```

Key features:

- **Accepts Promises directly**: Pass `fetch(url)` or `() => fetch(url)` – both work
- **Automatic sync/async detection**: Returns `Result<T>` for sync, `Promise<Result<T>>` for async
- **Optional error transformation**: Use `mapError` to convert `StdError` to your custom error type

`Result<T, E>` is:

```ts
type Result<T, E = StdError> = { ok: true; value: T; error: null } | { ok: false; value: null; error: E };
```

This forces you to handle both branches explicitly in TypeScript.

More patterns:

- **[Promise Handling](./docs/BestPractices.md#promise-handling)**
- **[Common Patterns – API Error Handling](./docs/BestPractices.md#common-patterns)**
- **[Exception Usage – When to Use stderr vs tryCatch](./docs/BestPractices.md#exception-usage)**

---

## Global Configuration (Limits)

You can tune normalization limits globally via properties on `stderr`:

```ts
import { stderr } from 'stderr-lib';

stderr.maxDepth = 10; // Default: 8, range: 1–1000
stderr.maxProperties = 500; // Default: 1000, range: 1–100000
stderr.maxArrayLength = 5000; // Default: 10000, range: 1–1000000
```

Invalid values throw `TypeError`/`RangeError` instead of silently misconfiguring:

```ts
stderr.maxDepth = 0; // RangeError
stderr.maxDepth = 3.5; // TypeError
stderr.maxProperties = 200000; // RangeError
stderr.maxArrayLength = 2000000; // RangeError
```

For environment‑specific tuning, see
**[Best Practices – Security & DoS Protection](./docs/BestPractices.md#security-considerations)**
and **[Performance Tips](./docs/BestPractices.md#performance-tips)**.

---

## When to Use stderr-lib

### A Good Fit

- Web apps (frontend and backend)
- Node.js services and APIs
- Business, financial, or e‑commerce systems
- Logging / monitoring / error‑reporting services
- Codebases that prefer explicit Result‑style error handling

### Not a Good Fit

- Hard real‑time or safety‑critical systems (avionics, life‑critical medical devices, automotive safety, etc.)
- Environments that require certified runtimes or deterministic timing

(These environments generally should not use JavaScript/TypeScript at all.)

---

## Further Reading

- **[BestPractices.md](./docs/BestPractices.md)** – deep dive:
    - Promise handling patterns and timeouts
    - Exception usage, mutation, and error immutability
    - Security/sanitization and DoS protections
    - Performance tuning and environment‑specific limits
    - Testing strategies and property‑based tests
    - Custom error classes vs `StdError`, common patterns, and anti‑patterns
- **[ADR.md](./docs/ADR.md)** – architectural decisions
- **[TypeScript Coding Standard](./docs/TypeScript%20Coding%20Standard%20for%20Mission-Critical%20Systems.md)** – broader Result‑pattern guidance

---

## Contributing

Contributions are welcome. Please:

1. Follow existing code style and patterns
2. Add tests for new behavior
3. Update documentation where relevant
4. Run linting and tests before submitting (see `package.json` scripts)

---

## License

MIT © Michael L. Hobbs
