# How to Publish to NPM

Follow these steps to publish `stderr-lib` to [npm](https://www.npmjs.com/):

## Prerequisites

1. **NPM Account:** Create an account at [npmjs.com](https://www.npmjs.com/) if you don't have one.
2. **Authenticate:** Login to npm from the command line:
    ```bash
    npm login
    ```

## First-Time Publishing

### 1. Update Package Name

Update `package.json` to use the new name:

```json
{
    "name": "stderr-lib"
    // ... rest of your package.json
}
```

### 2. Test Everything Locally

```bash
# Run tests and check coverage
pnpm test

# Check the package contents
pnpm dry-run
```

### 3. Publish to NPM

```bash
npm publish
```

This automatically:

- Cleans and rebuilds the dist folder
- Runs all tests
- Publishes to npm
- Shows the published package info

### 4. Create GitHub Release

After successful publishing:

```bash
# Create and push the version tag
git tag -a v1.0.0 -m "Initial release"
git push origin v1.0.0

# Or push all tags
git push --tags
```

Then create a GitHub release:

1. Go to https://github.com/MichaelLeeHobbs/stderr/releases
2. Click "Create a new release"
3. Choose the tag `v1.0.0`
4. Add release notes describing the features
5. Publish the release

## Subsequent Releases

### 1. Version the Package

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

### 2. Publish to NPM

```bash
npm publish
```

### 3. Create GitHub Release

Since the `postversion` script already pushed the tag, just create the release:

1. Go to https://github.com/MichaelLeeHobbs/stderr/releases
2. Click "Draft a new release"
3. Select the new tag that was just pushed
4. Add release notes
5. Publish

## Post-Publish Verification

Verify your package at:

- https://www.npmjs.com/package/stderr-lib
- https://github.com/MichaelLeeHobbs/stderr/releases

Check installation works:

```bash
npm install stderr-lib
```

## Notes

- The `prepublishOnly` script ensures the package is always built, tested, and linted before publishing
- The `postversion` script automatically pushes changes and tags to GitHub
- Use `pnpm dry-run` anytime to preview what will be published
- The GitHub repo name (`stderr`) can differ from the npm package name (`stderr-lib`)
