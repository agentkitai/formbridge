# FormBridge Intake Contract Specification

**Version:** 0.1.0-draft
**Status:** Draft
**Authors:** Amit

---

## Abstract

The FormBridge Intake Contract is a protocol for structured data collection that works equally well for AI agents and humans. It defines a submission state machine, structured error schema, resumable sessions, idempotent submission semantics, file upload negotiation, human approval gates, and an audit event stream.

Any system that implements this contract can reliably collect structured data from agents, humans, or a mix of both — with full auditability.

---

## Table of Contents

- [Abstract](#abstract)
- [1. Design Principles](#1-design-principles)
- [2. Submission Lifecycle](#2-submission-lifecycle)
  - [2.1 States](#21-states)
  - [2.2 Transitions](#22-transitions)
  - [2.3 Transition Rules](#23-transition-rules)
  - [2.4 Submission Record Schema](#24-submission-record-schema)
- [3. Error Schema](#3-error-schema)
  - [3.1 Error Types](#31-error-types)
- [4. Operations](#4-operations)
  - [4.1 `createSubmission`](#41-createsubmission)
  - [4.2 `setFields`](#42-setfields)
  - [4.3 `validate`](#43-validate)
  - [4.4 `requestUpload`](#44-requestupload)
  - [4.5 `confirmUpload`](#45-confirmupload)
  - [4.6 `submit`](#46-submit)
  - [4.7 `review`](#47-review)
  - [4.8 `cancel`](#48-cancel)
  - [4.9 `getSubmission`](#49-getsubmission)
  - [4.10 `getEvents`](#410-getevents)
- [5. Actors](#5-actors)
- [6. Event Stream](#6-event-stream)
  - [6.1 Event Types](#61-event-types)
  - [6.2 Event Delivery](#62-event-delivery)
  - [6.3 Event Serialization](#63-event-serialization)
- [7. Resume Protocol](#7-resume-protocol)
  - [7.1 Resume Tokens](#71-resume-tokens)
  - [7.2 Handoff Flow](#72-handoff-flow)
- [8. Idempotency](#8-idempotency)
  - [8.1 Creation Idempotency](#81-creation-idempotency)
  - [8.2 Submission Idempotency](#82-submission-idempotency)
  - [8.3 Storage Backend Configuration](#83-storage-backend-configuration)
  - [8.4 TTL and Expiration](#84-ttl-and-expiration)
  - [8.5 Concurrent Request Handling](#85-concurrent-request-handling)
  - [8.6 HTTP Header Examples](#86-http-header-examples)
- [9. Upload Negotiation](#9-upload-negotiation)
- [10. Approval Gates](#10-approval-gates)
  - [10.1 Gate Definition](#101-gate-definition)
  - [10.2 Review Flow](#102-review-flow)
- [11. Intake Definition](#11-intake-definition)
- [12. Transport Bindings](#12-transport-bindings)
  - [12.1 HTTP/JSON Binding](#121-httpjson-binding)
  - [12.2 MCP Tool Binding](#122-mcp-tool-binding)
- [Appendix A: Glossary](#appendix-a-glossary)
- [Appendix B: Comparison with MCP Elicitation](#appendix-b-comparison-with-mcp-elicitation)

---

## 1. Design Principles

1. **Schema-first.** The intake definition is a JSON Schema. Everything — validation, UI rendering, MCP tool generation, documentation — derives from it.

2. **Agent-native errors.** Validation failures return structured, actionable objects that an LLM can loop over — not HTML error pages or unstructured strings.

3. **Resumable by default.** Every submission has a resume token. Partial work is never lost. An agent can start, hand off to a human, and resume later.

4. **Idempotent submission.** Retries with the same idempotency key are safe. Agents can retry without fear of duplicates.

5. **Mixed-mode as the default.** Agent fills 80%, human finishes 20%, reviewer approves. This isn't an edge case — it's the primary flow.

6. **Auditable.** Every state transition emits a typed event with actor, timestamp, and payload. The event stream is the source of truth.

7. **Transport-agnostic.** The contract defines semantics, not wire format. Implementations may use HTTP/JSON, MCP tools, gRPC, or any other transport.

---

## 2. Submission Lifecycle

### 2.1 States

| State | Description |
|---|---|
| `draft` | Created, no meaningful data yet |
| `in_progress` | At least one field has been set |
| `awaiting_input` | Validation found missing/invalid fields; waiting for actor to provide them |
| `awaiting_upload` | One or more file fields need upload completion |
| `submitted` | All fields valid; submission locked for review or delivery |
| `needs_review` | Routed to a human approval gate |
| `approved` | Human reviewer approved |
| `rejected` | Human reviewer rejected (with reasons) |
| `finalized` | Delivered to destination; immutable |
| `cancelled` | Explicitly cancelled by an actor |
| `expired` | Timed out per TTL policy |

### 2.2 Transitions

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
  ┌──────┐    ┌───────────┐    ┌───────────────┐    ┌───────────┐
  │ draft │───▶│in_progress│───▶│awaiting_input │───▶│in_progress│
  └──────┘    └───────────┘    └───────────────┘    └───────────┘
                    │                                      │
                    │          ┌────────────────┐          │
                    ├─────────▶│awaiting_upload  │─────────▶┤
                    │          └────────────────┘          │
                    │                                      │
                    ▼                                      ▼
              ┌───────────┐    ┌──────────────┐    ┌──────────┐
              │ submitted │───▶│ needs_review  │───▶│ approved │
              └───────────┘    └──────────────┘    └──────────┘
                    │                │                    │
                    │                ▼                    ▼
                    │          ┌──────────┐       ┌───────────┐
                    └─────────▶│ rejected │       │ finalized │
                               └──────────┘       └───────────┘

  Any non-terminal state ───▶ cancelled
  Any non-terminal state ───▶ expired (by TTL)
```

### 2.3 Transition Rules

- `draft → in_progress`: Any field is set via `setFields`.
- `in_progress → awaiting_input`: `validate` returns missing or invalid fields.
- `in_progress → awaiting_upload`: `validate` returns pending file uploads.
- `awaiting_input → in_progress`: Missing fields are provided.
- `awaiting_upload → in_progress`: All pending uploads complete.
- `in_progress → submitted`: `submit` is called and all fields pass validation.
- `submitted → needs_review`: Intake definition includes an approval gate policy.
- `submitted → finalized`: No approval gate; delivery succeeds.
- `needs_review → approved`: Reviewer approves.
- `needs_review → rejected`: Reviewer rejects (must include `reasons`).
- `approved → finalized`: Delivery succeeds.
- Any non-terminal → `cancelled`: Explicit cancel by authorized actor.
- Any non-terminal → `expired`: TTL elapsed without completion.

### 2.4 Submission Record Schema

Every submission is represented by a record with the following structure:

```typescript
interface SubmissionRecord {
  // Identity
  submissionId: string;                // Unique identifier for this submission
  intakeId: string;                    // Which intake definition this uses

  // State
  state: SubmissionState;              // Current lifecycle state
  resumeToken: string;                 // Optimistic concurrency token

  // Data
  fields: Record<string, unknown>;     // Collected field values
  schema: JSONSchema;                  // The intake schema

  // Idempotency Metadata
  idempotencyKey?: string;             // Deduplication key (if provided at creation)
  originalTimestamp: string;           // ISO 8601 timestamp of first creation
  replayCount: number;                 // Number of times this submission was returned via idempotent replay (0 = original)

  // Lifecycle Metadata
  createdAt: string;                   // ISO 8601 timestamp
  updatedAt: string;                   // ISO 8601 timestamp of last state change
  expiresAt: string;                   // ISO 8601 timestamp when TTL expires
  actor: Actor;                        // Most recent actor

  // Validation State
  missingFields?: string[];            // Fields still needed for completion
  validationErrors?: FieldError[];     // Current validation issues

  // Upload State
  pendingUploads?: PendingUpload[];    // Files awaiting upload completion

  // Review State (if applicable)
  reviewState?: {
    gate: string;                      // Which approval gate
    requestedAt: string;               // When review was requested
    reviewers: string[];               // Authorized reviewer IDs
    decision?: "approved" | "rejected";
    decidedBy?: Actor;
    decidedAt?: string;
    reasons?: string[];                // If rejected
  };

  // Delivery State (if finalized)
  deliveryState?: {
    attemptCount: number;
    lastAttemptAt?: string;
    lastError?: string;
    deliveredAt?: string;
  };
}

interface PendingUpload {
  field: string;                       // Field path
  uploadId: string;                    // Upload session ID
  filename: string;
  sizeBytes: number;
  mimeType: string;
  requestedAt: string;
}
```

#### Idempotency Metadata Fields

**`idempotencyKey`** (optional)
- Present only if the submission was created with an idempotency key (§8.1)
- Used to detect duplicate creation requests
- Retained until submission reaches terminal state + grace period

**`originalTimestamp`** (required)
- ISO 8601 timestamp of the first creation of this submission
- Never changes, even if the submission is accessed via idempotent replay
- Used for audit trails and TTL calculations

**`replayCount`** (required, default: 0)
- Number of times this submission has been returned via idempotent cache replay
- `0` = Original creation response
- `1+` = Returned from cache due to duplicate idempotency key
- Incremented each time a cached creation response is replayed
- Helps distinguish new operations from retries in observability and debugging

**Example: Original Creation**
```json
{
  "submissionId": "sub_abc123",
  "intakeId": "vendor_onboarding",
  "state": "in_progress",
  "idempotencyKey": "idem_xyz789",
  "originalTimestamp": "2026-01-29T10:00:00Z",
  "replayCount": 0,
  "createdAt": "2026-01-29T10:00:00Z",
  "updatedAt": "2026-01-29T10:00:00Z"
}
```

**Example: Replayed Response**
```json
{
  "submissionId": "sub_abc123",
  "intakeId": "vendor_onboarding",
  "state": "in_progress",
  "idempotencyKey": "idem_xyz789",
  "originalTimestamp": "2026-01-29T10:00:00Z",
  "replayCount": 2,
  "createdAt": "2026-01-29T10:00:00Z",
  "updatedAt": "2026-01-29T10:00:00Z"
}
```

Note: `replayCount` increments with each cache hit, while `originalTimestamp` remains constant.

---

## 3. Error Schema

All validation and submission errors follow a single envelope:

```typescript
interface IntakeError {
  ok: false;
  submissionId: string;
  state: SubmissionState;
  resumeToken: string;
  error: {
    type: "missing" | "invalid" | "conflict" | "needs_approval" | "upload_pending" | "delivery_failed" | "expired" | "cancelled";
    message?: string;             // Human-readable summary
    fields?: FieldError[];        // Per-field details
    nextActions?: NextAction[];   // What the caller should do next
    retryable: boolean;           // Can the caller retry this exact call?
    retryAfterMs?: number;        // Suggested retry delay
  };
}

interface FieldError {
  path: string;                   // Dot-notation field path, e.g. "docs.w9"
  code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
  message: string;                // Human-readable
  expected?: unknown;             // What was expected (type, format, enum values)
  received?: unknown;             // What was received
}

interface NextAction {
  action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
  field?: string;                 // Which field this action relates to
  hint?: string;                  // LLM-friendly guidance
  // Upload-specific
  accept?: string[];              // MIME types
  maxBytes?: number;
}
```

### 3.1 Error Types

| Type | Meaning | Retryable | Typical Next Action |
|---|---|---|---|
| `missing` | Required fields not provided | Yes | `collect_field` |
| `invalid` | Fields provided but fail validation | Yes | `collect_field` (with corrected value) |
| `conflict` | Idempotency key reused with different payload; same key with identical payload returns cached result | No | Use new idempotency key or fetch existing |
| `needs_approval` | Submission requires human review | No (wait) | `wait_for_review` |
| `upload_pending` | Files declared but not yet uploaded | Yes | `request_upload` |
| `delivery_failed` | Finalization webhook/API call failed | Yes | `retry_delivery` |
| `expired` | Submission TTL elapsed | No | Create new submission |
| `cancelled` | Submission was explicitly cancelled | No | Create new submission |

---

## 4. Operations

### 4.1 `createSubmission`

Creates a new submission for a given intake definition.

**Input:**
```typescript
{
  intakeId: string;               // Which intake definition to use
  idempotencyKey?: string;        // Prevents duplicate creation
  actor: Actor;                   // Who is creating this
  initialFields?: Record<string, unknown>;  // Pre-fill known fields
  ttlMs?: number;                 // Override default TTL
}
```

**Output:**
```typescript
{
  ok: true;
  submissionId: string;
  state: "draft" | "in_progress";  // "in_progress" if initialFields provided
  resumeToken: string;
  schema: JSONSchema;              // The full intake schema
  missingFields?: string[];        // Fields still needed (if initialFields partial)
}
```

### 4.2 `setFields`

Sets or updates fields on an existing submission.

**Input:**
```typescript
{
  submissionId: string;
  resumeToken: string;
  actor: Actor;
  fields: Record<string, unknown>;
}
```

**Output:** Success with updated state + any remaining validation issues, or `IntakeError`.

### 4.3 `validate`

Validates current submission state without submitting.

**Input:**
```typescript
{
  submissionId: string;
  resumeToken: string;
}
```

**Output:** `{ ok: true, state, ready: boolean }` or `IntakeError` with field-level details.

### 4.4 `requestUpload`

Negotiates a file upload for a given field.

**Input:**
```typescript
{
  submissionId: string;
  resumeToken: string;
  field: string;                   // Dot-path to the file field
  filename: string;
  mimeType: string;
  sizeBytes: number;
  actor: Actor;
}
```

**Output:**
```typescript
{
  ok: true;
  uploadId: string;
  method: "PUT" | "POST";
  url: string;                     // Signed upload URL
  headers?: Record<string, string>;
  expiresInMs: number;
  constraints: {
    accept: string[];              // Allowed MIME types
    maxBytes: number;
  };
}
```

### 4.5 `confirmUpload`

Confirms a completed upload (called after the client uploads to the signed URL).

**Input:**
```typescript
{
  submissionId: string;
  resumeToken: string;
  uploadId: string;
  actor: Actor;
}
```

**Output:** Success with updated state, or error if upload verification fails.

### 4.6 `submit`

Locks the submission and requests finalization (or routes to review).

**Input:**
```typescript
{
  submissionId: string;
  resumeToken: string;
  idempotencyKey: string;          // Required — prevents duplicate submissions
  actor: Actor;
}
```

**Output:** Success with new state (`submitted`, `needs_review`, or `finalized`), or `IntakeError`.

### 4.7 `review`

Approves or rejects a submission in `needs_review` state.

**Input:**
```typescript
{
  submissionId: string;
  decision: "approved" | "rejected";
  reasons?: string[];              // Required if rejected
  actor: Actor;                    // Must be authorized reviewer
}
```

**Output:** Success with new state, or error.

### 4.8 `cancel`

Cancels a submission. Irreversible.

**Input:**
```typescript
{
  submissionId: string;
  reason?: string;
  actor: Actor;
}
```

### 4.9 `getSubmission`

Retrieves current submission state, fields, and metadata.

### 4.10 `getEvents`

Retrieves the event stream for a submission (see §6).

---

## 5. Actors

Every operation requires an actor identity:

```typescript
interface Actor {
  kind: "agent" | "human" | "system";
  id: string;                      // Unique identifier
  name?: string;                   // Display name
  metadata?: Record<string, unknown>;
}
```

The actor is recorded on every event for audit purposes. Implementations SHOULD authenticate actors and enforce authorization (e.g., only designated reviewers can call `review`).

---

## 6. Event Stream

Every state transition and significant action emits a typed event:

```typescript
interface IntakeEvent {
  eventId: string;                 // Globally unique
  type: IntakeEventType;
  submissionId: string;
  ts: string;                      // ISO 8601 timestamp
  actor: Actor;
  state: SubmissionState;          // State after this event
  payload?: Record<string, unknown>;
}
```

### 6.1 Event Types

| Event Type | Emitted When |
|---|---|
| `submission.created` | New submission created |
| `submission.replayed` | Cached submission returned via idempotent replay |
| `field.updated` | One or more fields set/changed |
| `validation.passed` | Validation succeeds (all fields valid) |
| `validation.failed` | Validation finds issues |
| `upload.requested` | Upload URL issued |
| `upload.completed` | File upload confirmed |
| `upload.failed` | Upload verification failed |
| `submission.submitted` | Submit called successfully |
| `review.requested` | Routed to approval gate |
| `review.approved` | Reviewer approved |
| `review.rejected` | Reviewer rejected |
| `delivery.attempted` | Finalization delivery started |
| `delivery.succeeded` | Delivery completed |
| `delivery.failed` | Delivery failed |
| `submission.finalized` | Terminal success state |
| `submission.cancelled` | Explicitly cancelled |
| `submission.expired` | TTL expired |
| `handoff.link_issued` | Human form link generated |
| `handoff.resumed` | Agent resumed after human handoff |

### 6.2 Event Delivery

Implementations MUST support:
- **Pull:** `getEvents(submissionId, { afterEventId?, limit? })` — polling
- **Push (optional):** Webhook or SSE for real-time event delivery

Events are append-only and immutable. The event stream is the canonical audit trail.

### 6.3 Event Serialization

The canonical serialization is JSONL (one JSON object per line). Example:

```jsonl
{"eventId":"evt_01","type":"submission.created","submissionId":"sub_01","ts":"2026-01-29T10:00:00Z","actor":{"kind":"agent","id":"onboarding_bot"},"state":"draft"}
{"eventId":"evt_02","type":"field.updated","submissionId":"sub_01","ts":"2026-01-29T10:00:01Z","actor":{"kind":"agent","id":"onboarding_bot"},"state":"in_progress","payload":{"fields":{"legal_name":"Acme Corp","country":"US"}}}
```

---

## 7. Resume Protocol

### 7.1 Resume Tokens

Every submission has a `resumeToken` — an opaque string that represents the current checkpoint. Resume tokens:

- Are returned on every successful operation and in every error response
- MUST be passed on subsequent operations (optimistic concurrency)
- Are rotated on every state change (stale tokens are rejected with `conflict`)
- Allow different actors to hand off work (agent starts → human continues → agent resumes)

### 7.2 Handoff Flow

```
Agent creates submission → gets resumeToken_1
Agent sets fields         → gets resumeToken_2
Agent generates form link → includes resumeToken_2 (or session binding)
Human opens form          → form loads from resumeToken_2
Human fills fields        → resumeToken_3
Agent calls getSubmission → sees updated fields, gets resumeToken_3
Agent calls submit        → uses resumeToken_3
```

---

## 8. Idempotency

### 8.1 Creation Idempotency

`createSubmission` accepts an optional `idempotencyKey` to prevent duplicate submission creation. This allows callers to safely retry failed requests without creating multiple submissions for the same logical operation.

#### Semantics

When `createSubmission` is called with an `idempotencyKey`:

1. **First call:** Server creates a new submission, associates the key with the `submissionId`, and returns the submission details.

2. **Duplicate call (same key, same payload):** Server detects the existing submission, returns the current state of that submission (same `submissionId`). No new submission is created.

3. **Conflicting call (same key, different payload):** Server detects a mismatch between the stored payload and the new request. Returns a `conflict` error with details.

#### Duplicate Detection

The server MUST:
- Store the mapping of `idempotencyKey → submissionId` when a submission is created with a key
- Hash or compare the request payload (`intakeId`, `actor`, `initialFields`, `ttlMs`) to detect conflicts
- Retain the key mapping until the submission reaches a terminal state (`finalized`, `cancelled`, `expired`)
- After terminal state, MAY purge the key (allowing reuse) or reject reuse depending on implementation policy

The server SHOULD NOT:
- Create idempotency keys automatically — keys are caller-provided
- Perform idempotency checks if no `idempotencyKey` is provided

#### Response Format

**Success (new submission created):**
```typescript
{
  ok: true;
  submissionId: string;             // Newly generated ID
  state: "draft" | "in_progress";
  resumeToken: string;
  schema: JSONSchema;
  missingFields?: string[];
  _idempotent: false;               // Indicates this was a new creation
}
```

**Success (duplicate detected, returning existing):**
```typescript
{
  ok: true;
  submissionId: string;             // Existing submission ID
  state: SubmissionState;           // Current state (may have progressed)
  resumeToken: string;              // Current resume token
  schema: JSONSchema;
  missingFields?: string[];
  _idempotent: true;                // Indicates this was an idempotent return
}
```

**Error (conflicting payload):**
```typescript
{
  ok: false;
  submissionId: string;             // The existing submission ID
  state: SubmissionState;           // Current state of existing submission
  resumeToken: string;
  error: {
    type: "conflict";
    message: "Idempotency key already used with different payload";
    retryable: false;
    nextActions: [
      {
        action: "cancel";
        hint: "Use a different idempotency key, or fetch the existing submission and resume it."
      }
    ];
  };
}
```

#### Examples

**Example 1: First creation**

```bash
curl -X POST https://api.formbridge.example/intakes/vendor_onboarding/submissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "idempotencyKey": "idem_abc123",
    "actor": {
      "kind": "agent",
      "id": "onboarding_bot",
      "name": "Vendor Onboarding Agent"
    },
    "initialFields": {
      "legal_name": "Acme Corp",
      "country": "US"
    }
  }'
```

**Response:**
```json
{
  "ok": true,
  "submissionId": "sub_xyz789",
  "state": "in_progress",
  "resumeToken": "rtok_001",
  "schema": { ... },
  "missingFields": ["tax_id", "address", "contact_email"],
  "_idempotent": false
}
```

**Example 2: Retry with same key (network failure recovery)**

```bash
# Agent retries the exact same request after a network timeout
curl -X POST https://api.formbridge.example/intakes/vendor_onboarding/submissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "idempotencyKey": "idem_abc123",
    "actor": {
      "kind": "agent",
      "id": "onboarding_bot",
      "name": "Vendor Onboarding Agent"
    },
    "initialFields": {
      "legal_name": "Acme Corp",
      "country": "US"
    }
  }'
```

**Response:**
```json
{
  "ok": true,
  "submissionId": "sub_xyz789",
  "state": "in_progress",
  "resumeToken": "rtok_001",
  "schema": { ... },
  "missingFields": ["tax_id", "address", "contact_email"],
  "_idempotent": true
}
```

**Example 3: Conflict (same key, different payload)**

```bash
# Agent mistakenly reuses the key for a different vendor
curl -X POST https://api.formbridge.example/intakes/vendor_onboarding/submissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "idempotencyKey": "idem_abc123",
    "actor": {
      "kind": "agent",
      "id": "onboarding_bot"
    },
    "initialFields": {
      "legal_name": "Different Corp",
      "country": "CA"
    }
  }'
```

**Response:**
```json
{
  "ok": false,
  "submissionId": "sub_xyz789",
  "state": "in_progress",
  "resumeToken": "rtok_001",
  "error": {
    "type": "conflict",
    "message": "Idempotency key 'idem_abc123' already used with different payload",
    "retryable": false,
    "nextActions": [
      {
        "action": "cancel",
        "hint": "Use a different idempotency key, or fetch the existing submission and resume it."
      }
    ]
  }
}
```

#### Key Generation Recommendations

**For agents:**
- Use a unique identifier tied to the workflow instance: `{workflow_id}_{step}`
- Include a timestamp or UUID for uniqueness: `idem_{uuid}`
- Store the key with the workflow state to enable safe retries

**For humans (via form UI):**
- Generate a key on form load and include it in a hidden field
- Regenerate if the user explicitly starts a "new" submission

**Key format:**
- Printable ASCII, 1-255 characters
- Recommended prefix: `idem_` for clarity
- Avoid PII or sensitive data in the key itself

### 8.2 Submission Idempotency

`submit` REQUIRES an `idempotencyKey` to prevent duplicate submissions. This allows callers to safely retry failed submission requests without risk of creating duplicate finalized records or triggering duplicate delivery actions.

#### Semantics

When `submit` is called with an `idempotencyKey`:

1. **First call:** Server validates fields, transitions submission to `submitted` (or `needs_review`), records the operation result, and associates the `idempotencyKey` with the `submissionId` and submission outcome.

2. **Duplicate call (same key, same payload):** Server detects the existing submission operation, returns the cached result without re-executing submission logic. The response is replayed from cache.

3. **Conflicting call (same key, different payload):** Server detects a mismatch between the stored submission request and the new request. Returns a `conflict` error with details.

#### Caching and Response Replay

The server MUST cache the result of the first `submit` call with a given `idempotencyKey` and replay that result on subsequent requests with the same key. This cache MUST include:

- The final outcome: success response or error response
- The submission state after the operation
- The current `resumeToken`
- Any side effects that were triggered (e.g., delivery attempts, state transitions)

**Critical:** The cache ensures that retrying a `submit` operation:
- Does NOT re-execute validation logic (which could have different results if data changed)
- Does NOT trigger duplicate delivery attempts to the destination
- Does NOT create duplicate audit events beyond the original operation
- Returns EXACTLY the same response as the original call

The server MUST include an `Idempotent-Replayed` header (or equivalent transport-specific indicator) in replayed responses:

```
Idempotent-Replayed: true
```

When this header is present, clients know the response is a cached replay of a previous operation, not a new execution.

#### Duplicate Detection

The server MUST:
- Store the mapping of `idempotencyKey → (submissionId, cached_response)` when `submit` is called
- Hash or compare the request payload (`submissionId`, `resumeToken`, `actor`) to detect conflicts
- Retain the key mapping and cached response until:
  - The submission reaches a terminal state (`finalized`, `cancelled`, `expired`), AND
  - A retention period has elapsed (implementation-defined, recommended: 24 hours after terminal state)
- After expiry, MAY purge the cache to allow key reuse

The server SHOULD NOT:
- Accept `submit` calls without an `idempotencyKey` — the key is required
- Cache operations other than `submit` with the submission idempotency key (creation has separate idempotency, see §8.1)

#### Conflict Detection

A conflict occurs when the same `idempotencyKey` is used with different request parameters. The server MUST detect conflicts on:

- `submissionId`: Different submission being submitted with same key
- `resumeToken`: Same submission but from a different state checkpoint
- `actor`: Different actor attempting submission (optional check, implementation-dependent)

When a conflict is detected, the server MUST NOT execute the submission and MUST return a `conflict` error.

#### Response Format

**Success (first submission):**
```typescript
{
  ok: true;
  submissionId: string;
  state: "submitted" | "needs_review" | "finalized";  // Depends on gate configuration
  resumeToken: string;                                // New token after state transition
  _idempotent: false;                                 // Indicates new execution
}
```

**Success (replayed response):**
```typescript
{
  ok: true;
  submissionId: string;
  state: "submitted" | "needs_review" | "finalized";
  resumeToken: string;                                // Token from original execution
  _idempotent: true;                                  // Indicates cached replay
}
```

**Note:** When using HTTP/JSON binding, replayed responses include header `Idempotent-Replayed: true`.

**Error (conflicting payload):**
```typescript
{
  ok: false;
  submissionId: string;
  state: SubmissionState;                             // Current state
  resumeToken: string;                                // Current resume token
  error: {
    type: "conflict";
    message: "Idempotency key already used for different submission or state";
    retryable: false;
    nextActions: [
      {
        action: "cancel";
        hint: "Use a different idempotency key, or fetch current submission state to get the correct resumeToken."
      }
    ];
  };
}
```

#### Examples

**Example 1: First submission**

```bash
curl -X POST https://api.formbridge.example/submissions/sub_xyz789/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "submissionId": "sub_xyz789",
    "resumeToken": "rtok_003",
    "idempotencyKey": "submit_abc123",
    "actor": {
      "kind": "agent",
      "id": "onboarding_bot"
    }
  }'
```

**Response:**
```json
{
  "ok": true,
  "submissionId": "sub_xyz789",
  "state": "submitted",
  "resumeToken": "rtok_004",
  "_idempotent": false
}
```

**Example 2: Retry with same key (network timeout recovery)**

```bash
# Agent retries after network timeout, same request
curl -X POST https://api.formbridge.example/submissions/sub_xyz789/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "submissionId": "sub_xyz789",
    "resumeToken": "rtok_003",
    "idempotencyKey": "submit_abc123",
    "actor": {
      "kind": "agent",
      "id": "onboarding_bot"
    }
  }'
```

**Response:**
```
Idempotent-Replayed: true

{
  "ok": true,
  "submissionId": "sub_xyz789",
  "state": "submitted",
  "resumeToken": "rtok_004",
  "_idempotent": true
}
```

**Example 3: Conflict (same key, different resumeToken)**

```bash
# Agent mistakenly reuses key with stale resumeToken
curl -X POST https://api.formbridge.example/submissions/sub_xyz789/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "submissionId": "sub_xyz789",
    "resumeToken": "rtok_002",
    "idempotencyKey": "submit_abc123",
    "actor": {
      "kind": "agent",
      "id": "onboarding_bot"
    }
  }'
```

**Response:**
```json
{
  "ok": false,
  "submissionId": "sub_xyz789",
  "state": "submitted",
  "resumeToken": "rtok_004",
  "error": {
    "type": "conflict",
    "message": "Idempotency key 'submit_abc123' already used with different resumeToken (expected rtok_003, got rtok_002)",
    "retryable": false,
    "nextActions": [
      {
        "action": "cancel",
        "hint": "Fetch current submission state to get the correct resumeToken, or use a new idempotency key."
      }
    ]
  }
}
```

**Example 4: Conflict (same key, different submission)**

```bash
# Agent mistakenly reuses key for different submission
curl -X POST https://api.formbridge.example/submissions/sub_different/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "submissionId": "sub_different",
    "resumeToken": "rtok_099",
    "idempotencyKey": "submit_abc123",
    "actor": {
      "kind": "agent",
      "id": "onboarding_bot"
    }
  }'
```

**Response:**
```json
{
  "ok": false,
  "submissionId": "sub_different",
  "state": "in_progress",
  "resumeToken": "rtok_099",
  "error": {
    "type": "conflict",
    "message": "Idempotency key 'submit_abc123' already used for different submission (sub_xyz789)",
    "retryable": false,
    "nextActions": [
      {
        "action": "cancel",
        "hint": "Use a unique idempotency key for each submission."
      }
    ]
  }
}
```

#### Key Generation Recommendations

**For agents:**
- Use a unique identifier tied to the submission: `submit_{submissionId}_{attempt}`
- Or use a workflow-tied key: `{workflow_id}_submit`
- Store the key with the workflow state to enable safe retries
- Generate a new key if the submission state has changed significantly

**For humans (via form UI):**
- Generate a key when the submit button is clicked: `submit_{submissionId}_{uuid}`
- Include it in the submission request
- If user clicks "submit" again after an error, reuse the same key for that attempt

**Key format:**
- Printable ASCII, 1-255 characters
- Recommended prefix: `submit_` for clarity
- MUST be unique per logical submission operation
- Avoid PII or sensitive data in the key itself

### 8.3 Storage Backend Configuration

Idempotency tracking requires persistent storage to detect duplicate requests across service restarts and distributed deployments. FormBridge defines a pluggable `IdempotencyStore` interface that implementations can adapt to their infrastructure.

#### Interface

```typescript
interface IdempotencyStore {
  // Creation idempotency (§8.1)
  recordCreation(params: {
    idempotencyKey: string;
    submissionId: string;
    payloadHash: string;          // Hash of creation request params
    intakeId: string;
    expiresAt: Date;
  }): Promise<void>;

  getCreation(idempotencyKey: string): Promise<{
    submissionId: string;
    payloadHash: string;
    intakeId: string;
  } | null>;

  // Submission idempotency (§8.2)
  recordSubmission(params: {
    idempotencyKey: string;
    submissionId: string;
    resumeToken: string;
    cachedResponse: unknown;      // The full response to replay
    expiresAt: Date;
  }): Promise<void>;

  getSubmission(idempotencyKey: string): Promise<{
    submissionId: string;
    resumeToken: string;
    cachedResponse: unknown;
  } | null>;

  // Cleanup
  deleteExpiredKeys(before: Date): Promise<number>;  // Returns count deleted
}
```

#### Default: In-Memory Store

The reference implementation includes an in-memory store suitable for development and single-instance deployments:

```typescript
class InMemoryIdempotencyStore implements IdempotencyStore {
  private creationKeys = new Map<string, CreationRecord>();
  private submissionKeys = new Map<string, SubmissionRecord>();

  // Implements interface methods with Map operations
  // Periodically calls deleteExpiredKeys() to prevent unbounded growth
}
```

**Limitations:**
- Keys are lost on restart
- Does not work with multiple service instances (race conditions possible)
- Not suitable for production use

#### Production: Redis Backend

For distributed deployments, use a Redis-backed store:

```typescript
class RedisIdempotencyStore implements IdempotencyStore {
  constructor(private redis: RedisClient) {}

  async recordCreation(params) {
    const key = `idem:create:${params.idempotencyKey}`;
    const value = JSON.stringify({
      submissionId: params.submissionId,
      payloadHash: params.payloadHash,
      intakeId: params.intakeId,
    });
    const ttl = Math.floor((params.expiresAt.getTime() - Date.now()) / 1000);
    await this.redis.setex(key, ttl, value);
  }

  // Similar implementations for other methods
}
```

**Configuration:**
```typescript
const store = new RedisIdempotencyStore(
  createRedisClient({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD,
  })
);

const intakeService = new IntakeService({ idempotencyStore: store });
```

#### Alternative: Database Backend

For implementations already using PostgreSQL, MySQL, or similar:

```typescript
class DatabaseIdempotencyStore implements IdempotencyStore {
  constructor(private db: DatabaseClient) {}

  async recordCreation(params) {
    await this.db.query(
      `INSERT INTO idempotency_keys (key, type, submission_id, payload_hash, expires_at)
       VALUES ($1, 'creation', $2, $3, $4)
       ON CONFLICT (key) DO NOTHING`,
      [params.idempotencyKey, params.submissionId, params.payloadHash, params.expiresAt]
    );
  }

  // Similar implementations for other methods
}
```

**Schema:**
```sql
CREATE TABLE idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  type VARCHAR(20) NOT NULL,           -- 'creation' or 'submission'
  submission_id VARCHAR(255) NOT NULL,
  payload_hash VARCHAR(64),            -- For creation keys
  resume_token VARCHAR(255),           -- For submission keys
  cached_response JSONB,               -- For submission keys
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  INDEX idx_expires_at (expires_at)
);
```

#### Implementation Notes

**TTL Management:**
- Store TTL should match or exceed submission TTL
- Recommended: Keep keys for 24 hours after submission reaches terminal state
- Run periodic cleanup: `store.deleteExpiredKeys(new Date())` via cron or background task

**Conflict Detection:**
- `recordCreation` and `recordSubmission` should use atomic operations (Redis SETNX, DB INSERT ON CONFLICT)
- Read-then-write patterns risk race conditions in distributed systems

**Performance:**
- All idempotency checks are synchronous blockers on the request path
- Use fast key-value stores (Redis) or indexed database queries
- Consider caching negative lookups briefly to reduce store load

### 8.4 TTL and Expiration

Every submission has a time-to-live (TTL) that determines how long it remains active before automatic expiration. This prevents abandoned submissions from accumulating indefinitely and ensures that stale data doesn't remain in the system.

#### Default TTL

The default TTL for all submissions is **24 hours** (86,400,000 milliseconds) from creation. This provides a reasonable window for most workflows while ensuring timely cleanup of incomplete work.

#### Per-Intake Configuration

Intake definitions can override the default TTL to match their specific requirements:

```typescript
interface IntakeDefinition {
  // ... other fields
  ttlMs?: number;  // Custom TTL in milliseconds
}
```

**Examples:**
- **Quick feedback forms:** `ttlMs: 3600000` (1 hour)
- **Complex onboarding:** `ttlMs: 604800000` (7 days)
- **Regulatory compliance:** `ttlMs: 2592000000` (30 days)

#### Per-Submission Override

Individual submissions can override both the default and intake-level TTL at creation time:

```typescript
createSubmission({
  intakeId: "vendor_onboarding",
  actor: { kind: "agent", id: "bot_1" },
  ttlMs: 172800000  // 48 hours for this specific submission
})
```

The most specific TTL takes precedence: submission-level > intake-level > system default.

#### Automatic Cleanup

When a submission's TTL expires:

1. **State Transition:** The submission automatically transitions to the `expired` state (if not already in a terminal state)

2. **Event Emission:** An `submission.expired` event is emitted to the event stream:
   ```typescript
   {
     eventId: "evt_xyz",
     type: "submission.expired",
     submissionId: "sub_123",
     ts: "2026-01-30T14:30:00Z",
     actor: { kind: "system", id: "ttl_enforcer" },
     state: "expired",
     payload: {
       originalState: "in_progress",
       ttlMs: 86400000,
       createdAt: "2026-01-29T14:30:00Z",
       expiredAt: "2026-01-30T14:30:00Z"
     }
   }
   ```

3. **Resource Cleanup:** Implementations SHOULD:
   - Mark associated file uploads for deletion (with grace period)
   - Archive the submission data to cold storage
   - Clean up idempotency keys after a retention period
   - Free any locks or reservations held by the submission

4. **Idempotency Key Retention:** Idempotency keys are retained for an additional grace period (recommended: 24 hours) after expiration to allow detection of late retry attempts.

#### Behavior After Expiration

Once a submission reaches the `expired` state:

- **All operations fail:** Attempts to call `setFields`, `validate`, `submit`, or other operations on an expired submission return an `expired` error:
  ```typescript
  {
    ok: false,
    submissionId: "sub_123",
    state: "expired",
    resumeToken: "rtok_final",
    error: {
      type: "expired",
      message: "Submission expired after 24 hours",
      retryable: false,
      nextActions: [
        {
          action: "cancel",
          hint: "Create a new submission to restart the workflow."
        }
      ]
    }
  }
  ```

- **Resume tokens are invalidated:** The `resumeToken` from an expired submission cannot be used to perform any operations.

- **Read operations permitted:** `getSubmission` and `getEvents` continue to work for audit and debugging purposes, subject to data retention policies.

- **No reactivation:** Expired submissions cannot be resumed or reactivated. Callers must create a new submission and re-enter data.

#### TTL Monitoring

Implementations SHOULD:
- Run a background job that checks for expired submissions at regular intervals (e.g., every 5 minutes)
- Support TTL warnings via the event stream (optional): emit a `submission.ttl_warning` event when 80% of TTL has elapsed
- Expose TTL information in `getSubmission` responses:
  ```typescript
  {
    ok: true,
    submissionId: "sub_123",
    state: "in_progress",
    resumeToken: "rtok_05",
    ttl: {
      expiresAt: "2026-01-30T14:30:00Z",
      remainingMs: 21600000  // 6 hours remaining
    }
  }
  ```

#### Implementation Notes

**TTL Clock Start:**
- The TTL countdown begins at submission creation (`submission.created` event timestamp)
- Updating fields or transitioning states does NOT reset the TTL
- Only creating a new submission starts a new TTL countdown

**Terminal States:**
- Submissions in terminal states (`finalized`, `cancelled`, `expired`) do not expire further
- Data retention policies determine how long terminal submissions are kept

**Clock Skew:**
- Implementations MUST use a consistent clock source (e.g., database server time, NTP-synced system clock)
- TTL checks SHOULD have a small grace period (e.g., +30 seconds) to account for clock skew in distributed systems

### 8.5 Concurrent Request Handling

When multiple requests arrive concurrently with the same idempotency key, FormBridge implementations MUST ensure that exactly one request is processed while others are safely handled through locking and response replay. This section defines the concurrency guarantees and implementation requirements.

#### Request Serialization

**Guarantee:** For any given idempotency key, all requests MUST be serialized such that:
1. Exactly one request performs the actual operation (creation or submission)
2. All other concurrent requests wait for the first to complete, then receive the replayed response
3. No duplicate side effects occur (e.g., multiple submissions, multiple delivery attempts)

#### Locking Strategy

Implementations MUST use one of the following strategies to ensure request serialization:

**1. Distributed Lock (Recommended for Production)**

Use a distributed locking mechanism (e.g., Redis SETNX, database row locks) to coordinate across multiple service instances:

```typescript
async function handleIdempotentRequest(idempotencyKey: string, operation: () => Promise<Response>) {
  const lockKey = `lock:${idempotencyKey}`;
  const lockId = generateUniqueId();
  const lockTimeout = 30000; // 30 seconds

  // Acquire lock with timeout
  const acquired = await acquireLock(lockKey, lockId, lockTimeout);

  if (!acquired) {
    // Another request is processing; wait and retry
    return await waitForResult(idempotencyKey, lockTimeout);
  }

  try {
    // Check if result already exists (first request may have completed)
    const existing = await idempotencyStore.get(idempotencyKey);
    if (existing) {
      return replayResponse(existing);
    }

    // Execute operation (we won the race)
    const result = await operation();

    // Store result for replays
    await idempotencyStore.record(idempotencyKey, result);

    return result;
  } finally {
    await releaseLock(lockKey, lockId);
  }
}
```

**2. Database Row Lock**

For database-backed stores, use row-level locking:

```sql
-- PostgreSQL example
BEGIN;
SELECT * FROM idempotency_keys
WHERE key = $1
FOR UPDATE NOWAIT;  -- Fail fast if locked

-- If row exists, return cached response
-- If row doesn't exist, INSERT and execute operation

COMMIT;
```

**3. Single-Instance In-Memory Lock**

For development or single-instance deployments, use in-memory mutexes:

```typescript
class InMemoryLockManager {
  private locks = new Map<string, Promise<unknown>>();

  async execute<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.locks.get(key);
    if (existing) {
      // Wait for in-flight request to complete
      return await existing as T;
    }

    const promise = operation();
    this.locks.set(key, promise);

    try {
      return await promise;
    } finally {
      this.locks.delete(key);
    }
  }
}
```

**Note:** In-memory locks do NOT work across multiple service instances and risk duplicate processing in distributed deployments.

#### Timeout Behavior

**Lock Acquisition Timeout:**
- Default: 30 seconds
- If a lock cannot be acquired within the timeout, the request MUST fail with a retryable error:
  ```typescript
  {
    ok: false,
    error: {
      type: "locked",
      message: "Request with this idempotency key is currently being processed",
      retryable: true,
      retryAfterMs: 1000  // Suggested backoff
    }
  }
  ```

**Lock Hold Timeout:**
- Maximum time a lock can be held: 30 seconds (configurable)
- If an operation exceeds this timeout, the lock MUST be released automatically to prevent deadlocks
- The original request SHOULD fail with an error indicating timeout
- Subsequent requests with the same key will attempt operation again

**Response Wait Timeout:**
- When waiting for another request to complete, wait up to 30 seconds for the result
- If the result is not available after timeout, return a retryable error

#### Race Condition Prevention

**Double-Check Pattern:**

Even after acquiring a lock, implementations MUST check if another request has already stored a result. This handles the case where:
1. Request A acquires lock
2. Request B waits for lock
3. Request A completes and stores result
4. Request A releases lock
5. Request B acquires lock and MUST check for existing result before re-executing

```typescript
// After acquiring lock:
const existingResult = await idempotencyStore.get(idempotencyKey);
if (existingResult) {
  // Another request completed while we were waiting
  return replayResponse(existingResult);
}

// Safe to proceed - we're the first to execute
const result = await executeOperation();
await idempotencyStore.record(idempotencyKey, result);
return result;
```

**Atomic Operations:**

For creation idempotency (§8.1), use atomic database operations to prevent race conditions:

```sql
-- PostgreSQL example: Atomic insert-or-return
INSERT INTO idempotency_keys (key, submission_id, payload_hash, expires_at)
VALUES ($1, $2, $3, $4)
ON CONFLICT (key) DO NOTHING
RETURNING submission_id;

-- If RETURNING is empty, another request won the race
-- Read the existing record to get the submission_id
```

For Redis:
```typescript
// SETNX is atomic: returns 1 if set, 0 if key exists
const created = await redis.setnx(`idem:create:${key}`, JSON.stringify(record));
if (!created) {
  // Another request won the race
  const existing = await redis.get(`idem:create:${key}`);
  return JSON.parse(existing);
}
```

**Resume Token Validation:**

For submission idempotency (§8.2), validate the resume token matches the stored value to detect conflicts:

```typescript
const storedSubmission = await idempotencyStore.getSubmission(idempotencyKey);
if (storedSubmission && storedSubmission.resumeToken !== request.resumeToken) {
  // Conflict: same key, different state checkpoint
  return conflictError("Resume token mismatch");
}
```

#### Queuing Behavior

**Request Ordering:**

When multiple requests arrive with the same idempotency key:
1. First request: Acquires lock, executes operation, stores result
2. Concurrent requests: Wait for lock release, then receive replayed response
3. Late arrivals: Immediately receive replayed response if result is cached

**No Guaranteed Order:**

Implementations do NOT guarantee that requests are processed in arrival order. All concurrent requests receive the SAME response (the cached result), regardless of arrival order.

**Fairness:**

Lock acquisition SHOULD be fair (FIFO) to prevent starvation, but this is implementation-dependent. Implementations using spin-lock retries SHOULD use exponential backoff to reduce contention.

#### Implementation Requirements

**MUST:**
- Serialize requests with the same idempotency key
- Ensure exactly-once execution of side effects (submission, delivery)
- Store cached responses atomically with the operation result
- Release locks on timeout to prevent deadlocks
- Handle lock acquisition failures gracefully with retryable errors

**SHOULD:**
- Use distributed locks for multi-instance deployments
- Implement request timeout monitoring
- Log lock contention metrics for observability
- Use fair lock acquisition to prevent starvation

**MUST NOT:**
- Allow multiple requests with the same key to execute concurrently
- Release locks before storing the cached response
- Assume in-memory locks work across service instances

#### Observability

Implementations SHOULD emit metrics for:
- `idempotency.lock.acquired`: Lock acquisition latency
- `idempotency.lock.timeout`: Lock acquisition timeout count
- `idempotency.lock.contention`: Concurrent requests for same key
- `idempotency.cache.hit`: Replayed response count
- `idempotency.cache.miss`: New operation execution count

#### Example: Complete Flow

```
Time  Request A (key=idem_001)           Request B (key=idem_001)
----  --------------------------------    --------------------------------
T0    Arrives, attempts lock
T1    Acquires lock                      Arrives, attempts lock
T2    Checks cache (miss)                Waits for lock...
T3    Executes createSubmission()        Waits for lock...
T4    Stores result in cache             Waits for lock...
T5    Releases lock                      Acquires lock
T6    Returns response                   Checks cache (hit!)
T7                                       Returns replayed response
                                         Releases lock
```

**Key Points:**
- Request B never executes `createSubmission()` — it receives the cached result from Request A
- Both requests receive identical responses
- The submission is created exactly once
- All event emissions happen exactly once (during Request A's execution)

### 8.6 HTTP Header Examples

When using the HTTP/JSON binding, idempotency keys can be provided via the `Idempotency-Key` header instead of including them in the request body. This approach follows standard HTTP conventions and allows infrastructure (proxies, caches, load balancers) to participate in idempotency handling.

#### Header Format

```
Idempotency-Key: <key>
```

Where `<key>` is a printable ASCII string, 1-255 characters, following the same format requirements as body-based keys (§8.1, §8.2).

#### Example 1: Initial Request (Success)

**Request:**
```bash
curl -X POST https://api.formbridge.example/intakes/vendor_onboarding/submissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Idempotency-Key: idem_7f3a2b9c" \
  -d '{
    "actor": {
      "kind": "agent",
      "id": "onboarding_bot",
      "name": "Vendor Onboarding Agent"
    },
    "initialFields": {
      "legal_name": "Acme Corp",
      "country": "US",
      "tax_id": "12-3456789"
    }
  }'
```

**Response (201 Created):**
```http
HTTP/1.1 201 Created
Content-Type: application/json
X-Request-Id: req_xyz123

{
  "ok": true,
  "submissionId": "sub_abc456",
  "state": "in_progress",
  "resumeToken": "rtok_001",
  "schema": {
    "type": "object",
    "properties": {
      "legal_name": { "type": "string" },
      "country": { "type": "string" },
      "tax_id": { "type": "string" },
      "address": { "type": "string" },
      "contact_email": { "type": "string", "format": "email" }
    },
    "required": ["legal_name", "country", "tax_id", "address", "contact_email"]
  },
  "missingFields": ["address", "contact_email"],
  "_idempotent": false
}
```

#### Example 2: Replay with Same Payload (Network Retry)

**Request (identical to Example 1):**
```bash
curl -X POST https://api.formbridge.example/intakes/vendor_onboarding/submissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Idempotency-Key: idem_7f3a2b9c" \
  -d '{
    "actor": {
      "kind": "agent",
      "id": "onboarding_bot",
      "name": "Vendor Onboarding Agent"
    },
    "initialFields": {
      "legal_name": "Acme Corp",
      "country": "US",
      "tax_id": "12-3456789"
    }
  }'
```

**Response (200 OK - Cached):**
```http
HTTP/1.1 200 OK
Content-Type: application/json
Idempotent-Replayed: true
X-Request-Id: req_def789

{
  "ok": true,
  "submissionId": "sub_abc456",
  "state": "in_progress",
  "resumeToken": "rtok_001",
  "schema": { ... },
  "missingFields": ["address", "contact_email"],
  "_idempotent": true
}
```

**Key Differences:**
- HTTP status is `200 OK` instead of `201 Created`
- Header `Idempotent-Replayed: true` indicates this is a cached response
- Field `_idempotent: true` confirms no new submission was created
- Same `submissionId` and `resumeToken` as original request
- Response returned quickly (no re-execution of business logic)

#### Example 3: Conflict with Different Payload

**Request (same key, different data):**
```bash
curl -X POST https://api.formbridge.example/intakes/vendor_onboarding/submissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Idempotency-Key: idem_7f3a2b9c" \
  -d '{
    "actor": {
      "kind": "agent",
      "id": "onboarding_bot"
    },
    "initialFields": {
      "legal_name": "Different Corp",
      "country": "CA",
      "tax_id": "98-7654321"
    }
  }'
```

**Response (409 Conflict):**
```http
HTTP/1.1 409 Conflict
Content-Type: application/json
X-Request-Id: req_ghi012

{
  "ok": false,
  "submissionId": "sub_abc456",
  "state": "in_progress",
  "resumeToken": "rtok_001",
  "error": {
    "type": "conflict",
    "message": "Idempotency key 'idem_7f3a2b9c' already used with different payload",
    "retryable": false,
    "nextActions": [
      {
        "action": "cancel",
        "hint": "Generate a new idempotency key for this different submission, or retrieve the existing submission using submissionId 'sub_abc456'."
      }
    ]
  }
}
```

**Key Points:**
- HTTP status `409 Conflict` signals payload mismatch
- Returns the `submissionId` of the existing submission created with this key
- Error is non-retryable — caller must choose: use new key or work with existing submission
- Server compared payload hash and detected different `initialFields`

#### Example 4: TTL Expiration During Retry

**Context:** Agent created a submission, waited 25 hours (past the 24-hour default TTL), then attempted to retry creation with the same idempotency key.

**Request:**
```bash
curl -X POST https://api.formbridge.example/intakes/vendor_onboarding/submissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Idempotency-Key: idem_expired_001" \
  -d '{
    "actor": {
      "kind": "agent",
      "id": "onboarding_bot"
    },
    "initialFields": {
      "legal_name": "Stale Corp",
      "country": "US"
    }
  }'
```

**Response (410 Gone):**
```http
HTTP/1.1 410 Gone
Content-Type: application/json
X-Request-Id: req_jkl345

{
  "ok": false,
  "submissionId": "sub_expired_789",
  "state": "expired",
  "resumeToken": "rtok_final",
  "error": {
    "type": "expired",
    "message": "Submission 'sub_expired_789' expired after 24 hours. Idempotency key was retained but submission is no longer active.",
    "retryable": false,
    "nextActions": [
      {
        "action": "cancel",
        "hint": "Create a new submission with a fresh idempotency key. The expired submission cannot be resumed."
      }
    ]
  }
}
```

**Key Points:**
- HTTP status `410 Gone` indicates the resource expired and is no longer available
- The idempotency key was retained past expiration (grace period) to detect this retry
- Error type `expired` signals TTL enforcement
- Caller must create a completely new submission with a new idempotency key
- The expired submission's data may have been archived or deleted per retention policy

#### Example 5: Submission with Idempotency-Key Header

**Request:**
```bash
curl -X POST https://api.formbridge.example/submissions/sub_abc456/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Idempotency-Key: submit_7f3a2b9c_final" \
  -d '{
    "submissionId": "sub_abc456",
    "resumeToken": "rtok_005",
    "actor": {
      "kind": "agent",
      "id": "onboarding_bot"
    }
  }'
```

**Response (200 OK):**
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-Id: req_mno678

{
  "ok": true,
  "submissionId": "sub_abc456",
  "state": "submitted",
  "resumeToken": "rtok_006",
  "_idempotent": false
}
```

#### Example 6: Submission Replay After Network Timeout

**Request (identical to Example 5):**
```bash
curl -X POST https://api.formbridge.example/submissions/sub_abc456/submit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Idempotency-Key: submit_7f3a2b9c_final" \
  -d '{
    "submissionId": "sub_abc456",
    "resumeToken": "rtok_005",
    "actor": {
      "kind": "agent",
      "id": "onboarding_bot"
    }
  }'
```

**Response (200 OK - Cached):**
```http
HTTP/1.1 200 OK
Content-Type: application/json
Idempotent-Replayed: true
X-Request-Id: req_pqr901

{
  "ok": true,
  "submissionId": "sub_abc456",
  "state": "submitted",
  "resumeToken": "rtok_006",
  "_idempotent": true
}
```

**Key Points:**
- Header `Idempotent-Replayed: true` confirms this is a cache replay
- No duplicate submission processing occurred
- No duplicate delivery attempts triggered
- Returned exact same `state` and `resumeToken` as original request
- Critical for preventing duplicate orders, payments, or downstream actions

#### Header vs. Body Parameter

Both approaches are supported. Choose based on your needs:

**Header-based (`Idempotency-Key` header):**
- ✅ Follows HTTP conventions
- ✅ Infrastructure can participate (caching, routing)
- ✅ Key is visible in logs without parsing body
- ✅ Recommended for public APIs

**Body-based (`idempotencyKey` field):**
- ✅ Works with MCP tools and non-HTTP transports
- ✅ Key travels with request payload in signed/encrypted contexts
- ✅ No header parsing required
- ✅ Recommended for MCP bindings

Implementations SHOULD support both. If both are provided, header takes precedence.

---

## 9. Upload Negotiation

File uploads use a two-phase protocol:

1. **Negotiate:** Client calls `requestUpload` with file metadata. Server validates constraints and returns a signed upload URL.
2. **Upload:** Client uploads directly to the signed URL (bypassing the FormBridge server for large files).
3. **Confirm:** Client calls `confirmUpload`. Server verifies the upload (checksum, size, type) and updates the submission.

This keeps large files off the main API path and works with any storage backend (S3, GCS, Azure Blob, local).

---

## 10. Approval Gates

### 10.1 Gate Definition

Intake definitions can declare approval gates:

```typescript
interface ApprovalGate {
  name: string;                    // e.g. "compliance_review"
  reviewers: ReviewerSpec;         // Who can approve
  requiredApprovals?: number;      // Default: 1
  autoApproveIf?: JSONLogic;       // Optional auto-approval rules
  escalateAfterMs?: number;        // Escalation timeout
}
```

### 10.2 Review Flow

When a submission enters `needs_review`:
1. Event `review.requested` is emitted
2. Notification sent to designated reviewers (implementation-specific)
3. Reviewer calls `review` with `approved` or `rejected`
4. If rejected, `reasons` are required and included in the event
5. Submitter (agent or human) can see rejection reasons and potentially re-submit

---

## 11. Intake Definition

An intake definition binds together:

```typescript
interface IntakeDefinition {
  id: string;
  version: string;
  name: string;
  description?: string;

  // The schema
  schema: JSONSchema;              // Or Zod schema (converted at registration)

  // Behavior
  approvalGates?: ApprovalGate[];
  ttlMs?: number;                  // Default submission TTL
  destination: Destination;        // Where finalized submissions go

  // UI hints (optional)
  uiHints?: {
    steps?: StepDefinition[];      // Multi-step wizard layout
    fieldHints?: Record<string, FieldHint>;
  };
}

interface Destination {
  kind: "webhook" | "callback" | "queue";
  url?: string;
  headers?: Record<string, string>;
  retryPolicy?: RetryPolicy;
}
```

---

## 12. Transport Bindings

This spec defines semantics. Transport bindings define how these operations map to specific protocols.

### 12.1 HTTP/JSON Binding

```
POST   /intakes/{intakeId}/submissions          → createSubmission
PATCH  /submissions/{submissionId}/fields        → setFields
POST   /submissions/{submissionId}/validate      → validate
POST   /submissions/{submissionId}/uploads       → requestUpload
POST   /submissions/{submissionId}/uploads/{id}/confirm → confirmUpload
POST   /submissions/{submissionId}/submit        → submit
POST   /submissions/{submissionId}/review        → review
DELETE /submissions/{submissionId}               → cancel
GET    /submissions/{submissionId}               → getSubmission
GET    /submissions/{submissionId}/events        → getEvents
```

### 12.2 MCP Tool Binding

Each intake definition registers MCP tools:

```
formbridge_{intakeId}_create    → createSubmission
formbridge_{intakeId}_set       → setFields
formbridge_{intakeId}_validate  → validate
formbridge_{intakeId}_upload    → requestUpload
formbridge_{intakeId}_submit    → submit
formbridge_{intakeId}_status    → getSubmission
```

The tool input schemas are derived from the intake definition's JSON Schema, so agents discover fields through standard MCP `tools/list`.

#### Idempotency in MCP Tools

Idempotency keys are passed as arguments to MCP tools, following the same semantics as the HTTP/JSON binding (§8). The MCP server implementation handles idempotency detection and response replay transparently.

**Example 1: Creating a submission with idempotency key**

```json
{
  "method": "tools/call",
  "params": {
    "name": "formbridge_vendor_onboarding_create",
    "arguments": {
      "idempotencyKey": "idem_agent_workflow_001",
      "actor": {
        "kind": "agent",
        "id": "onboarding_agent",
        "name": "Vendor Onboarding Assistant"
      },
      "initialFields": {
        "legal_name": "Acme Corp",
        "country": "US",
        "tax_id": "12-3456789"
      }
    }
  }
}
```

**Response (first call):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"ok\":true,\"submissionId\":\"sub_mcp_123\",\"state\":\"in_progress\",\"resumeToken\":\"rtok_001\",\"schema\":{...},\"missingFields\":[\"address\",\"contact_email\"],\"_idempotent\":false}"
    }
  ]
}
```

**Response (replayed after retry):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"ok\":true,\"submissionId\":\"sub_mcp_123\",\"state\":\"in_progress\",\"resumeToken\":\"rtok_001\",\"schema\":{...},\"missingFields\":[\"address\",\"contact_email\"],\"_idempotent\":true}"
    }
  ],
  "isError": false,
  "_meta": {
    "idempotent_replayed": true
  }
}
```

**Note:** The `_meta.idempotent_replayed` field (when present) indicates this is a cached response, equivalent to the `Idempotent-Replayed` HTTP header in §8.6.

**Example 2: Submitting with idempotency key (required)**

```json
{
  "method": "tools/call",
  "params": {
    "name": "formbridge_vendor_onboarding_submit",
    "arguments": {
      "submissionId": "sub_mcp_123",
      "resumeToken": "rtok_005",
      "idempotencyKey": "submit_agent_workflow_001_final",
      "actor": {
        "kind": "agent",
        "id": "onboarding_agent"
      }
    }
  }
}
```

**Response (first call):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"ok\":true,\"submissionId\":\"sub_mcp_123\",\"state\":\"submitted\",\"resumeToken\":\"rtok_006\",\"_idempotent\":false}"
    }
  ]
}
```

**Response (replayed after network timeout):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"ok\":true,\"submissionId\":\"sub_mcp_123\",\"state\":\"submitted\",\"resumeToken\":\"rtok_006\",\"_idempotent\":true}"
    }
  ],
  "isError": false,
  "_meta": {
    "idempotent_replayed": true
  }
}
```

**Critical:** The replayed response prevents duplicate submission processing and duplicate delivery attempts to the destination webhook/API.

**Example 3: Conflict detection**

```json
{
  "method": "tools/call",
  "params": {
    "name": "formbridge_vendor_onboarding_create",
    "arguments": {
      "idempotencyKey": "idem_agent_workflow_001",
      "actor": {
        "kind": "agent",
        "id": "onboarding_agent"
      },
      "initialFields": {
        "legal_name": "Different Corp",
        "country": "CA"
      }
    }
  }
}
```

**Response (conflict - same key, different payload):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"ok\":false,\"submissionId\":\"sub_mcp_123\",\"state\":\"in_progress\",\"resumeToken\":\"rtok_001\",\"error\":{\"type\":\"conflict\",\"message\":\"Idempotency key 'idem_agent_workflow_001' already used with different payload\",\"retryable\":false,\"nextActions\":[{\"action\":\"cancel\",\"hint\":\"Generate a new idempotency key for this different submission, or retrieve the existing submission using submissionId 'sub_mcp_123'.\"}]}}"
    }
  ],
  "isError": true
}
```

**Example 4: Missing idempotency key on submit**

```json
{
  "method": "tools/call",
  "params": {
    "name": "formbridge_vendor_onboarding_submit",
    "arguments": {
      "submissionId": "sub_mcp_456",
      "resumeToken": "rtok_003",
      "actor": {
        "kind": "agent",
        "id": "onboarding_agent"
      }
    }
  }
}
```

**Response (error - idempotency key required):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"ok\":false,\"submissionId\":\"sub_mcp_456\",\"state\":\"in_progress\",\"resumeToken\":\"rtok_003\",\"error\":{\"type\":\"invalid\",\"message\":\"idempotencyKey is required for submit operation\",\"retryable\":true,\"nextActions\":[{\"action\":\"collect_field\",\"field\":\"idempotencyKey\",\"hint\":\"Generate a unique idempotency key to safely retry this submission. Example: 'submit_{submissionId}_{uuid}'.\"}]}}"
    }
  ],
  "isError": true
}
```

#### Implementation Notes for MCP Servers

1. **Tool Schema Generation:** The `idempotencyKey` parameter should be included in the tool schema for `_create` and `_submit` tools:
   ```json
   {
     "name": "formbridge_vendor_onboarding_create",
     "inputSchema": {
       "type": "object",
       "properties": {
         "idempotencyKey": {
           "type": "string",
           "description": "Optional. Unique key to prevent duplicate submission creation. Retries with the same key return the existing submission."
         },
         "actor": { ... },
         "initialFields": { ... }
       }
     }
   }
   ```

2. **Metadata Propagation:** When replaying cached responses, MCP servers SHOULD include `_meta.idempotent_replayed: true` to signal to agents that this is not a new operation.

3. **Error Handling:** Agents using MCP tools can detect conflicts and other idempotency errors by checking `error.type === "conflict"` in the parsed response.

4. **Key Generation Guidance:** MCP tool descriptions SHOULD include examples of proper idempotency key generation to guide agents:
   - Creation: `"idem_{workflow_id}_{timestamp}"` or `"idem_{uuid}"`
   - Submission: `"submit_{submissionId}_{attempt}"` or `"submit_{workflow_id}"`

---

## Appendix A: Glossary

- **Intake:** A defined data collection process (the template)
- **Submission:** A single instance of an intake being filled out
- **Actor:** An agent, human, or system performing an operation
- **Resume Token:** Opaque checkpoint string for optimistic concurrency
- **Idempotency Key:** Caller-generated dedup key for safe retries
- **Approval Gate:** Human review checkpoint before finalization
- **Destination:** Where finalized submission data is delivered

---

## Appendix B: Comparison with MCP Elicitation

MCP's `elicitation/create` (Nov 2025) is a minimal human-input primitive:

| Feature | MCP Elicitation | FormBridge Intake Contract |
|---|---|---|
| Schema support | Flat objects only | Full JSON Schema (nested, arrays, refs) |
| Multi-step | No | Yes (resume tokens) |
| File uploads | No | Yes (signed URL negotiation) |
| Idempotency | No | Yes |
| Approval gates | No | Yes |
| Event stream / audit | No | Yes |
| Mixed-mode (agent + human) | No | Yes |
| Error contract for agent loops | No | Yes (structured, retryable) |
| Transport | MCP only | HTTP, MCP, extensible |

FormBridge is designed to complement MCP elicitation for simple cases and extend beyond it for production workflows.
