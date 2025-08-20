# How to Publish to NPM

Follow these steps to publish `stderr` to [npm](https://www.npmjs.com/):

## Prerequisites

1. **NPM Account:** Create an account at [npmjs.com](https://www.npmjs.com/) if you don't have one.
2. **Authenticate:** Login to npm from the command line:
   ```bash
   npm login
   ```

## Steps to Publish

### 1. Test Everything Locally

```bash
# Run tests and check coverage
pnpm test

# Check the package contents
pnpm dry-run
```

### 2. Version the Package

Choose the appropriate version bump:

```bash
# For bug fixes (1.0.0 → 1.0.1)
pnpm version:patch

# For new features (1.0.0 → 1.1.0)
pnpm version:minor

# For breaking changes (1.0.0 → 2.0.0)
pnpm version:major
```

This automatically:
- Runs linting and tests
- Updates version in package.json
- Creates a git commit and tag
- Pushes to GitHub with tags

### 3. Publish to NPM

```bash
npm publish
```

For first-time publishing:
```bash
npm publish --access public
```

This automatically:
- Cleans and rebuilds the dist folder
- Runs all tests
- Publishes to npm
- Shows the published package info

## Post-Publish Verification

The package info will automatically display after publishing. You can also verify at:
- https://www.npmjs.com/package/stderr
- https://github.com/MichaelLeeHobbs/stderr/releases

## Notes

- The `prepublishOnly` script ensures the package is always built, tested, and linted before publishing
- The `postversion` script automatically pushes changes and tags to GitHub
- Use `pnpm dry-run` anytime to preview what will be published
