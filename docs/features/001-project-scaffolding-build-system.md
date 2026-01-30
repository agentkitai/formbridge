# Feature 001 — Project Scaffolding & Build System

> **Status:** IMPLEMENTED | **Phase:** 1 | **Priority:** must | **Complexity:** medium | **Impact:** high
> **[Back to Feature Index](../FEATURES.md)**

## Implementation Summary

> Implemented as the first task of the initial FormBridge build. Establishes the monorepo structure, TypeScript configuration, build tooling, test framework, and linting for all subsequent features.

**Key files:**
- `package.json` (root) -- npm workspace root, scripts, dependencies
- `tsconfig.json` -- root TypeScript configuration (ES2022, strict mode)
- `tsconfig.base.json` -- shared base TypeScript config for packages
- `.eslintrc.json` -- ESLint configuration
- `.prettierrc` / `.prettierignore` -- Prettier configuration
- `vitest.config.ts` -- Vitest test runner config with coverage thresholds
- `tsup.config.ts` -- tsup bundler config (ESM output, declarations, sourcemaps)
- `packages/core/package.json`, `packages/core/tsup.config.ts`, `packages/core/src/index.ts`
- `packages/react/package.json`, `packages/react/tsup.config.ts`, `packages/react/src/index.ts`
- `packages/mcp/package.json`, `packages/mcp/tsup.config.ts`, `packages/mcp/src/index.ts`
- `packages/schema-normalizer/package.json`, `packages/schema-normalizer/vitest.config.ts`, `packages/schema-normalizer/src/index.ts`

**Known issues:**
- `packages/core/src/index.ts` and `packages/mcp/src/index.ts` are stubs with minimal/placeholder content. The primary logic lives in `src/` (root-level) rather than within the monorepo packages. The monorepo package structure exists but is not the primary code location for Features 003-004.

## Summary

Feature 001 initializes the FormBridge monorepo from scratch with a complete development environment. It establishes npm workspaces containing four packages (`@formbridge/core`, `@formbridge/react`, `@formbridge/mcp`, `@formbridge/schema-normalizer`), configures TypeScript in strict mode targeting ES2022, sets up tsup for ESM bundling with declaration files, configures Vitest with V8 coverage at 80% thresholds, and installs ESLint and Prettier for code quality. This foundation enables all subsequent features to build on a consistent, type-safe, tested codebase.

## Dependencies

**Upstream:** None (greenfield project)
**Downstream:** ALL other features depend on this (002-023)

## Architecture & Design

- **Monorepo layout:** npm workspaces under `packages/` directory. Four packages: `core`, `react`, `mcp`, `schema-normalizer`. Root `src/` contains the HTTP server and MCP server code.
- **TypeScript:** Strict mode with all strict checks enabled (`strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `noUncheckedIndexedAccess`, `noImplicitOverride`). Target ES2022, module ESNext with bundler resolution. `tsconfig.base.json` provides shared config that packages extend.
- **Build system:** tsup configured for ESM-only output (`format: ['esm']`), with declaration generation, source maps, tree shaking, targeting ES2022 on Node platform. Root `package.json` has `"type": "module"` for native ESM.
- **Test framework:** Vitest with global test APIs, Node environment. Coverage via V8 provider with 80% line/function/branch/statement thresholds. Test timeout of 10 seconds.
- **Linting:** ESLint with JSON config (`.eslintrc.json`). Prettier with separate config (`.prettierrc`) and ignore file (`.prettierignore`).
- **Key dependencies:** TypeScript ^5.3, Vitest ^1.0, tsup ^8.0, Hono ^4.0, Ajv ^8.12, Zod ^3.25, `@modelcontextprotocol/sdk` ^1.0.

## Implementation Tasks

### Task 1: Initialize Monorepo Root
- [x] Create root `package.json` with npm workspace configuration
- [x] Configure `"type": "module"` for ESM support
- [x] Define workspace paths pointing to `packages/*`
- [x] Add root-level scripts (`build`, `test`, `typecheck`, `clean`, `dev`)
- [x] Set Node engine requirement (`>=18.0.0`)
**Validation:** `npm install` succeeds; workspace packages are linked.

### Task 2: TypeScript Configuration
- [x] Create `tsconfig.json` with strict mode and all strict checks
- [x] Target ES2022 with ESNext module system and bundler module resolution
- [x] Enable declaration and declaration map generation
- [x] Create `tsconfig.base.json` for shared configuration across packages
- [x] Configure include/exclude paths (`src/**/*`, `tests/**/*`, `examples/**/*`)
- [x] Enable `verbatimModuleSyntax` for explicit type imports
**Validation:** `tsc --noEmit` passes with zero errors.

### Task 3: Package Scaffolding
- [x] Create `packages/core/` with `package.json`, `tsup.config.ts`, `src/index.ts`
- [x] Create `packages/react/` with `package.json`, `tsup.config.ts`, `src/index.ts`
- [x] Create `packages/mcp/` with `package.json`, `tsup.config.ts`, `src/index.ts`
- [x] Create `packages/schema-normalizer/` with `package.json`, `vitest.config.ts`, `src/index.ts`
- [x] Configure each package with correct `name`, `main`, `types`, `exports` fields
- [x] Add per-package build and test scripts
**Validation:** Each package directory exists with valid `package.json` and entry point.

### Task 4: Build System (tsup)
- [x] Install tsup ^8.0 as dev dependency
- [x] Configure root `tsup.config.ts` for ESM output with declarations
- [x] Enable source maps and tree shaking
- [x] Set target to ES2022, platform to Node
- [x] Configure `skipNodeModulesBundle` to avoid bundling dependencies
- [x] Per-package tsup configs inherit root patterns
**Validation:** `npm run build` produces `dist/` with `.js`, `.d.ts`, and `.map` files.

### Task 5: Test Framework (Vitest)
- [x] Install Vitest ^1.0 and `@vitest/coverage-v8` as dev dependencies
- [x] Create `vitest.config.ts` with globals, Node environment, coverage config
- [x] Set coverage thresholds to 80% (lines, functions, branches, statements)
- [x] Configure test file patterns (`src/**/*.test.ts`, `tests/**/*.test.ts`)
- [x] Set test timeout to 10 seconds
- [x] Add placeholder test files for each package (`__tests__/index.test.ts`)
**Validation:** `npm test` runs and reports results for placeholder tests.

### Task 6: Linting & Formatting
- [x] Install and configure ESLint (`.eslintrc.json`)
- [x] Install and configure Prettier (`.prettierrc`, `.prettierignore`)
- [x] Ensure linting rules are compatible with TypeScript strict mode
- [x] Configure ignore patterns for `dist/`, `node_modules/`, generated files
**Validation:** `eslint` and `prettier --check` pass on all source files.

### Task 7: Workspace References & Dependencies
- [x] Install core dependencies: Hono ^4.0, Ajv ^8.12, Zod ^3.25, Express ^4.18
- [x] Install MCP SDK: `@modelcontextprotocol/sdk` ^1.0
- [x] Install dev dependencies: TypeScript ^5.3, `@types/node` ^20, `@types/express` ^4.17
- [x] Configure `zod` as optional peer dependency for schema-normalizer
- [x] Verify packages can import from workspace siblings
**Validation:** All dependencies resolve; cross-package imports compile without error.

## Test Plan

| Type | Description | Count |
|------|------------|-------|
| Unit | Placeholder tests in each package (`packages/*/src/__tests__/index.test.ts`) | 3 |
| Build | TypeScript compilation succeeds across all packages | 1 |
| Lint | ESLint and Prettier pass on all source files | 1 |

## Documentation Tasks
- [x] Root `package.json` documented with workspace config and scripts
- [x] TypeScript config annotated with JSDoc-style comments explaining each section
- [x] Package entry points (`index.ts`) include module-level JSDoc

## Code Review Checklist
- [x] Type safety verified (strict mode with all checks enabled)
- [x] Patterns consistent (all packages follow same structure: `package.json` + `tsup.config.ts` + `src/index.ts`)
- [x] No regressions (greenfield -- no prior code)
- [x] Performance acceptable (tsup tree-shaking enabled, source maps for debugging)

## Deployment & Release
- **Backward compatibility:** N/A (greenfield project)
- **Migration:** None required
- **Versioning:** All packages start at 0.1.0

## Observability & Monitoring
- **Logging:** No logging at scaffolding level
- **Build health:** TypeScript `--noEmit` check, Vitest runner, ESLint

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Package stub divergence from root `src/` | High | Medium | Known issue: core logic in `src/` not `packages/core/`. Future refactor to consolidate. |
| Dependency version conflicts across packages | Low | Medium | All packages pin to compatible version ranges; npm workspace hoisting handles dedup. |
| ESM-only may limit compatibility | Low | Low | Target audience is Node 18+ and modern bundlers; CJS not required. |

## Definition of Done
- [x] All acceptance criteria met
- [x] Tests passing (placeholder tests execute)
- [x] Code reviewed
- [x] Documentation updated
- [x] Monorepo structure exists with @formbridge/core, @formbridge/react, @formbridge/mcp, @formbridge/schema-normalizer
- [x] TypeScript compiles with strict mode across all packages
- [x] Vitest runs and reports results
- [x] ESLint and Prettier configured and passing
- [x] Build produces ESM outputs with declarations
- [x] Package.json files have correct exports and type definitions
