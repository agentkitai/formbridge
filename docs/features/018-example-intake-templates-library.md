# Feature 018 — Example Intake Templates Library

> **Status:** PLANNED | **Phase:** 4 | **Priority:** Could | **Complexity:** Low | **Impact:** Medium
> **[Back to Feature Index](../FEATURES.md)**

## Summary

Provide a curated library of pre-built, real-world intake templates that developers can import as npm packages or copy-paste into their projects. Each template ships with a Zod schema, a JSON Schema equivalent, and a step-by-step walkthrough document. The library accelerates adoption by giving teams production-ready starting points for common intake workflows: vendor onboarding, IT access requests, customer intake, expense reports, and bug reports. A vendor onboarding example already exists in `packages/demo/src/schemas/vendorOnboarding.ts`; this feature formalizes and extends that pattern into a standalone, discoverable templates package.

## Dependencies

**Upstream:**
- Feature 2 (Schema Normalization) — templates depend on the IntakeSchema IR and parser infrastructure in `packages/schema-normalizer/`
- Feature 3 (Form Renderer) — templates must render correctly through `packages/form-renderer/`

**Downstream:** None

**Internal task ordering:** Template structure and packaging (Task 1) must be completed before individual templates (Tasks 2-6). JSON Schema equivalents (Task 7) depend on having the Zod schemas. Walkthroughs (Task 8) depend on finished schemas. npm packaging (Task 10) is the final task.

## Architecture & Design

### Directory Structure

```
packages/templates/
  src/
    vendor-onboarding/
      schema.ts          # Zod schema
      schema.json        # JSON Schema equivalent
      README.md          # Walkthrough
      index.ts           # Named export
    it-access-request/
      schema.ts
      schema.json
      README.md
      index.ts
    customer-intake/
      schema.ts
      schema.json
      README.md
      index.ts
    expense-report/
      schema.ts
      schema.json
      README.md
      index.ts
    bug-report/
      schema.ts
      schema.json
      README.md
      index.ts
  index.ts               # Barrel export of all templates
  package.json
  tsconfig.json
  tsup.config.ts
```

### Template Contract

Each template exports:
- `schema` — Zod schema object
- `jsonSchema` — JSON Schema equivalent (plain object)
- `metadata` — Template metadata (name, description, category, field count, required fields)

Templates must be self-contained: no runtime dependencies beyond Zod and the FormBridge schema-normalizer types. The existing `vendorOnboardingSchema` in the demo package will be migrated and enhanced as the canonical vendor onboarding template.

### Consumption Patterns

1. **npm import:** `import { vendorOnboarding } from '@formbridge/templates'`
2. **Copy-paste:** Each template directory is self-contained; developers can copy the folder into their project
3. **JSON Schema:** The `.json` files can be consumed by non-TypeScript toolchains

## Implementation Tasks

### Task 1: Template Structure and Packaging
- [ ] Create `packages/templates/` directory with `package.json`, `tsconfig.json`, and `tsup.config.ts`
- [ ] Define `TemplateMetadata` TypeScript interface (name, description, category, fieldCount, requiredFields, version)
- [ ] Create barrel `index.ts` that re-exports all templates
- [ ] Configure build to output both ESM and CJS
- [ ] Add the package to the workspace root `package.json`

**Dependencies:** None
**Effort:** S
**Validation:** Package builds successfully; empty barrel export compiles

### Task 2: Vendor Onboarding Template
- [ ] Migrate and enhance the existing schema from `packages/demo/src/schemas/vendorOnboarding.ts`
- [ ] Create Zod schema with all field types: company info (string), contact (email, phone), address (nested object), certifications (array of objects), business type (enum), file uploads (W-9, certificates)
- [ ] Add comprehensive field descriptions and examples for MCP tool generation
- [ ] Export `vendorOnboarding` with schema, JSON Schema, and metadata
- [ ] Verify the schema round-trips through `packages/schema-normalizer/`

**Dependencies:** Task 1
**Effort:** M
**Validation:** Schema validates sample vendor data; renders in form renderer; normalizer round-trip succeeds

### Task 3: IT Access Request Template
- [ ] Define Zod schema: requester info, requested system/role, access level (enum: read/write/admin), justification (textarea), manager email, start/end dates, emergency flag (boolean)
- [ ] Include conditional-ready field hints (e.g., "emergency justification required when emergency=true" in descriptions)
- [ ] Add realistic examples and field descriptions
- [ ] Export `itAccessRequest` with schema, JSON Schema, and metadata

**Dependencies:** Task 1
**Effort:** M
**Validation:** Schema validates sample IT request data; renders correctly; normalizer round-trip succeeds

### Task 4: Customer Intake Template
- [ ] Define Zod schema: contact info, company details, industry (enum), budget range (number with min/max), timeline (enum: urgent/standard/flexible), decision maker info (nested object), requirements (array of strings), referral source (enum)
- [ ] Design for lead qualification and sales workflows
- [ ] Add realistic examples and field descriptions
- [ ] Export `customerIntake` with schema, JSON Schema, and metadata

**Dependencies:** Task 1
**Effort:** M
**Validation:** Schema validates sample customer data; renders correctly; normalizer round-trip succeeds

### Task 5: Expense Report Template
- [ ] Define Zod schema: employee info, expense date, category (enum: travel/meals/supplies/software/other), amount (number with currency), receipt upload (file field), description, project code, approval manager
- [ ] Include array field for line items (multiple expenses per report)
- [ ] Add realistic examples and field descriptions
- [ ] Export `expenseReport` with schema, JSON Schema, and metadata

**Dependencies:** Task 1
**Effort:** M
**Validation:** Schema validates sample expense data; line items array works; file field constraints correct

### Task 6: Bug Report Template
- [ ] Define Zod schema: title, description (textarea), severity (enum: critical/high/medium/low), component (enum), steps to reproduce (array of strings), expected behavior, actual behavior, environment info (nested: OS, browser, version), screenshot upload (file field), reporter email
- [ ] Align with common issue tracker patterns (GitHub Issues, Jira)
- [ ] Add realistic examples and field descriptions
- [ ] Export `bugReport` with schema, JSON Schema, and metadata

**Dependencies:** Task 1
**Effort:** M
**Validation:** Schema validates sample bug data; renders correctly; normalizer round-trip succeeds

### Task 7: JSON Schema Equivalents
- [ ] Generate JSON Schema files for each template using the `json-schema-serializer` from `packages/schema-normalizer/`
- [ ] Validate generated JSON Schema files against the JSON Schema Draft-07 meta-schema
- [ ] Ensure JSON Schema files are semantically equivalent to Zod schemas (same constraints, same required fields)
- [ ] Add a build-time script or test that regenerates and verifies JSON Schema files stay in sync

**Dependencies:** Tasks 2-6
**Effort:** M
**Validation:** All JSON Schema files pass meta-schema validation; round-trip through normalizer matches Zod output

### Task 8: Template Walkthroughs
- [ ] Write README.md for each template with: use case description, field inventory table, usage examples (npm import + copy-paste), customization guidance
- [ ] Include code snippets showing integration with FormBridge server and form renderer
- [ ] Document how to extend each template with additional fields
- [ ] Add a top-level README.md for the templates package with links to each walkthrough

**Dependencies:** Tasks 2-7
**Effort:** M
**Validation:** All walkthroughs render correctly in Markdown; code snippets compile

### Task 9: Template Testing
- [ ] Write unit tests for each template: schema validates correct data, rejects invalid data, required fields enforced
- [ ] Write round-trip tests: Zod schema -> IntakeSchema IR -> JSON Schema -> IntakeSchema IR (via normalizer)
- [ ] Write rendering smoke tests: each template renders without errors in the form renderer
- [ ] Verify JSON Schema equivalents accept the same data as Zod schemas

**Dependencies:** Tasks 2-7
**Effort:** M
**Validation:** All tests pass; coverage > 90% on schema validation logic

### Task 10: npm Packaging and Publishing
- [ ] Configure `@formbridge/templates` package metadata (name, version, description, keywords, license)
- [ ] Set up proper `exports` field in package.json for tree-shaking individual templates
- [ ] Add `files` field to include only built output and JSON schemas
- [ ] Verify package installs and imports correctly in a clean project
- [ ] Document installation in the top-level README

**Dependencies:** Tasks 1-9
**Effort:** S
**Validation:** Package builds, publishes to local registry, installs in clean project, all imports resolve

## Test Plan

| Type | Description | Target Count |
|------|-------------|--------------|
| Unit | Schema validation (valid/invalid data per template) | 30 |
| Unit | Metadata correctness (field counts, required fields) | 5 |
| Integration | Normalizer round-trip (Zod -> IR -> JSON Schema -> IR) | 5 |
| Integration | Form renderer smoke test per template | 5 |
| Snapshot | JSON Schema output stability | 5 |

## Documentation Tasks

- [ ] Write per-template walkthrough README.md files
- [ ] Write top-level templates package README with installation, usage, and customization guide
- [ ] Add templates section to main FormBridge documentation
- [ ] Update `docs/EXAMPLE_VENDOR_ONBOARDING.md` to reference the templates package

## Code Review Checklist

- [ ] Type safety: all templates use strict Zod types, no `z.any()` or `z.unknown()`
- [ ] Patterns consistent: every template follows the same export shape (schema, jsonSchema, metadata)
- [ ] No regressions: existing demo vendor onboarding schema still works after migration
- [ ] Performance acceptable: template imports do not increase bundle size by more than 10KB per template

## Deployment & Release

- **Package name:** `@formbridge/templates`
- **Release strategy:** Publish alongside main FormBridge SDK releases
- **Breaking change policy:** Template schema changes are semver-major (consumers may depend on field names)
- **Distribution:** npm registry + copy-pasteable from GitHub repository

## Observability & Monitoring

- Track npm download counts per template (via npm stats)
- Monitor GitHub issues tagged `templates` for gaps in the library
- Track which templates are most commonly imported (via optional telemetry if added in future)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Templates become stale as IR evolves | Medium | Medium | Automated round-trip tests catch drift on every CI run |
| JSON Schema and Zod schemas diverge | Medium | High | Build-time sync check and snapshot tests |
| Template schemas too generic for real use | Low | Medium | Design from real-world requirements; include customization guidance |
| Large bundle size from importing all templates | Low | Low | Tree-shakeable exports; document individual imports |

## Definition of Done

- [ ] At least 5 templates implemented (vendor onboarding, IT access, customer intake, expense report, bug report)
- [ ] Each template has a Zod schema and JSON Schema equivalent
- [ ] Templates are importable as `@formbridge/templates` npm package
- [ ] Templates are copy-pasteable as standalone directories
- [ ] Each template has a documented walkthrough with usage examples
- [ ] All acceptance criteria met
- [ ] Tests passing (unit, integration, round-trip)
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] No regressions in existing demo or schema-normalizer
