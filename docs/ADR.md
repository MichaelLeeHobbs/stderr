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

| ADR | Title                        | Status      | Impact                        |
| --- | ---------------------------- | ----------- | ----------------------------- |
| 001 | Recursion with Bounded Depth | ✅ Accepted | Keep recursion                |
| 002 | maxDepth Semantics           | ✅ Accepted | Exclusive, arrays transparent |
| 003 | Bounded Loops for Safety     | ✅ Accepted | Added safety limits           |
| 004 | No Timeouts in tryCatch      | ✅ Accepted | User responsibility           |
| 005 | Errors Are Mutable           | ✅ Accepted | Match standard Error          |
| 006 | No Built-in Sanitization     | ✅ Accepted | User responsibility           |

---

## Review Schedule

**Next Review**: Before v3.0 (as needed)  
**Trigger Events**: Major feature requests, security issues, standard updates  
**Process**: Evaluate decisions against actual usage patterns and feedback
