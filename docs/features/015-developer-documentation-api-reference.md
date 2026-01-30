# Feature 015 --- Developer Documentation & API Reference

> **Status:** PLANNED | **Phase:** 4 | **Priority:** should | **Complexity:** medium | **Impact:** high
> **[Back to Feature Index](../FEATURES.md)**

## Summary

Build a comprehensive developer documentation site covering the FormBridge SDK, Intake Contract, and all interfaces (HTTP API, MCP tools, React components). The site will include a 10-minute quickstart guide, full API reference generated from TypeScript source, schema definition guides for Zod/JSON Schema/OpenAPI, state machine diagrams, an MCP integration guide with transport examples, React component docs, and three end-to-end walkthroughs (vendor onboarding, IT access request, customer intake). All code examples will be tested as part of CI. The documentation site will be built with a static site generator (VitePress or Docusaurus) and deployed with search functionality.

## Dependencies

**Upstream:**
- Feature 2 (Schema Definition & Validation) -- documents schema formats and validation behavior
- Feature 3 (Submission Lifecycle & State Machine) -- documents the state machine, error taxonomy, and operations
- Feature 4 (MCP Tool Generation) -- documents MCP server setup, tool discovery, and transport configuration
- Feature 5 (HTTP API Routes) -- documents REST endpoints, request/response shapes, and error codes
- Feature 6 (React Form Components) -- documents React component API, props, and usage patterns

**Downstream:** None -- documentation is a leaf dependency.

**Internal task ordering:**
1. Task 1 (static site setup) must complete before all other tasks.
2. Tasks 2--7 (content authoring) can proceed in parallel after Task 1.
3. Task 8 (end-to-end walkthroughs) should start after Tasks 2--4 are drafted, as walkthroughs reference those guides.
4. Task 9 (code example testing) depends on Tasks 2--8 having code examples written.
5. Task 10 (deployment) depends on all other tasks.

## Architecture & Design

### Components and files to create
- `docs-site/` -- root directory for the documentation site
- `docs-site/package.json` -- documentation site dependencies and scripts
- `docs-site/.vitepress/config.ts` or `docusaurus.config.js` -- site configuration
- `docs-site/guide/quickstart.md` -- 10-minute quickstart
- `docs-site/guide/schema-definitions.md` -- Zod, JSON Schema, OpenAPI guide
- `docs-site/guide/intake-contract.md` -- Intake Contract overview and reference
- `docs-site/guide/mcp-integration.md` -- MCP server setup and transport guide
- `docs-site/guide/react-components.md` -- React component API docs
- `docs-site/reference/api.md` -- HTTP API reference
- `docs-site/reference/types.md` -- TypeScript type reference (generated)
- `docs-site/reference/events.md` -- Event type reference
- `docs-site/reference/errors.md` -- Error taxonomy reference
- `docs-site/examples/vendor-onboarding.md` -- End-to-end walkthrough
- `docs-site/examples/it-access-request.md` -- End-to-end walkthrough
- `docs-site/examples/customer-intake.md` -- End-to-end walkthrough
- `docs-site/examples/code/` -- Tested code examples
- `tests/docs-examples.test.ts` -- Test runner for documentation code examples

### Components and files to modify
- `package.json` -- add docs scripts (`docs:dev`, `docs:build`, `docs:test`)
- Existing doc files (`docs/INTAKE_CONTRACT_SPEC.md`, `docs/API.md`, etc.) -- cross-link to the new documentation site

### Design decisions
- Use VitePress as the static site generator: it supports Vue/Markdown, has built-in search (local or Algolia), generates fast static sites, and integrates well with TypeScript projects. Docusaurus is the alternative if React-based documentation is preferred.
- API reference is generated from TypeScript source using TypeDoc or API Extractor, then rendered as Markdown pages within the site.
- Code examples are extracted from documentation Markdown files and executed as Vitest tests to ensure they compile and run correctly.
- State machine diagrams are rendered using Mermaid (supported natively by VitePress).
- The documentation site is a separate package in the monorepo (or a top-level directory), not published to npm.

### Patterns to follow
- Existing documentation in `docs/` provides the source material: `INTAKE_CONTRACT_SPEC.md` for the contract spec, `API.md` for HTTP endpoints, `EXAMPLE_VENDOR_ONBOARDING.md` for walkthrough content.
- Code examples use the public API exported from `src/index.ts`, ensuring examples stay in sync with the SDK.

## Implementation Tasks

### Task 1: Static Site Setup

- [ ] Choose static site generator (VitePress recommended) and initialize in `docs-site/`
- [ ] Configure site metadata: title ("FormBridge Developer Docs"), description, logo
- [ ] Set up navigation sidebar with sections: Guide, Reference, Examples
- [ ] Configure Mermaid diagram support for state machine visualizations
- [ ] Configure syntax highlighting for TypeScript, JSON, and shell code blocks
- [ ] Add local search plugin (VitePress built-in MiniSearch or Algolia DocSearch)
- [ ] Add `docs:dev` and `docs:build` scripts to root `package.json`
- [ ] Verify the site builds and serves locally

**Dependencies:** None
**Effort:** M
**Validation:** Documentation site builds without errors. Local dev server starts and renders the home page. Navigation sidebar renders all sections. Search is functional.

### Task 2: Write Quickstart Guide

- [ ] Write `docs-site/guide/quickstart.md` targeting a 10-minute setup experience
- [ ] Cover installation: `npm install @formbridge/mcp-server`
- [ ] Cover defining a schema (Zod example as primary, JSON Schema as alternative)
- [ ] Cover creating an MCP server from the schema with `FormBridgeMCPServer`
- [ ] Cover starting the server with stdio transport
- [ ] Cover making a submission via MCP tool call (example agent interaction)
- [ ] Cover generating an HTTP API endpoint as an alternative
- [ ] Include a "What's Next" section linking to deeper guides
- [ ] Ensure all code examples are self-contained and copy-pasteable

**Dependencies:** Task 1
**Effort:** M
**Validation:** A developer unfamiliar with FormBridge can follow the guide and have a working MCP server in under 10 minutes. All code examples run without modification.

### Task 3: Generate API Reference

- [ ] Set up TypeDoc or API Extractor to generate API docs from TypeScript source
- [ ] Generate reference pages for all public exports from `src/index.ts`
- [ ] Organize by module: Core Types, MCP Server, Validation, Schema Utilities, Transport, Routes
- [ ] Include type signatures, parameter descriptions, return types, and usage examples
- [ ] Generate the event type reference table from `IntakeEventType` union
- [ ] Generate the error taxonomy reference from `IntakeErrorType` union and `IntakeError` interface
- [ ] Generate the state machine reference from `SubmissionState` union
- [ ] Add cross-links between related types (e.g., `IntakeEvent` links to `Actor`, `SubmissionState`)
- [ ] Integrate generated docs into the VitePress site as the Reference section

**Dependencies:** Task 1
**Effort:** L
**Validation:** Every public export from `src/index.ts` has a reference page. Type signatures are accurate and complete. Cross-links work correctly. Reference pages render correctly in the site.

### Task 4: Write Schema Definition Guide

- [ ] Write `docs-site/guide/schema-definitions.md`
- [ ] Cover Zod schema definition with FormBridge (primary path)
- [ ] Cover JSON Schema usage with `convertZodToJsonSchema()` utility
- [ ] Cover OpenAPI schema extraction and conversion
- [ ] Document supported field types: string, number, boolean, enum, nested objects, arrays, file uploads
- [ ] Document validation constraints: required, min/max length, patterns, email format, custom validators
- [ ] Document file field configuration: `format: "binary"`, maxSize, allowedTypes, maxCount
- [ ] Include comparison table of Zod, JSON Schema, and OpenAPI approaches
- [ ] Provide migration examples for converting existing schemas to FormBridge intake definitions

**Dependencies:** Task 1
**Effort:** M
**Validation:** Guide covers all three schema formats with working examples. Each supported field type has at least one example. Comparison table helps developers choose the right approach.

### Task 5: Write Intake Contract Reference

- [ ] Write `docs-site/guide/intake-contract.md` as a developer-friendly version of `INTAKE_CONTRACT_SPEC.md`
- [ ] Include the state machine diagram rendered with Mermaid
- [ ] Document each state and its allowed transitions with examples
- [ ] Document the error taxonomy with examples of each error type
- [ ] Document the resume token protocol with a visual flow diagram
- [ ] Document idempotency key usage with examples
- [ ] Document the file upload negotiation protocol step-by-step
- [ ] Document approval gates with review flow diagrams
- [ ] Cross-link to the formal spec (`docs/INTAKE_CONTRACT_SPEC.md`) for implementors

**Dependencies:** Task 1
**Effort:** M
**Validation:** State machine diagram renders correctly. All states, transitions, error types, and protocols are documented. Developer can understand the submission lifecycle without reading the formal spec.

### Task 6: Write MCP Integration Guide

- [ ] Write `docs-site/guide/mcp-integration.md`
- [ ] Document `FormBridgeMCPServer` setup and configuration
- [ ] Document stdio transport setup with `createStdioTransport()` and `createConfiguredStdioTransport()`
- [ ] Document SSE transport setup with `createSSETransport()` and Express integration
- [ ] Document tool generation from intake definitions with `generateToolsFromIntake()`
- [ ] Document tool naming conventions (`formbridge_{intakeId}_{operation}`)
- [ ] Document MCP tool call examples for each operation (create, set, validate, upload, submit, status)
- [ ] Document integration with Claude Desktop, Cursor, and other MCP clients
- [ ] Include troubleshooting section for common MCP setup issues

**Dependencies:** Task 1
**Effort:** M
**Validation:** Guide covers both transport types with working configuration examples. Tool call examples match the actual MCP protocol. Integration instructions work with at least one MCP client.

### Task 7: Write React Component API Docs

- [ ] Write `docs-site/guide/react-components.md`
- [ ] Document the React form component props and configuration
- [ ] Document field rendering for each supported type (text, number, select, file upload, etc.)
- [ ] Document form state management and submission handling
- [ ] Document agent-to-human handoff UI flow (resume form page)
- [ ] Document styling and customization options
- [ ] Document integration with existing React applications
- [ ] Include live code examples (if the site generator supports interactive components)

**Dependencies:** Task 1
**Effort:** M
**Validation:** All React components are documented with props tables and usage examples. Handoff flow is clearly illustrated. Customization options are documented.

### Task 8: Write End-to-End Walkthroughs

- [ ] Write `docs-site/examples/vendor-onboarding.md` -- complete walkthrough of a vendor onboarding intake (schema definition through approval and delivery)
- [ ] Write `docs-site/examples/it-access-request.md` -- walkthrough of an IT access request with role selection, justification, and manager approval
- [ ] Write `docs-site/examples/customer-intake.md` -- walkthrough of a customer intake form with file uploads and mixed-mode completion
- [ ] Each walkthrough must include: schema definition, server setup, agent interaction (MCP tool calls), human handoff, approval (if applicable), and delivery
- [ ] Include the complete source code for each walkthrough in `docs-site/examples/code/`
- [ ] Cross-link to relevant guide sections for deeper explanation

**Dependencies:** Tasks 2, 3, 4 (drafted)
**Effort:** L
**Validation:** Each walkthrough can be followed end-to-end by a developer. Source code is complete and runnable. All three scenarios demonstrate different FormBridge capabilities (basic flow, approval gates, file uploads + mixed-mode).

### Task 9: Code Example Testing

- [ ] Create `tests/docs-examples.test.ts` test file
- [ ] Extract code examples from documentation Markdown files (or maintain separate `.ts` files in `docs-site/examples/code/`)
- [ ] Write Vitest tests that import and execute each code example
- [ ] Verify examples compile (TypeScript type-checking)
- [ ] Verify examples produce expected output (basic assertions)
- [ ] Add `docs:test` script to `package.json` that runs documentation example tests
- [ ] Integrate docs example testing into CI pipeline (so examples break the build if they become stale)

**Dependencies:** Tasks 2--8 (code examples written)
**Effort:** M
**Validation:** All code examples in documentation compile and run. CI fails if a code change breaks a documentation example. Test coverage includes at least the quickstart, one schema example, and one walkthrough.

### Task 10: Documentation Site Deployment

- [ ] Configure build output for static hosting
- [ ] Set up deployment to GitHub Pages, Netlify, or Vercel
- [ ] Configure custom domain if applicable
- [ ] Enable search indexing (Algolia DocSearch or built-in search)
- [ ] Add deployment step to CI/CD pipeline (build and deploy on merge to main)
- [ ] Verify all pages render correctly in production
- [ ] Verify search returns relevant results for key terms (e.g., "resume token", "webhook", "MCP")
- [ ] Add a link to the documentation site in the repository README

**Dependencies:** All prior tasks
**Effort:** M
**Validation:** Documentation site is accessible at the configured URL. All pages render correctly. Search works for key terms. Deployment is automated on merge to main.

## Test Plan

| Type | Description | Target Count |
|------|------------|-------------|
| Unit | Code example compilation and execution | 10--15 |
| Unit | API reference generation accuracy | 3--5 |
| Integration | Documentation site build (no broken links, all pages render) | 1 |
| Integration | Search functionality (key term queries return relevant results) | 3--5 |
| E2E | Walkthrough code examples run end-to-end | 3 |

## Documentation Tasks

- [ ] This feature IS the documentation task -- no additional documentation tasks beyond the implementation tasks above
- [ ] Cross-link existing `docs/` files to the new documentation site
- [ ] Add a documentation contribution guide for future contributors

## Code Review Checklist

- [ ] Type safety verified -- all code examples use typed APIs, no `any` usage in examples
- [ ] Patterns consistent with existing codebase -- examples use public API from `src/index.ts`
- [ ] No regressions to existing features -- documentation site is additive, no source code changes required
- [ ] Performance acceptable -- static site builds in under 60 seconds, page load under 3 seconds
- [ ] Accuracy verified -- API reference matches actual TypeScript source, state diagrams match implementation
- [ ] Code examples tested -- all examples compile and execute correctly

## Deployment & Release

- **Backward compatibility:** This feature adds documentation only. No changes to the FormBridge SDK or runtime behavior.
- **Migration steps:** None. Existing documentation in `docs/` continues to exist and is cross-linked.
- **Release steps:**
  1. Merge documentation site into the repository
  2. Configure CI to build and deploy the site
  3. Verify deployment at the configured URL
  4. Add documentation link to README and npm package description
  5. Announce availability to developers

## Observability & Monitoring

- **Logging:** Static site has no runtime logging. Build logs are captured by CI.
- **Metrics to track:**
  - Page views per documentation section (via analytics)
  - Search query frequency and top queries (via search analytics)
  - 404 errors (broken links)
  - Time on page for quickstart guide (engagement metric)
- **Health checks:** CI build verification ensures the site builds without errors. Link checker ensures no broken internal links.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Code examples become stale as SDK evolves | High | High | Test all code examples in CI; fail the build on stale examples; review examples on every SDK change |
| API reference generation misses or misrepresents types | Medium | Medium | Use TypeDoc directly from source; verify generated output against source; manual review of generated pages |
| Documentation site generator has breaking updates | Low | Medium | Pin generator version; use a widely-adopted generator (VitePress/Docusaurus) with LTS support |
| Search functionality is inadequate for developer needs | Medium | Low | Start with built-in local search; upgrade to Algolia if needed; monitor search queries for gaps |
| Walkthrough examples require features not yet implemented | Medium | Medium | Scope walkthroughs to implemented features; mark upcoming features clearly; update walkthroughs as features ship |
| Documentation deployment fails or becomes inaccessible | Low | Medium | Automated deployment in CI; fallback to manual deployment; monitor site availability |

## Definition of Done

- [ ] All acceptance criteria met:
  1. 10-minute quickstart guide published
  2. Full API reference across all packages
  3. Zod/JSON Schema/OpenAPI examples documented
  4. State diagrams and error taxonomy reference
  5. MCP integration guide with transports
  6. React component API docs
  7. 3+ end-to-end walkthroughs (vendor onboarding, IT access, customer intake)
  8. All code examples tested in CI
  9. Documentation site deployed and accessible
  10. Search functionality working
- [ ] Tests passing with adequate coverage (all code examples compile and run)
- [ ] Code reviewed and approved
- [ ] Documentation reviewed for accuracy and completeness
- [ ] No regressions in existing features
