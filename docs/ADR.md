# Architecture Decision Records

**Project**: stderr-lib  
**Version**: 2.0  
**Last Updated**: 2025-11-21

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

_Note: JS/TS is fundamentally unsuitable for hard real-time due to GC, JIT, non-deterministic timing_

---

## ADR-002: No Result Utility Functions

**Status**: ✅ Accepted  
**Date**: 2025-11-21

### Context

Initial library included `mapResult`, `unwrapOr`, `andThen`, `orElse` for functional-style Result handling. These enabled chaining and transformations without explicit error checks.

### Decision

**Removed all Result utility functions.**

Deleted: `mapResult`, `unwrapOr`, `andThen`, `orElse` (~70 lines removed)

### Rationale

**Core Philosophy**: `tryCatch` exists to **force explicit error handling**

Utilities violated this by:

- Enabling error swallowing (`unwrapOr` returns default without logging)
- Encouraging chaining without error checks (`mapResult`, `andThen`)
- Recreating promise chaining anti-pattern (defeats the purpose)

### Examples

```typescript
// ❌ BAD: Utilities hide error handling
const value = unwrapOr(
    mapResult(result, x => x * 2),
    0
);
// Where's the error logged? Nowhere!

// ✅ GOOD: Explicit error handling
const result = tryCatch(() => compute());
if (!result.ok) {
    logger.error('Compute failed', result.error);
    return 0;
}
return result.value * 2;
```

### For Users Who Want Chaining

Use libraries designed for that purpose:

- **neverthrow**: Functional Result library
- **fp-ts**: Either type with full FP utilities
- **Write your own**: Functions are simple to implement if truly needed

### Impact

**Breaking Change**: v1.x → v2.0  
**Migration**: Replace utility calls with explicit error handling (better pattern)  
**Benefit**: Simpler library with clear, opinionated philosophy

---

## ADR-003: Result Pattern Uses `value` Property

**Status**: ✅ Accepted  
**Date**: 2025-11-21

### Context

Initial Result type used `data` property. TypeScript ecosystem standard is `value`.

### Decision

**Changed Result pattern from `data` to `value`.**

```typescript
// Before (v1.x)
type Result<T, E> = { ok: true; data: T; error: null } | { ok: false; data: null; error: E };

// After (v2.0)
type Result<T, E> = { ok: true; value: T; error: null } | { ok: false; value: null; error: E };
```

### Rationale

1. **Standard Compliance**: Aligns with TypeScript Result pattern conventions
2. **Consistency**: Matches neverthrow, fp-ts, and other TS libraries
3. **Clarity**: `value` is more descriptive than `data`

### Impact

**Breaking Change**: v1.x → v2.0  
**Migration**: Replace `result.data` with `result.value`

---

## ADR-004: Bounded Loops for Safety

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

## ADR-005: Simplified Options (Removed originalStack, includeNonEnumerable)

**Status**: ✅ Accepted  
**Date**: 2025-11-21

### Context

Library had options for `originalStack` (override stack trace) and `includeNonEnumerable` (control property copying).

### Decision

**Removed both options. Behavior is now fixed.**

- **Stack traces**: Always preserved from original error
- **Non-enumerable properties**: Always included (complete error capture)

### Rationale

1. **Simplicity**: Fewer options = easier to use and understand
2. **Correct Defaults**: Original behavior was always the right choice
3. **No Valid Use Cases**:
    - Why would you want to replace original stack?
    - Why would you skip non-enumerable properties?

### Impact

**Breaking Change**: v1.x → v2.0 (removed options)  
**Migration**: Remove these options from calls (behavior unchanged for defaults)

---

## ADR-006: Options Validation

**Status**: ✅ Accepted  
**Date**: 2025-11-21

### Context

Options were not validated, allowing invalid values to cause runtime issues.

### Decision

**All options are validated on input.**

`maxDepth`:

- Must be integer
- Range: 1-1000
- Validated via getter/setter AND on function call
- Throws `TypeError` or `RangeError` for invalid values

### Rationale

1. **Fail Fast**: Catch configuration errors immediately
2. **Clear Errors**: Descriptive error messages for invalid inputs
3. **Safety**: Prevents edge cases from invalid configurations

### Implementation

```typescript
// Validation on stderr.maxDepth assignment
Object.defineProperty(stderr, 'maxDepth', {
    set(value: number) {
        if (!Number.isInteger(value)) throw new TypeError('maxDepth must be an integer');
        if (value < 1 || value > 1000) throw new RangeError('maxDepth must be between 1 and 1000');
        _maxDepth = value;
    },
});

// Validation on options parameter
if (options.maxDepth !== undefined) {
    if (!Number.isInteger(options.maxDepth)) throw new TypeError('maxDepth must be an integer');
    if (options.maxDepth < 1 || options.maxDepth > 1000) throw new RangeError('maxDepth must be between 1 and 1000');
}
```

---

## ADR-007: No Timeouts in tryCatch

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

## ADR-008: Errors Are Mutable

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

## ADR-009: Security - No Additional Sanitization

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

## ADR-010: Refactored Functions for Modularity

**Status**: ✅ Accepted  
**Date**: 2025-11-21  
**Updated**: 2025-11-23

### Context

Original `normalizeObjectToError` was ~150 lines with mixed concerns.

### Decision

**Broke down large functions into focused helpers (≤40 lines each).**

Created helpers:

- `normalizeCause()` - 30 lines
- `normalizeErrorsArray()` - 25 lines
- `normalizeErrorsSingle()` - 18 lines
- `normalizeErrorsObject()` - 37 lines

### Rationale

1. **Readability**: Each function has single responsibility
2. **Testability**: Helpers can be tested independently
3. **Maintainability**: Easier to understand and modify
4. **Compliance**: Meets mission-critical standard (≤40 lines per function)

### Impact

Main function reduced from ~150 lines to ~70 lines. Total code slightly longer (~180 lines) but much more maintainable.

### Implementation Note: Symbol for Internal State

To prevent property name collisions with real-world errors, internal StdError metadata (like `maxDepth`) is stored using JavaScript Symbols:

```typescript
const MAX_DEPTH_SYMBOL = Symbol('stderr_maxDepth');
```

**Benefits**:

- Won't collide with user error properties (even if they have `_maxDepth`)
- Won't appear in `Object.keys()`, `for...in`, `JSON.stringify()`
- Won't leak into error output (`toString()`, `toJSON()`)
- Still accessible internally via `this[MAX_DEPTH_SYMBOL]`

This ensures internal state remains truly private and isolated from user data.

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

| ADR | Title                        | Status      | Impact                      |
| --- | ---------------------------- | ----------- | --------------------------- |
| 001 | Recursion with Bounded Depth | ✅ Accepted | Keep recursion              |
| 002 | No Result Utility Functions  | ✅ Accepted | Breaking: Removed utilities |
| 003 | Result Uses `value` Property | ✅ Accepted | Breaking: Renamed property  |
| 004 | Bounded Loops for Safety     | ✅ Accepted | Added safety limits         |
| 005 | Simplified Options           | ✅ Accepted | Breaking: Removed options   |
| 006 | Options Validation           | ✅ Accepted | Throws on invalid input     |
| 007 | No Timeouts in tryCatch      | ✅ Accepted | User responsibility         |
| 008 | Errors Are Mutable           | ✅ Accepted | Match standard Error        |
| 009 | No Built-in Sanitization     | ✅ Accepted | User responsibility         |
| 010 | Refactored for Modularity    | ✅ Accepted | Code structure              |

---

## Review Schedule

**Next Review**: Before v3.0 (as needed)  
**Trigger Events**: Major feature requests, security issues, standard updates  
**Process**: Evaluate decisions against actual usage patterns and feedback
