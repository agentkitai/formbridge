# @agentkitai/formbridge-templates

## 0.3.1

### Patch Changes

- d03c737: Security and dependency updates: fix fast-uri high-severity audit advisory
  (GHSA-4c8g-83qw-93j6 / GHSA-v2hh-gcrm-f6hx), patch OpenSSL CVE-2026-45447 in
  the production Docker image, move base images to node 25-alpine, and refresh
  infra/tooling dependencies (aws-cdk 2.1133, aws-cdk-lib 2.262, constructs
  10.7, setup-node/setup-python action majors).

## 0.3.0

### Minor Changes

- Release the accumulated work since 0.2.0. Notably, schema-normalizer removes
  `require()` calls from the ESM module (fixes a runtime break in the published
  0.2.0); form-renderer / create / templates / shared carry accumulated fixes.

## 0.2.0

### Minor Changes

- Initial public release of FormBridge — mixed-mode agent-human form submission infrastructure.

  **Packages:**

  - `@agentkitai/formbridge-shared` — Isomorphic utilities (condition evaluator, step validator)
  - `@agentkitai/formbridge-create` — CLI scaffolding tool (`npx @agentkitai/formbridge-create`)
  - `@agentkitai/formbridge-form-renderer` — React components for resume forms, wizards, reviewer views
  - `@agentkitai/formbridge-schema-normalizer` — Converts Zod/JSON Schema/OpenAPI to unified IR
  - `@agentkitai/formbridge-templates` — Pre-built intake templates (vendor onboarding, IT access, etc.)

  **Quality:**

  - 1,339 tests across 50 test files
  - 85.9% code coverage
  - Zero TypeScript errors, clean ESLint
