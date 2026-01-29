# FormBridge Intake Contract Specification

**Version:** 0.1.0-draft
**Status:** Draft
**Authors:** Amit

---

## Abstract

The FormBridge Intake Contract is a protocol for structured data collection that works equally well for AI agents and humans. It defines a submission state machine, structured error schema, resumable sessions, idempotent submission semantics, file upload negotiation, human approval gates, and an audit event stream.

Any system that implements this contract can reliably collect structured data from agents, humans, or a mix of both — with full auditability.

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
| `conflict` | Idempotency key reused with different payload | No | Use new idempotency key or fetch existing |
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

`createSubmission` accepts an optional `idempotencyKey`. If a submission with the same key already exists:
- Return the existing submission (same `submissionId`, current state)
- Do NOT create a duplicate

### 8.2 Submission Idempotency

`submit` REQUIRES an `idempotencyKey`. If the same key is reused:
- With the same payload: return the existing result (success or error)
- With a different payload: return `conflict` error

### 8.3 Key Format

Idempotency keys are caller-generated opaque strings. Recommended format: `idem_{random}` or `{workflow_id}_{step}`. Keys expire after the submission is finalized or expired.

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
