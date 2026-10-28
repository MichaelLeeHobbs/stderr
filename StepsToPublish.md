# How to Publish to NPM

Releases are published by the [Publish workflow](./.github/workflows/publish.yml) when a `v*` tag is pushed. It runs the
tests with coverage, builds, runs `verify:dist`, publishes to npm with provenance and creates a GitHub release.

## One-Time Setup: npm Trusted Publishing

The workflow has no npm token. It authenticates with npm trusted publishing (OIDC), which the package owner sets up once:

1. Sign in at [npmjs.com](https://www.npmjs.com/) and open the `stderr-lib` package settings.
2. Under **Trusted Publisher**, add a GitHub Actions publisher with:
    - Organization or user: `MichaelLeeHobbs`
    - Repository: `stderr`
    - Workflow filename: `publish.yml`
    - Environment: leave empty

## Releasing a Version

1. On a branch, set `version` in `package.json` and add the release to `CHANGELOG.md`. Merge it to `main` once CI is green.
2. Tag the merge commit on `main` and push the tag:

    ```bash
    git checkout main && git pull
    git tag -a v3.0.0 -m "v3.0.0"
    git push origin v3.0.0
    ```

3. Watch the Publish run under the repository's **Actions** tab. If it fails at `npm publish` because trusted publishing is
   not set up, do the one-time setup above and re-run the failed job.

The tag must match `package.json`'s version, since npm publishes the version in `package.json`.

## Post-Publish Verification

- https://www.npmjs.com/package/stderr-lib
- https://github.com/MichaelLeeHobbs/stderr/releases

```bash
npm view stderr-lib version
pnpm dry-run   # preview the package contents locally at any time
```
