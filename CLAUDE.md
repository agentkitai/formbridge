# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
# Build
npm run build                    # Build root package (tsc)
npm run build --workspaces       # Build all 7 workspace packages

# Test (root — vitest, 1,427 tests across 59 files)
npm test                         # Watch mode
npm run test:run                 # Single run
npx vitest run tests/api.test.ts # Single test file

# Test (form-renderer — jsdom environment)
cd packages/form-renderer && npx vitest run
cd packages/form-renderer && npx vitest run src/components/fields/StringField.test.tsx

# Typecheck & Lint
npm run typecheck                # tsc --noEmit
npm run lint                     # eslint src/

# Dev server (HTTP API on port 3000)
npx tsx tests/test-server.ts
```

## Architecture

FormBridge is a **mixed-mode agent-human form submission system**. AI agents create submissions, fill fields they know, and hand off to humans via resume URLs to complete the rest — with field-level attribution tracking.

**Monorepo** using npm workspaces with 7 packages under `packages/` and the core `@agentkitai/formbridge-mcp-server` at root (`src/`).

### Core Backend (`src/`)

Built on **Hono** (v4) with `@hono/node-server`. Two app factory functions in `src/app.ts`:
- `createFormBridgeApp()` — minimal app with health check
- `createFormBridgeAppWithIntakes(intakes[])` — full app with all routes and services wired

**Service wiring in the factory:**
1. `IntakeRegistry` — holds intake definitions, validates schemas
2. `InMemorySubmissionStore` — stores submissions with idempotency index
3. `BridgingEventEmitter` — fans out events to listeners (WebhookManager, etc.)
4. `InMemoryEventStore` — append-only event persistence
5. `SubmissionManager` — orchestrates submission lifecycle, owns the **triple-write pattern**
6. `ApprovalManager` — handles review/approve/reject workflows
7. `WebhookManager` — delivery with signing, verification, retry

**Triple-write pattern** (`SubmissionManager.recordEvent()`): every event is written to (1) `submission.events[]` array, (2) `BridgingEventEmitter.emit()` for fan-out, and (3) `EventStore.appendEvent()` for queries. Do not add additional listeners that duplicate eventStore writes.

### Submission State Machine (`src/core/state-machine.ts`)

```
draft → in_progress → submitted → finalized
  ↓         ↓             ↓
  ├→ awaiting_upload  ├→ cancelled
  ├→ needs_review → approved/rejected
  └→ cancelled/expired
```

Terminal states: `rejected`, `finalized`, `cancelled`, `expired`. Resume tokens rotate on field mutations (`set`, `requestUpload`, a successful `confirmUpload`, and `finalize`) but NOT on `submit`, `approve`, or `reject`.

### MCP Server (`src/mcp/`)

`FormBridgeMCPServer` is a thin transport over the SAME shared `SubmissionManager`/`ApprovalManager` lifecycle the HTTP API uses — there is no MCP-only store. Each registered `IntakeDefinition` (Zod) is converted to the contract intake (`toContractIntake`) and registered in the shared `IntakeRegistry`; `tool-generator.ts` auto-generates the per-intake tool surface with **single-underscore** names: `{intakeId}_create`, `{intakeId}_set`, `{intakeId}_validate` (read-only), `{intakeId}_submit`, `{intakeId}_requestUpload`, `{intakeId}_confirmUpload`, `{intakeId}_get`, `{intakeId}_handoff`, `{intakeId}_finalize`. Approval (`approve`/`reject`) is deliberately NOT exposed over MCP: separation of duties can't be enforced on an unauthenticated stdio transport (the submitting agent still holds a valid resume token and could self-approve), so approval is a human action over the authenticated HTTP/dashboard path. A gated `submit` still returns `needs_review`; a reviewer approves via HTTP. Every mutating tool takes an optional `actor` (defaults to a `{kind:'system', id:'mcp-server'}` actor); an `actor.kind` outside `agent|human|system` falls back to the default. MCP `create`/`set` validate provided fields against the intake schema before persisting (parity with the HTTP route). Resume tokens rotate on field mutations (`set`/`requestUpload`/successful `confirmUpload`/`finalize`) but NOT on `submit`; responses use the CORE state vocabulary (`draft`/`in_progress`/`submitted`/`needs_review`/`finalized`). Injected services enable true cross-transport shared state (an SSE mount on the shared/durable backend is the follow-on). Supports Stdio and SSE transports.

### Route Modules (`src/routes/`)

All mounted in `app.ts`. Sub-routers define their own paths and get mounted at `'/'` (or `/intake` for uploads/schema). Key endpoints:
- `POST/GET/PATCH /intake/:intakeId/submissions[/:id]` — CRUD
- `POST /intake/:intakeId/submissions/:id/submit` — submit for processing
- `POST /submissions/:id/handoff` — generate resume URL
- `GET /submissions/resume/:resumeToken` — fetch by resume token
- `GET /submissions/:id/deliveries` — webhook delivery status
- `GET /analytics/summary`, `GET /analytics/volume` — dashboard metrics
- `POST /webhooks`, `GET /webhooks/:id` — webhook management
- `POST /approvals/:id/approve|reject` — approval actions

### Frontend Packages

**`packages/form-renderer`** — React library. `FormBridgeForm` renders JSON Schema → typed field components (`StringField`, `NumberField`, `BooleanField`, `EnumField`, `ObjectField`, `ArrayField`, `FileField`). `ResumeFormPage` handles the agent-to-human handoff flow. `WizardForm` provides multi-step progressive forms. Hooks: `useFormState`, `useValidation`, `useFormSubmission`, `useResumeSubmission`.

**`packages/admin-dashboard`** — React SPA (Vite, port 3002). Uses `FormBridgeApiClient` for typed API calls. Routes: `/` (dashboard), `/intakes`, `/submissions`, `/submissions/:id`, `/approvals`, `/analytics`, `/webhooks`.

**`packages/demo`** — Demo app (Vite, port 5173). Shows form rendering, resume flow, reviewer page, and wizard form. Vite proxy forwards API calls to `localhost:3000`.

**`packages/schema-normalizer`** — Converts Zod, JSON Schema, and OpenAPI specs into unified `IntakeSchema` IR.

### Key Domain Types

Defined in `src/types.ts` and `src/types/intake-contract.ts`:

- **`IntakeDefinition`** — `{ id, version, name, schema, destination, approvalGates?, ttlMs? }`
- **`Submission`** — `{ id, intakeId, state, resumeToken, fields, fieldAttribution, events, createdBy, ... }`
- **`Actor`** — `{ kind: "agent" | "human" | "system", id, name? }`
- **`IntakeEvent`** — `{ eventId, type, submissionId, ts, actor, state, payload?, version }`
- **`FieldAttribution`** — `{ [fieldPath]: Actor }` — tracks who filled each field

## TypeScript Configuration

Strict mode with extra flags: `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (requires explicit `type` imports). Target ES2022, module resolution `bundler`. Unused variables must be prefixed with `_`.

## Testing

Root tests use vitest with `node` environment. Form-renderer tests use `jsdom`. Coverage threshold is 80% across lines/functions/branches/statements. Test files live in `src/**/__tests__/` and `tests/` (root), or `src/` colocated (form-renderer).

## Lint

ESLint flat config (v9). TypeScript-eslint recommended rules. React + React Hooks plugins for `.tsx` files. Prettier integration via `eslint-config-prettier`. `@typescript-eslint/no-explicit-any` is warn level.
