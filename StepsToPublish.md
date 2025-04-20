# How to Publish to NPM

Follow these steps to publish your package to [npm](https://www.npmjs.com/):

## Prerequisites

1. **NPM Account:** Ensure you have an npm account. If not, create one at [npmjs.com](https://www.npmjs.com/).
2. **Authenticated:** Login to npm from the command line:

   ```bash
   pnpm login
   ```

## Steps to Publish

### 1. Build/Lint/Test the Project and then Version it:

```bash
pnpm version:[patch | minor | major]
```

Example:

```bash
pnpm version:patch
```

### 2. Publish the Package:

```bash
pnpm publish
```

Use the `--access public` flag if it’s the first time publishing a scoped package:

```bash
pnpm publish --access public
```

### 3. Verify the Publish:

After the publish command, the post-publish script will run, `pnpm view normalize-error"`, which checks the npm registry for the package.

## Post-Publish Checklist

- Verify that the version was updated in `package.json`.


- Push the changes and tags:
  ```bash
  git add .
  git commit -m "Release version x.y.z"
  git push origin main --tags
  ```


