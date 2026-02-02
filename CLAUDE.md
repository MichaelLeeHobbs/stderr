# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`stderr-lib` is a TypeScript library for standardized error handling. It provides two main exports:

- `stderr()` - normalizes any error-like value into a `StdError` instance
- `tryCatch()` - wraps sync/async code in a type-safe `Result` union pattern

## Commands

```bash
pnpm run build        # Build with tsup (outputs to dist/)
pnpm run test         # Run Jest tests
pnpm run test:watch   # Run tests in watch mode
pnpm run lint         # Run ESLint
pnpm run lint:fix     # Run ESLint with auto-fix
pnpm run typecheck    # TypeScript type checking
pnpm run typecheck:test-types  # Type-check test-types/*.test-d.ts files
```

Run a single test file:

```bash
pnpm run test -- test/stderr.test.ts
```

Run a specific test by name:

```bash
pnpm run test -- -t "test name pattern"
```

## Architecture

### Source Files (src/)

- **index.ts** - Public API exports
- **stderr.ts** - Main normalizer function with configurable limits (maxDepth, maxProperties, maxArrayLength)
- **StdError.ts** - Error class extending native Error with `toString()` and `toJSON()` methods for comprehensive output
- **tryCatch.ts** - Result pattern wrapper with sync/async detection and optional error transformation via `mapError`
- **types.ts** - Type definitions including `ErrorShape`, `ErrorRecord`, and type guards
- **utils.ts** - Internal helpers for property copying, circular detection, depth limiting
- **constants.ts** - Default limits (MAX_DEPTH=8, MAX_PROPERTIES=1000, MAX_ARRAY_LENGTH=10000)

### Test Files (test/)

- Unit tests: `*.test.ts`
- Fuzz tests using fast-check: `*.fuzz.test.ts`
- Type tests: `test-types/*.test-d.ts` (checked with tsd)

### Key Design Patterns

1. **Result Pattern**: `tryCatch()` returns `{ ok: true; value: T; error: null } | { ok: false; value: null; error: E }` forcing explicit error handling

2. **Normalization Limits**: All recursive operations respect configurable limits to prevent DoS. Limits can be set globally on `stderr` or per-call via options.

3. **Circular Reference Detection**: Uses `WeakSet` to detect and mark circular references as `'[Circular]'`

4. **Symbol Property Handling**: Symbol keys are preserved or converted to strings depending on context

## Coverage Requirements

Tests must maintain 95% coverage across branches, functions, lines, and statements (configured in jest.config.ts).
