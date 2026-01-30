# Feature 013 --- Event Stream & Audit Trail

> **Status:** PLANNED | **Phase:** 3 | **Priority:** should | **Complexity:** medium | **Impact:** medium
> **[Back to Feature Index](../FEATURES.md)**

## Summary

Implement an append-only, immutable event stream that records every state transition, validation result, and actor action across the submission lifecycle. Events are already emitted and stored in the `submission.events` array for most operations, and typed event types are defined in `IntakeEventType`. This feature closes the gap by adding a dedicated `EventStore` abstraction, a GET endpoint for querying the event stream with filtering, field-level diff tracking for `field.updated` events, a JSONL export endpoint, and a pluggable storage interface so the event store can be backed by memory, a database, or an external service.

## Dependencies

**Upstream:** Feature 3 (Submission Lifecycle & State Machine) -- events are emitted during state transitions orchestrated by `SubmissionManager` and `ApprovalManager`.

**Downstream:** Feature 19 (Analytics Dashboard), Feature 22 (Pluggable Integrations Platform) -- both consume the event stream for reporting and triggering external workflows.

**Internal task ordering:**
1. Task 1 (EventStore interface) must complete before Task 2 (InMemoryEventStore) and Task 3 (events route).
2. Task 2 must complete before Task 3 (route needs a concrete store implementation for testing).
3. Task 4 (query filtering) depends on Task 3 (route exists).
4. Task 5 (field-level diffs) can proceed in parallel with Tasks 3--4 but must be integrated before Task 7 (integration tests).
5. Task 6 (validation event emission) can proceed independently but must merge before Task 7.
6. Task 7 (export endpoint) depends on Tasks 3--5.
7. Task 8 (integration tests) depends on all prior tasks.

## Architecture & Design

### Components and files to create
- `src/core/event-store.ts` -- `EventStore` interface, `EventQuery` type, `EventPage` response type
- `src/core/in-memory-event-store.ts` -- `InMemoryEventStore` implementation
- `src/routes/events.ts` -- Express route factory `createEventsRouter(eventStore)`
- `tests/event-store.test.ts` -- unit tests for EventStore
- `tests/events-route.test.ts` -- integration tests for the events HTTP API

### Components and files to modify
- `src/core/submission-manager.ts` -- wire EventStore into event emission; add field-level diffs to `field.updated` payloads
- `src/core/approval-manager.ts` -- wire EventStore so approval events are persisted in the store (not only in `submission.events`)
- `src/validation/validator.ts` -- emit `validation.passed` and `validation.failed` events with full results
- `src/types/intake-contract.ts` -- add `version` field to `IntakeEvent` if not present; add `EventStoreConfig` type
- `src/index.ts` -- export new modules

### Design decisions
- The `EventStore` interface must be separate from the `SubmissionStore` so events can be stored, queried, and exported independently.
- Events remain append-only: the interface exposes `append()` and `query()` but no `update()` or `delete()`.
- Query results are paginated using cursor-based pagination (`afterEventId` + `limit`), matching the spec in INTAKE_CONTRACT_SPEC.md section 4.10.
- Field-level diffs include `previousValue` and `newValue` in the `field.updated` event payload.
- Export format is JSONL (one JSON object per line), consistent with INTAKE_CONTRACT_SPEC.md section 6.3.

### Patterns to follow
- Routes use the factory pattern `createEventsRouter(eventStore)`, consistent with `createSubmissionRoutes(manager)` in `src/routes/submissions.ts` and `createApprovalRoutes(manager)` in `src/routes/approvals.ts`.
- Events follow the existing `IntakeEvent` shape: `{ eventId, type, submissionId, ts, actor, state, payload? }`.
- Zod schemas for request validation, consistent with `actorSchema` usage in existing routes.
- Error handling follows the existing pattern: custom Error subclasses caught in route handlers, mapped to HTTP status codes.

## Implementation Tasks

### Task 1: Define EventStore Interface and Types

- [ ] Create `src/core/event-store.ts` with `EventStore` interface
- [ ] Define `EventQuery` type with optional filters: `submissionId` (required), `type?`, `actorId?`, `after?` (ISO timestamp), `before?` (ISO timestamp), `afterEventId?` (cursor), `limit?` (default 100, max 1000)
- [ ] Define `EventPage` response type: `{ events: IntakeEvent[], hasMore: boolean, nextEventId?: string }`
- [ ] Define `EventStoreConfig` type for pluggable storage configuration
- [ ] Export `EventStore` interface method signatures: `append(event: IntakeEvent): Promise<void>`, `query(query: EventQuery): Promise<EventPage>`, `getById(eventId: string): Promise<IntakeEvent | null>`, `countBySubmission(submissionId: string): Promise<number>`
- [ ] Add `version` field to `IntakeEvent` in `src/types/intake-contract.ts` if not already present (monotonic per submission)

**Dependencies:** None
**Effort:** S
**Validation:** TypeScript compilation passes. Interface is importable from `src/core/event-store.ts`. All method signatures are typed and documented with JSDoc.

### Task 2: Implement InMemoryEventStore

- [ ] Create `src/core/in-memory-event-store.ts` implementing `EventStore`
- [ ] Use a `Map<string, IntakeEvent[]>` keyed by `submissionId` for fast per-submission lookups
- [ ] Implement `append()` that validates event shape, enforces append-only semantics (no duplicate `eventId`), and stores the event
- [ ] Implement `query()` with support for all `EventQuery` filters: type, actorId, time range, cursor pagination
- [ ] Implement `getById()` with O(1) lookup via a secondary `Map<string, IntakeEvent>` keyed by `eventId`
- [ ] Implement `countBySubmission()` returning the total event count for a submission
- [ ] Add unit tests in `tests/event-store.test.ts` covering: append, query with each filter, cursor pagination, duplicate rejection, empty results

**Dependencies:** Task 1
**Effort:** M
**Validation:** All unit tests pass. Events are queryable by type, actor, time range. Cursor pagination returns correct pages. Duplicate eventIds are rejected.

### Task 3: Create Events API Route

- [ ] Create `src/routes/events.ts` with `createEventsRouter(eventStore)` factory function
- [ ] Implement `GET /submissions/:submissionId/events` endpoint
- [ ] Parse query parameters: `type`, `actorId`, `after`, `before`, `afterEventId`, `limit`
- [ ] Validate query parameters using Zod schemas
- [ ] Return `EventPage` JSON response with `{ ok: true, submissionId, events, hasMore, nextEventId? }`
- [ ] Return 400 for invalid query parameters, 404 for unknown submission (zero events)
- [ ] Add route to `src/index.ts` exports

**Dependencies:** Tasks 1, 2
**Effort:** M
**Validation:** HTTP GET returns paginated events. Query parameters filter correctly. Invalid parameters return 400. Response shape matches INTAKE_CONTRACT_SPEC.md section 4.10.

### Task 4: Implement Query Filtering

- [ ] Add filter-by-type support: accept comma-separated event types (e.g., `?type=field.updated,validation.passed`)
- [ ] Add filter-by-actor: `?actorId=agent_bot_1` filters events to those performed by the specified actor
- [ ] Add filter-by-time-range: `?after=2026-01-01T00:00:00Z&before=2026-02-01T00:00:00Z`
- [ ] Add compound filtering: all filters combine with AND semantics
- [ ] Validate filter values (event type must be valid `IntakeEventType`, timestamps must be ISO 8601)
- [ ] Add unit tests for each filter and compound filters

**Dependencies:** Task 3
**Effort:** S
**Validation:** Each filter narrows results correctly. Compound filters combine with AND. Invalid filter values return 400.

### Task 5: Add Field-Level Diffs to field.updated Events

- [ ] Modify `SubmissionManager.setFields()` to compute diffs before applying field updates
- [ ] For each updated field, capture `{ fieldPath, previousValue, newValue }` in the event payload
- [ ] Handle nested field paths (dot-notation, e.g., `address.city`)
- [ ] Handle new fields (previousValue is `undefined`) and removed fields (newValue is `undefined`)
- [ ] Include the diff array as `payload.diffs: Array<{ fieldPath: string, previousValue: unknown, newValue: unknown }>` on `field.updated` events
- [ ] Preserve backward compatibility: existing `payload.fieldPath` and `payload.value` fields remain
- [ ] Add unit tests verifying diff payloads for field creation, update, and removal

**Dependencies:** Task 1 (for event types)
**Effort:** M
**Validation:** `field.updated` events contain `diffs` array with correct previous and new values. Nested paths are handled. Backward-compatible payload shape preserved.

### Task 6: Emit Validation Events with Full Results

- [ ] Modify `src/validation/validator.ts` or the calling code in `SubmissionManager` to emit `validation.passed` events when validation succeeds
- [ ] Emit `validation.failed` events when validation fails, including full `FieldError[]` in the payload
- [ ] Include in the event payload: `{ fields: string[], errors?: FieldError[], schema: string (intake ID) }`
- [ ] Ensure validation events are appended to the EventStore (not just `submission.events` array)
- [ ] Add unit tests verifying event emission for both pass and fail scenarios

**Dependencies:** Task 1
**Effort:** S
**Validation:** Validation pass emits `validation.passed` event with field list. Validation fail emits `validation.failed` with full error details. Events appear in EventStore queries.

### Task 7: Implement JSONL Export Endpoint

- [ ] Add `GET /submissions/:submissionId/events/export` endpoint to the events router
- [ ] Stream events as JSONL (one JSON object per line, `Content-Type: application/x-ndjson`)
- [ ] Support the same query filters as the main events endpoint
- [ ] Set `Content-Disposition: attachment; filename="events-{submissionId}.jsonl"` header
- [ ] Stream results to avoid loading all events into memory for large submissions
- [ ] Add integration test verifying JSONL format and headers

**Dependencies:** Tasks 3, 4, 5
**Effort:** S
**Validation:** Response is valid JSONL. Each line parses as a valid `IntakeEvent`. Content-Type and Content-Disposition headers are correct. Filters apply to exported events.

### Task 8: Integration Tests

- [ ] Write integration tests exercising the full flow: create submission, set fields, submit, and query events
- [ ] Verify that every lifecycle transition produces the expected event type
- [ ] Verify field-level diffs appear correctly in queried events
- [ ] Verify validation events appear in the stream
- [ ] Verify approval events (from `ApprovalManager`) appear in the EventStore
- [ ] Verify export endpoint returns complete event history in JSONL format
- [ ] Verify cursor pagination across multiple pages
- [ ] Verify filtering by type, actor, and time range in integration context

**Dependencies:** All prior tasks
**Effort:** M
**Validation:** All integration tests pass. Full submission lifecycle produces a complete, queryable, exportable audit trail.

## Test Plan

| Type | Description | Target Count |
|------|------------|-------------|
| Unit | EventStore interface compliance (append, query, getById, count) | 8--10 |
| Unit | InMemoryEventStore filters (type, actor, time, compound) | 6--8 |
| Unit | Field-level diff computation (create, update, remove, nested) | 5--6 |
| Unit | Validation event emission (pass, fail, partial) | 3--4 |
| Integration | Full lifecycle event stream (create through finalize) | 3--4 |
| Integration | Events API endpoint (pagination, filters, errors) | 5--6 |
| Integration | JSONL export (format, headers, streaming) | 2--3 |
| E2E | End-to-end submission with audit trail verification | 1--2 |

## Documentation Tasks

- [ ] Add JSDoc to all public interfaces and methods in `event-store.ts`
- [ ] Document the events API endpoint in `docs/API.md` (GET /submissions/:id/events, query params, response shape)
- [ ] Document the export endpoint in `docs/API.md` (GET /submissions/:id/events/export)
- [ ] Add event type reference table to API docs
- [ ] Update `docs/INTAKE_CONTRACT_SPEC.md` section 6 if implementation deviates from spec

## Code Review Checklist

- [ ] Type safety verified -- all event payloads are typed, no `any` usage
- [ ] Patterns consistent with existing codebase -- factory functions, Zod validation, error handling
- [ ] No regressions to existing features -- `submission.events` array still populated, existing SubmissionManager behavior preserved
- [ ] Performance acceptable -- InMemoryEventStore uses indexed lookups, pagination prevents unbounded queries
- [ ] Append-only invariant enforced -- no update or delete methods exposed on EventStore
- [ ] Backward compatibility -- existing event payload fields preserved alongside new diff fields

## Deployment & Release

- **Backward compatibility:** The `submission.events` array continues to be populated as before. The new EventStore runs alongside it. Consumers relying on `submission.events` are unaffected.
- **Migration steps:** No data migration required. New EventStore starts empty. For existing submissions, the `submission.events` array remains the source of truth. Optionally, a one-time backfill script can copy existing `submission.events` into the EventStore.
- **Release steps:**
  1. Deploy new EventStore module and events route
  2. Verify events are being appended to both `submission.events` and `EventStore`
  3. Enable events API endpoint
  4. Monitor event query latency and storage growth

## Observability & Monitoring

- **Logging:** Log event append operations at DEBUG level. Log query errors at WARN level. Log export requests at INFO level.
- **Metrics to track:**
  - `events.appended` counter (by event type)
  - `events.query.latency` histogram (by filter combination)
  - `events.export.count` counter
  - `events.store.size` gauge (total events in store)
- **Health checks:** EventStore should expose a health check method verifying it can append and query. Include in the existing `/health` endpoint.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| InMemoryEventStore grows unbounded for high-volume submissions | Medium | Medium | Implement configurable max-events-per-submission limit; document memory characteristics; pluggable storage addresses this for production |
| Field-level diff computation introduces latency on setFields | Low | Low | Diffs are shallow comparisons on flat/nested objects; benchmark and optimize if needed |
| Dual-write to submission.events and EventStore creates inconsistency | Medium | High | Use a single append path that writes to both atomically; add integration test verifying consistency |
| JSONL export of large event streams causes memory pressure | Low | Medium | Stream events using Node.js readable streams instead of buffering; set configurable page size |
| Filtering by time range with clock skew between events | Low | Low | All timestamps are server-generated ISO 8601; document that filtering uses server timestamps |

## Definition of Done

- [ ] All acceptance criteria met:
  1. Every transition emits a typed event
  2. Events include type, timestamp, actor, payload, version
  3. Append-only (no modify/delete)
  4. GET endpoint returns full event stream
  5. Filterable by type, actor, time
  6. Field-level diffs for updates
  7. Validation events include full results
  8. Approval events include decision/comments
  9. Serializable for export (JSONL)
  10. Pluggable storage (EventStore interface with InMemoryEventStore)
- [ ] Tests passing with adequate coverage (>85% for new code)
- [ ] Code reviewed and approved
- [ ] Documentation updated (API docs, JSDoc)
- [ ] No regressions in existing features
