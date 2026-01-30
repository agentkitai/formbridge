# FormBridge Code Review Log

Ongoing review of Auto Claude's build progress. Observations, issues, and recommendations.

---

## Review #1 — 2026-01-29 ~17:00 IST

**Status:** Task 004 (HTTP/JSON API Server) at 16/18 subtasks, Testing & Verification phase.
**Completed tasks:** 001 (scaffolding), 002 (schema normalizer), 003 (intake contract runtime), 004 (in progress).
**In flight:** 005 (React form renderer) started in a git worktree.
**Codebase:** ~22K lines TypeScript + Python.

### Architecture

- **Monorepo** with `packages/` (schema-normalizer, core, react, mcp) + root `src/` (HTTP server) + `formbridge/` (Python runtime)
- HTTP server built on **Hono** (good choice — lightweight, works on edge/serverless)
- Schema normalizer uses an **IntakeSchema IR** (intermediate representation) as the canonical internal format
- Validation via **Ajv** with structured error conversion
- State machine implemented in Python with proper transition maps and event emission

### What's Good

- **Types are thorough.** `src/types.ts` faithfully implements every section of the Intake Contract spec — states, errors, actors, events, operations, definitions. Well-documented with JSDoc + spec section references.
- **Schema normalizer is solid.** Separate parsers for Zod, JSON Schema, OpenAPI. Has round-trip tests. The IR type system (`IntakeSchemaField` union with type guards) is clean.
- **Validator does proper error mapping.** Converts Ajv's raw errors into the structured `FieldError[]` format with `NextAction[]` suggestions. Handles all the keyword→code mappings (required, type, format, pattern, minLength, etc.).
- **HTTP routes follow the spec.** Transport binding matches §12.1. Routes: `POST /:id/submissions`, `GET /:id/submissions/:submissionId`, `PATCH /:id/submissions/:submissionId`. Proper error responses with typed error envelopes.
- **Resume token rotation** works — new token generated on every state change, stale tokens rejected with 409.

### Issues Found

#### 🔴 Critical

1. **Dual-language split (Python + TypeScript).** The project has a full Python package (`formbridge/` — state machine, validation, events, runtime, types) AND a full TypeScript implementation (`src/` — types, submission manager, validator, HTTP server). These are parallel implementations of the same spec, not complementary pieces. This will cause maintenance burden and divergence. **Recommendation:** Pick one. The TS side is further along and more complete for the target audience (JS/TS developers).

2. **Validator not wired into SubmissionManager.** The `Validator` class (`src/core/validator.ts`) does proper Ajv-based schema validation. But `SubmissionManager.validateFields()` has its own basic implementation that only checks required fields with a `// TODO: Add type validation` comment. The Validator exists but isn't used where it matters. **Recommendation:** Inject `Validator` into `SubmissionManager` and use it for all validation.

#### 🟡 Important

3. **Missing `submit` endpoint.** The spec defines `POST /submissions/:id/submit` (§4.6) as the lock-and-finalize operation. The HTTP routes only have create/get/update. Without submit, there's no way to actually complete a submission flow. Likely coming in a future subtask.

4. **`createFormBridgeAppWithIntakes` creates double components.** It calls `createFormBridgeApp()` (which creates its own registry/validator/submissionManager internally), then creates a SECOND set of those components to register the intakes on. The first set is orphaned. The code has a comment acknowledging this. **Recommendation:** Either expose the registry from `createFormBridgeApp` or restructure the factory.

5. **No state transition validation in SubmissionManager.** The Python state machine has proper `VALID_TRANSITIONS` enforcement, but the TypeScript `SubmissionManager.transitionState()` doesn't check whether the transition is valid. It just sets the new state. **Recommendation:** Port the transition validation logic from the Python implementation.

#### 🟢 Minor

6. **`packages/core/src/index.ts` and `packages/mcp/src/index.ts` are stubs.** They exist but have minimal/placeholder content. The real logic lives in `src/` (root). The monorepo package structure exists but isn't the primary code location.

7. **`packages/react/` has no test file.** The other packages have `__tests__/index.test.ts` but react doesn't (though it's being worked on in the worktree).

8. **Event stream not exposed via HTTP.** `SubmissionManager.getEvents()` exists but there's no `GET /submissions/:id/events` route yet. Spec §4.10.

---

---

## Review #2 — 2026-01-29 ~17:00 IST

**Status:** Task 005 (React Form Renderer) at 22/25 subtasks, "Demo Application" phase.
**Completed since last review:** Task 004 finished, task 005 nearly done.
**New packages:** `packages/form-renderer/` (18.6K lines), `packages/demo/` (Vite app with vendor onboarding example).
**Codebase now:** ~40K+ lines TypeScript + Python.

### What's New

The form renderer is a substantial piece of work:

- **`FormBridgeForm`** — Main orchestrator component. Takes an `IntakeSchema`, renders fields automatically, handles validation and submission. Clean prop API with callbacks for success/error/change/validate. Supports customization via className, custom loading/error/success components.
- **Field components** — `StringField`, `NumberField`, `BooleanField`, `EnumField`, `ObjectField`, `ArrayField`. Each with dedicated test files.
- **Hooks** — `useFormState` (field state management), `useValidation` (client-side validation), `useFormSubmission` (API submission flow with states: idle → validating → submitting → success/error).
- **API client** (`FormBridgeApiClient`) — fetch-based, timeout-aware, handles IntakeError responses. Supports injecting custom fetch for testing.
- **Demo app** — Vite-based vendor onboarding demo showcasing all field types (strings, numbers, booleans, enums, nested objects, arrays).
- **Testing** — Unit tests per component + integration tests for validation, error handling, and form submission.

### What's Good

- **Clean hook architecture.** Form state, validation, and submission are separated into composable hooks. Each is independently testable.
- **API client handles IntakeError properly.** Distinguishes between structured IntakeError responses and raw HTTP errors. Has `isIntakeError` type guard.
- **Accessibility considered.** ARIA attributes, `role="alert"`, `aria-live`, keyboard navigation, proper labels. Form uses `noValidate` to disable browser validation in favor of custom validation.
- **Recursive field rendering.** `renderField` handles nested objects and arrays recursively — the ObjectField and ArrayField components delegate back to `renderField` for their children.
- **Testable API layer.** Client accepts injected `fetch` for testing. Good design.

### Issues Found

#### 🟡 Important

1. **API URL mismatch between client and server.** The API client uses `POST /intakes/{intakeId}/submissions` and `POST /submissions/{submissionId}/submit`, but the HTTP server routes are `POST /intake/:id/submissions`. Note: `intakes` (plural) vs `intake` (singular), and the client has a flat `/submissions/:id/submit` path while the server nests under `/intake/:id/submissions/:submissionId`. These won't connect without fixing.

2. **Idempotency key generation is weak.** `useFormSubmission` generates keys as `submit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`. This means every submit click generates a NEW idempotency key, which defeats the purpose. If the user clicks submit twice quickly, they get two different keys = two submissions. The key should be stable per submission attempt (e.g., derived from the data hash or generated once per form load).

3. **`onChange` handler has a bug.** In `FormBridgeForm.handleFieldChange`, it creates a shallow copy of `data` and manually walks the path to set the value. But it calls `setField(path, value)` BEFORE building the `newData` copy, and then passes the stale `data` reference (pre-update) to `onChange`. The parent will see stale data on every change callback.

#### 🟢 Minor

4. **Demo points to mock endpoint.** `https://api.formbridge.example.com` — expected for a demo, but the form will always error on submit. The demo should either mock fetch or note this more prominently.

5. **`packages/react/` still exists alongside `packages/form-renderer/`.** Two React packages. The `packages/react/` from scaffolding has stubs, while `packages/form-renderer/` has the actual implementation. Redundant.

6. **No CSS shipped.** The form uses BEM-style class names (`formbridge-form__title`, etc.) but no actual CSS file is included. Users will get an unstyled form. Fine for a library, but the demo should have styles.

### Previous Issues Status

- 🔴 Dual-language split — **still present**, Python code untouched
- 🔴 Validator not wired into SubmissionManager — **unknown**, haven't seen changes to `src/core/`
- 🟡 Missing submit endpoint — **still missing** from HTTP server
- 🟡 Double component creation — **still present**
- 🟡 No state transition validation in TS — **still present**

---

---

## Review #3 — 2026-01-29 ~19:00 IST

**Status:** Task 005 (React Form Renderer) still at 22/25 subtasks. Last update was 16:18 UTC (18:18 IST). Build appears stalled/paused — no new files modified since last review. Workers: 0 active.
**Git:** Still only 2 commits. Auto Claude hasn't committed any of its work to the repo.

### What Changed Since Review #2

Minimal changes — the build progress log says "PRODUCTION-READY" and "Ready for QA sign-off" but the subtask counter hasn't advanced (still 22/25). The auto-claude appears to have paused or is waiting.

New files discovered that weren't checked last time:
- **CSS shipped!** `default.css` (550+ lines) and `variables.css` with full design token system. Previous review flagged "no CSS" — this was already there, I just missed it. Clean BEM naming, CSS custom properties for theming, focus/error/disabled states all styled. Good.
- **Demo schema** (`vendorOnboarding.ts`) — comprehensive, covers all field types including nested objects (address), arrays of objects (certifications), arrays of enums (serviceCategories). Good showcase.

### Assessment

#### ✅ Resolved from Previous Reviews
- ~~No CSS shipped~~ — CSS was there, I missed it. Clean design token system via CSS variables. Fully customizable.

#### Still Open
- 🔴 API URL mismatch (client `/intakes/` vs server `/intake/`)
- 🔴 Dual Python+TypeScript implementations
- 🟡 Idempotency key regenerates per click
- 🟡 onChange passes stale data
- 🟡 Validator not wired into SubmissionManager
- 🟡 Missing submit endpoint on server
- 🟡 No state transition validation in TS SubmissionManager
- 🟡 Double component creation in factory

#### Build Health Concern
- **0 active workers, last update 3+ hours ago.** The build may have stalled. Status says "building" but nothing is happening.
- **No git commits from Auto Claude.** All work is uncommitted. If something crashes, work could be lost.

---

---

## Review #4 — 2026-01-29 ~20:15 IST

**Status:** No change. Task 005 still at 22/25. 0 active workers. Last update 16:18 UTC (18:18 IST) — now **4+ hours stalled.** Same 2 git commits. No new or modified files.

### Assessment

**Auto Claude is dead.** The build hasn't moved in over 4 hours. Session 24 started at 15:00 UTC and the last meaningful work was at 16:18 UTC. The status file still says `"active": true` and `"state": "building"` but nothing is happening. The remaining 3 subtasks on task 005 (likely final QA/acceptance) have not advanced.

All previously flagged issues remain unchanged. No new code to review.

**Action needed:** Amit should check whether Auto Claude needs to be restarted or unblocked.

---

---

## Review #5 — 2026-01-29 ~21:10 IST (CORRECTION)

**⚠️ Previous reviews #3 and #4 were wrong.** I was only checking the main worktree's `.auto-claude-status`. Auto Claude works in **git worktrees** under `.auto-claude/worktrees/tasks/`. It was building the whole time. My mistake.

**Actual status:**
- ✅ **005 (React Form Renderer)** — completed (merged to worktree branch `auto-claude/005-react-form-renderer`)
- ✅ **006 (MCP Tool Server Generation)** — **COMPLETE.** 32/32 subtasks. Full MCP server implementation in its own worktree.
- 🔨 **007 (Structured Retryable Error Protocol)** — 5/10 subtasks, actively building. "Agent Retry Loop Documentation" phase.

**Active worktrees:**
- `006-mcp-tool-server-generation` — branch `auto-claude/006-mcp-tool-server-generation`, 32 commits
- `007-structured-retryable-error-protocol` — branch `auto-claude/007-structured-retryable-error-protocol`, 5 commits

### Task 006 — MCP Tool Server (COMPLETE, new since last review)

Full MCP server implementation in its own package. Key files:

```
src/
├── index.ts
├── mcp/
│   ├── server.ts          # FormBridgeMCPServer class
│   ├── submission-store.ts # In-memory submission state
│   ├── tool-generator.ts   # Schema → MCP tool generation
│   └── transports/
│       ├── sse.ts          # SSE transport
│       └── stdio.ts        # stdio transport
├── schemas/
│   ├── intake-schema.ts
│   └── json-schema-converter.ts
├── types/
│   ├── intake-contract.ts
│   └── mcp-types.ts
└── validation/
    ├── error-mapper.ts     # Validation errors → IntakeError
    └── validator.ts
```

Plus: `examples/` (vendor onboarding), `tests/` (unit + integration + transport), `docs/` (API docs), README.

**Architecture notes:**
- Uses official `@modelcontextprotocol/sdk`
- Each intake generates 4 MCP tools: `create`, `set`, `validate`, `submit`
- Supports stdio AND SSE transports
- Has its own `SubmissionStore` for state management (in-memory)
- Validation errors mapped to Intake Contract error format

### Task 007 — Structured Retryable Error Protocol (in progress)

Currently building documentation and examples for the error protocol. 5/10 subtasks done. Working in docs/ with error type definitions, FieldError code examples, NextAction examples, error summary format, and agent retry loop pseudocode.

### Issues (Updated)

#### 🔴 Still Critical
1. **Dual Python+TypeScript** — still present, Python code untouched
2. **Each worktree is a standalone package** — 006 has its own `package.json`, `tsconfig.json`, `node_modules/`. These are not integrated with the main monorepo. When it's time to merge, there could be significant integration work.

#### 🟡 Architecture Concern (NEW)
3. **Code duplication across worktrees.** The 006 MCP server has its own `SubmissionStore`, `validator.ts`, `intake-schema.ts`, `intake-contract.ts` — duplicating logic from the main `src/` directory. These are parallel implementations, not shared packages. Merging will require deduplication.
4. **API URL mismatch** — still present between form-renderer client and HTTP server

#### Previously flagged — status unknown
- Validator wiring, submit endpoint, state transition validation, double factory — need to re-check after worktree code is merged

### Lesson Learned

**Always check worktrees.** Auto Claude uses git worktrees for parallel task execution. The main `.auto-claude-status` goes stale once work moves to worktrees. Future reviews must check ALL worktree status files.

---

*Next review: ~22:00 IST.*

---

## Review #6 — 2026-01-29 ~22:00 IST

**Status:** Task 007 (Structured Retryable Error Protocol) — **COMPLETED** ✅ (10/10, QA passed). Task 008 (Idempotent Submissions) — **in progress**, 15/20 subtasks, "Metadata and Audit Trail" phase.
**Active worktree:** `008-idempotent-submissions` (16 commits so far).
**Main `.auto-claude-status`:** Stale (still shows 007). Worktree status is the source of truth.
**Workers:** 0 active at time of review, last update 21:59 UTC. Build appears to have briefly paused after subtask-4-2.

### Task 007 — Completed Since Last Review

QA report confirms all 10/10 subtasks completed across 5 phases. This was a **documentation-only task** — no code, no tests. QA validated documentation completeness against acceptance criteria. Covers:
- Error type documentation (FieldError codes, envelopes)
- NextAction guidance (retry strategies, field correction hints)
- Agent retry loop documentation (pseudocode, state diagrams)
- Comprehensive examples
- Reference documentation

Clean pass. No issues flagged.

### Task 008 — Idempotent Submissions (In Progress)

**Also documentation-heavy so far.** 15/20 subtasks done. Two main outputs:

#### IDEMPOTENCY_DESIGN.md (~2,800 lines)
Comprehensive architecture doc covering:
- Storage backend interface (in-memory, Redis, database) with pluggable implementation
- Concurrency handling via distributed locking (Redlock pattern)
- TTL expiration and cleanup semantics
- Key scoping per intake definition
- Sequence diagrams for all flows
- Edge cases: clock skew, storage failures, lock starvation, response size limits
- HTTP examples with `Idempotency-Key` header
- MCP tool binding examples

#### INTAKE_CONTRACT_SPEC.md Updates (~320 lines added)
- §8 expanded with detailed idempotency semantics
- §3 Error Schema updated with conflict error types
- §6 Event stream updated with idempotent replay events
- MCP examples showing idempotency in tool calls
- Appendix with FormBridge vs MCP elicitation comparison table

### What's Good

- **Design quality is high.** The idempotency design follows Stripe's patterns (industry standard). Covers the right edge cases: concurrent requests, key collisions, TTL expiry, storage backend failures. The pluggable storage interface is well-defined.
- **Spec integration is thorough.** Idempotency isn't treated as a bolt-on — it's woven into the error schema (conflict types), event stream (replay events), submission records (idempotency metadata), and MCP tool bindings.
- **MCP examples are practical.** Shows exactly how agents should generate idempotency keys and handle conflict responses. This is the kind of documentation that would actually help an agent developer.

### Issues Found

#### 🟡 Important

1. **Still documentation-only after 8 tasks.** Tasks 001-004 built actual code (TypeScript + Python). Tasks 005-006 built React renderer and MCP server. But tasks 007-008 are purely documentation. The IDEMPOTENCY_DESIGN.md is great, but there's no implementation yet. The `IdempotencyStore` interface described in the design doc doesn't exist as actual TypeScript code. At this pace, the spec will be beautifully documented but implementation will lag.

2. **Worktree isolation concern persists.** The 008 worktree only has `docs/` — no `src/`, no `packages/`, no `tests/`. When it merges, it'll just add documentation to the main branch. The earlier code (tasks 001-006) was apparently merged but the main branch still only shows 2 commits (`Initial commit` + `.gitignore`). Need to verify where the actual code from tasks 001-006 ended up.

3. **Main branch may be behind.** `git branch -a` shows only `main` and `auto-claude/008-idempotent-submissions`. The branches for tasks 005-006 that Review #5 spotted (`auto-claude/005-react-form-renderer`, `auto-claude/006-mcp-tool-server-generation`) are gone. Either they were merged (but main only has 2 commits) or they were deleted without merging. **This needs investigation.**

#### 🟢 Minor

4. **IDEMPOTENCY_DESIGN.md is ~100KB.** That's a LOT of documentation for a feature that doesn't exist in code yet. Risk of spec-implementation drift when someone eventually builds it.

### Previous Issues Status

| Issue | Status |
|-------|--------|
| 🔴 Dual Python+TypeScript | Unknown — can't verify, worktree only has docs |
| 🔴 Validator not wired into SubmissionManager | Unknown |
| 🟡 API URL mismatch (client vs server) | Unknown |
| 🟡 Missing submit endpoint | Unknown |
| 🟡 No state transition validation in TS | Unknown |
| 🟡 Double component creation | Unknown |
| 🟡 Idempotency key regenerates per click | Unknown — but now extensively documented |

**Note:** Can't verify code-level issues because the active worktree (008) only contains documentation. All code-level issues from Reviews #1-2 need re-verification against wherever the task 001-006 code actually lives.

### Key Question for Next Review

**Where is the code?** Main branch has 2 commits. Task branches are gone. The 40K+ lines of TypeScript from tasks 001-006 should be somewhere. Need to check if code was squash-merged, rebased away, or lost.

---

*Next review: Check cron schedule.*

---

## Review #7 — 2026-01-29 ~23:00 IST

**Status:** Task 008 (Idempotent Submissions) — **COMPLETED** ✅ (no QA report found, but task moved on). Task 009 (Resumable Sessions with Resume Tokens) — **in progress**, 11/16 subtasks, "Update Intake Contract Spec" phase.
**Active worktree:** `009-resumable-sessions-with-resume-tokens` (11 commits, branched from Initial commit).
**Main `.auto-claude-status`:** Stale again (shows 008 at 8/20). Worktree is source of truth.
**Git state:** Main branch has 2 commits. Only branch is `auto-claude/009-resumable-sessions-with-resume-tokens`. Previous task branches (005, 006, 007, 008) all gone — never merged to main.

### Task 008 Completion

Task 008 appears to have completed between reviews. No `qa_report.md` found in `.auto-claude/specs/008-idempotent-submissions/` — QA may have been skipped or handled differently. The worktree for 008 was cleaned up and replaced by 009.

### Task 009 — Resumable Sessions with Resume Tokens (In Progress)

Another **documentation-only task**. Building two artifacts:

#### RESUME_TOKENS_DESIGN.md (~6,842 lines, ~239KB)
This is the **largest document yet**. Comprehensive design covering:
- Token format and generation (CSPRNG-based opaque tokens)
- Optimistic concurrency control (ETag-style versioning)
- 409 Conflict response format with current state in body
- Token storage with pluggable backends (in-memory, Redis, DB)
- TTL configuration and expiration (default 7 days, 410 Gone on expired)
- Cross-actor handoff: agent→human, agent→agent, human→agent flows
- Authentication bypass rationale (token = capability credential)
- HTTP API bindings (GET/PATCH with resume token in URL)
- MCP integration (resume token as tool parameter)
- Event stream events (token.issued, token.accessed, token.expired, token.revoked, handoff.initiated)
- Edge cases: clock skew, storage failures, concurrent token rotation
- Observability: Prometheus metrics, SLIs/SLOs, error budgets, Grafana dashboards

#### INTAKE_CONTRACT_SPEC.md Updates (~588 lines added)
- §7.1 Resume Tokens expanded with detailed semantics
- §7.2 Handoff Flow expanded with examples
- §2.4 Submission Record Schema updated with resume token fields
- §3 Error Schema updated with token-related error types

### What's Good

- **Cross-actor handoff is the killer feature.** The design nails the agent→human handoff flow — generate a URL with embedded resume token, send it to a human, they pick up where the agent left off. No shared auth needed. This is genuinely differentiated from everything else in the market.
- **Optimistic concurrency is well thought out.** ETag-style versioning prevents silent overwrites. 409 Conflict responses include the current state so the client can resolve. Sequence diagrams cover all the concurrent edit scenarios.
- **Token security model is reasonable.** Tokens are capability-based (bearer auth). The doc honestly discusses the security trade-offs vs traditional auth and proposes mitigations (short TTL, IP binding, revocation, rate limiting).

### Issues Found

#### 🔴 Critical

1. **Documentation-to-code ratio is alarming.** We're now 9 tasks in. Tasks 001-006 produced actual code. Tasks 007-009 have produced ~400KB of design documents with zero implementation. The design docs now dwarf the codebase. The RESUME_TOKENS_DESIGN.md alone (239KB) is larger than all the TypeScript code from tasks 001-006 combined.

2. **All code from tasks 001-006 appears lost.** Git history confirms: main branch has 2 commits. The `auto-claude/009` branch also starts from `Initial commit` (17af700), not from any code branch. Previous task branches (005, 006, 007, 008) are completely gone. The 40K+ lines of TypeScript, React renderer, MCP server, HTTP server — none of it is on any existing branch. **This is a significant loss if the code wasn't preserved elsewhere.**

#### 🟡 Important

3. **Massive over-specification.** 6,842 lines for resume tokens — including Prometheus queries, Grafana dashboard JSON, SLO error budget calculations, SLI monitoring. This is production ops documentation for a feature that hasn't been written yet. The design doc includes Helm chart configurations, Kubernetes probe setups, and circuit breaker patterns. This level of detail is premature for an MVP.

4. **No QA report for task 008.** Every task from 001-007 has a QA report. Task 008 doesn't. Either QA was skipped or the process changed. Worth monitoring whether 009 gets QA'd.

#### 🟢 Minor

5. **Worktree branching from root.** Task 009's branch diverges from `Initial commit`, not from the latest code. This means when it merges, it'll only bring in the docs/ changes, not any prior code. Each worktree is essentially building on a blank slate.

### Cumulative Progress Summary (Tasks 001-009)

| Task | Type | Status | Output |
|------|------|--------|--------|
| 001 | Code | ✅ Done | Project scaffolding, monorepo |
| 002 | Code | ✅ Done | Schema normalizer (Zod/JSON Schema/OpenAPI→IR) |
| 003 | Code | ✅ Done | Intake contract runtime + validation |
| 004 | Code | ✅ Done | HTTP/JSON API server (Hono) |
| 005 | Code | ✅ Done | React form renderer + hooks + demo |
| 006 | Code | ✅ Done | MCP tool server generation |
| 007 | Docs | ✅ Done | Error protocol documentation |
| 008 | Docs | ✅ Done | Idempotency design + spec updates |
| 009 | Docs | 🔨 11/16 | Resume tokens design + spec updates |

**Pattern:** Auto Claude shifted from code (001-006) to pure documentation (007-009). Remaining specs (010-023) include both code and doc tasks, so this may be a temporary docs phase.

### Key Concern

The biggest risk is now **spec-implementation drift**. The design docs specify everything down to Prometheus metric names and Grafana dashboards, but the actual codebase hasn't been touched since task 006. When implementation resumes, the specs may be too detailed to follow exactly, or the code may need to diverge from them.

---

*Next review: ~00:00 IST (midnight, may skip if it's late and nothing's changed).*

---

## ⚠️ CORRECTION — Reviews #6 & #7 (issued 2026-01-29 ~23:05 IST)

**Reviews #6 and #7 contained a major error: the claim that "code from tasks 001-006 appears lost" is WRONG.**

### What Actually Happened

Auto Claude's workflow: build code on a worktree branch → merge files into the main working directory → delete the worktree branch. The code was never "lost" — it lives in the working directory as **uncommitted staged files**. `git status` shows ~5,769 staged additions including all 120 source files (~42K lines of TS/TSX/Python).

The files are all present and accounted for:
- `src/` — HTTP server (Hono), MCP server, validators, submission manager, types
- `packages/schema-normalizer/` — Zod/JSON Schema/OpenAPI parsers, IR types, tests
- `packages/form-renderer/` — React components, hooks, API client, integration tests
- `packages/demo/` — Vite demo app with vendor onboarding
- `packages/core/`, `packages/mcp/`, `packages/react/` — package stubs
- `formbridge/` — Python runtime (state machine, validation, events)
- `tests/` — Unit + integration tests (TS + Python)
- `examples/` — Vendor onboarding example

The git history only shows 2 commits on main because Auto Claude hasn't done a final commit of the merged code. The worktree branches are cleaned up after their files are copied to the main working tree.

### Corrected Issue Status (from Reviews #1-2)

Re-verified against the actual code on disk:

| Issue | Status |
|-------|--------|
| 🔴 Dual Python+TypeScript | **Still present.** `formbridge/` (Python) and `src/` (TypeScript) are parallel implementations. |
| 🔴 Validator not wired into SubmissionManager | **Still present.** `validateFields()` at line 409 still has `// TODO: Add type validation` — only checks required fields. The full `Validator` class exists separately in `src/core/validator.ts`. |
| 🟡 API URL mismatch | **Still present.** Form renderer client uses `POST /intakes/{intakeId}/submissions` (plural "intakes"). Server routes use `POST /intake/:id/submissions` (singular "intake"). |
| 🟡 Missing submit endpoint | **Still missing.** No `POST /submit` route in `src/routes/submissions.ts`. |
| 🟡 No state transition validation in TS | **Still present.** `transitionState()` at line 348 sets the new state directly without checking valid transitions. |
| 🟡 Idempotency key regenerates per click | **Unknown** — needs re-check in form-renderer hooks. |

### Lessons Learned (Updated)

1. ~~Always check worktrees~~ → **Always check the working directory too.** `git log` doesn't tell the whole story when files are staged but uncommitted.
2. Don't assume "branch deleted = code lost." Auto Claude's workflow copies files before cleaning up branches.
3. Verify claims before escalating to the user. The "code is lost" alarm in Review #7 was wrong and unnecessarily alarming.

### Revised Assessment

The project is in better shape than Reviews #6-7 suggested. All code from tasks 001-006 is present. The documentation-heavy phase (tasks 007-009) is layering specs on top of working code, not writing specs into a void. The concern about spec-implementation drift is still valid but less urgent — the code exists and can be iterated on.

The real remaining concerns are:
1. **Code-level bugs from Reviews #1-2 haven't been fixed** (validator wiring, URL mismatch, missing submit endpoint, no transition validation)
2. **Design docs are extremely verbose** (~400KB+ for features not yet implemented in code)
3. **No git commit of the merged codebase** — all that code is just staged, one bad `git reset` away from confusion

---
