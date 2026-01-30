# Feature 009 — Resumable Sessions with Resume Tokens

> **Status:** IMPLEMENTED | **Phase:** 2 | **Priority:** should | **Complexity:** high | **Impact:** high
> **[Back to Feature Index](../FEATURES.md)**

## Implementation Summary

> Resumable submission sessions are implemented via opaque, CSPRNG-based resume tokens with ETag-style optimistic concurrency control. A comprehensive design document (RESUME_TOKENS_DESIGN.md, ~6,842 lines / ~239KB) was produced covering token format, concurrency model, storage backends, TTL/expiration policy, cross-actor handoff flows, authentication bypass rationale, HTTP and MCP bindings, event stream events, and observability. The Intake Contract Spec (INTAKE_CONTRACT_SPEC.md) was updated at sections 2.4, 3, 7.1, and 7.2. Resume token rotation is already functional in the codebase -- every state change in `SubmissionManager` generates a new `rtok_` prefixed token, and stale tokens are rejected with a 409 Conflict response.

**Key files:**
- `docs/RESUME_TOKENS_DESIGN.md` -- full design document (~239KB)
- `docs/INTAKE_CONTRACT_SPEC.md` -- spec updates at sections 2.4, 3, 7.1, 7.2
- `src/core/submission-manager.ts` -- token generation (`rtok_` prefix via `randomUUID`), token rotation on state changes, token verification, expiry checks
- `src/types.ts` -- `Submission` interface with `resumeToken`, `expiresAt`, `ttlMs` fields
- `src/types/intake-contract.ts` -- `SubmissionState` type including `expired`, error types including `expired` and `conflict`

**Known issues:**
- Design document is extremely verbose (239KB) with premature production ops details (Prometheus queries, Grafana dashboard JSON, Helm charts, K8s probe configurations) for a feature at design stage.
- `SubmissionManager.transitionState()` does not validate whether state transitions are legal (missing transition guard from the Python implementation).

## Summary

Resumable sessions enable pausable, resumable submission workflows via opaque resume tokens that serve as both capability credentials and version identifiers. When a submission is created or updated, the server issues a CSPRNG-based opaque resume token. Any actor -- the original agent, a different agent, or a human -- can use this token to retrieve the current submission state and continue from where it left off, without requiring shared authentication. Tokens support ETag-style versioning to prevent conflicting concurrent edits: every state-changing operation rotates the token, and stale tokens are rejected with 409 Conflict. Tokens have a configurable TTL (default 7 days) and return 410 Gone with the submission ID when expired.

## Dependencies

**Upstream:** Feature 003 (Intake Contract Runtime), Feature 004 (HTTP/JSON API Server), Feature 008 (Idempotent Submissions)
**Downstream:** Feature 010 (Mixed-Mode Agent-Human Collaboration), Feature 021 (future)

## Architecture & Design

### Token Format
- Opaque string with `rtok_` prefix followed by a v4 UUID generated via `crypto.randomUUID()`
- Example: `rtok_550e8400-e29b-41d4-a716-446655440000`
- CSPRNG-based for non-guessability (128 bits of entropy)
- No embedded metadata -- purely opaque capability credential

### Concurrency Model
- ETag-style optimistic concurrency: the resume token acts as a version stamp
- Every state-changing operation (create, setFields, submit, requestUpload, confirmUpload, approve, reject, requestChanges) rotates the token
- Clients must supply the current resume token on every mutating request
- Mismatched tokens result in `InvalidResumeTokenError` (maps to 409 Conflict over HTTP)

### Storage
- `SubmissionStore` interface with `get(id)`, `save(submission)`, and `getByResumeToken(token)` methods
- In-memory implementation for development; pluggable for Redis/database in production
- Token-to-submission mapping maintained by the store

### TTL & Expiration
- Configurable via `ttlMs` on `CreateSubmissionRequest`
- `Submission.expiresAt` computed at creation time: `Date.now() + ttlMs`
- Expired submissions return `IntakeError` with `type: "expired"` and `retryable: false`
- Default TTL: 7 days (604,800,000 ms)

### Security Model
- Token = capability credential (bearer-style)
- No authentication required beyond token possession
- Token rotation prevents replay of stale tokens
- Short TTL limits window of exposure

## Implementation Tasks

### Task 1: Token Format and Generation Design
- [x] Define CSPRNG-based opaque token format (`rtok_` + UUID v4)
- [x] Document token entropy requirements (128 bits minimum)
- [x] Specify token encoding (URL-safe string)
**Validation:** Token format documented in RESUME_TOKENS_DESIGN.md section 3. Implementation confirmed in `SubmissionManager.createSubmission()` generating `rtok_${randomUUID()}`.

### Task 2: Optimistic Concurrency Control Model
- [x] Design ETag-style version mechanism using token rotation
- [x] Define version increment strategy (new token on every state change)
- [x] Document 409 Conflict response format with current state in body
- [x] Create sequence diagrams for concurrent edit scenarios
**Validation:** Concurrency model documented in RESUME_TOKENS_DESIGN.md section 4. Token rotation implemented in `setFields()`, `requestUpload()`, and approval operations.

### Task 3: Storage Backend Interface
- [x] Design `SubmissionStore` interface with token-based lookup
- [x] Implement `get(submissionId)` method
- [x] Implement `save(submission)` method
- [x] Implement `getByResumeToken(resumeToken)` method
- [x] Document pluggable backend strategy (in-memory, Redis, database)
**Validation:** `SubmissionStore` interface defined in `submission-manager.ts`. In-memory implementation used in tests (`MockSubmissionStore`). Backend architecture documented in RESUME_TOKENS_DESIGN.md section 5.

### Task 4: TTL and Expiration Policy
- [x] Define configurable TTL with 7-day default
- [x] Implement `expiresAt` computation in `createSubmission()`
- [x] Add expiry check in `setFields()` and other mutating operations
- [x] Define 410 Gone response for expired tokens with submission ID
- [x] Document cleanup strategies for expired submissions
**Validation:** TTL handled via `ttlMs` field on `CreateSubmissionRequest`. Expiry checks present in `setFields()` (line ~235) and `requestUpload()` (line ~331).

### Task 5: Cross-Actor Handoff Flow Design
- [x] Document agent-to-human handoff flow
- [x] Document agent-to-agent handoff flow
- [x] Document human-to-agent handoff flow
- [x] Define URL generation for human access via resume token
- [x] Specify `handoff.link_issued` and `handoff.resumed` event types
**Validation:** Handoff flows documented in RESUME_TOKENS_DESIGN.md section 6. Event types defined in `intake-contract.ts` (`handoff.link_issued`, `handoff.resumed`).

### Task 6: HTTP API Binding
- [x] Document GET /submissions/:resumeToken for state retrieval
- [x] Document PATCH /submissions/:resumeToken for field updates
- [x] Define HTTP header conventions for token versioning
- [x] Document CORS and preflight requirements
- [x] Define error response mappings (409, 410, 403)
**Validation:** HTTP bindings documented in RESUME_TOKENS_DESIGN.md section 7. Route implementations in `src/routes/submissions.ts`.

### Task 7: MCP Integration
- [x] Define resume token as MCP tool parameter
- [x] Document token passing in MCP responses
- [x] Integrate with Intake Contract operations via MCP tools
- [x] Define MCP-specific error handling for token conflicts
**Validation:** MCP integration documented in RESUME_TOKENS_DESIGN.md section 8. Tool generator in `src/mcp/tool-generator.ts` handles resume tokens.

### Task 8: Security Model Documentation
- [x] Document token-as-capability-credential model
- [x] Justify authentication bypass for cross-actor scenarios
- [x] Define mitigations (TTL, rotation, IP binding, rate limiting, revocation)
- [x] Compare with traditional authentication approaches
**Validation:** Security model in RESUME_TOKENS_DESIGN.md section 6.2-6.7.

### Task 9: Observability
- [x] Define event stream events for token lifecycle
- [x] Document token.issued, token.accessed, token.expired, token.revoked events
- [x] Specify monitoring metrics and SLIs
**Validation:** Event stream documented in RESUME_TOKENS_DESIGN.md section 9. Note: Prometheus/Grafana details are premature for current project stage.

### Task 10: Intake Contract Spec Updates
- [x] Update section 2.4 (Submission Record Schema) with resume token fields
- [x] Update section 3 (Error Schema) with token-related error types
- [x] Expand section 7.1 (Resume Tokens) with detailed semantics
- [x] Expand section 7.2 (Handoff Flow) with examples
**Validation:** ~588 lines added to INTAKE_CONTRACT_SPEC.md across sections 2.4, 3, 7.1, and 7.2.

## Test Plan

| Type | Description | Count |
|------|-------------|-------|
| Unit | Token generation produces valid `rtok_` format | 1 |
| Unit | Token rotation on setFields changes resume token | 1 |
| Unit | Stale token rejected with InvalidResumeTokenError | 1 |
| Unit | Expired submission returns error with type "expired" | 1 |
| Integration | Full create-setFields-submit flow with token rotation | 1 |
| Integration | Concurrent edit detection via stale token | 1 |
| Integration | Resume by token after actor switch | 1 |
| Design review | RESUME_TOKENS_DESIGN.md reviewed against acceptance criteria | 1 |
| Spec review | INTAKE_CONTRACT_SPEC.md updates reviewed for consistency | 1 |

## Documentation Tasks

- [x] RESUME_TOKENS_DESIGN.md created (~6,842 lines)
- [x] INTAKE_CONTRACT_SPEC.md updated (sections 2.4, 3, 7.1, 7.2)
- [x] Token format specification documented
- [x] Concurrency model with sequence diagrams documented
- [x] Cross-actor handoff flows documented
- [x] Security rationale and trade-offs documented

## Code Review Checklist

- [x] Type safety verified -- `Submission` interface includes `resumeToken: string`, `expiresAt?: string`, `ttlMs?: number`
- [x] Patterns consistent -- token generation follows `rtok_${randomUUID()}` convention throughout
- [x] No regressions -- existing submission flows continue to work with token rotation
- [x] Performance acceptable -- token lookup via `getByResumeToken` is O(1) in in-memory store

## Deployment & Release

- Design document and spec updates are documentation-only artifacts
- Token generation and rotation are already integrated into `SubmissionManager`
- No additional deployment steps required beyond existing server deployment
- Future: pluggable storage backends (Redis, database) will require configuration

## Observability & Monitoring

- Resume token events defined: `submission.created` (includes initial token), `field.updated`, `handoff.link_issued`, `handoff.resumed`
- Token expiry tracked via `Submission.expiresAt`
- Future: Prometheus metrics, Grafana dashboards (documented in design but not yet implemented)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Design doc too verbose for implementation | Medium | Medium | Focus on core sections (1-8) during implementation; defer ops sections |
| Spec-implementation drift due to doc size | Medium | High | Keep implementation aligned with code-level types, not just prose |
| Token leakage in logs or URLs | Low | High | Tokens are opaque; ensure they are not logged at INFO level |
| Concurrent edit conflicts confuse agents | Medium | Medium | Clear 409 response format with current state for conflict resolution |

## Definition of Done

- [x] All acceptance criteria met (10/10)
- [x] Draft submission returns resume token
- [x] Token enables GET and PATCH operations
- [x] ETag-style version for concurrency (token rotation)
- [x] Stale version returns 409 Conflict
- [x] Opaque, non-guessable tokens (CSPRNG-based)
- [x] Configurable expiration (7-day default)
- [x] Expired returns 410 Gone with submission ID
- [x] Works without authentication (token = capability)
- [x] MCP supports resume token passing
- [x] Token-based access for cross-actor handoff
- [x] Tests passing
- [x] Code reviewed
- [x] Documentation updated
