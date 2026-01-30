# Feature 017 --- CLI Scaffolding Tool

> **Status:** PLANNED | **Phase:** 4 | **Priority:** could | **Complexity:** medium | **Impact:** medium
> **[Back to Feature Index](../FEATURES.md)**

## Summary

Build an interactive CLI wizard invoked via `npx @formbridge/create` that scaffolds new FormBridge projects. The wizard prompts the developer to select a schema format (Zod, JSON Schema, or OpenAPI), choose one or more interfaces (React form, MCP server, HTTP API), and pick a template (vendor onboarding, IT access request, customer intake, or blank). It then generates a ready-to-run project with the selected schema, interface configuration, working imports, a dev server, and a README with next steps. A non-interactive mode with CLI flags supports automation and CI use cases. The scaffolded project runs with `npm run dev` and completes setup in under 10 seconds.

## Dependencies

**Upstream:**
- Feature 2 (Schema Definition & Validation) -- generated schemas must use the FormBridge schema patterns (Zod, JSON Schema converters)
- Feature 4 (MCP Tool Generation) -- MCP server scaffolding uses `FormBridgeMCPServer` and transport setup from the SDK
- Feature 5 (HTTP API Routes) -- HTTP API scaffolding uses Express route factories from the SDK
- Feature 6 (React Form Components) -- React form scaffolding uses FormBridge React components

**Downstream:** None -- the CLI tool is a developer-facing utility with no runtime dependencies from other features.

**Internal task ordering:**
1. Task 1 (CLI package setup) must complete before all other tasks.
2. Task 2 (interactive prompt system) must complete before Task 4 (schema templates) and Task 5 (interface generators).
3. Task 3 (template engine) must complete before Tasks 4, 5, 6 (all use templates).
4. Tasks 4, 5, 6 can proceed in parallel after Tasks 2 and 3.
5. Task 7 (non-interactive mode) depends on Task 2 (reuses prompt logic).
6. Task 8 (README generation) depends on Tasks 4, 5, 6 (needs to know what was generated).
7. Task 9 (testing) depends on all prior tasks.
8. Task 10 (npm package configuration) depends on Tasks 1, 9.

## Architecture & Design

### Components and files to create
- `packages/create-formbridge/` -- CLI package root
- `packages/create-formbridge/package.json` -- package configuration with `bin` field
- `packages/create-formbridge/tsconfig.json` -- TypeScript configuration for the CLI
- `packages/create-formbridge/src/index.ts` -- CLI entry point
- `packages/create-formbridge/src/prompts.ts` -- interactive prompt definitions
- `packages/create-formbridge/src/generator.ts` -- project generator orchestrator
- `packages/create-formbridge/src/template-engine.ts` -- template rendering engine
- `packages/create-formbridge/src/templates/` -- template files directory
- `packages/create-formbridge/src/templates/schemas/` -- schema templates (Zod, JSON Schema, OpenAPI)
- `packages/create-formbridge/src/templates/interfaces/` -- interface templates (MCP, HTTP, React)
- `packages/create-formbridge/src/templates/examples/` -- example templates (vendor onboarding, IT access, customer intake)
- `packages/create-formbridge/src/templates/common/` -- shared templates (package.json, tsconfig.json, README.md, .gitignore)
- `packages/create-formbridge/tests/` -- CLI tests

### Components and files to modify
- Root `package.json` -- add workspace reference for `packages/create-formbridge` (if using workspaces)

### Design decisions
- **Prompt library:** Use `@clack/prompts` (modern, beautiful CLI prompts) or `prompts` (lightweight). `@clack/prompts` provides a better visual experience with spinners, groups, and confirmation steps. Alternative: `inquirer` (more established but heavier).
- **Template engine:** Use a simple string interpolation engine (e.g., Handlebars-style `{{variable}}` replacement) rather than a full templating language. Templates are TypeScript/JSON files with placeholder markers. This keeps the CLI lightweight and avoids a template language learning curve.
- **Output structure:** Generated projects follow standard Node.js conventions: `package.json`, `tsconfig.json`, `src/`, `README.md`, `.gitignore`. The structure mirrors what a developer would create manually.
- **Dependency versions:** Generated `package.json` pins the current stable version of `@formbridge/mcp-server` and other dependencies. Version is injected at CLI build time.
- **Non-interactive mode:** All prompts have equivalent CLI flags (e.g., `--schema zod --interface mcp,http --template vendor-onboarding --name my-project`). This enables automation and testing.

### Patterns to follow
- The CLI is a separate npm package (`@formbridge/create`) following the `create-*` convention used by Vite, Next.js, and others.
- The `bin` field in `package.json` maps `create-formbridge` to the built entry point, enabling `npx @formbridge/create`.
- Generated code imports from `@formbridge/mcp-server` using the public API exported from `src/index.ts`.

## Implementation Tasks

### Task 1: CLI Package Setup

- [ ] Create `packages/create-formbridge/` directory structure
- [ ] Create `package.json` with `name: "@formbridge/create"`, `bin: { "create-formbridge": "./dist/index.js" }`, `type: "module"`
- [ ] Create `tsconfig.json` extending the root configuration, targeting Node.js
- [ ] Add dependencies: `@clack/prompts` (or `prompts`), `picocolors` (terminal colors), `fs-extra` (file operations)
- [ ] Create `src/index.ts` entry point with shebang (`#!/usr/bin/env node`)
- [ ] Parse CLI arguments using `process.argv` or a lightweight arg parser (e.g., `mri` or `minimist`)
- [ ] Add `build` script using `tsup` to produce a single CJS bundle (for maximum Node.js compatibility)
- [ ] Verify `npx .` runs the CLI locally during development

**Dependencies:** None
**Effort:** M
**Validation:** `packages/create-formbridge/` exists with valid `package.json` and `tsconfig.json`. The CLI entry point executes when run with `node dist/index.js`. Shebang line is present.

### Task 2: Implement Interactive Prompt System

- [ ] Create `src/prompts.ts` with prompt definitions
- [ ] Implement project name prompt: text input with validation (valid npm package name, no spaces, lowercase)
- [ ] Implement schema format prompt: select from Zod (default), JSON Schema, OpenAPI
- [ ] Implement interface selection prompt: multi-select from React form, MCP server, HTTP API (at least one required)
- [ ] Implement template selection prompt: select from Vendor Onboarding, IT Access Request, Customer Intake, Blank
- [ ] Implement output directory prompt: default to `./{project-name}`, validate directory does not exist or is empty
- [ ] Implement confirmation prompt: show summary of selections and ask for confirmation before generating
- [ ] Add cancel handling (Ctrl+C) with clean exit message
- [ ] Display a welcome banner with FormBridge branding

**Dependencies:** Task 1
**Effort:** M
**Validation:** Running the CLI displays prompts in sequence. Selections are captured correctly. Cancellation exits cleanly. Summary shows all selections before confirmation. Invalid project names are rejected.

### Task 3: Implement Template Engine

- [ ] Create `src/template-engine.ts` with template rendering functions
- [ ] Implement `renderTemplate(templateString, variables)` using `{{variable}}` placeholder syntax
- [ ] Support conditional blocks: `{{#if variable}}...{{/if}}` for optional sections
- [ ] Support array iteration: `{{#each items}}...{{/each}}` for repeated sections (e.g., multiple interfaces)
- [ ] Implement `renderTemplateFile(filePath, variables)` that reads a template file and renders it
- [ ] Implement `renderDirectory(templateDir, outputDir, variables)` that recursively renders all files in a template directory
- [ ] Handle file renaming: template files named `_gitignore` are output as `.gitignore` (npm strips dotfiles from packages)
- [ ] Handle binary files: pass through without template rendering
- [ ] Add unit tests for template rendering (variable substitution, conditionals, iteration, edge cases)

**Dependencies:** Task 1
**Effort:** M
**Validation:** Template variables are substituted correctly. Conditional blocks include/exclude content. Array iteration produces repeated sections. File renaming works for dotfiles. Binary files pass through unchanged.

### Task 4: Create Schema Format Templates

- [ ] Create `src/templates/schemas/zod.ts.template` -- Zod schema definition with example fields (name, email, description, file upload)
- [ ] Create `src/templates/schemas/json-schema.json.template` -- equivalent JSON Schema definition
- [ ] Create `src/templates/schemas/openapi.yaml.template` -- equivalent OpenAPI 3.0 schema definition
- [ ] Each template must produce a valid, runnable schema that integrates with FormBridge
- [ ] Zod template imports from `zod` and exports a typed schema object
- [ ] JSON Schema template is a valid JSON file importable as a module
- [ ] OpenAPI template includes the schema under `components.schemas` with proper references
- [ ] Template variables: `{{projectName}}`, `{{projectDescription}}`, `{{schemaFields}}` (populated from the selected example template)
- [ ] Add unit tests verifying each template produces valid output

**Dependencies:** Tasks 2, 3
**Effort:** M
**Validation:** Each schema template renders to valid, parseable code/data. Zod schema type-checks. JSON Schema validates with AJV. OpenAPI schema passes linting. Generated schemas integrate with FormBridge SDK.

### Task 5: Create Interface Code Generators

- [ ] Create `src/templates/interfaces/mcp-server.ts.template` -- MCP server setup using `FormBridgeMCPServer`, stdio transport, intake definition registration
- [ ] Create `src/templates/interfaces/http-api.ts.template` -- Express server setup using `createIntakeRouter`, `createSubmissionRouter`, port configuration
- [ ] Create `src/templates/interfaces/react-form.tsx.template` -- React component setup with FormBridge form rendering, submission handling
- [ ] Create `src/templates/interfaces/react-app.tsx.template` -- React App wrapper with routing (if React is selected)
- [ ] Each interface template imports from `@formbridge/mcp-server` and the generated schema
- [ ] MCP server template includes a `start` script and stdio transport configuration
- [ ] HTTP API template includes Express setup, middleware (CORS, error handling), and health endpoint
- [ ] React template includes form component, submission handler, and basic styling
- [ ] Combine multiple interfaces into a single project when more than one is selected
- [ ] Add a unified `src/index.ts` entry point that wires together selected interfaces

**Dependencies:** Tasks 2, 3
**Effort:** L
**Validation:** Each interface template produces runnable code. MCP server starts and responds to tool calls. HTTP API starts and responds to requests. React form renders in the browser. Multiple interfaces coexist in a single project.

### Task 6: Create Template Library (Example Projects)

- [ ] Create `src/templates/examples/vendor-onboarding/` -- schema with company info, tax ID, W-9 upload, contact details; includes approval gate
- [ ] Create `src/templates/examples/it-access-request/` -- schema with role, justification, manager email, access level; includes approval gate
- [ ] Create `src/templates/examples/customer-intake/` -- schema with customer name, email, requirements description, file attachments
- [ ] Create `src/templates/examples/blank/` -- minimal schema with one text field, no approval gates
- [ ] Each example includes: complete schema definition, intake definition with name/description/destination, sample data for testing
- [ ] Example schemas use the selected schema format (Zod, JSON Schema, or OpenAPI) via the template engine
- [ ] Add integration between example templates and interface templates (examples provide the schema, interfaces consume it)

**Dependencies:** Tasks 2, 3
**Effort:** M
**Validation:** Each example template generates a complete, runnable project. Example schemas are realistic and demonstrate different FormBridge features (file uploads, approval gates, mixed field types). The blank template is minimal and easy to customize.

### Task 7: Implement Non-Interactive Mode

- [ ] Add CLI flags: `--name`, `--schema` (zod|json-schema|openapi), `--interface` (comma-separated: mcp,http,react), `--template` (vendor-onboarding|it-access|customer-intake|blank), `--output` (directory path)
- [ ] When all required flags are provided, skip interactive prompts and generate directly
- [ ] Validate flag values (same validation as interactive prompts)
- [ ] Print error messages for invalid flag values with usage examples
- [ ] Add `--help` flag showing all available options and usage examples
- [ ] Add `--version` flag showing CLI version
- [ ] Add `--yes` flag to skip the confirmation prompt
- [ ] Support mixed mode: provide some flags, prompt for the rest
- [ ] Add unit tests for flag parsing and validation

**Dependencies:** Task 2
**Effort:** M
**Validation:** `npx @formbridge/create --name my-app --schema zod --interface mcp --template blank --yes` generates a project without prompts. Invalid flags produce helpful error messages. `--help` shows usage. Mixed mode prompts only for missing values.

### Task 8: Implement README Generation

- [ ] Create `src/templates/common/README.md.template` with dynamic content based on selections
- [ ] Include project name and description
- [ ] Include "Getting Started" section with `npm install` and `npm run dev` instructions
- [ ] Include "Project Structure" section listing generated files with descriptions
- [ ] Include interface-specific sections: MCP server usage (how to connect), HTTP API endpoints (how to test with curl), React form (how to start dev server)
- [ ] Include "Next Steps" section linking to FormBridge documentation
- [ ] Include "Schema" section explaining the selected schema format and how to modify it
- [ ] Render the README template with all project-specific variables
- [ ] Add the generated README to the output directory

**Dependencies:** Tasks 4, 5, 6
**Effort:** S
**Validation:** Generated README is accurate for the selected options. Instructions work when followed. All generated files are listed in the project structure section. Links to documentation are valid.

### Task 9: Testing

- [ ] Write unit tests for the template engine (variable substitution, conditionals, iteration)
- [ ] Write unit tests for prompt validation (project name, directory existence)
- [ ] Write unit tests for CLI flag parsing (valid flags, invalid flags, mixed mode)
- [ ] Write integration tests that run the CLI in non-interactive mode and verify the generated project structure
- [ ] Verify generated projects have correct `package.json` (dependencies, scripts, name)
- [ ] Verify generated projects pass `tsc --noEmit` (TypeScript type-checking)
- [ ] Verify generated projects run `npm run dev` successfully (start and respond)
- [ ] Test all 12 combinations (3 schema formats x 4 templates) with MCP interface
- [ ] Test multi-interface selection (MCP + HTTP, all three)
- [ ] Measure CLI execution time (must be under 10 seconds excluding npm install)

**Dependencies:** All prior tasks
**Effort:** L
**Validation:** All unit and integration tests pass. Every schema format + template combination produces a valid project. Generated projects type-check and run. CLI completes in under 10 seconds (excluding npm install).

### Task 10: npm Package Configuration

- [ ] Configure `package.json` for publishing: `name: "@formbridge/create"`, `version: "0.1.0"`, `bin`, `files: ["dist"]`
- [ ] Add `publishConfig: { "access": "public" }`
- [ ] Add `keywords`: `["formbridge", "create", "scaffold", "mcp", "intake", "cli"]`
- [ ] Build the CLI with `tsup` to produce a single file bundle (minimize install size)
- [ ] Verify `npx @formbridge/create` works from a clean environment (no local install)
- [ ] Add the package to the release workflow (Feature 016) for automated publishing
- [ ] Test with `npm pack` and inspect tarball contents and size

**Dependencies:** Tasks 1, 9
**Effort:** S
**Validation:** `npm pack` produces a tarball with the CLI bundle. `npx @formbridge/create` downloads and runs. Package size is under 500KB. Published package includes bin entry.

## Test Plan

| Type | Description | Target Count |
|------|------------|-------------|
| Unit | Template engine (substitution, conditionals, iteration) | 8--10 |
| Unit | Prompt validation (project name, directory) | 4--5 |
| Unit | CLI flag parsing (valid, invalid, mixed) | 6--8 |
| Unit | Schema template output validity (Zod, JSON Schema, OpenAPI) | 3 |
| Integration | Non-interactive generation for all template combinations | 12 |
| Integration | Multi-interface generation | 3--4 |
| Integration | Generated project type-checks (tsc --noEmit) | 4--6 |
| Integration | Generated project starts (npm run dev) | 3--4 |
| E2E | Full interactive flow (simulated stdin) | 1--2 |
| Performance | CLI execution time under 10 seconds | 1 |

## Documentation Tasks

- [ ] Add JSDoc to all public functions in the CLI package
- [ ] Write CLI usage documentation (interactive and non-interactive modes)
- [ ] Add CLI reference to the FormBridge developer documentation site (Feature 015)
- [ ] Document all available templates and their use cases
- [ ] Document how to create custom templates (for advanced users)
- [ ] Add `npx @formbridge/create` to the quickstart guide (Feature 015)

## Code Review Checklist

- [ ] Type safety verified -- all CLI inputs are validated, templates produce typed output
- [ ] Patterns consistent with existing codebase -- generated code uses FormBridge SDK public API
- [ ] No regressions to existing features -- CLI is a new package, no changes to existing code
- [ ] Performance acceptable -- CLI completes in under 10 seconds, generated projects are minimal
- [ ] Security reviewed -- no arbitrary code execution from user input, no network requests during scaffolding
- [ ] Generated code quality -- output follows TypeScript best practices, ESLint passes, no `any` types

## Deployment & Release

- **Backward compatibility:** First release of a new package. No backward compatibility concerns.
- **Migration steps:** None. This is a new developer tool.
- **Release steps:**
  1. Build and test the CLI package
  2. Publish to npm under `@formbridge/create`
  3. Verify `npx @formbridge/create` works from a clean environment
  4. Add to the FormBridge documentation quickstart
  5. Announce availability

## Observability & Monitoring

- **Logging:** CLI logs are local to the developer's terminal. No remote logging.
- **Metrics to track:**
  - npm download count for `@formbridge/create` (npmjs.com)
  - Schema format selection distribution (via anonymous opt-in telemetry, if implemented)
  - Template selection distribution (same)
  - Error reports (via GitHub Issues)
- **Health checks:** Not applicable -- CLI is a local tool with no runtime server.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Generated code breaks when SDK API changes | High | High | Test all generated projects against the current SDK version in CI; pin SDK version in generated package.json; update templates on SDK releases |
| Template engine is too simple for complex templates | Medium | Medium | Start simple; add features as needed; consider switching to EJS or Handlebars if `{{}}` syntax is insufficient |
| CLI prompt library has compatibility issues across terminals | Low | Medium | Test on Windows (PowerShell, CMD), macOS (Terminal, iTerm), and Linux; use a well-tested prompt library (@clack/prompts has wide adoption) |
| `npx` download is slow, exceeding 10-second target | Medium | Low | Keep the package small (single file bundle); exclude unnecessary dependencies; the 10-second target excludes `npm install` in the generated project |
| OpenAPI schema template is complex and error-prone | Medium | Medium | Start with a simplified OpenAPI subset; validate output with an OpenAPI linter in tests; document limitations |
| Multi-interface projects have conflicting dependencies or scripts | Medium | Medium | Test all interface combinations; use a single entry point that conditionally starts each interface; document how interfaces interact |

## Definition of Done

- [ ] All acceptance criteria met:
  1. Interactive setup wizard works via `npx @formbridge/create`
  2. Schema format selection (Zod, JSON Schema, OpenAPI)
  3. Interface multi-select (React form, MCP server, HTTP API)
  4. Template selection (vendor onboarding, IT access, customer intake, blank)
  5. Generated project has working imports and configuration
  6. Generated project runs with `npm run dev`
  7. Generated README includes next steps
  8. Non-interactive mode with CLI flags
  9. CLI completes in under 10 seconds (excluding npm install)
- [ ] Tests passing with adequate coverage (>80% for CLI code, all combinations tested)
- [ ] Code reviewed and approved
- [ ] Documentation updated (CLI usage, quickstart guide)
- [ ] No regressions in existing features
