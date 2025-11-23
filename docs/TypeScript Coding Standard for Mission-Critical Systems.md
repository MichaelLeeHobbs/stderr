# TypeScript Coding Standard for Mission-Critical Systems

## 1. Introduction

This standard establishes a rigorous framework for developing high-reliability
TypeScript applications in mission-critical environments, such as aerospace,
finance, healthcare, or infrastructure systems. It emphasizes safety,
predictability, maintainability, and verifiability, prioritizing these over
developer convenience, performance optimizations, or syntactic brevity. Strict
adherence minimizes runtime errors, memory leaks, non-deterministic behaviors,
security vulnerabilities, and operational failures inherent in JavaScript
ecosystems.

This document is not exhaustive but serves as a baseline. Teams **shall**
supplement it with domain-specific rules (e.g., for real-time systems or
embedded environments). Compliance is enforced via automated tools (CI/CD
pipelines, linters) and periodic code audits. Violations must be documented and
justified in a risk register.

## 2. Levels of Compliance

- **Shall**: Mandatory requirement. Non-compliance requires a formal waiver
  approved by the technical lead or architecture review board, including a risk
  assessment and mitigation plan.
- **Should**: Strong recommendation. Deviation requires inline code comments
  with rationale, plus a ticket for review in the next sprint.
- **May**: Permissible option. Use judiciously with documentation.

All rules assume TypeScript 5.0+ and Node.js 20+ (or equivalent runtime). Legacy
environments require explicit justification.

---

## 3. Compiler, Environment, and Tooling Compliance

### Rule 3.1: Strict Compiler Configuration

The TypeScript compiler (`tsc`) **shall** be configured with maximum strictness
to catch errors early. The `tsconfig.json` must include at minimum:

```json
{
    "compilerOptions": {
        "strict": true,
        "noImplicitAny": true,
        "strictNullChecks": true,
        "strictFunctionTypes": true,
        "strictBindCallApply": true,
        "strictPropertyInitialization": true,
        "noImplicitThis": true,
        "useUnknownInCatchVariables": true,
        "noUncheckedIndexedAccess": true,
        "exactOptionalPropertyTypes": true,
        "noFallthroughCasesInSwitch": true,
        "noImplicitReturns": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true,
        "skipLibCheck": false,
        "allowUnusedLabels": false,
        "allowUnreachableCode": false
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "**/*.test.ts"]
}
```

- Additional requirements: Enable `"declaration": true` for library builds and
  `"outDir": "./dist"` for clear separation of source and output.
- For TypeScript 5.8+: Consider `"erasableSyntaxOnly": true` to enforce
  erasable-only syntax (e.g., no traditional enums).
  **Rationale**: Strict mode enforces sound typing, preventing subtle bugs like
  null/undefined dereferences or implicit type coercion. String-based
  alternatives to enums provide more type safety, and union types offer
  lightweight, quick solutions.

### Rule 3.2: Zero Tolerance for `any` and Discouraged Loose Types

The `any` type **shall not** be used under any circumstances.

- **Alternatives**: Prefer `unknown` for untyped inputs (e.g., from APIs),
  followed by type guards or narrowing. Use generics for reusable utilities.
  Avoid `object` or loose unions; opt for precise discriminated unions.
- Type assertions (`as Type` or `!` non-null assertion) **shall** be minimized
  and justified with comments; prefer type guards.
  **Rationale**: `any` bypasses type safety, reintroducing JavaScript's
  fragility. In mission-critical code, type errors must be compile-time, not
  runtime, issues.

### Rule 3.3: Automated Static Analysis and Linting

All code **shall** pass ESLint (with `@typescript-eslint` plugin) and other
static analyzers (e.g., SonarQube) with zero warnings or errors. The build
pipeline **must** fail on any issues, treating warnings as errors via ESLint's
`--max-warnings 0`.

- Enforce rules like `no-floating-promises`,
  `@typescript-eslint/no-misused-promises`,
  `@typescript-eslint/prefer-readonly-parameter-types`, and
  `@typescript-eslint/no-unnecessary-type-assertion`.
- Integrate tools like TypeScript's `tsc --noEmit` in pre-commit hooks.
  **Rationale**: AI tools can speed up coding, but generated code must always be
  reviewed and tested for accuracy in mission-critical applications.

### Rule 3.4: Dependency Management

Dependencies **shall** be pinned to exact semantic versions in `package.json` (
e.g., `"lodash": "4.17.21"`). Use tools like `npm audit` or `yarn audit` in CI
to scan for vulnerabilities; fail builds on high-severity issues.

- Minimize third-party dependencies; prefer standard library or audited
  internals (e.g., Node.js built-ins over external HTTP clients).
- No dynamic `require` or `import`; all imports **shall** be static and use ESM
  syntax (`import`/`export`).
- **Rationale**: ESM is the default in 2025, aligning with modern JavaScript and
  enabling better bundle optimization through tree-shaking.

### Rule 3.5: Prohibition of Traditional Enums

Traditional TypeScript `enum` declarations **shall not** be used due to runtime
overhead, non-erasable code generation, and inconsistencies with JavaScript.

- **Rationale**: Enums generate non-erasable code, create inconsistencies
  between string and numeric enums, and add runtime overhead.Using objects with
  `as const` keeps your codebase aligned with JavaScript's future, as enum
  proposals evolve.

---

## 4. Asynchronous Execution & Promises

### Rule 4.1: No Floating or Unhandled Promises

All Promises **shall** be explicitly handled: `await`ed, chained (
`.then/.catch`), returned to the caller, or explicitly ignored only if
fire-and-forget is provably safe (e.g., logging) and documented.

- Forbid `void` on async functions unless the return value is intentionally
  discarded with inline justification.
  **Rationale**: Unhandled rejections lead to silent failures, resource leaks (
  e.g., open sockets), and inconsistent states. In critical systems, all async
  paths must be observable.

### Rule 4.2: Mandatory Timeouts and Cancellation

No asynchronous operation (e.g., network I/O, timers, file operations) **shall**
run without a timeout. Use `AbortController` for cancellation and `Promise.race`
for timeouts; timeouts **shall** be configurable but never exceed 30 seconds by
default unless justified.
**Example:**

```typescript
// Bad: No timeout
await fetch('https://api.example.com/data');

// Good: Timeout with AbortController
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000); // Configurable via env or param
try {
    const response = await fetch('https://api.example.com/data', { signal: controller.signal });
    return await response.json();
} catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Operation timed out'); // Or handle as Result<...>
    }
    throw error;
} finally {
    clearTimeout(timeoutId);
}
```

**Rationale**: Indefinite operations cause hangs, resource exhaustion, or
denial-of-service vulnerabilities. Timeouts ensure liveness and fault tolerance.

### Rule 4.3: Bounded and Predictable Parallelism

Asynchronous operations **should** execute serially by default. Parallelism (
e.g., `Promise.all`) **shall** be bounded (e.g., max 5 concurrent via `p-limit`
or semaphores) and justified with performance metrics.

- Forbid unbounded `Promise.all` on user-controlled inputs (e.g., arrays from
  APIs).
  **Rationale**: Uncontrolled parallelism risks thread pool exhaustion, memory
  spikes, or cascading failures under load. Serial execution simplifies
  debugging and error isolation.

### Rule 4.4: Async Iteration Safety

Use `for await...of` only on trusted iterables. Custom async iterators **shall**
implement cancellation via `AbortSignal`.
**Rationale**: Async iterators can leak resources if not properly torn down,
especially in long-running loops.

---

## 5. Scope, Closures, and Memory Management

### Rule 5.1: Explicit Resource Disposal

Closures, event listeners, timers, or streams that capture resources **shall**
implement explicit disposal (e.g., via `Disposable` interface from TypeScript
5.2+ or a custom `dispose()` method).

- Event emitters: Always pair `on` with `off` or use `once` for one-shots.
- Timers: Clear with `clearTimeout`/`clearInterval` in a `finally` block or
  disposal hook.
  **Example:**

```typescript
class ResourceHandler {
    private timer: NodeJS.Timeout | null = null;
    private disposable: Disposable | null = null;

    start(): void {
        this.timer = setInterval(() => {
            /* work */
        }, 1000);
        this.disposable = someAsyncDisposable();
    }

    dispose(): void {
        if (this.timer) clearInterval(this.timer);
        if (this.disposable) this.disposable[Symbol.dispose]();
    }
}
```

**Rationale**: JavaScript's garbage collector cannot reclaim cycles in closures
or event loops, leading to leaks in long-lived processes. Explicit disposal
ensures deterministic memory usage.

### Rule 5.2: Scoped Variables Only

The `var` keyword **shall not** be used. Prefer `const`; use `let` only for
reassignable block-scoped variables, and minimize its scope (e.g., inside
loops).

- Forbid global variables; use modules for shared state with lazy
  initialization.
  **Rationale**: `var`'s hoisting and function scoping introduce temporal dead
  zones and bugs. Block scoping reduces cognitive load and accidental mutations.

### Rule 5.3: Safe `this` Binding

Avoid `this` in callbacks; use arrow functions to capture lexical `this`.

- If dynamic `this` is unavoidable (e.g., class methods), declare it explicitly:
  `function method(this: MyClass) { ... }` and bind via `.bind(this)`.
  **Rationale**: `this` binding is context-dependent and error-prone in
  callbacks, leading to null references or wrong scopes.

---

## 6. Error Handling (Result and Panic Patterns)

### Rule 6.1: Reserved Use of Exceptions

`throw` **shall** be reserved for unrecoverable panics (e.g., assertion
failures, OOM, configuration errors). Never use for control flow (e.g.,
validation or expected I/O failures).

- Panics **must** include structured logging with context (e.g., stack trace,
  inputs).
- **Rationale**: "Use exceptions for exceptional circumstances" - throw errors
  sparingly and with good reason.

### Rule 6.2: Result Pattern for Recoverable Errors

Functions that can fail **shall** return a `Result<T, E>` union type, forcing
explicit handling.
**Standard Type Definition:**

```typescript
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E extends Error ? E : Error };
```

**Utility Wrappers:**

```typescript
// Sync
export function tryCatchSync<T, E = unknown>(fn: () => T, mapError?: (error: unknown) => E): Result<T, E> {
    try {
        return { ok: true, value: fn() };
    } catch (error) {
        return { ok: false, error: mapError ? mapError(error) : (error as E) };
    }
}

// Async
export async function tryCatch<T, E = unknown>(promise: Promise<T>, mapError?: (caughtError: unknown) => E): Promise<Result<T, E>> {
    try {
        return { ok: true, value: await promise };
    } catch (error) {
        return { ok: false, error: mapError ? mapError(error) : (error as E) };
    }
}
```

- Always check `if (!result.ok) { /* handle error */ }` before accessing`value`.
  Use pattern matching libraries (e.g., `ts-results` or `neverthrow`)if
  approved.
  **Rationale**: Results make error paths type-safe and exhaustive, eliminating
  unchecked exceptions. Expected errors should be handled explicitly to maintain
  fault tolerance and control system responses.

### Rule 6.3: Comprehensive Logging

All errors **shall** be logged using a structured logger (e.g., Winston or Pino)
with levels (ERROR, WARN), context (request ID, user), and no sensitive data.

- Integrate with monitoring (e.g., Sentry, DataDog) for alerts on panics.
  **Rationale**: Logs enable post-mortem analysis and observability in
  production.

---

## 7. Defensive Coding & Data Integrity

### Rule 7.1: Immutability by Default

Treat all data as immutable: Use `readonly` for interfaces, `ReadonlyArray<T>`/
`ReadonlyMap<K,V>`, and `DeepReadonly<T>` for nested structures (via utility
types).

- Functions **shall** accept `const` parameters where possible; avoid
  mutations (use `Object.freeze` for enforcement in critical paths).
  **Rationale**: Mutations create hidden side effects, complicating concurrency
  and testing. Immutability aids reasoning and enables optimizations like
  memoization.

### Rule 7.2: Runtime Validation and Sanitization

All external inputs (APIs, files, env vars, user data) **shall** be validated
and sanitized at boundaries using schema libraries (Zod preferred for its type
inference; alternatives: Valibot, ArkType).

- Forbid raw type assertions; implement type guards:
  `function isValidUser(input: unknown): input is User { ... }`.
- Sanitize outputs to prevent injection (e.g., XSS via DOMPurify, SQL injection
  via parameterized queries).
  **Example (Zod):**

```typescript
import { z } from 'zod';

const UserSchema = z.object({
    id: z.number().positive(),
    name: z.string().min(1).max(100),
});
type User = z.infer<typeof UserSchema>;

function parseUser(input: unknown): Result<User> {
    const parsed = UserSchema.safeParse(input);
    return parsed.success
        ? { ok: true, value: parsed.data }
        : {
              ok: false,
              error: new Error(`Invalid user: ${parsed.error.message}`),
          };
}
```

**Rationale**: Runtime type erasure means compile-time safety is insufficient.
Validation catches malformed data early, preventing deep propagation of errors
or exploits.

### Rule 7.3: Nominal and Opaque Typing

Avoid raw primitives for domain types (e.g., `string` for emails). Use branded
types for nominal distinction and opaque types for abstraction.
**Example:**

```typescript
declare const __brand: unique symbol;
type Brand<T, TBrand extends string> = T & { readonly [__brand]: TBrand };

type UserId = Brand<string, 'UserId'>;
type Email = Brand<string, 'Email'>;
type Meters = Brand<number, 'Meters'>;

// Factory functions enforce validation
function createUserId(id: string): Result<UserId> {
    if (!id || id.length === 0) {
        return { ok: false, error: new Error('Invalid user ID') };
    }
    return { ok: true, value: id as UserId };
}

function createEmail(email: string): Result<Email> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { ok: false, error: new Error('Invalid email format') };
    }
    return { ok: true, value: email as Email };
}

function sendEmail(to: Email, message: string): Result<void> {
    // Won't accept plain string
    // Implementation here
    return { ok: true, value: undefined };
}
```

**Rationale**: Primitives allow accidental mixing (e.g., using user ID as
timestamp), violating domain invariants. Branding enforces type safety without
runtime overhead.

### Rule 7.4: Security Hardening

- Inputs: Validate lengths, escape outputs (e.g., no direct SQL concatenation;
  use prepared statements via libraries like `pg` or ORMs with parameterized
  queries).
- Secrets: Never hardcode; use env vars or vaults (e.g., AWS Secrets Manager,
  HashiCorp Vault). Audit logs for access.
- Crypto: Use audited libraries (e.g., Node.js `crypto` module, `libsodium.js`);
  avoid custom implementations.
- **Headers**: Set security headers (CSP, HSTS, X-Frame-Options) in HTTP
  responses.
  **Rationale**: Mission-critical systems are attack targets; defensive rules
  mitigate OWASP risks like injection or leakage.

---

## 8. Control Flow & Structure

### Rule 8.1: Bounded and Guarded Loops

All loops **shall** have a compile-time or runtime upper bound (e.g.,
`for (let i = 0; i < MAX_ITERATIONS; i++)`). The bound **shall** be documented
with rationale.

- Discourage `while(true)`; if used, add a counter with
  `if (counter > MAX) throw new Error('Loop exceeded bounds');`.
  **Rationale**: Infinite loops cause denial-of-service or hangs. Bounds ensure
  termination.

### Rule 8.2: Iterative Algorithms Only

Recursion (direct or indirect via mutual calls) **shall not** be used. Rewrite
as iterative (e.g., using stacks for tree traversals).

- **Rationale**: JS lacks tail-call optimization, risking stack overflows in
  deep calls—fatal in resource-constrained environments.

### Rule 8.3: Exhaustive Pattern Matching with Const Assertions

For discriminated unions and state machines, use `const` assertions instead of
traditional enums for type-safe, enum-like values. **All** `switch` statements
and union checks **shall** be exhaustive, using a`default: assertUnreachable(x)`
case.

**Const Assertion Pattern (Preferred):**

```typescript
// Define enum-like values using const assertion
const State = {
    LOADING: 'LOADING',
    SUCCESS: 'SUCCESS',
    ERROR: 'ERROR',
    IDLE: 'IDLE',
} as const;

// Extract the type from the object
type StateValue = (typeof State)[keyof typeof State];

// Define discriminated union using the const-asserted values
type AppState =
    | { kind: typeof State.LOADING }
    | { kind: typeof State.SUCCESS; data: string }
    | { kind: typeof State.ERROR; error: Error }
    | { kind: typeof State.IDLE };

// Exhaustiveness checking helper
function assertUnreachable(x: never): never {
    throw new Error(`Exhaustive check failed: ${JSON.stringify(x)}`);
}

// Usage with exhaustive switch
function handleState(state: AppState): string {
    switch (state.kind) {
        case State.LOADING:
            return 'Loading...';
        case State.SUCCESS:
            return `Success: ${state.data}`;
        case State.ERROR:
            return `Error: ${state.error.message}`;
        case State.IDLE:
            return 'Idle';
        default:
            assertUnreachable(state); // TypeScript error if union changes
    }
}

// Can also use string literals directly (both are type-safe)
const currentState: AppState = { kind: State.SUCCESS, value: 'result' };
// OR
const currentState2: AppState = { kind: 'SUCCESS', value: 'result' }; // Also valid
```

**Alternative Pattern for Iteration:**

```typescript
// When you need to iterate over all possible values
const HTTP_STATUS_CODES = ['200', '400', '404', '500'] as const;
type HttpStatusCode = (typeof HTTP_STATUS_CODES)[number]; // '200' | '400' | '404' | '500'

// Type-safe iteration
for (const code of HTTP_STATUS_CODES) {
    processStatusCode(code); // code is typed as HttpStatusCode
}

// Type guard for runtime validation
function isHttpStatusCode(value: unknown): value is HttpStatusCode {
    return typeof value === 'string' && HTTP_STATUS_CODES.includes(value as HttpStatusCode);
}
```

**Benefits over Traditional Enums:**
Using `as const` objects provides a modern, type-safe alternative that avoids
non-erasable code, inconsistencies, and runtime
overhead. Const assertions are structural (like most TypeScript types), while
enums are
nominal, and you get more functionality for free with `as const`, like having a
mapping object explicitly
defined.

**For Union Types (Lightweight Alternative):**

```typescript
// Simplest approach when you don't need the object at runtime
type Status = 'loading' | 'success' | 'error' | 'idle';

function handleStatus(status: Status): void {
    switch (status) {
        case 'loading':
            console.log('Loading...');
            break;
        case 'success':
            console.log('Success!');
            break;
        case 'error':
            console.log('Error!');
            break;
        case 'idle':
            console.log('Idle');
            break;
        default:
            assertUnreachable(status);
    }
}
```

- For non-switch: Use `if` chains with `else throw assertUnreachable(value)`.
- **Rationale**: Union types of string literals are lightweight and quick
  solutions that don't add runtime
  overhead. Non-exhaustive checks allow silent failures on new variants,
  breaking
  invariants. Const assertions provide type safety without enum baggage.

### Rule 8.4: Modular Function Design

- Functions **should** be ≤ 40 lines (configurable per project, but must be
  documented).
- ≤ 4 parameters; use a single options object for more:
  `function process(options: ProcessOptions)`.
- Single responsibility: One function, one concern. Extract nested logic into
  helpers.
- Early returns for guards; avoid deep nesting (>3 levels).
- Pure functions preferred where possible (no side effects).
  **Rationale**: Small functions reduce cognitive complexity, easing reviews,
  testing, and maintenance. High complexity correlates with bugs.

---

## 9. Testing, Verification, and Observability

### Rule 9.1: Comprehensive Test Coverage

All code **shall** have ≥95% branch coverage via unit/integration tests (Jest,
Vitest, or approved framework). Use property-based testing (e.g., fast-check)for
algorithms and data structures.

- Mock external dependencies minimally; prefer contract testing or integration
  tests with test containers.
- Tests **shall** include edge cases: empty inputs, null/undefined, boundary
  values, concurrent access.
  **Rationale**: Reliability is the prime concern for mission-critical software;
  techniques like peer reviews, code inspection, and dynamic testing improve
  software reliability.

### Rule 9.2: Fuzzing and Chaos Testing

Critical paths (authentication, payment processing, data persistence) **shall**
undergo fuzzing (e.g., via `@fast-check/jest` or dedicated fuzzers) and chaos
engineering (e.g., inject faults with `fault-injection` tools, simulate network
failures).

- Run fuzzing in CI on a schedule (e.g., nightly builds).
  **Rationale**: Uncovers rare failures in async or concurrent code that
  traditional tests miss.

### Rule 9.3: Observability and Monitoring

Instrument code with metrics (e.g., Prometheus, StatsD) for latency, error
rates, and resource usage. All critical functions **should** emit traces (e.g.,
OpenTelemetry) and structured logs.

- Define SLOs (Service Level Objectives) for critical endpoints.
- Implement health check endpoints (`/health`, `/ready`) for orchestration.
  **Rationale**: Enables proactive detection of degradations in production.
  Distributed tracing helps diagnose issues in microservices.

### Rule 9.4: Type Testing

Use type-level tests (e.g., `tsd`, `expect-type`) to verify complex type
transformations and generic utilities behave correctly.
**Example:**

```typescript
import { expectType } from 'tsd';

type ExtractSuccess<T> = T extends { ok: true; value: infer V } ? V : never;

expectType<string>(null as any as ExtractSuccess<Result<string>>);
```

**Rationale**: Complex generics can have subtle bugs; type tests catch these at
compile time.

---

## 10. Documentation and Code Organization

### Rule 10.1: Inline Documentation

All public APIs **shall** have TSDoc comments with `@param`, `@returns`, and
`@throws` annotations. Include usage examples for complex functions.

````typescript
/**
 * Parses and validates a user object from unknown input.
 *
 * @param input - The unknown input to parse
 * @returns A Result containing either the validated User or an error
 * @throws Never throws; all errors returned in Result
 *
 * @example
 * ```ts
 * const result = parseUser({ id: 1, name: 'Alice' });
 * if (result.ok) {
 *   console.log(result.value.name);
 * }
 *
 */
function parseUser(input: unknown): Result<User> {
    // ...
}
````

### Rule 10.2: Architecture Decision Records (ADRs)

Significant design decisions (e.g., choice of error handling pattern, database
schema changes) **shall** be documented in ADRs stored in version control (e.g.,
`docs/adr/`).
**Rationale**: Provides historical context for future maintainers and regulatory
audits.

### Rule 10.3: Modular Architecture

Code **shall** be organized into modules with clear boundaries. Use barrel
exports (`index.ts`) sparingly to avoid circular dependencies.

- Dependency direction: Core domain logic **shall not** depend on
  infrastructure (Dependency Inversion Principle).
  **Rationale**: Modularity improves testability, enables parallel development,
  and reduces coupling.

---

## 11. Performance and Resource Management

### Rule 11.1: Profiling Before Optimization

Performance optimizations **shall** be justified with profiling data (e.g.,
Chrome DevTools, `clinic.js`). Document baseline and target metrics.

- Avoid premature optimization; prioritize correctness and maintainability
  first.
  **Rationale**: Premature optimization is the root of all evil. Data-driven
  decisions prevent wasted effort.

### Rule 11.2: Memory Leak Detection

Run memory profilers (e.g., `heapdump`, Chrome DevTools) on long-running
processes during development and staging.

- Set memory limits in production (`--max-old-space-size`) and monitor for
  growth.
  **Rationale**: JavaScript's GC doesn't prevent all leaks (closures, global
  references). Early detection is critical.

### Rule 11.3: Efficient Data Structures

Choose appropriate data structures: `Map`/`Set` for lookups, typed arrays (
`Uint8Array`) for binary data, streaming for large files.

- Avoid copying large objects; use structural sharing libraries (e.g., Immer) if
  immutability is required.
  **Rationale**: Poor data structure choices can degrade performance by orders
  of magnitude in mission-critical systems.

---

## 12. Deployment and Runtime Considerations

### Rule 12.1: Environment Parity

Development, staging, and production environments **shall** be as similar as
possible (same Node.js version, OS, dependencies).

- Use containers (Docker) or reproducible builds (Nix) to ensure consistency.
  **Rationale**: "Works on my machine" is unacceptable in critical systems.
  Environment parity reduces deployment risks.

### Rule 12.2: Graceful Shutdown

Applications **shall** handle `SIGTERM` and `SIGINT` signals, draining
connections and releasing resources before exit.

```typescript
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, starting graceful shutdown');
    await server.close();
    await database.disconnect();
    process.exit(0);
});
```

**Rationale**: Abrupt termination can corrupt data or leave resources in
inconsistent states.

### Rule 12.3: Feature Flags

Use feature flags for gradual rollouts of high-risk changes. Flags **shall** be
temporary (removed after stabilization) to avoid technical debt.
**Rationale**: Allows safe deployment with quick rollback capability without
code changes.

---

## 13. Compliance and Audit Trail

### Rule 13.1: Code Review Requirements

All code changes **shall** be reviewed by at least one other qualified engineer.
Critical modules (authentication, encryption) require two reviewers.

- Use checklists covering security, error handling, testing, and documentation.
  **Rationale**: Peer review catches bugs and knowledge-shares across teams.

### Rule 13.2: Audit Logging

Security-sensitive operations (authentication, authorization changes, data
access) **shall** be logged immutably with timestamp, actor, and operation
details.

- Logs **shall** be tamper-evident (e.g., cryptographically signed or in
  append-only storage).
  **Rationale**: Required for forensic analysis and regulatory compliance (GDPR,
  HIPAA, SOC 2).

### Rule 13.3: Versioning and Traceability

All releases **shall** be tagged in version control with semantic versioning.
Maintain a CHANGELOG linking commits to issues/tickets.
**Rationale**: Enables rollback and root cause analysis linking production
issues to code changes.

---

## Appendix A: Tool Configuration Examples

### ESLint Configuration (`.eslintrc.json`)

```json
{
    "parser": "@typescript-eslint/parser",
    "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended", "plugin:@typescript-eslint/recommended-requiring-type-checking"],
    "parserOptions": {
        "project": "./tsconfig.json"
    },
    "rules": {
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-misused-promises": "error",
        "@typescript-eslint/prefer-readonly-parameter-types": "warn",
        "@typescript-eslint/explicit-function-return-type": "error",
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
        "no-console": ["warn", { "allow": ["warn", "error"] }],
        "max-lines-per-function": ["warn", { "max": 40, "skipBlankLines": true, "skipComments": true }],
        "complexity": ["error", 10]
    }
}
```

### Pre-commit Hook (using Husky)

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npm run lint
npm run type-check
npm run test:unit
```

---

## Appendix B: Glossary

- **Discriminated Union**: A union type where each variant has a literal
  property (discriminant) enabling exhaustive type narrowing.
- **Branded Type**: A technique using intersection types to create nominally
  distinct types from primitives.
- **Result Type**: A type representing either success (with value) or failure (
  with error), avoiding exceptions.
- **Const Assertion**: TypeScript's `as const` syntax that infers narrowest
  possible literal types and marks objects as readonly.

---

## Revision History

| Version | Date       | Changes                                                                                                                              |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1.0     | 2025-11-21 | Initial release                                                                                                                      |
| 1.1     | 2025-11-21 | Added enum prohibition, const assertion patterns, enhanced error handling examples, observability section, deployment considerations |

---

**This document is a living standard and shall be reviewed quarterly for updates
aligned with TypeScript evolution and industry best practices.**
