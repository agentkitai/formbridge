# @formbridge/shared

## 0.3.0

### Minor Changes

- Release the accumulated work since 0.2.0. Notably, schema-normalizer removes
  `require()` calls from the ESM module (fixes a runtime break in the published
  0.2.0); form-renderer / create / templates / shared carry accumulated fixes.

## 0.2.0

### Minor Changes

- Initial public release of FormBridge — mixed-mode agent-human form submission infrastructure.

  **Packages:**

  - `@formbridge/shared` — Isomorphic utilities (condition evaluator, step validator)
  - `@formbridge/create` — CLI scaffolding tool (`npx @formbridge/create`)
  - `@formbridge/form-renderer` — React components for resume forms, wizards, reviewer views
  - `@formbridge/schema-normalizer` — Converts Zod/JSON Schema/OpenAPI to unified IR
  - `@formbridge/templates` — Pre-built intake templates (vendor onboarding, IT access, etc.)

  **Quality:**

  - 1,339 tests across 50 test files
  - 85.9% code coverage
  - Zero TypeScript errors, clean ESLint
