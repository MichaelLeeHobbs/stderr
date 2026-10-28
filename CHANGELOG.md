# Changelog

All notable changes to `stderr-lib` are listed here. The project follows [Semantic Versioning](https://semver.org/).

## 3.0.0 (2026-10-28)

3.0.0 is the final feature release. The library is feature complete: future releases, if any, will only fix bugs.

Version 2.3.0 was prepared but never published; its changes are part of this release.

### Breaking changes

- **Node.js 22 or newer is required** (`engines.node` is `>=22`). Node 18 and 20 are end of life.
- **`tryCatch` never throws or rejects.** If `mapError` itself throws, the `Result` is a failure whose `error` is a `StdError`
  (not your `E`) with the original error as `cause` and the `mapError` failure as `mapErrorFailure`. Before, the `mapError`
  error escaped from `tryCatch`.
- **`tryCatch` adopts any thenable**, not only native Promises, and a function returning a `PromiseLike` is typed
  `Promise<Result>`.
- **`tryCatch(() => anyValue)` is typed `Result<any>`** instead of `Result<any> | Promise<Result<any>>`. An explicit
  `tryCatch<any>(async () => ...)` is now typed as a sync `Result`; let TypeScript infer the type there.
- **Package exports changed.** ESM consumers get `index.d.mts` and CJS consumers `index.d.ts`, and `./package.json` is exported.
  Deep imports into `dist/` are not part of the public API.
- **Output of `stderr()`, `toString()` and `toJSON()` changed** in the ways listed under "Changed" below. Code that parses this
  output or snapshots it in tests may need updating.

### Changed

- `toString()` and `toJSON()` now respect `maxDepth`, `maxProperties` and `maxArrayLength` everywhere (metadata, nested objects,
  arrays, Maps and Sets, `cause` and `errors`) and agree with each other on what they show. What they leave out is marked with
  `_truncated` or `_truncated_<key>`.
- `toJSON()` serializes `Date`, `RegExp`, `Map`, `Set` and `BigInt` values, and only emits string `name`, `message` and `stack`.
- A value that cannot be read (a throwing getter, a revoked Proxy) is shown as `'[Unreadable value]'` instead of throwing.
- Circular detection now means "is an ancestor": a shared, non-circular reference is output in full each time it appears.
- `{ message, errors: singleError }` keeps its own message (it used to become `'AggregateError'`), and a `Set` of errors becomes
  an array.
- An array `cause` becomes an `AggregateError`; a `Date` cause or root keeps its ISO text (`stderr(new Date(0)).message` was `''`);
  wrapper objects like `new String('x')` are unboxed.
- An error made from a value without a stack no longer gets a stack pointing into the library; it gets the stack of its caller.
- Re-normalizing a `StdError` is idempotent: carried-over `_truncated` markers do not count towards `maxProperties`, and user keys
  named `_truncated*` are treated as markers.
- A user property named `stderr_maxDepth` is now kept. A property literally named `Symbol(stderr_maxDepth)` is dropped (see
  [ADR-007](./docs/ADR.md#adr-007-internal-state-is-never-an-own-property)).
- `new StdError(message, { maxDepth, maxProperties, maxArrayLength })` and the `StdError.default*` statics validate their values
  with the same ranges as `stderr()`. `maxDepth: 0` throws.
- `stderr.maxDepth`, `stderr.maxProperties` and `stderr.maxArrayLength` are now part of the TypeScript types.

### Fixed

- Re-normalizing a `StdError` leaked the internal key `Symbol(stderr_maxDepth)` into `toString()` and `toJSON()`.
- Passing an explicit `undefined` option (`stderr(e, { maxDepth: undefined })`) disabled the depth limit and could overflow the stack.
- `stderr()` no longer throws on revoked Proxies or throwing getters, keeps falsy causes, keeps the original stack of nested
  errors, and only treats metadata as a nested error when it looks like one.
- Symbol keys with the same description no longer overwrite each other.
- User properties named like internal methods are no longer dropped, and truncation markers never overwrite user properties.
- The bundled class was named `_StdError`, so `StdError.name` was `'_StdError'` and `console.log` printed `_StdError [Error]`.
- An error whose `name` and `message` refer to itself no longer hangs `toString()`.

## 2.2.0 (2026-02-02)

See the [GitHub release](https://github.com/MichaelLeeHobbs/stderr/releases) and git history for 2.2.0 and earlier.
