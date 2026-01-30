# Feature 019 — Pluggable Storage Backends

> **Status:** PLANNED | **Phase:** 5 | **Priority:** Could | **Complexity:** Medium | **Impact:** Medium
> **[Back to Feature Index](../FEATURES.md)**

## Summary

Introduce a unified storage backend abstraction that covers all FormBridge persistence needs: submissions, events, resume tokens, and files. Today, the codebase already contains partial storage abstractions — a `StorageBackend` interface for file uploads (`src/storage/storage-backend.ts`), an in-memory `SubmissionStore` interface in `SubmissionManager`, and an `EventEmitter` interface for events. This feature unifies these into a single `FormBridgeStorage` interface with pluggable implementations: in-memory (development), SQLite (single-server production), and S3 (file storage). The interface will be published as a stable TypeScript contract so the community can build adapters for PostgreSQL, MongoDB, Redis, and other backends.

## Dependencies

**Upstream:**
- Feature 3 (Form Renderer) — submission data flows through the storage layer
- Feature 13 (Event Store / Audit Trail) — event persistence must be covered by the unified interface

**Downstream:** None directly, but this feature enables community-built adapters for additional databases. Feature 22 (Admin Dashboard) and Feature 23 (Auth/Multi-Tenancy) will benefit from the query capabilities added here.

**Internal task ordering:** Unified interface design (Task 1) must come first. In-memory backend (Task 2) and SQLite backend (Task 3) can proceed in parallel after that. S3 file backend (Task 4) depends on interface design. Migration utility (Task 5) depends on at least two backend implementations. Integration test suite (Task 6) depends on all backends.

## Architecture & Design

### Unified Storage Interface

```typescript
// src/storage/storage-interface.ts

interface FormBridgeStorage {
  // Submission operations
  submissions: {
    get(id: string): Promise<Submission | null>;
    getByResumeToken(token: string): Promise<Submission | null>;
    save(submission: Submission): Promise<void>;
    delete(id: string): Promise<boolean>;
    list(filter: SubmissionFilter): Promise<PaginatedResult<Submission>>;
    count(filter: SubmissionFilter): Promise<number>;
  };

  // Event operations
  events: {
    append(event: IntakeEvent): Promise<void>;
    listBySubmission(submissionId: string, opts?: PaginationOpts): Promise<PaginatedResult<IntakeEvent>>;
    listByType(type: IntakeEventType, opts?: PaginationOpts): Promise<PaginatedResult<IntakeEvent>>;
  };

  // File operations (delegates to StorageBackend for actual file I/O)
  files: StorageBackend;

  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number }>;
}
```

### Backend Implementations

| Backend | Use Case | Submissions | Events | Files |
|---------|----------|------------|--------|-------|
| In-Memory | Development, testing | Map<string, Submission> | Array<IntakeEvent> | Local filesystem (`src/storage/local-storage.ts`) |
| SQLite | Single-server production | SQLite tables | SQLite tables | Local filesystem or S3 |
| S3 | File storage only | N/A (paired with another backend) | N/A | S3-compatible object storage |

### Configuration

```typescript
// Single constructor parameter
const storage = createStorage({
  type: 'sqlite',
  submissions: { path: './data/formbridge.db' },
  events: { path: './data/formbridge.db' },
  files: { type: 's3', bucket: 'formbridge-uploads', region: 'us-east-1' },
});
```

### Existing Code to Refactor

- `src/core/submission-manager.ts` — currently accepts `SubmissionStore` and `EventEmitter` as separate constructor parameters; refactor to accept `FormBridgeStorage`
- `src/core/event-store.ts` (if created by Feature 13) — consolidate into the unified storage interface
- `src/storage/storage-backend.ts` — existing file upload interface becomes the `files` sub-interface
- `src/storage/local-storage.ts` — becomes the file backend for the in-memory and SQLite storage implementations
- `src/storage/s3-storage.ts` — becomes the S3 file backend implementation

### Migration Path

Existing in-memory stores will be wrapped to implement the new interface. No breaking changes for users who construct `SubmissionManager` directly; the old constructor signature will be supported via a compatibility adapter during the deprecation period.

## Implementation Tasks

### Task 1: Unified Storage Interface Design
- [ ] Define `FormBridgeStorage` interface in `src/storage/storage-interface.ts`
- [ ] Define `SubmissionFilter` type (by intakeId, state, date range, actor)
- [ ] Define `PaginatedResult<T>` and `PaginationOpts` types
- [ ] Define `StorageConfig` discriminated union for all backend types
- [ ] Define `createStorage(config: StorageConfig): FormBridgeStorage` factory function signature
- [ ] Export all types from `src/storage/index.ts` barrel

**Dependencies:** None
**Effort:** M
**Validation:** Types compile; interface covers all operations used by `SubmissionManager`, `ApprovalManager`, and event emission

### Task 2: In-Memory Backend
- [ ] Implement `MemoryStorage` class implementing `FormBridgeStorage`
- [ ] Store submissions in `Map<string, Submission>` with secondary index on resumeToken
- [ ] Store events in `Array<IntakeEvent>` with index by submissionId
- [ ] Implement `SubmissionFilter` with in-memory filtering and pagination
- [ ] Wire file operations to existing `LocalStorageBackend`
- [ ] Implement `healthCheck()` returning immediate OK
- [ ] Ensure thread-safety for concurrent operations (Promise-based locking)

**Dependencies:** Task 1
**Effort:** M
**Validation:** All existing SubmissionManager tests pass with MemoryStorage; filter and pagination work correctly

### Task 3: SQLite Backend
- [ ] Implement `SqliteStorage` class implementing `FormBridgeStorage`
- [ ] Design schema: `submissions` table (id, intakeId, state, resumeToken, fields JSON, fieldAttribution JSON, metadata JSON, createdAt, updatedAt, expiresAt)
- [ ] Design schema: `events` table (eventId, type, submissionId, ts, actor JSON, state, payload JSON)
- [ ] Use `better-sqlite3` for synchronous SQLite access (fast, no native build issues)
- [ ] Implement `SubmissionFilter` with SQL WHERE clauses and indexed columns
- [ ] Implement pagination with LIMIT/OFFSET
- [ ] Add indexes on: submissions(resumeToken), submissions(intakeId, state), events(submissionId), events(type)
- [ ] Wire file operations to `LocalStorageBackend` or `S3StorageBackend` based on config
- [ ] Implement `healthCheck()` with a simple SELECT query and latency measurement

**Dependencies:** Task 1
**Effort:** L
**Validation:** All existing SubmissionManager tests pass with SqliteStorage; data persists across process restarts; queries use indexes

### Task 4: S3 File Backend Integration
- [ ] Verify existing `S3StorageBackend` in `src/storage/s3-storage.ts` implements the `StorageBackend` interface correctly
- [ ] Add configuration option to use S3 for files with SQLite or in-memory for submissions/events
- [ ] Implement `createStorage` factory logic to compose file backend with submission/event backend
- [ ] Add connection validation on `initialize()` (verify bucket exists and is accessible)
- [ ] Document S3 IAM policy requirements

**Dependencies:** Task 1
**Effort:** S
**Validation:** S3 file operations work through the unified interface; initialization fails gracefully with clear error on misconfigured credentials

### Task 5: Migration Utility
- [ ] Create `src/storage/migration.ts` with `migrateStorage(source, target, opts)` function
- [ ] Implement submission migration with batched reads and writes
- [ ] Implement event migration preserving ordering and eventIds
- [ ] Implement file migration (copy between storage backends)
- [ ] Add progress callback for long migrations
- [ ] Add dry-run mode that reports counts without writing
- [ ] Handle interrupted migrations (idempotent writes, skip existing records)

**Dependencies:** Tasks 2, 3
**Effort:** M
**Validation:** Migration from in-memory to SQLite preserves all data; migration is idempotent; dry-run reports correct counts

### Task 6: Integration Test Suite
- [ ] Create shared test suite in `src/storage/__tests__/storage-compliance.test.ts`
- [ ] Test CRUD operations for submissions (create, read, update, delete)
- [ ] Test resume token lookup
- [ ] Test event append and query (by submission, by type)
- [ ] Test `SubmissionFilter` with various filter combinations
- [ ] Test pagination (first page, subsequent pages, empty results)
- [ ] Test `healthCheck()` returns latency
- [ ] Test `initialize()` and `close()` lifecycle
- [ ] Run the same test suite against every backend implementation
- [ ] Add concurrent access tests (parallel writes to same submission)

**Dependencies:** Tasks 2, 3, 4
**Effort:** L
**Validation:** Same test suite passes for all backend implementations; no test is backend-specific

### Task 7: Interface Documentation
- [ ] Document the `FormBridgeStorage` interface with JSDoc and usage examples
- [ ] Write a "Building a Custom Storage Backend" guide for community adapter authors
- [ ] Document the compliance test suite and how to run it against custom backends
- [ ] Document configuration options for each built-in backend
- [ ] Add storage backend selection guidance (when to use which backend)

**Dependencies:** Tasks 1-6
**Effort:** M
**Validation:** Documentation is complete; a developer can follow the guide to implement a custom backend

### Task 8: Performance Benchmarks
- [ ] Create benchmark script in `src/storage/__benchmarks__/storage-bench.ts`
- [ ] Benchmark submission create/read/update at 100, 1000, 10000 records
- [ ] Benchmark event append and query at high volume (10000+ events)
- [ ] Benchmark filter queries with various selectivity
- [ ] Compare in-memory vs SQLite performance and document results
- [ ] Establish baseline performance numbers for each operation

**Dependencies:** Tasks 2, 3
**Effort:** M
**Validation:** Benchmarks run successfully; results documented; no operation exceeds acceptable latency thresholds

### Task 9: Configuration API and SubmissionManager Refactor
- [ ] Refactor `SubmissionManager` constructor to accept `FormBridgeStorage` as primary parameter
- [ ] Add backward-compatible constructor overload accepting old `SubmissionStore` + `EventEmitter` parameters
- [ ] Refactor `ApprovalManager` to use `FormBridgeStorage` for event emission
- [ ] Update `src/index.ts` exports to include storage factory and types
- [ ] Update all existing tests to use the new constructor
- [ ] Deprecate the old constructor signature with a console warning

**Dependencies:** Tasks 1, 2
**Effort:** M
**Validation:** All existing tests pass without modification; deprecation warning appears when using old constructor

## Test Plan

| Type | Description | Target Count |
|------|-------------|--------------|
| Unit | MemoryStorage operations | 20 |
| Unit | SqliteStorage operations | 20 |
| Unit | Migration utility (mock backends) | 10 |
| Integration | Shared compliance suite (per backend) | 15 x 2 backends |
| Integration | SubmissionManager with new storage | 15 |
| Integration | ApprovalManager with new storage | 8 |
| Performance | Benchmark suite (per backend) | 6 x 2 backends |
| Concurrent | Parallel write safety | 5 |

## Documentation Tasks

- [ ] Write API reference for `FormBridgeStorage` interface
- [ ] Write "Building a Custom Storage Backend" community guide
- [ ] Write storage configuration reference with examples
- [ ] Write migration guide for users upgrading from direct SubmissionStore usage
- [ ] Document performance characteristics and selection guidance

## Code Review Checklist

- [ ] Type safety: all operations are fully typed, no `any` leaks
- [ ] Patterns consistent: all backends implement the exact same interface
- [ ] No regressions: existing SubmissionManager and ApprovalManager tests pass unchanged
- [ ] Performance acceptable: SQLite operations complete within 10ms for single-record operations
- [ ] Error handling: all backends surface clear errors for connection/permission issues
- [ ] Resource cleanup: `close()` releases all connections and file handles

## Deployment & Release

- **Breaking changes:** None initially; old constructor signature deprecated but supported
- **Migration path:** Users upgrade to `FormBridgeStorage` at their own pace; `createStorage({ type: 'memory' })` replicates current behavior exactly
- **New dependencies:** `better-sqlite3` (SQLite backend only, optional peer dependency)
- **Feature flags:** None needed; backend selection is explicit via configuration

## Observability & Monitoring

- `healthCheck()` on every backend reports latency and availability
- SQLite backend logs slow queries (> 50ms) at warning level
- Migration utility logs progress (records migrated, elapsed time, errors)
- Storage initialization logs backend type and configuration (redacting credentials)
- Event append failures are logged and surfaced to the caller

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SQLite performance degrades at scale | Medium | Medium | Document capacity limits; benchmark at target volumes; index critical columns |
| `better-sqlite3` native module build issues | Medium | Low | Make SQLite backend an optional peer dependency; document build requirements |
| Migration data loss | Low | High | Dry-run mode, idempotent writes, pre-migration backup guidance |
| Breaking change to existing SubmissionStore consumers | Low | Medium | Backward-compatible constructor; deprecation period before removal |
| Interface too restrictive for community backends | Medium | Medium | Design interface from real-world query patterns; accept feedback before 1.0 |

## Definition of Done

- [ ] `FormBridgeStorage` TypeScript interface defined and exported
- [ ] In-memory backend implemented and tested
- [ ] SQLite backend implemented and tested
- [ ] S3 file backend integrated through unified interface
- [ ] Single constructor parameter configures the entire storage layer
- [ ] Same integration test suite passes against all backends
- [ ] Interface exported for community adapter development
- [ ] Migration utility implemented with dry-run and progress reporting
- [ ] Performance benchmarks documented
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] No regressions
