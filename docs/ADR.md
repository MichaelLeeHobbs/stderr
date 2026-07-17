# Architecture Decision Records

**Project**: stderr-lib  
**Version**: 2.0  
**Last Updated**: 2025-11-23

---

## Table of Contents

- [Introduction](#introduction)
- [ADR-001: Recursion with Bounded Depth](#adr-001-recursion-with-bounded-depth)
- [ADR-002: maxDepth Semantics](#adr-002-maxdepth-semantics)
- [ADR-003: Bounded Loops for Safety](#adr-003-bounded-loops-for-safety)
- [ADR-004: No Timeouts in tryCatch](#adr-004-no-timeouts-in-trycatch)
- [ADR-005: Errors Are Mutable](#adr-005-errors-are-mutable)
- [ADR-006: No Built-in Sanitization](#adr-006-no-built-in-sanitization)
- [ADR-007: Internal State Is Never An Own Property](#adr-007-internal-state-is-never-an-own-property)
- [Summary of v2.0 Changes](#summary-of-v20-changes)
- [Decision Log](#decision-log)

---

## Introduction

This document contains all architectural decisions for the stderr-lib error handling library. Each ADR explains the context, decision, and rationale for key design choices.

**Library Purpose**: Standardize errors for logging and provide type-safe error handling via `tryCatch`.

**Target Audience**: General-purpose applications (web, Node.js, business software). NOT designed for critical real-time systems.

---

## ADR-001: Recursion with Bounded Depth

**Status**: ✅ Accepted  
**Date**: 2025-11-21

### Context

TypeScript/JavaScript lacks guaranteed tail-call optimization. Mission-critical standards prohibit recursion due to stack overflow risk. However, error normalization requires processing arbitrarily nested structures (cause chains, nested errors, custom metadata).

### Decision

**Keep recursion with enforced depth bounds.**

- Default `maxDepth = 8` (covers 99.99% of real-world cases)
- Validated range: 1-1000 (enforced via getter/setter)
- Circular reference detection with `WeakSet`

### Rationale

1. **Practical Safety**: Even 1000 recursive calls won't overflow modern JS engines (10k-50k frame limits)
2. **Simplicity**: Recursive solution is ~70 lines vs ~250+ for iterative
3. **Maintainability**: Easy to understand and modify
4. **Proven Correct**: 99%+ test coverage, no known issues

### Trade-offs

**Accepted**: Technically violates strict no-recursion rule  
**Mitigated**: Bounded depth, circular detection, extensive testing  
**Alternative**: If needed for certified systems, iterative version can be developed (10-15 days effort)

### Target Audience

✅ Web apps, Node.js, business software, non-critical medical software  
❌ Critical real-time systems, avionics, medical devices, automotive safety

> _Note: JS/TS is fundamentally unsuitable for hard real-time due to GC, JIT, non-deterministic timing_

---

## ADR-002: maxDepth Semantics

**Status**: ✅ Accepted  
**Date**: 2025-11-21  
**Updated**: 2025-11-23

### Context

The `maxDepth` option controls how deeply the library recurses when formatting errors. We needed to define what "depth" means and how it's counted to ensure predictable, intuitive behavior.

### Decision

**maxDepth uses EXCLUSIVE semantics: `maxDepth: N` means "show N levels".**

**Depth Counting Rules**:

1. **Root error = depth 0**
2. **Each nested structure increments depth** (cause, errors object, nested objects)
3. **Arrays are transparent** - the array container itself doesn't increment depth, but its elements do

### Rationale

1. **Exclusive is Intuitive**: Users expect `maxDepth: 2` to mean "show 2 levels" not "show up to index 2"
2. **Arrays are Containers**: Arrays are lists - the container isn't meaningful structure, only the items matter
3. **Objects are Structure**: Objects with keys represent meaningful hierarchical structure
4. **Consistent Behavior**: Same depth counting for `toString()` and `toJSON()`

### Examples

#### Basic Cause Chain

```typescript
const error = new StdError('Root', {
    maxDepth: 2,
    cause: new Error('Level 1', {
        cause: new Error('Hidden'),
    }),
});

// Shows 2 levels:
// Root                <- depth 0
//   [cause]: Level 1  <- depth 1
//     [cause]: [Max depth of 2 reached]
```

#### Errors Array (Transparent Container)

```typescript
const error = new StdError('Root', {
    maxDepth: 2,
    errors: [new Error('Error 1'), new Error('Error 2', { cause: new Error('Hidden') })],
});

// Array doesn't count as depth:
// Root                      <- depth 0
//   [errors]: [             <- container (no depth increment)
//     Error 1               <- depth 1
//     Error 2               <- depth 1
//       [cause]: [Max depth of 2 reached]
//   ]
```

#### Errors Object (Counts as Depth)

```typescript
const error = new StdError('Root', {
    maxDepth: 2,
    errors: {
        field: new Error('Error', { cause: new Error('Hidden') }),
    },
});

// Object counts as depth:
// Root                         <- depth 0
//   [errors]: {                <- depth 1 (object structure)
//     field: Error             <- depth 1 (value in object)
//       [cause]: [Max depth of 2 reached]
//   }
```

### Default maxDepth

**Default: 8 levels**

- Sufficient for 99.99% of real-world error chains
- Prevents infinite recursion in pathological cases
- Not Java-level nesting

---

## ADR-003: Bounded Loops for Safety

**Status**: ✅ Accepted  
**Date**: 2025-11-21

### Context

Mission-critical standards require explicit loop bounds to prevent infinite loops and DoS attacks.

### Decision

**All loops have explicit bounds with warnings on truncation.**

Constants:

- `MAX_PROPERTIES = 1000`: Maximum properties per object
- `MAX_ARRAY_LENGTH = 10000`: Maximum array length

### Rationale

1. **DoS Prevention**: Protects against malicious inputs with excessive properties/items
2. **Predictability**: Bounded execution time and memory usage
3. **Graceful Degradation**: Logs warning but continues (truncates excess)

### Implementation

```typescript
const boundedKeys = keys.slice(0, MAX_PROPERTIES);
if (keys.length > MAX_PROPERTIES) {
    console.warn(`Property count exceeds limit, truncating`);
}
for (const key of boundedKeys) {
    /* ... */
}
```

---

## ADR-004: No Timeouts in tryCatch

**Status**: ✅ Accepted  
**Date**: 2025-11-21

### Context

Mission-critical standards recommend mandatory timeouts for async operations. Could add timeout option to `tryCatch`.

### Decision

**No built-in timeouts in tryCatch.**

### Rationale

1. **Library Scope**: tryCatch wraps functions - it doesn't control their execution
2. **User Responsibility**: Caller controls the function behavior
3. **Counterintuitive**: Adding timeout would unexpectedly fail user's promises
4. **Better Patterns Exist**: Users should implement timeouts in their own code

### Recommended Pattern

```typescript
// ✅ User implements timeout where needed
const fetchWithTimeout = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
};

const result = await tryCatch(fetchWithTimeout);
```

### Documentation

Document in README that users should implement timeouts in their functions, not rely on tryCatch for timing control.

---

## ADR-005: Errors Are Mutable

**Status**: ✅ Accepted  
**Date**: 2025-11-21

### Context

Mission-critical standards prefer immutability. Could make StdError properties readonly.

### Decision

**StdError properties remain mutable (match standard Error behavior).**

### Rationale

1. **Standard Compatibility**: JavaScript Error is mutable, StdError should match
2. **Real-World Usage**: Developers commonly mutate error.message, add properties
3. **TypeScript Limitations**: Making properties readonly would complicate typing
4. **Practical Trade-off**: Benefits of mutability outweigh theoretical purity

### Examples

```typescript
// Common pattern (developers expect this to work)
const err = new StdError('Initial message');
err.message = `Updated with more context\n${err.message}`;
err.customField = additionalData; // TS would complain but that is up to user to handle
```

### Note

This is acceptable for a logging/error-handling library. Not suitable for mission-critical systems requiring immutable data structures.

---

## ADR-006: No Built-in Sanitization

**Status**: ✅ Accepted  
**Date**: 2025-11-21

### Context

Error objects may contain sensitive data (tokens, passwords). Could add sanitization/redaction features.

### Decision

**No built-in sanitization. User's responsibility.**

### Rationale

1. **Out of Scope**: Library standardizes errors, doesn't interpret content
2. **Application-Specific**: What's sensitive varies by application
3. **Better Done Upstream**: Sanitize before error creation or during logging
4. **Complexity**: Would require complex configuration, pattern matching

### Recommended Pattern

```typescript
// ✅ Sanitize before creating error
const sanitized = sanitizeUserData(userData);
throw new Error(`Failed for user: ${sanitized}`);

// ✅ Or sanitize during logging
logger.error('Operation failed', {
    error: stderr(err),
    user: sanitizeForLogging(user),
});
```

### Documentation

Document best practices for handling sensitive data in errors.

---

## ADR-007: Internal State Is Never An Own Property

**Status**: ✅ Accepted

### Context

This library defines "user data" as **every key `Reflect.ownKeys` returns** (`utils.ts` `getCustomKeys`), including non-enumerable ones — `copyPropertiesTo` passes `includeNonEnumerable: true`. On a `StdError`, **"own property" IS "observable output"** by construction. There is no own property that the library will decline to print.

Up to and including v2.2.0, `StdError` stored per-instance `maxDepth` under a module-local `Symbol('stderr_maxDepth')` own property. Normalizing an already-normalized error copied that key through `copyPropertiesTo` with `convertSymbolKeys: true`, stringifying it into output as the literal key `"Symbol(stderr_maxDepth)"`:

```
Error: TypeError: fetch failed
  Symbol(stderr_maxDepth): 8
  [cause]:   SocketError: ...
```

Two `if (isSymbol(key) && key === MAX_DEPTH_SYMBOL)` guards existed (in `formatError` and `serializeError`), but they only skipped **real symbols** — the stringified key sailed past both. The bug was self-amplifying: once a leaked error reached a JSON log and was rehydrated, the key was a plain **string** and copied forward forever with no symbol involved. `tryCatch` triggers it directly, since `fail()` calls `stderr(e)`.

### Decision

Internal per-instance state lives **off-instance**, in a module-local `WeakMap` side table — never behind a Symbol, and never behind a non-enumerable descriptor.

**Corollary**: `stderr()` is **idempotent**. `stderr(stderr(x))` is observationally identical to `stderr(x)`. This is now an executable assertion, not an aspiration.

### Rationale

**Why not a Symbol**: a Symbol is a **collision-avoidance** device, not a **privacy** device. The comment at the old `StdError.ts:9-11` claimed the Symbol "won't appear in normal property enumeration" — true, and irrelevant: this library exists precisely to see what normal enumeration hides. That mental model _was_ the bug; it is corrected here explicitly so it does not get re-derived.

**Why not a non-enumerable descriptor**: a no-op against our own reader — `copyPropertiesTo` passes `includeNonEnumerable: true`.

**Why not `Symbol.for()`**: it buys only cross-copy symbol identity for guards we deleted, and publishes an internal key into the cross-realm global registry where any package can read or forge it. The heal (below) covers the cross-copy case without that exposure.

**Why not `#maxDepth`**: functionally equivalent and the cleaner endpoint, but `tsup` targets `es2020` and esbuild 0.25.2 lowers `#` to exactly this `WeakMap` (verified) — so `#` only adds test/ship divergence (ts-jest compiles src at ESNext = native `#`) plus an unconditional per-construction `WeakMap` write via `__privateAdd`, in a hot-path logging library. Revisit if the target is ever raised to es2022+.

A `WeakMap` keyed on `this` also needs **no brand check**: `.get()` on a foreign object returns `undefined` and falls back to `StdError.defaultMaxDepth`, where a native `#maxDepth` would throw `TypeError`.

### Healing already-corrupted errors

`LEGACY_LEAK_KEYS` (`constants.ts`) drops `"Symbol(stderr_maxDepth)"` **unconditionally** on every enumeration, at the single choke point in `getCustomKeys`. This heals errors already poisoned in the wild — including errors minted by an old copy of this package still loaded in the same process (CJS/ESM dual-package or a transitive dep), whose distinct `Symbol()` stringifies to identical text. Without the heal, the fix is ineffective in a mixed-version process.

It sits **beside** `CRITICAL_SECURITY_KEYS`, not inside `excludeKeys`, because two call sites pass `excludeKeys: new Set()` and would otherwise opt out. Healing is therefore irreversible for that key, by design. It is **key-only** — the filter never reads the value to sniff `typeof === 'number'`, because `getCustomKeys` has no try/catch and a throwing getter would become a crash vector.

**Deliberate asymmetry a reviewer will query**: the heal fires in `getCustomKeys`, so it also applies to the plain-object branch of `stderr()`. Accepted — the key has no legitimate meaning anywhere.

### Accepted Trade-offs

- **Prototype-chain lookup of maxDepth is lost** (the only real semantic change). A symbol property resolves through the prototype chain; a `WeakMap` keyed on `this` does not. `Object.create(errWithMaxDepth10).toString()` inherited maxDepth 10 before; it now falls back to `StdError.defaultMaxDepth`. Same for `Object.assign(new StdError('a'), errWithMaxDepth10)`. Exotic, undocumented, untested, and itself accidental. Native `#maxDepth` would lose this identically.
- **A user property literally named `Symbol(stderr_maxDepth)` is dropped** by the heal. It is not an Error key and not a filter for current internal state — StdError 2.3+ has no internal own property to filter. Pinned by an explicit test so it stays a decision, not an accident.
- **`LEGACY_LEAK_KEYS` is a time-limited migration aid**, deletable once v<=2.2.0 errors have aged out of log stores. It is a **legacy quarantine**, not a filter for current internal state.
- **`Object.getOwnPropertySymbols(stdErr).length` goes 1 -> 0.** No consumer can depend on it: `MAX_DEPTH_SYMBOL` was never exported from `src/index.ts`, so the symbol was unreachable and the value unusable.

### Correction of Record

The `'stderr_maxDepth'` entry in `STANDARD_ERROR_KEYS` (added in `127cc23`, 2025-11-25) **never matched any key at any version** — `Symbol('stderr_maxDepth').toString()` is `'Symbol(stderr_maxDepth)'`, and the pre-symbol field was `_maxDepth` (per `15383f7`, two days earlier). Its only live effect was silently dropping a user property named `stderr_maxDepth`, contradicting the library's own collision-preservation test. It was removed in this change; that property is now preserved.

### Verification

`scripts/verify-dist.mjs` gates the **shipped artifact** (both `dist/index.js` and `dist/index.mjs`, plus cross-feeding one copy's errors through the other). The original bug was reproduced against `dist/` while `src` sat at 100% coverage: jest sets `collectCoverageFrom: ['src/**/*.ts']` and has never loaded `dist/`. **Coverage was not the gap; the gate was.**

### Known Related Issue (out of scope)

Two residues were measured during this change and deliberately left alone. Both are pre-existing and unrelated to the symbol leak; file separately rather than expanding this fix.

1. **`_truncated` / `_truncated_<key>`** (`utils.ts`) are internal markers written as own **string** keys, which ADR-007 says internal state should never be. They do copy forward on re-normalization — but, measured, they copy forward **idempotently**: `stderr(stderr(x))` carries the same marker with the same value, and does not accumulate. So this is the same _category_ as the symbol leak but **not** the same severity: there is no self-amplification. Arguably they are intended output (they describe the payload, not the library's config), which is why they are not simply swept into `LEGACY_LEAK_KEYS`. Needs a decision, not a patch.

2. **Nested error stacks are re-minted on re-normalization.** `stack` is in `STANDARD_ERROR_KEYS`, so it is never copied; only the _top-level_ stack is restored (`stderr.ts`, via `originalStack`). Errors nested in `cause` / `errors` therefore get a fresh stack pointing **inside stderr-lib** instead of at the original throw site. This is the sole reason full idempotence over `toJSON()` does not hold.

**Measured invariant**: with `stack` stripped, `stderr(stderr(v))` is deep-equal to `stderr(v)` across 2000 fast-check `fc.anything()` inputs. Idempotence holds **modulo stack**; the gated fuzz property in `test/stderr.fuzz.test.ts` asserts the narrower no-leak invariant so it stays green independent of item 2.

---

## Summary of v2.0 Changes

### Breaking Changes

1. ✅ Result pattern: `data` → `value`
2. ✅ Removed options: `originalStack`, `includeNonEnumerable`
3. ✅ Added options validation (throws on invalid input)

### New Features

1. ✅ Bounded loops with safety limits
2. ✅ Validated `maxDepth` getter/setter
3. ✅ Refactored for modularity

### Philosophy

**Explicit over implicit**: Force clear error handling patterns  
**Simple over complex**: Minimal API surface, focused purpose  
**Safe by default**: Bounded recursion, validated options, graceful degradation

---

## Decision Log

| ADR | Title                                   | Status      | Impact                                  |
| --- | --------------------------------------- | ----------- | --------------------------------------- |
| 001 | Recursion with Bounded Depth            | ✅ Accepted | Keep recursion                          |
| 002 | maxDepth Semantics                      | ✅ Accepted | Exclusive, arrays transparent           |
| 003 | Bounded Loops for Safety                | ✅ Accepted | Added safety limits                     |
| 004 | No Timeouts in tryCatch                 | ✅ Accepted | User responsibility                     |
| 005 | Errors Are Mutable                      | ✅ Accepted | Match standard Error                    |
| 006 | No Built-in Sanitization                | ✅ Accepted | User responsibility                     |
| 007 | Internal State Is Never An Own Property | ✅ Accepted | WeakMap side table; stderr() idempotent |

---

## Review Schedule

**Next Review**: Before v3.0 (as needed)  
**Trigger Events**: Major feature requests, security issues, standard updates  
**Process**: Evaluate decisions against actual usage patterns and feedback
