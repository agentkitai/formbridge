# Feature 003 — Intake Contract Runtime & Validation Engine

> **Status:** IMPLEMENTED | **Phase:** 1 | **Priority:** must | **Complexity:** high | **Impact:** high
> **[Back to Feature Index](../FEATURES.md)**

## Implementation Summary

> Implemented as the core runtime for FormBridge. The TypeScript implementation in `src/` provides the submission state machine (via `SubmissionManager`), JSON Schema validation engine (via `Validator` using Ajv), structured error reporting with `FieldError[]` and `NextAction[]` guidance, and typed event emission. A parallel Python implementation exists in `formbridge/` but the TypeScript side is the active runtime.

**Key files:**
- `src/types/intake-contract.ts` -- Core type definitions: `Actor`, `SubmissionState`, `IntakeEvent`, `IntakeError`, `FieldError`, `NextAction`, `IntakeDefinition`, request/response types
- `src/types.ts` -- Re-exports and additional types: `Submission`, `SubmissionEntry`, `JSONSchema`, `FieldErrorCode`, `FieldAttribution`
- `src/core/submission-manager.ts` -- `SubmissionManager` class: submission lifecycle (create, setFields, submit), field attribution, event emission, resume token rotation, handoff URL generation
- `src/core/validator.ts` -- `Validator` class: Ajv-based JSON Schema validation, `FieldError[]` conversion, `NextAction[]` generation, upload validation
- `src/core/intake-registry.ts` -- `IntakeRegistry` class: intake definition storage, validation, retrieval

**Known issues:**
- **CRITICAL: Dual Python+TypeScript implementations.** `formbridge/` (Python) and `src/` (TypeScript) are parallel implementations of the same spec, not complementary pieces. The Python side has proper state transition validation maps; the TypeScript side does not.
- **CRITICAL: Validator not wired into SubmissionManager.** The `Validator` class in `src/core/validator.ts` does full Ajv-based schema validation. However, `SubmissionManager.setFields()` does not invoke the Validator for data validation -- it only updates fields and tracks attribution. Validation is available as a separate component but not integrated into the submission lifecycle.
- **IMPORTANT: No state transition validation in TypeScript SubmissionManager.** The `transitionState()` logic sets the new state directly without checking whether the transition is valid (e.g., `draft -> submitted` might bypass `in_progress`). The Python implementation has `VALID_TRANSITIONS` enforcement, but this was not ported.

## Summary

Feature 003 implements the core runtime engine for the Intake Contract specification. It provides: (1) a submission state machine that manages the lifecycle from `draft` through `in_progress`, `submitted`, `needs_review`, `approved`/`rejected`, to `finalized`; (2) a validation engine backed by Ajv that validates submission data against JSON Schema with structured error reporting; (3) typed error conversion that maps Ajv's raw errors into `FieldError[]` with codes like `required`, `invalid_type`, `invalid_format`, `too_short`, `too_long`, `invalid_value`; (4) `NextAction[]` guidance that tells agents what to do next (collect a field, fix a format, request an upload); and (5) an event system that emits typed `IntakeEvent` records for audit trails. The runtime supports field-level actor attribution for mixed-mode agent-human collaboration.

## Dependencies

**Upstream:** Feature 001 (scaffolding), Feature 002 (schema normalization -- provides IntakeSchema types)
**Downstream:** Features 004, 006, 007, 008, 009, 012, 013, 014, 018, 019, 020, 021, 022

## Architecture & Design

### State Machine
- **States defined in `SubmissionState` type:** `draft`, `in_progress`, `awaiting_input`, `awaiting_upload`, `submitted`, `needs_review`, `approved`, `rejected`, `finalized`, `cancelled`, `expired`, plus upload protocol states (`created`, `validating`, `invalid`, `valid`, `uploading`, `submitting`, `completed`, `failed`, `pending_approval`).
- **Runtime constants:** `SubmissionState` object provides enum-like access (e.g., `SubmissionState.DRAFT`).
- **State transitions in SubmissionManager:** `createSubmission()` initializes to `draft`; `setFields()` transitions `draft -> in_progress`; `submit()` transitions to `submitted` or `needs_review` (if approval gates configured); upload operations manage `awaiting_upload` state.
- **Known gap:** No explicit valid-transition enforcement in TypeScript. States can be set directly.

### Validation Engine
- **Ajv-based:** `Validator` class wraps Ajv with `allErrors: true`, `verbose: true`, format validation enabled via `ajv-formats`.
- **Schema compilation cache:** Compiled schemas stored in `Map<string, ValidateFunction>` keyed by `$id` or JSON stringification.
- **Full validation:** `validate()` runs complete schema validation and converts all Ajv errors.
- **Required-only validation:** `validateRequired()` checks only required fields (for partial submission readiness).
- **Upload validation:** `validateUploads()` checks file field constraints (required uploads, pending status, size/type constraints).
- **Error conversion:** `convertAjvErrors()` maps Ajv keywords (`required`, `type`, `format`, `pattern`, `minLength`, `maxLength`, `minimum`, `maximum`, `enum`, `const`) to `FieldErrorCode` values.
- **NextAction generation:** `generateNextActions()` produces actionable guidance per field error: `collect_field` for missing/invalid values, `request_upload` for file fields, with contextual hints.

### Event System
- **IntakeEvent type:** `eventId`, `type` (18 event types), `submissionId`, `ts`, `actor`, `state`, `payload`.
- **EventEmitter interface:** Simple `emit(event)` method. SubmissionManager takes an EventEmitter in constructor.
- **Events emitted:** `submission.created`, `field.updated`, `submission.submitted`, `review.requested`, `upload.requested`, `upload.completed`, `upload.failed`, `handoff.link_issued`, `handoff.resumed`.
- **Audit trail:** Events stored on `submission.events` array.

### Actor Attribution
- **FieldAttribution:** `Record<fieldPath, Actor>` tracks which actor filled each field.
- **Mixed-mode:** Agents and humans can both fill fields on the same submission, with attribution preserved per field.
- **Submission metadata:** `createdBy` and `updatedBy` Actor references on each submission.

### Error Types
- **IntakeError envelope:** `{ ok: false, submissionId, state, resumeToken, error: { type, message, fields?, nextActions?, retryable, retryAfterMs? } }`
- **IntakeErrorType:** `missing`, `invalid`, `conflict`, `needs_approval`, `upload_pending`, `delivery_failed`, `expired`, `cancelled`
- **FieldError (contract level):** `{ field, message, type, constraint?, value? }`
- **FieldError (validator level):** `{ path, code, message, expected?, received? }` with `FieldErrorCode` enum

## Implementation Tasks

### Task 1: Core Type Definitions
- [x] Define `Actor` interface with `kind`, `id`, `name`, `metadata`
- [x] Define `SubmissionState` type union (18+ states)
- [x] Define `SubmissionState` runtime constant object
- [x] Define `IntakeErrorType` and `IntakeError` envelope
- [x] Define `FieldError` and `NextAction` types
- [x] Define `IntakeEvent` and `IntakeEventType` (18 event types)
- [x] Define `IntakeDefinition` with schema, approvalGates, destination, uiHints
- [x] Define request/response types: `CreateSubmissionRequest`, `SetFieldsRequest`, `SubmitRequest`, `ReviewRequest`, `CancelRequest`
- [x] Implement `isIntakeError()` and `isSubmissionSuccess()` type guards
**Validation:** All types compile; type guards narrow correctly.

### Task 2: Submission Model
- [x] Define `Submission` interface with id, intakeId, state, resumeToken, timestamps, fields, fieldAttribution, createdBy, updatedBy, events, ttlMs
- [x] Define `SubmissionEntry` wrapper
- [x] Define `FieldAttribution` as `Record<string, Actor>`
- [x] Define `FieldErrorCode` type for validator-level errors
**Validation:** Submission type used throughout SubmissionManager.

### Task 3: SubmissionManager (State Machine)
- [x] Implement `SubmissionManager` class with store, eventEmitter, intakeRegistry, baseUrl, storageBackend dependencies
- [x] Implement `createSubmission()` -- generates IDs, sets initial state to `draft`, records actor attribution for initial fields, emits `submission.created` event
- [x] Implement `setFields()` -- validates state, verifies resume token, checks expiration, updates fields with attribution, transitions `draft -> in_progress`, emits `field.updated` events
- [x] Implement `submit()` -- checks approval gates via IntakeRegistry, transitions to `submitted` or `needs_review`, emits `submission.submitted` or `review.requested` events
- [x] Implement `getSubmission()` and `getSubmissionByResumeToken()` for retrieval
- [x] Implement `generateHandoffUrl()` for agent-to-human handoff
- [x] Implement `emitHandoffResumed()` for human-resumed-form notification
- [x] Implement `requestUpload()` and `confirmUpload()` for file upload protocol
- [x] Define `SubmissionStore` interface for pluggable storage
- [x] Define `EventEmitter` interface for event dispatch
- [x] Define custom error classes: `SubmissionNotFoundError`, `SubmissionExpiredError`, `InvalidResumeTokenError`
**Validation:** Submission lifecycle tests pass; events emitted correctly.

### Task 4: Validation Engine
- [x] Implement `Validator` class wrapping Ajv with format support
- [x] Implement `validate()` for full schema validation
- [x] Implement `validateRequired()` for partial/required-only validation
- [x] Implement `validateUploads()` for file field validation
- [x] Implement Ajv error-to-FieldError conversion covering all keyword mappings
- [x] Implement `NextAction` generation based on error codes and field schemas
- [x] Implement schema compilation cache for performance
- [x] Support file field detection via `format: 'binary'`
- [x] Support file constraint validation (maxSize, allowedTypes)
**Validation:** Validator tests pass for all error types and keyword mappings.

### Task 5: IntakeRegistry
- [x] Implement `IntakeRegistry` class with in-memory Map storage
- [x] Implement `registerIntake()` with optional validation and duplicate checking
- [x] Implement `getIntake()`, `getSchema()`, `hasIntake()`, `listIntakeIds()`, `listIntakes()`
- [x] Implement `unregisterIntake()` and `clear()`
- [x] Implement intake validation: required fields, schema structure, destination validation, approval gates validation, UI hints validation
- [x] Define error classes: `IntakeNotFoundError`, `IntakeDuplicateError`, `IntakeValidationError`
**Validation:** Registry tests pass for CRUD operations and validation.

### Task 6: Event Emission
- [x] Define `EventEmitter` interface with `emit()` method
- [x] SubmissionManager emits events for all lifecycle operations
- [x] Events include actor attribution, timestamp, state, and contextual payload
- [x] Events stored on `submission.events` array for audit trail
**Validation:** Events emitted for create, setFields, submit, upload, handoff operations.

## Test Plan

| Type | Description | Count |
|------|------------|-------|
| Unit | Validator tests -- Ajv error conversion, all keyword mappings | ~20+ |
| Unit | IntakeRegistry tests -- CRUD, validation, error handling | ~15+ |
| Integration | SubmissionManager lifecycle -- create, update, submit, handoff | ~20+ |
| Integration | API integration tests (`tests/api.test.ts`) cover full submission flow | ~25+ |

## Documentation Tasks
- [x] Comprehensive JSDoc on all types with spec section references
- [x] JSDoc on SubmissionManager methods with parameter/return documentation
- [x] JSDoc on Validator methods with usage examples
- [x] Module-level comments linking to Intake Contract Spec sections

## Code Review Checklist
- [x] Type safety verified (strict TypeScript, discriminated unions, type guards)
- [x] Patterns consistent (dependency injection for store, emitter, registry)
- [ ] No regressions -- **NOTE:** Validator not wired into SubmissionManager (known gap)
- [x] Performance acceptable (Ajv schema cache, in-memory store)

## Deployment & Release
- **Backward compatibility:** N/A (new implementation)
- **Migration:** None required
- **Dual implementation note:** Python implementation in `formbridge/` exists but TypeScript in `src/` is the active runtime. Python code should be considered legacy/reference.

## Observability & Monitoring
- **Logging:** Errors thrown as typed exceptions with descriptive messages
- **Audit trail:** `IntakeEvent` stream records all state changes, field updates, and actor actions
- **Metrics:** None built-in (suitable for middleware integration)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Validator not integrated into submission flow | Confirmed | High | Validator class exists and works; needs to be injected into SubmissionManager for setFields/submit validation |
| No state transition enforcement in TypeScript | Confirmed | Medium | Port `VALID_TRANSITIONS` map from Python state machine to TypeScript SubmissionManager |
| Dual Python+TypeScript causes confusion | High | Medium | Recommend deprecating Python implementation; TypeScript is the target runtime |
| Event ordering not guaranteed in async flows | Low | Medium | Events are emitted sequentially within each operation; no concurrent emit |

## Definition of Done
- [x] All acceptance criteria met
- [x] Tests passing (80+ tests across validator, registry, submission lifecycle, API integration)
- [x] Code reviewed (critical issues documented as known issues)
- [x] Documentation updated (JSDoc on all public APIs)
- [x] State machine manages submission lifecycle with typed states
- [x] Validation engine produces structured `FieldError[]` with error codes
- [x] NextAction generation provides actionable guidance to agents
- [x] Event system emits typed events with actor attribution
- [x] Resume token rotation works on state changes
- [x] Error envelope follows IntakeError schema from spec
