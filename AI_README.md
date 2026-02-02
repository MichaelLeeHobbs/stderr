# AI_README.md

TypeScript error handling library. Two exports: `stderr()` and `tryCatch()`.

## stderr(input)

Normalizes any value into a `StdError` instance. Use for logging/serializing errors.

```typescript
import { stderr } from 'stderr-lib';
const err = stderr(unknownError);
console.log(err.toString()); // human-readable
console.log(JSON.stringify(err)); // uses toJSON()
```

## tryCatch(fn)

Wraps sync/async functions in Result pattern. Forces explicit error handling.

```typescript
import { tryCatch } from 'stderr-lib';

// Returns: { ok: true, value: T, error: null } | { ok: false, value: null, error: StdError }
const result = await tryCatch(async () => fetchData());
if (!result.ok) {
    console.error(result.error);
    return;
}
console.log(result.value);
```

## Implicit vs Explicit Typing

**Use implicit typing (default).** TypeScript infers the return type automatically.

```typescript
// PREFERRED - implicit typing
const result = await tryCatch(async () => {
    return { id: 1, name: 'test' };
});
// result.value is correctly typed as { id: number; name: string }
```

**Use explicit typing only when:**

1. The return type cannot be inferred (external API, complex generics)
2. You need to widen/narrow the type explicitly

```typescript
// Explicit typing - only when necessary
const result = await tryCatch<UserDto>(async () => {
    return await externalApi.getUser();
});
```

## mapError (optional)

Transform StdError to custom error type:

```typescript
type AppError = { code: string; message: string };
const result = tryCatch(
    () => riskyOperation(),
    err => ({ code: err.name, message: err.message })
);
// result.error is AppError, not StdError
```

## Result Type

```typescript
type Result<T, E = StdError> = { ok: true; value: T; error: null } | { ok: false; value: null; error: E };
```
