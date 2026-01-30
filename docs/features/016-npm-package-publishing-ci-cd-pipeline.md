# Feature 016 --- npm Package Publishing & CI/CD Pipeline

> **Status:** PLANNED | **Phase:** 4 | **Priority:** should | **Complexity:** medium | **Impact:** high
> **[Back to Feature Index](../FEATURES.md)**

## Summary

Establish an automated CI/CD pipeline using GitHub Actions that lints, type-checks, tests, and builds the FormBridge packages on every pull request, and publishes to npm on tagged releases. The pipeline will enforce semver versioning, generate conventional commit changelogs, produce dual ESM/CJS output with TypeScript declarations, attach npm provenance attestations, track package size, and run integration tests against real MCP and HTTP transports. All packages will be published under the `@formbridge` npm scope with README, LICENSE, and CHANGELOG included in the published artifacts.

## Dependencies

**Upstream:** Feature 1 (Project Setup & TypeScript Configuration) -- the build system, TypeScript configuration, and package.json structure must be in place.

**Downstream:** None -- CI/CD is a leaf infrastructure concern that enables all other features to be published.

**Internal task ordering:**
1. Task 1 (CI workflow) must complete first -- it establishes the foundation that all other tasks depend on.
2. Task 2 (release workflow) depends on Task 1 and Task 3 (changesets/conventional commits).
3. Task 3 (changeset or conventional commits setup) can proceed in parallel with Task 1.
4. Task 4 (provenance) depends on Task 2.
5. Task 5 (package size tracking) can proceed in parallel with Tasks 2--4.
6. Task 6 (integration test setup) depends on Task 1.
7. Task 7 (package.json exports configuration) should precede Task 2 (release workflow needs correct exports).
8. Task 8 (README/LICENSE/CHANGELOG inclusion) should precede Task 2.
9. Task 9 (npm scope configuration) should precede Task 2.

## Architecture & Design

### Components and files to create
- `.github/workflows/ci.yml` -- CI workflow (lint, type-check, test, build) on every PR and push to main
- `.github/workflows/release.yml` -- Release workflow (version bump, changelog, npm publish) on tagged releases or manual trigger
- `.changeset/config.json` -- Changesets configuration (if using Changesets) OR `commitlint.config.js` + `release.config.js` (if using Conventional Commits + semantic-release)
- `.github/workflows/size.yml` -- Package size tracking workflow (optional, can be part of CI)
- `tests/integration/mcp-integration.test.ts` -- Integration tests against real MCP transport
- `tests/integration/http-integration.test.ts` -- Integration tests against real HTTP server

### Components and files to modify
- `package.json` -- add `exports` map for ESM/CJS dual output, `types` field, `files` field, `publishConfig`, `scripts` for linting and building
- `tsconfig.json` -- ensure `declaration: true`, `declarationMap: true`, output directory alignment with `exports` map
- `tsconfig.build.json` (create if needed) -- production build configuration excluding tests
- `.gitignore` -- ensure `dist/` is ignored

### Design decisions
- **Changesets vs Conventional Commits:** Use Changesets (`@changesets/cli`) for version management. Changesets provide explicit, human-authored changelogs and support monorepo versioning if FormBridge expands to multiple packages. Alternative: semantic-release with Conventional Commits for fully automated versioning.
- **Dual ESM/CJS output:** Use `tsup` (already in devDependencies) to produce both ESM (`.mjs`) and CJS (`.cjs`) bundles with `.d.ts` declarations. The `exports` map in `package.json` routes consumers to the correct format.
- **Provenance:** Enable npm provenance attestation via `--provenance` flag in the publish step, which requires the workflow to run on GitHub Actions with `id-token: write` permission.
- **Package size tracking:** Use `size-limit` to set budgets for the published package size and fail CI if budgets are exceeded.
- **npm scope:** All packages publish under `@formbridge/` scope. The main package is `@formbridge/mcp-server` (already configured in `package.json`).

### Patterns to follow
- GitHub Actions workflow structure follows community best practices: separate CI and release workflows, matrix testing for multiple Node.js versions.
- Package exports follow the Node.js subpath exports pattern for dual ESM/CJS.

## Implementation Tasks

### Task 1: Create CI Workflow

- [ ] Create `.github/workflows/ci.yml`
- [ ] Trigger on: push to main, pull requests targeting main
- [ ] Set up Node.js environment (matrix: Node 18, 20, 22)
- [ ] Cache npm dependencies using `actions/cache` with `node_modules` and `~/.npm`
- [ ] Add lint step: `npm run lint` (add ESLint configuration if not present)
- [ ] Add type-check step: `npm run typecheck` (already configured as `tsc --noEmit`)
- [ ] Add test step: `npm run test:run` (already configured for Vitest)
- [ ] Add build step: `npm run build` (compile TypeScript to dist/)
- [ ] Add coverage reporting: upload coverage to a service (Codecov or GitHub summary)
- [ ] Ensure workflow fails on any step failure
- [ ] Add status badge to README

**Dependencies:** None
**Effort:** M
**Validation:** CI runs on every PR. All four steps (lint, type-check, test, build) execute. Workflow passes on the current codebase. Matrix tests run on Node 18, 20, and 22.

### Task 2: Create Release Workflow

- [ ] Create `.github/workflows/release.yml`
- [ ] Trigger on: push of version tags (`v*`), or manual workflow dispatch
- [ ] Set up Node.js environment (latest LTS)
- [ ] Run full CI checks (lint, type-check, test, build) before publishing
- [ ] Build production artifacts using `tsup` for dual ESM/CJS output
- [ ] Publish to npm registry using `npm publish --access public`
- [ ] Configure `NPM_TOKEN` as a GitHub repository secret
- [ ] Create a GitHub Release with auto-generated release notes from the tag
- [ ] Upload build artifacts to the GitHub Release
- [ ] Send notification (GitHub Action summary) on successful publish

**Dependencies:** Tasks 1, 3
**Effort:** M
**Validation:** Tagging a release (e.g., `v0.2.0`) triggers the release workflow. The package is published to npm with correct version. GitHub Release is created with release notes. Workflow fails if CI checks fail.

### Task 3: Set Up Changesets for Version Management

- [ ] Install `@changesets/cli` as a devDependency
- [ ] Run `npx changeset init` to create `.changeset/config.json`
- [ ] Configure Changesets: `access: "public"`, `baseBranch: "main"`, `changelog: "@changesets/changelog-github"`
- [ ] Add `changeset` script to `package.json`: `"changeset": "changeset"`
- [ ] Add `version` script: `"version": "changeset version"`
- [ ] Add `release` script: `"release": "changeset publish"`
- [ ] Optionally, add the Changesets GitHub bot for PR-based version management
- [ ] Document the release process: create changeset, merge PR, version bump, publish
- [ ] Add `CHANGELOG.md` to the repository root (auto-generated by Changesets)

**Dependencies:** None
**Effort:** S
**Validation:** `npx changeset` creates a changeset file. `npx changeset version` bumps version and updates CHANGELOG.md. Changeset configuration is valid.

### Task 4: Configure npm Provenance Attestation

- [ ] Add `--provenance` flag to the npm publish command in the release workflow
- [ ] Add `id-token: write` permission to the release workflow job
- [ ] Add `permissions` block to the workflow: `contents: read`, `id-token: write`
- [ ] Verify provenance is attached to the published package on npmjs.com
- [ ] Document provenance verification for consumers

**Dependencies:** Task 2
**Effort:** S
**Validation:** Published package on npmjs.com shows a green provenance badge. The SLSA provenance attestation is verifiable. Workflow has correct permissions.

### Task 5: Set Up Package Size Tracking

- [ ] Install `size-limit` and `@size-limit/preset-small-lib` as devDependencies
- [ ] Create `.size-limit.js` or add `size-limit` configuration to `package.json`
- [ ] Set initial size budgets based on current build output (e.g., ESM bundle < 50KB, CJS bundle < 60KB)
- [ ] Add `size` script to `package.json`: `"size": "size-limit"`
- [ ] Add `size-check` script: `"size-check": "size-limit --check"`
- [ ] Add size check step to CI workflow (run after build)
- [ ] Configure `size-limit` GitHub Action to report size changes on PRs as comments
- [ ] Document size budgets and how to update them

**Dependencies:** Task 1
**Effort:** S
**Validation:** `npm run size` reports current package sizes. `npm run size-check` fails if budgets are exceeded. PR comments show size impact of changes.

### Task 6: Set Up Integration Tests

- [ ] Create `tests/integration/` directory
- [ ] Write `mcp-integration.test.ts`: start a real MCP server with stdio transport, connect a client, exercise create/set/validate/submit tool calls
- [ ] Write `http-integration.test.ts`: start a real Express server, make HTTP requests to submission endpoints, verify response shapes
- [ ] Use Vitest for test execution
- [ ] Add test data fixtures (intake definitions, sample submissions)
- [ ] Add `test:integration` script to `package.json`
- [ ] Add integration test step to CI workflow (runs after unit tests)
- [ ] Ensure integration tests clean up resources (close servers, clear stores)

**Dependencies:** Task 1
**Effort:** L
**Validation:** MCP integration test exercises the full MCP tool call flow. HTTP integration test exercises the full HTTP API flow. Both tests pass in CI. Servers start and stop cleanly.

### Task 7: Configure package.json Exports and TypeScript Declarations

- [ ] Configure `tsup` build to produce: ESM output (`.js` with `"type": "module"`), CJS output (`.cjs`), TypeScript declarations (`.d.ts`)
- [ ] Update `package.json` `exports` map:
  ```
  ".": {
    "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
  }
  ```
- [ ] Set `"main": "./dist/index.cjs"` for CJS consumers
- [ ] Set `"module": "./dist/index.js"` for ESM consumers
- [ ] Set `"types": "./dist/index.d.ts"` for TypeScript consumers
- [ ] Verify the package works when imported via `import` (ESM) and `require()` (CJS)
- [ ] Verify TypeScript types resolve correctly in consumer projects
- [ ] Add `tsup.config.ts` with dual-format build configuration
- [ ] Test with `npm pack` and inspect the tarball contents

**Dependencies:** None (should precede Task 2)
**Effort:** M
**Validation:** `npm pack` produces a tarball with ESM, CJS, and declaration files. Importing the package in an ESM project works. Requiring the package in a CJS project works. TypeScript types resolve in a consumer project.

### Task 8: Include README, LICENSE, and CHANGELOG in Published Package

- [ ] Verify `LICENSE` file exists at the repository root (MIT license, per `package.json`)
- [ ] Create `LICENSE` file if it does not exist
- [ ] Verify `README.md` exists and includes: project description, installation instructions, quickstart example, links to documentation
- [ ] Verify `CHANGELOG.md` is generated by Changesets (Task 3)
- [ ] Update `package.json` `files` field to include `dist`, `README.md`, `LICENSE`, `CHANGELOG.md`
- [ ] Verify all three files are included in the npm tarball (`npm pack --dry-run`)

**Dependencies:** Task 3
**Effort:** S
**Validation:** `npm pack --dry-run` lists README.md, LICENSE, and CHANGELOG.md. The published package on npmjs.com displays the README.

### Task 9: Configure npm Scope

- [ ] Verify `package.json` `name` is `@formbridge/mcp-server` (already configured)
- [ ] Add `publishConfig` to `package.json`: `{ "access": "public", "registry": "https://registry.npmjs.org/" }`
- [ ] Ensure the `@formbridge` npm organization exists on npmjs.com (or create it)
- [ ] Configure `NPM_TOKEN` as a GitHub repository secret with publish permissions for the `@formbridge` scope
- [ ] Verify the scope is correct by running `npm publish --dry-run`
- [ ] Document the npm organization setup for maintainers

**Dependencies:** None (should precede Task 2)
**Effort:** S
**Validation:** `npm publish --dry-run` succeeds with the correct scope. `publishConfig` is set. NPM_TOKEN secret is configured.

## Test Plan

| Type | Description | Target Count |
|------|------------|-------------|
| Unit | Existing unit tests continue to pass in CI | Existing count |
| Integration | MCP transport integration (stdio: create, set, validate, submit) | 4--6 |
| Integration | HTTP API integration (full submission lifecycle) | 4--6 |
| Infrastructure | CI workflow executes all steps (lint, type-check, test, build) | 1 |
| Infrastructure | Release workflow publishes correctly (dry-run) | 1 |
| Infrastructure | Package size check passes within budgets | 1 |
| Infrastructure | Package exports resolve correctly (ESM, CJS, TypeScript) | 3 |

## Documentation Tasks

- [ ] Document the release process for maintainers (create changeset, version, publish)
- [ ] Document CI/CD pipeline in a `CONTRIBUTING.md` or developer guide
- [ ] Document how to run integration tests locally
- [ ] Document package size budgets and how to update them
- [ ] Document npm scope and organization setup
- [ ] Update README with CI status badge

## Code Review Checklist

- [ ] Type safety verified -- build produces correct `.d.ts` declarations
- [ ] Patterns consistent with existing codebase -- build scripts extend existing configuration
- [ ] No regressions to existing features -- CI validates all existing tests pass
- [ ] Performance acceptable -- CI completes in under 5 minutes, release in under 10 minutes
- [ ] Security reviewed -- NPM_TOKEN stored as secret, provenance attestation enabled, no credentials in workflow logs
- [ ] Dual output verified -- ESM and CJS both importable, types resolve correctly

## Deployment & Release

- **Backward compatibility:** First npm publish establishes the public API. The `exports` map ensures consumers use the correct module format. No breaking changes relative to the current `package.json` configuration.
- **Migration steps:** For existing local consumers, no changes required. The `dist/` output directory and entry point remain the same. CJS consumers gain a new `.cjs` entry point.
- **Release steps:**
  1. Merge CI and release workflows to main
  2. Run `npx changeset` to create a changeset for the initial release
  3. Run `npx changeset version` to bump to `0.2.0` (or appropriate version)
  4. Commit version bump and changelog
  5. Tag the release: `git tag v0.2.0`
  6. Push tag: `git push --tags`
  7. Release workflow publishes to npm
  8. Verify package on npmjs.com

## Observability & Monitoring

- **Logging:** GitHub Actions provides built-in step-level logging. No custom logging required.
- **Metrics to track:**
  - CI pass rate (GitHub Actions dashboard)
  - CI duration (by step: lint, type-check, test, build)
  - Package size over time (size-limit reports)
  - npm download count (npmjs.com package page)
  - Test coverage percentage (Codecov or GitHub summary)
- **Health checks:** CI status badge in README. npm package version badge.
- **Alerting:** GitHub Actions notifications on workflow failure. Optional: Slack notification on release.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| NPM_TOKEN is compromised | Low | Critical | Use fine-grained npm access tokens; rotate regularly; enable npm 2FA for the @formbridge organization; provenance attestation provides supply chain verification |
| CI is slow, blocking developer productivity | Medium | Medium | Cache dependencies aggressively; parallelize lint/type-check/test steps; use matrix builds only for Node version compatibility |
| Dual ESM/CJS build produces incompatible output | Medium | High | Test both import paths in CI; use `npm pack` + install test; verify with real consumer projects |
| Changesets workflow is confusing for contributors | Medium | Low | Document the process clearly; consider the Changesets bot for automated PR tracking; provide templates |
| Package size grows beyond budgets over time | Medium | Low | size-limit enforces budgets in CI; review size impact on every PR; refactor when needed |
| Integration tests are flaky due to port conflicts or timing | Medium | Medium | Use random ports; add timeouts and retries; isolate test fixtures; run integration tests in a separate job |

## Definition of Done

- [ ] All acceptance criteria met:
  1. GitHub Actions CI on every PR (lint, type-check, test, build)
  2. ESM/CJS output with TypeScript declarations
  3. Automated npm publish on tagged releases
  4. Provenance attestation
  5. Conventional commit changelog (via Changesets)
  6. Semver enforcement
  7. @formbridge scope
  8. Package size tracking
  9. Integration tests against real MCP/HTTP
  10. README, LICENSE, CHANGELOG in published packages
- [ ] Tests passing with adequate coverage
- [ ] Code reviewed and approved
- [ ] Documentation updated (release process, CI pipeline, contributing guide)
- [ ] No regressions in existing features
