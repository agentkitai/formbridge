# Feature 008 — Idempotent Submissions

> **Status:** IMPLEMENTED | **Phase:** 2 | **Priority:** must | **Complexity:** medium | **Impact:** high
> **[Back to Feature Index](../FEATURES.md)**

## Implementation Summary

> Implemented as part of the FormBridge build. This was a documentation and design task that produced the comprehensive idempotency design document (`IDEMPOTENCY_DESIGN.md`, ~2,800 lines / ~100KB) and updated the Intake Contract Spec (Section 8) with detailed idempotency semantics. The design covers storage backend interface, concurrency handling via Redlock, TTL management, key scoping, and edge cases. No runtime code was implemented — this is a specification for future implementation.

**Key files:**
- `docs/IDEMPOTENCY_DESIGN.md` — comprehensive idempotency design document (~2,800 lines)
- `docs/INTAKE_CONTRACT_SPEC.md` (Section 8) — idempotency header semantics and contract

**Known issues:**
- Design document is ~100KB, which is very verbose for a feature that has no runtime implementation yet. Risk of specification-implementation drift when code is eventually written.

## Summary

The Idempotent Submissions feature defines the design for `Idempotency-Key` header support in FormBridge. When a client submits a form with an `Idempotency-Key` header, duplicate requests with the same key return the original response instead of creating duplicate submissions. The design specifies a pluggable storage backend interface, TTL-based key expiration, Redlock-based concurrent request handling, key scoping rules (per intake, per user), and comprehensive edge case handling. This ensures that network retries, agent retry loops, and user double-clicks do not produce duplicate submissions.

## Dependencies

**Upstream:**
- Feature 003 (Intake Contract Spec) — defines the HTTP submission endpoint that receives the Idempotency-Key header
- Feature 004 (HTTP API) — the API layer that will implement idempotency key processing

**Downstream:**
- Feature 009 (Submission Lifecycle) — idempotent submissions integrate with the submission state machine

## Architecture & Design

### Idempotency-Key Header
- Header: `Idempotency-Key: <client-generated-uuid>`
- Required on all `POST` submission requests
- Optional on `PUT`/`PATCH` requests (inherently idempotent but key adds safety)
- Key format: UUIDv4 recommended, any string up to 256 characters accepted

### Request Processing Flow
```
Client Request + Idempotency-Key
       |
       v
  Key exists in store?
       |
  YES: Return stored response (HTTP 200 with original body)
       |           + X-Idempotent-Replayed: true header
  NO:  Acquire lock (Redlock)
       |
       v
  Key acquired (no race)?
       |
  YES: Process request, store response, release lock
  NO:  Wait for lock release, return stored response
```

### Storage Backend Interface
Pluggable storage backend with the following interface:
- `get(key, scope)` — retrieve stored response for key
- `set(key, scope, response, ttl)` — store response with TTL
- `acquireLock(key, scope, timeout)` — acquire processing lock
- `releaseLock(key, scope, lockToken)` — release processing lock

Planned implementations:
- **In-memory** — for development and single-instance deployments
- **Redis** — for production multi-instance deployments (with Redlock for distributed locking)
- **PostgreSQL** — for deployments preferring database-backed storage

### Key Scoping
Keys are scoped to prevent collisions:
- **Intake scope** — key is unique within an intake form (default)
- **User scope** — key is unique per user per intake (when authentication is present)
- Composite key: `{intake_id}:{user_id}:{idempotency_key}`

### TTL and Expiration
- Default TTL: 24 hours (configurable)
- TTL starts when the original response is stored
- Expired keys are treated as new requests
- Background cleanup process for expired entries

### Concurrent Request Handling
- First request acquires Redlock and processes
- Concurrent duplicates wait for lock release (configurable timeout: 30s default)
- After lock release, concurrent requests return the stored response
- Lock timeout triggers HTTP 409 Conflict with retry guidance

### Response Headers
| Header | Description |
|--------|-------------|
| `Idempotency-Key` | Echoed back in response |
| `X-Idempotent-Replayed` | `true` if response is a replay of stored result |
| `X-Idempotent-Expires` | ISO 8601 timestamp when the key expires |

### Edge Cases
- **Request body mismatch** — same key, different body: HTTP 422 error (key reuse violation)
- **In-flight expiration** — key expires during processing: complete and store with new TTL
- **Storage failure** — fallback to processing without idempotency (log warning)
- **Key format invalid** — HTTP 400 with error message
- **Key missing on required endpoint** — HTTP 400 with error message

## Implementation Tasks

### Task 1: Idempotency-Key Header Design
- [x] Define header format and validation rules
- [x] Specify required vs optional endpoints
- [x] Document key generation recommendations for clients
- [x] Define error responses for missing/invalid keys

**Validation:** Header specification is complete and consistent with HTTP standards (reference: Stripe, IETF draft).

### Task 2: Storage Backend Interface
- [x] Define abstract storage interface with get/set/lock/unlock operations
- [x] Specify in-memory backend design for development use
- [x] Specify Redis backend design with Redlock for production use
- [x] Specify PostgreSQL backend design as alternative
- [x] Document storage backend selection and configuration

**Validation:** Interface is implementation-agnostic. All three backend designs are complete.

### Task 3: TTL and Expiration Design
- [x] Define default TTL and configuration mechanism
- [x] Specify TTL lifecycle (start on response store, not on request receipt)
- [x] Design background cleanup process for expired entries
- [x] Document TTL interaction with key scoping

**Validation:** TTL semantics are unambiguous. Cleanup process prevents unbounded storage growth.

### Task 4: Concurrent Request Handling Design
- [x] Design Redlock-based distributed lock acquisition
- [x] Specify wait behavior for concurrent duplicate requests
- [x] Define lock timeout and fallback behavior
- [x] Document race condition prevention guarantees

**Validation:** Concurrent request scenarios produce correct behavior (no duplicates, no lost requests).

### Task 5: Key Scoping Design
- [x] Define intake-scoped and user-scoped key strategies
- [x] Specify composite key format
- [x] Document scope selection based on authentication context
- [x] Handle scope transitions (anonymous to authenticated)

**Validation:** Key scoping prevents cross-intake and cross-user collisions.

### Task 6: MCP Integration Design
- [x] Specify how MCP tools handle idempotency keys
- [x] Document key lifecycle in MCP create/set/validate/submit flow
- [x] Define key generation responsibility (agent vs server)

**Validation:** MCP idempotency integrates cleanly with the MCP tool lifecycle.

### Task 7: Intake Contract Spec Updates
- [x] Update `INTAKE_CONTRACT_SPEC.md` Section 8 with idempotency semantics
- [x] Add request/response examples with idempotency headers
- [x] Document error responses for idempotency violations
- [x] Cross-reference with error protocol (Feature 007)

**Validation:** Spec section is complete and consistent with the design document.

### Task 8: Comprehensive Design Document
- [x] Write `IDEMPOTENCY_DESIGN.md` covering all design aspects
- [x] Include sequence diagrams for all request flows
- [x] Document all edge cases and their handling
- [x] Include storage backend comparison table
- [x] Provide configuration reference

**Validation:** Design document is comprehensive and implementable. All edge cases are addressed.

## Test Plan

| Type | Description | Count |
|------|-------------|-------|
| Design Review | Storage interface completeness and correctness | ~3 |
| Specification | Spec section consistency with design document | ~4 |
| Edge Case | All documented edge cases have defined behavior | ~8 |
| Cross-reference | Idempotency integrates with error protocol and MCP | ~4 |
| Example | All request/response examples are valid and consistent | ~6 |

## Documentation Tasks

- [x] `IDEMPOTENCY_DESIGN.md` comprehensive design document
- [x] `INTAKE_CONTRACT_SPEC.md` Section 8 updates
- [x] Storage backend comparison and selection guide
- [x] Client integration guide (key generation, header usage)
- [x] MCP integration guide for agent developers

## Code Review Checklist

- [x] Type safety verified — storage interface types are well-defined
- [x] Patterns consistent — follows existing spec document conventions
- [x] No regressions — existing spec sections unmodified
- [x] Performance acceptable — N/A (design document, no runtime code)
- [ ] Document verbosity (~100KB) may need condensing for implementability

## Deployment & Release

- Documentation-only release; no runtime deployment required
- Design document serves as implementation specification for future development
- Storage backend selection is a deployment-time configuration decision
- Redis backend requires Redis 6.2+ with Redlock support
- PostgreSQL backend requires advisory lock support

## Observability & Monitoring

- Idempotency key hit/miss ratio (replayed vs new responses)
- Storage backend latency (get, set, lock operations)
- Lock contention rate (concurrent duplicates waiting)
- Lock timeout rate (failed concurrent requests)
- Key expiration rate and storage utilization
- Request body mismatch rate (key reuse violations)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Spec-implementation drift due to verbose design doc | High | Medium | Treat design doc as living document; update during implementation |
| Design document too large for developers to absorb | Medium | Medium | Add executive summary and quick-start section |
| Redis Redlock correctness concerns (Kleppmann critique) | Low | High | Document Redlock limitations; offer PostgreSQL advisory lock alternative |
| Storage backend performance under high load | Medium | Medium | Benchmark during implementation; configurable TTL and cleanup intervals |
| Key scoping complexity causes integration confusion | Low | Medium | Default to intake-scope; user-scope as opt-in |

## Definition of Done

- [x] All acceptance criteria met (9/9)
- [x] Tests passing (design review complete)
- [x] Code reviewed
- [x] Documentation updated
- [ ] Runtime implementation tracked as follow-up work
