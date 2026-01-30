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
  - [3.2 Token Error Examples](#32-token-error-examples)
    - [3.2.1 Token Expired (410 Gone)](#321-token-expired-410-gone)
    - [3.2.2 Token Conflict (409 Conflict)](#322-token-conflict-409-conflict)
    - [3.2.3 Token Invalid (400 Bad Request)](#323-token-invalid-400-bad-request)
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
    - [7.1.1 Token Format and Properties](#711-token-format-and-properties)
    - [7.1.2 Token Lifecycle](#712-token-lifecycle)
    - [7.1.3 Version and Concurrency Control (ETag Mechanism)](#713-version-and-concurrency-control-etag-mechanism)
    - [7.1.4 Token Expiration Behavior](#714-token-expiration-behavior)
    - [7.1.5 Multi-Actor Handoff](#715-multi-actor-handoff)
    - [7.1.6 Implementation Notes](#716-implementation-notes)
  - [7.2 Handoff Flow](#72-handoff-flow)
    - [7.2.1 Basic Handoff Sequence](#721-basic-handoff-sequence)
    - [7.2.2 Step-by-Step Example with Token Passing](#722-step-by-step-example-with-token-passing)
    - [7.2.3 Version Rotation on Each Operation](#723-version-rotation-on-each-operation)
    - [7.2.4 Conflict Detection Example](#724-conflict-detection-example)
    - [7.2.5 Resume URL Generation Patterns](#725-resume-url-generation-patterns)
- [8. Idempotency](#8-idempotency)
  - [8.1 Creation Idempotency](#81-creation-idempotency)
  - [8.2 Submission Idempotency](#82-submission-idempotency)
  - [8.3 Key Format](#83-key-format)
- [9. Upload Negotiation](#9-upload-negotiation)
- [10. Approval Gates](#10-approval-gates)
  - [10.1 Gate Definition](#101-gate-definition)
  - [10.2 Review Flow](#102-review-flow)
- [11. Intake Definition](#11-intake-definition)
- [12. Transport Bindings](#12-transport-bindings)
  - [12.1 HTTP/JSON Binding](#121-httpjson-binding)
    - [12.1.1 Submission ID-Based Endpoints](#1211-submission-id-based-endpoints)
    - [12.1.2 Resume Token-Based Endpoints](#1212-resume-token-based-endpoints)
    - [12.1.3 Concurrency Control Headers](#1213-concurrency-control-headers)
    - [12.1.4 Status Codes](#1214-status-codes)
  - [12.2 MCP Tool Binding](#122-mcp-tool-binding)
    - [12.2.1 Tool Definitions](#1221-tool-definitions)
    - [12.2.2 Resume Token Parameters](#1222-resume-token-parameters)
    - [12.2.3 Example MCP Tool Calls](#1223-example-mcp-tool-calls)
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

A submission record captures the complete state of an in-flight or completed submission.

```typescript
interface SubmissionRecord {
  submissionId: string;
  intakeId: string;
  state: SubmissionState;

  // Resume and concurrency control
  resumeToken: string;              // Opaque token for resuming and optimistic concurrency
  version: number;                  // Monotonic version number; increments on every state change
  tokenExpiresAt: string;           // ISO 8601 timestamp; when the current resumeToken expires

  // Submission data
  fields: Record<string, unknown>;  // Current field values
  schema: JSONSchema;               // The intake schema (for validation)

  // Metadata
  createdAt: string;                // ISO 8601 timestamp
  updatedAt: string;                // ISO 8601 timestamp
  createdBy: Actor;
  lastUpdatedBy: Actor;

  // Lifecycle
  submittedAt?: string;             // ISO 8601 timestamp; when submit() was called
  finalizedAt?: string;             // ISO 8601 timestamp; when delivery completed
  expiresAt?: string;               // ISO 8601 timestamp; TTL deadline

  // Idempotency
  idempotencyKey?: string;          // Creation or submission idempotency key
}
```

**Field Descriptions:**

- **`resumeToken`**: An opaque string representing the current checkpoint. MUST be passed on all mutating operations. Rotates on every state change. See §7.1 for full semantics.

- **`version`**: A monotonic integer that increments with each state mutation. Used for optimistic concurrency control and audit ordering. Starts at 1 on creation. Implementations MAY use UUIDs instead of integers if total ordering is not required.

- **`tokenExpiresAt`**: ISO 8601 timestamp indicating when the current `resumeToken` becomes invalid. Typically tied to session TTL or submission expiration. After this time, operations using this token will fail with `error.type = "expired"`.

- **`fields`**: The current values of all fields set via `setFields`. Keys match the JSON Schema property names (including nested dot-paths for nested objects).

- **`state`**: Current lifecycle state (see §2.1).

---

## 3. Error Schema

All validation and submission errors follow a single envelope:

```typescript
interface IntakeError {
  ok: false;
  submissionId: string;
  state: SubmissionState;
  resumeToken: string;
  version?: number;               // Current version (included in token_conflict responses)
  error: {
    type: "missing" | "invalid" | "conflict" | "needs_approval" | "upload_pending" | "delivery_failed" | "expired" | "cancelled" | "token_expired" | "token_conflict" | "token_invalid";
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
| `token_expired` | Resume token has expired (past `tokenExpiresAt`) | No | Fetch fresh submission state and use new token |
| `token_conflict` | Resume token is stale (another operation updated state) | Yes | Fetch latest state and retry with current token |
| `token_invalid` | Resume token is malformed or not recognized | No | Fetch fresh submission state |

### 3.2 Token Error Examples

#### 3.2.1 Token Expired (410 Gone)

When a resume token is used after its `tokenExpiresAt` timestamp:

```typescript
// Request
setFields({
  submissionId: "sub_123",
  resumeToken: "rtok_v2_expired",
  fields: { legal_name: "Acme Corp" }
})

// Response (HTTP 410 Gone)
{
  ok: false,
  submissionId: "sub_123",
  state: "in_progress",
  resumeToken: "rtok_v5_current",  // Current valid token
  version: 5,
  error: {
    type: "token_expired",
    message: "Resume token has expired. Fetch the latest submission state to continue.",
    retryable: false,
    nextActions: [
      {
        action: "fetch_current_state",
        hint: "Call getSubmission() to retrieve the current resumeToken and retry."
      }
    ]
  }
}
```

#### 3.2.2 Token Conflict (409 Conflict)

When a resume token is stale because another operation has modified the submission:

```typescript
// Initial state: submission is at version 3 with rtok_v3
// Actor A successfully updates → version 4, rtok_v4
// Actor B tries to update with stale rtok_v3

// Request (Actor B with stale token)
setFields({
  submissionId: "sub_123",
  resumeToken: "rtok_v3",  // Stale
  fields: { country: "CA" }
})

// Response (HTTP 409 Conflict)
{
  ok: false,
  submissionId: "sub_123",
  state: "in_progress",
  resumeToken: "rtok_v4",  // Current valid token
  version: 4,              // Current version
  error: {
    type: "token_conflict",
    message: "Resume token is stale. The submission was modified by another actor.",
    retryable: true,
    nextActions: [
      {
        action: "fetch_current_state",
        hint: "Call getSubmission() to retrieve version 4, merge your changes, and retry with rtok_v4."
      }
    ]
  }
}
```

**Optimistic Concurrency Pattern:**

```typescript
async function setFieldsWithRetry(submissionId, resumeToken, fields, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await setFields({ submissionId, resumeToken, fields });

    if (result.ok) {
      return result;
    }

    if (result.error.type === "token_conflict") {
      // Fetch latest state
      const latest = await getSubmission({ submissionId });

      // Merge changes (application-specific logic)
      const merged = { ...latest.fields, ...fields };

      // Retry with current token
      resumeToken = latest.resumeToken;
      fields = merged;
      continue;
    }

    // Non-retryable error
    throw new Error(result.error.message);
  }

  throw new Error("Max retries exceeded for token conflict");
}
```

#### 3.2.3 Token Invalid (400 Bad Request)

When a resume token is malformed, corrupted, or doesn't exist:

```typescript
// Request
setFields({
  submissionId: "sub_123",
  resumeToken: "invalid_token_format",
  fields: { legal_name: "Acme Corp" }
})

// Response (HTTP 400 Bad Request)
{
  ok: false,
  submissionId: "sub_123",
  state: "in_progress",
  resumeToken: "rtok_v5_current",  // Current valid token (if submission exists)
  version: 5,
  error: {
    type: "token_invalid",
    message: "Resume token is invalid or malformed.",
    retryable: false,
    nextActions: [
      {
        action: "fetch_current_state",
        hint: "Call getSubmission() to retrieve a valid resumeToken."
      }
    ]
  }
}
```

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
  resumeToken: string;             // Token for subsequent operations
  version: number;                 // Initial version (always 1)
  tokenExpiresAt: string;          // ISO 8601 timestamp
  schema: JSONSchema;              // The full intake schema
  fields: Record<string, unknown>; // Current field values
  missingFields?: string[];        // Fields still needed (if initialFields partial)
}
```

**Example:**
```typescript
// Create submission with initial fields
const result = await createSubmission({
  intakeId: "intake_vendor_onboarding",
  actor: { kind: "agent", id: "onboarding_bot" },
  initialFields: { legal_name: "Acme Corp", country: "US" },
  idempotencyKey: "create_acme_20260129"
});

// Response
{
  ok: true,
  submissionId: "sub_abc123",
  state: "in_progress",
  resumeToken: "rtok_v1_a1b2c3d4",
  version: 1,
  tokenExpiresAt: "2026-01-30T10:00:00Z",
  schema: { /* full JSON Schema */ },
  fields: { legal_name: "Acme Corp", country: "US" },
  missingFields: ["tax_id", "address", "w9_document"]
}
```

### 4.2 `setFields`

Sets or updates fields on an existing submission. Requires a valid `resumeToken` for optimistic concurrency control.

**Input:**
```typescript
{
  submissionId: string;
  resumeToken: string;             // Current resume token (from previous operation)
  actor: Actor;
  fields: Record<string, unknown>; // Fields to set or update
}
```

**Output (Success):**
```typescript
{
  ok: true;
  submissionId: string;
  state: SubmissionState;          // Updated state
  resumeToken: string;             // New resume token (rotated)
  version: number;                 // Incremented version
  tokenExpiresAt: string;          // ISO 8601 timestamp
  fields: Record<string, unknown>; // All current field values
  missingFields?: string[];        // Fields still needed for submission
  validationErrors?: FieldError[]; // Any validation issues
}
```

**Output (Error):** `IntakeError` (see §3)

**Example:**
```typescript
// Update fields with resume token
const result = await setFields({
  submissionId: "sub_abc123",
  resumeToken: "rtok_v1_a1b2c3d4",  // Token from createSubmission
  actor: { kind: "agent", id: "onboarding_bot" },
  fields: {
    tax_id: "12-3456789",
    address: {
      street: "123 Main St",
      city: "San Francisco",
      state: "CA",
      zip: "94105"
    }
  }
});

// Response
{
  ok: true,
  submissionId: "sub_abc123",
  state: "in_progress",
  resumeToken: "rtok_v2_b2c3d4e5",  // Token rotated
  version: 2,                        // Version incremented
  tokenExpiresAt: "2026-01-30T10:00:00Z",
  fields: {
    legal_name: "Acme Corp",
    country: "US",
    tax_id: "12-3456789",
    address: { street: "123 Main St", city: "San Francisco", state: "CA", zip: "94105" }
  },
  missingFields: ["w9_document"]
}
```

### 4.3 `validate`

Validates current submission state without submitting. Does not mutate state, so the `resumeToken` is not rotated.

**Input:**
```typescript
{
  submissionId: string;
  resumeToken: string;  // Current resume token (not rotated on validate)
}
```

**Output (Success):**
```typescript
{
  ok: true;
  submissionId: string;
  state: SubmissionState;
  resumeToken: string;             // Same token (not rotated for read-only ops)
  version: number;                 // Current version (unchanged)
  tokenExpiresAt: string;
  ready: boolean;                  // True if all fields valid for submission
  missingFields?: string[];
  validationErrors?: FieldError[];
}
```

**Output (Error):** `IntakeError` with field-level details (see §3)

**Example:**
```typescript
// Validate before submitting
const result = await validate({
  submissionId: "sub_abc123",
  resumeToken: "rtok_v2_b2c3d4e5"
});

// Response (not ready)
{
  ok: true,
  submissionId: "sub_abc123",
  state: "awaiting_input",
  resumeToken: "rtok_v2_b2c3d4e5",  // Same token (unchanged)
  version: 2,
  tokenExpiresAt: "2026-01-30T10:00:00Z",
  ready: false,
  missingFields: ["w9_document"],
  validationErrors: [
    {
      path: "w9_document",
      code: "file_required",
      message: "W-9 form is required"
    }
  ]
}
```

### 4.4 `requestUpload`

Negotiates a file upload for a given field. Transitions submission to `awaiting_upload` state and rotates the resume token.

**Input:**
```typescript
{
  submissionId: string;
  resumeToken: string;             // Current resume token
  field: string;                   // Dot-path to the file field (e.g., "w9_document")
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
  submissionId: string;
  state: "awaiting_upload";
  resumeToken: string;             // New resume token (rotated)
  version: number;                 // Incremented version
  tokenExpiresAt: string;
  uploadId: string;                // Use this to confirm upload later
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

**Example:**
```typescript
// Request upload for W-9 document
const result = await requestUpload({
  submissionId: "sub_abc123",
  resumeToken: "rtok_v2_b2c3d4e5",
  field: "w9_document",
  filename: "acme-w9.pdf",
  mimeType: "application/pdf",
  sizeBytes: 524288,
  actor: { kind: "agent", id: "onboarding_bot" }
});

// Response
{
  ok: true,
  submissionId: "sub_abc123",
  state: "awaiting_upload",
  resumeToken: "rtok_v3_c3d4e5f6",  // Token rotated
  version: 3,
  tokenExpiresAt: "2026-01-30T10:00:00Z",
  uploadId: "upload_xyz789",
  method: "PUT",
  url: "https://storage.example.com/uploads/xyz789?signed=...",
  headers: { "Content-Type": "application/pdf" },
  expiresInMs: 3600000,
  constraints: {
    accept: ["application/pdf", "image/png", "image/jpeg"],
    maxBytes: 10485760
  }
}
```

### 4.5 `confirmUpload`

Confirms a completed upload (called after the client uploads to the signed URL). Verifies the upload and transitions back to `in_progress` state.

**Input:**
```typescript
{
  submissionId: string;
  resumeToken: string;  // Token from requestUpload response
  uploadId: string;     // uploadId from requestUpload response
  actor: Actor;
}
```

**Output (Success):**
```typescript
{
  ok: true;
  submissionId: string;
  state: "in_progress";            // Back to in_progress after successful upload
  resumeToken: string;             // New resume token (rotated)
  version: number;                 // Incremented version
  tokenExpiresAt: string;
  fields: Record<string, unknown>; // Updated with file metadata
  missingFields?: string[];
}
```

**Output (Error):** `IntakeError` if upload verification fails

**Example:**
```typescript
// After uploading file to signed URL, confirm the upload
const result = await confirmUpload({
  submissionId: "sub_abc123",
  resumeToken: "rtok_v3_c3d4e5f6",
  uploadId: "upload_xyz789",
  actor: { kind: "agent", id: "onboarding_bot" }
});

// Response
{
  ok: true,
  submissionId: "sub_abc123",
  state: "in_progress",
  resumeToken: "rtok_v4_d4e5f6g7",  // Token rotated
  version: 4,
  tokenExpiresAt: "2026-01-30T10:00:00Z",
  fields: {
    legal_name: "Acme Corp",
    country: "US",
    tax_id: "12-3456789",
    address: { /* ... */ },
    w9_document: {
      filename: "acme-w9.pdf",
      mimeType: "application/pdf",
      sizeBytes: 524288,
      url: "https://storage.example.com/files/abc123/w9.pdf"
    }
  },
  missingFields: []  // All required fields now provided
}
```

### 4.6 `submit`

Locks the submission and requests finalization (or routes to review). This is the final mutating operation in the normal flow.

**Input:**
```typescript
{
  submissionId: string;
  resumeToken: string;             // Current resume token
  idempotencyKey: string;          // Required — prevents duplicate submissions
  actor: Actor;
}
```

**Output (Success):**
```typescript
{
  ok: true;
  submissionId: string;
  state: "submitted" | "needs_review" | "finalized";  // Depends on approval gate policy
  resumeToken: string;             // New resume token (rotated)
  version: number;                 // Incremented version
  tokenExpiresAt: string;
  fields: Record<string, unknown>; // Final field values (locked)
  submittedAt: string;             // ISO 8601 timestamp
  finalizedAt?: string;            // Present if state is "finalized"
}
```

**Output (Error):** `IntakeError` (e.g., validation failed, missing fields)

**Example (No Approval Gate):**
```typescript
// Submit for immediate finalization
const result = await submit({
  submissionId: "sub_abc123",
  resumeToken: "rtok_v4_d4e5f6g7",
  idempotencyKey: "submit_acme_20260129",
  actor: { kind: "agent", id: "onboarding_bot" }
});

// Response
{
  ok: true,
  submissionId: "sub_abc123",
  state: "finalized",
  resumeToken: "rtok_v5_e5f6g7h8",  // Token rotated (though submission is now locked)
  version: 5,
  tokenExpiresAt: "2026-01-30T10:00:00Z",
  fields: { /* all submitted fields */ },
  submittedAt: "2026-01-29T10:05:00Z",
  finalizedAt: "2026-01-29T10:05:01Z"
}
```

**Example (With Approval Gate):**
```typescript
// Submit to approval gate
const result = await submit({
  submissionId: "sub_def456",
  resumeToken: "rtok_v3_x1y2z3a4",
  idempotencyKey: "submit_acme2_20260129",
  actor: { kind: "agent", id: "onboarding_bot" }
});

// Response
{
  ok: true,
  submissionId: "sub_def456",
  state: "needs_review",
  resumeToken: "rtok_v4_y2z3a4b5",
  version: 4,
  tokenExpiresAt: "2026-01-30T10:00:00Z",
  fields: { /* all submitted fields */ },
  submittedAt: "2026-01-29T10:05:00Z"
}
```

### 4.7 `review`

Approves or rejects a submission in `needs_review` state. This operation is typically performed by a human reviewer and does not require a resume token (uses submissionId-based access).

**Input:**
```typescript
{
  submissionId: string;
  decision: "approved" | "rejected";
  reasons?: string[];              // Required if rejected
  actor: Actor;                    // Must be authorized reviewer
}
```

**Output (Success):**
```typescript
{
  ok: true;
  submissionId: string;
  state: "approved" | "rejected" | "finalized";  // "finalized" if auto-delivered after approval
  resumeToken: string;             // New resume token (rotated)
  version: number;                 // Incremented version
  tokenExpiresAt: string;
  decision: "approved" | "rejected";
  reviewedAt: string;              // ISO 8601 timestamp
  reviewedBy: Actor;
  reasons?: string[];              // Present if rejected
  finalizedAt?: string;            // Present if auto-finalized after approval
}
```

**Output (Error):** `IntakeError` (e.g., submission not in `needs_review` state)

**Example (Approval):**
```typescript
// Human reviewer approves
const result = await review({
  submissionId: "sub_def456",
  decision: "approved",
  actor: { kind: "human", id: "reviewer_alice", name: "Alice Smith" }
});

// Response (auto-finalized after approval)
{
  ok: true,
  submissionId: "sub_def456",
  state: "finalized",
  resumeToken: "rtok_v5_z3a4b5c6",
  version: 5,
  tokenExpiresAt: "2026-01-30T10:00:00Z",
  decision: "approved",
  reviewedAt: "2026-01-29T11:30:00Z",
  reviewedBy: { kind: "human", id: "reviewer_alice", name: "Alice Smith" },
  finalizedAt: "2026-01-29T11:30:01Z"
}
```

**Example (Rejection):**
```typescript
// Human reviewer rejects
const result = await review({
  submissionId: "sub_ghi789",
  decision: "rejected",
  reasons: ["Tax ID format is invalid", "W-9 signature is missing"],
  actor: { kind: "human", id: "reviewer_bob", name: "Bob Jones" }
});

// Response
{
  ok: true,
  submissionId: "sub_ghi789",
  state: "rejected",
  resumeToken: "rtok_v4_a4b5c6d7",
  version: 4,
  tokenExpiresAt: "2026-01-30T10:00:00Z",
  decision: "rejected",
  reviewedAt: "2026-01-29T11:35:00Z",
  reviewedBy: { kind: "human", id: "reviewer_bob", name: "Bob Jones" },
  reasons: ["Tax ID format is invalid", "W-9 signature is missing"]
}
```

### 4.8 `cancel`

Cancels a submission. Irreversible. Does not require a resume token (submissionId-based access).

**Input:**
```typescript
{
  submissionId: string;
  reason?: string;
  actor: Actor;
}
```

**Output (Success):**
```typescript
{
  ok: true;
  submissionId: string;
  state: "cancelled";
  resumeToken: string;             // Final resume token (no further operations allowed)
  version: number;                 // Incremented version
  tokenExpiresAt: string;
  cancelledAt: string;             // ISO 8601 timestamp
  cancelledBy: Actor;
  reason?: string;
}
```

**Example:**
```typescript
// Cancel a submission
const result = await cancel({
  submissionId: "sub_jkl012",
  reason: "Vendor decided not to proceed",
  actor: { kind: "human", id: "user_charlie", name: "Charlie Brown" }
});

// Response
{
  ok: true,
  submissionId: "sub_jkl012",
  state: "cancelled",
  resumeToken: "rtok_v3_b5c6d7e8",  // Final token (expired)
  version: 3,
  tokenExpiresAt: "2026-01-29T10:10:00Z",  // Immediately expired
  cancelledAt: "2026-01-29T10:10:00Z",
  cancelledBy: { kind: "human", id: "user_charlie", name: "Charlie Brown" },
  reason: "Vendor decided not to proceed"
}
```

### 4.9 `getSubmission`

Retrieves current submission state, fields, and metadata. Supports two access patterns:

1. **Submission ID-based access**: For actors with direct access (e.g., admins, creators)
2. **Resume token-based access**: For resuming work with just the resume token (e.g., agent handoff to human)

**Input (Submission ID-based):**
```typescript
{
  submissionId: string;
  actor: Actor;
}
```

**Input (Resume token-based):**
```typescript
{
  resumeToken: string;  // Access submission using only the resume token
}
```

**Output:**
```typescript
{
  ok: true;
  submissionId: string;
  intakeId: string;
  state: SubmissionState;
  resumeToken: string;             // Current resume token
  version: number;                 // Current version
  tokenExpiresAt: string;          // ISO 8601 timestamp
  fields: Record<string, unknown>; // Current field values
  schema: JSONSchema;              // The intake schema
  createdAt: string;
  updatedAt: string;
  createdBy: Actor;
  lastUpdatedBy: Actor;
  submittedAt?: string;
  finalizedAt?: string;
  expiresAt?: string;
  missingFields?: string[];        // Fields needed for submission
  validationErrors?: FieldError[];
}
```

**Example (Submission ID-based access):**
```typescript
// Get submission by ID (requires authorization)
const result = await getSubmission({
  submissionId: "sub_abc123",
  actor: { kind: "agent", id: "onboarding_bot" }
});

// Response
{
  ok: true,
  submissionId: "sub_abc123",
  intakeId: "intake_vendor_onboarding",
  state: "in_progress",
  resumeToken: "rtok_v4_d4e5f6g7",
  version: 4,
  tokenExpiresAt: "2026-01-30T10:00:00Z",
  fields: { legal_name: "Acme Corp", country: "US", /* ... */ },
  schema: { /* full JSON Schema */ },
  createdAt: "2026-01-29T10:00:00Z",
  updatedAt: "2026-01-29T10:04:30Z",
  createdBy: { kind: "agent", id: "onboarding_bot" },
  lastUpdatedBy: { kind: "agent", id: "onboarding_bot" },
  expiresAt: "2026-02-05T10:00:00Z",
  missingFields: []
}
```

**Example (Resume token-based access):**
```typescript
// Get submission using only resume token (e.g., human resuming agent's work)
// The resume token acts as a scoped access credential
const result = await getSubmission({
  resumeToken: "rtok_v4_d4e5f6g7"
});

// Response (same as above)
{
  ok: true,
  submissionId: "sub_abc123",  // Submission ID revealed via token
  intakeId: "intake_vendor_onboarding",
  state: "in_progress",
  resumeToken: "rtok_v4_d4e5f6g7",  // Same token (not rotated for read-only ops)
  version: 4,
  tokenExpiresAt: "2026-01-30T10:00:00Z",
  fields: { legal_name: "Acme Corp", country: "US", /* ... */ },
  schema: { /* full JSON Schema */ },
  createdAt: "2026-01-29T10:00:00Z",
  updatedAt: "2026-01-29T10:04:30Z",
  createdBy: { kind: "agent", id: "onboarding_bot" },
  lastUpdatedBy: { kind: "agent", id: "onboarding_bot" },
  expiresAt: "2026-02-05T10:00:00Z",
  missingFields: []
}
```

**Use Cases for Resume Token-based Access:**

1. **Agent-to-Human Handoff**: Agent generates a form link with embedded resume token
2. **Session Recovery**: User closes browser, returns later with token from email/bookmark
3. **Cross-Device**: Start on mobile, resume on desktop using the same token
4. **Delegated Access**: Share a token for limited-scope collaboration without sharing credentials

### 4.10 `getEvents`

Retrieves the event stream for a submission (see §6). Supports both submission ID-based and resume token-based access.

**Input (Submission ID-based):**
```typescript
{
  submissionId: string;
  afterEventId?: string;  // For pagination: get events after this ID
  limit?: number;         // Max events to return (default: 100)
  actor: Actor;
}
```

**Input (Resume token-based):**
```typescript
{
  resumeToken: string;    // Access using resume token
  afterEventId?: string;
  limit?: number;
}
```

**Output:**
```typescript
{
  ok: true;
  submissionId: string;
  events: IntakeEvent[];  // Array of events (see §6)
  hasMore: boolean;       // True if more events available
  nextEventId?: string;   // Use as afterEventId for next page
}
```

**Example:**
```typescript
// Get all events for a submission
const result = await getEvents({
  resumeToken: "rtok_v4_d4e5f6g7",
  limit: 50
});

// Response
{
  ok: true,
  submissionId: "sub_abc123",
  events: [
    {
      eventId: "evt_001",
      type: "submission.created",
      submissionId: "sub_abc123",
      ts: "2026-01-29T10:00:00Z",
      actor: { kind: "agent", id: "onboarding_bot" },
      state: "draft",
      payload: { intakeId: "intake_vendor_onboarding" }
    },
    {
      eventId: "evt_002",
      type: "field.updated",
      submissionId: "sub_abc123",
      ts: "2026-01-29T10:00:01Z",
      actor: { kind: "agent", id: "onboarding_bot" },
      state: "in_progress",
      payload: {
        fields: { legal_name: "Acme Corp", country: "US" },
        version: 1
      }
    },
    // ... more events
  ],
  hasMore: false
}
```

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

Every submission has a `resumeToken` — an opaque string that represents the current checkpoint and enables optimistic concurrency control.

#### 7.1.1 Token Format and Properties

Resume tokens are **opaque strings** with the following characteristics:

- **Format:** Implementation-defined (e.g., `rtok_a1b2c3d4e5f6`, UUID, or base64-encoded structure)
- **Opacity:** Clients MUST treat tokens as opaque. The internal structure is not part of the contract.
- **Uniqueness:** Each token uniquely identifies a specific version of a submission's state
- **Single-use:** Tokens are invalidated after the next state mutation
- **Scope:** Bound to a specific `submissionId`

**→ See also:** [RESUME_TOKENS_DESIGN.md §3](./RESUME_TOKENS_DESIGN.md#3-token-format-and-generation) for detailed token format specification, generation algorithms, and security considerations.

#### 7.1.2 Token Lifecycle

Resume tokens:

- Are returned on every successful operation and in every error response
- MUST be passed on subsequent mutating operations (`setFields`, `submit`, etc.)
- Are rotated on every state change — the server returns a new token, and the old token becomes stale
- Expire when the associated submission reaches a terminal state (`finalized`, `cancelled`, `expired`)

**→ See also:** [RESUME_TOKENS_DESIGN.md §2.2](./RESUME_TOKENS_DESIGN.md#22-token-lifecycle) for complete token lifecycle management including rotation strategies and expiration policies.

#### 7.1.3 Version and Concurrency Control (ETag Mechanism)

Resume tokens function as ETags for optimistic concurrency:

```typescript
// Operation 1: Agent sets fields
setFields({ submissionId: "sub_01", resumeToken: "rtok_v1", fields: {...} })
// → Returns { ok: true, resumeToken: "rtok_v2", ... }

// Operation 2: Concurrent update with stale token
setFields({ submissionId: "sub_01", resumeToken: "rtok_v1", fields: {...} })
// → Returns IntakeError { error: { type: "conflict", message: "Resume token is stale" } }
```

When a stale token is detected:
- The operation is rejected with `error.type = "conflict"`
- The response includes the current `resumeToken` so the caller can retry
- The caller MUST fetch the latest submission state before retrying

**→ See also:** [RESUME_TOKENS_DESIGN.md §4](./RESUME_TOKENS_DESIGN.md#4-optimistic-concurrency-control-and-versioning) for ETag-style versioning, conflict detection algorithms, and resolution patterns.

#### 7.1.4 Token Expiration Behavior

When a resume token is used after its associated submission has expired or been deleted:

**HTTP/JSON Binding:**
```http
PATCH /submissions/sub_01/fields
{
  "resumeToken": "rtok_expired",
  "fields": {...}
}

HTTP/1.1 410 Gone
Content-Type: application/json

{
  "ok": false,
  "submissionId": "sub_01",
  "state": "expired",
  "error": {
    "type": "expired",
    "message": "Submission has expired. Create a new submission to continue.",
    "retryable": false
  }
}
```

**MCP Tool Binding:**
Returns an error result with `type: "expired"` and `retryable: false`.

**→ See also:** [RESUME_TOKENS_DESIGN.md §5](./RESUME_TOKENS_DESIGN.md#5-token-storage-expiration-and-lifecycle-management) for storage architecture, TTL configuration, expiration behavior, and cleanup strategies.

#### 7.1.5 Multi-Actor Handoff

Resume tokens allow different actors to hand off work seamlessly:

```
Agent creates submission → gets resumeToken_1
Agent sets fields         → gets resumeToken_2
Agent generates form link → includes resumeToken_2 (or session binding)
Human opens form          → form loads from resumeToken_2
Human fills fields        → resumeToken_3 issued
Agent calls getSubmission → sees updated fields, gets resumeToken_3
Agent calls submit        → uses resumeToken_3
```

Each actor uses the latest token they received. The submission state remains consistent regardless of which actor performs the next operation.

**→ See also:** [RESUME_TOKENS_DESIGN.md §6](./RESUME_TOKENS_DESIGN.md#6-cross-actor-handoff-and-authentication-bypass) for detailed cross-actor handoff flows, authentication bypass rationale, and security best practices.

#### 7.1.6 Implementation Notes

For detailed design considerations, storage strategies, security requirements, and reference implementations, see:

**→** [`docs/RESUME_TOKENS_DESIGN.md`](./RESUME_TOKENS_DESIGN.md)

### 7.2 Handoff Flow

The handoff flow enables seamless collaboration between agents and humans. Resume tokens serve as checkpoints that any authorized actor can use to continue work from where another left off.

#### 7.2.1 Basic Handoff Sequence

```
Agent creates submission → gets resumeToken_1
Agent sets fields         → gets resumeToken_2
Agent generates form link → includes resumeToken_2 (or session binding)
Human opens form          → form loads from resumeToken_2
Human fills fields        → resumeToken_3
Agent calls getSubmission → sees updated fields, gets resumeToken_3
Agent calls submit        → uses resumeToken_3
```

#### 7.2.2 Step-by-Step Example with Token Passing

**Scenario:** Agent collects basic info, hands off to human for sensitive data (SSN, tax documents), then completes submission.

**Step 1: Agent Creates Submission**
```typescript
// Agent call
createSubmission({
  intakeId: "vendor_onboarding",
  actor: { kind: "agent", id: "onboarding_bot" },
  initialFields: {
    legal_name: "Acme Corp",
    country: "US"
  }
})

// Response
{
  ok: true,
  submissionId: "sub_a1b2c3",
  state: "in_progress",
  resumeToken: "rtok_v1_a1b2c3_ts1706529600",
  schema: { ... },
  missingFields: ["tax_id", "w9_form", "contact_email"]
}
```

**Step 2: Agent Sets Additional Fields**
```typescript
// Agent call (using token from step 1)
setFields({
  submissionId: "sub_a1b2c3",
  resumeToken: "rtok_v1_a1b2c3_ts1706529600",
  actor: { kind: "agent", id: "onboarding_bot" },
  fields: {
    contact_email: "finance@acme.corp"
  }
})

// Response (note new token)
{
  ok: true,
  submissionId: "sub_a1b2c3",
  state: "in_progress",
  resumeToken: "rtok_v2_a1b2c3_ts1706529601",
  updatedFields: ["contact_email"],
  missingFields: ["tax_id", "w9_form"]
}
```

**Step 3: Agent Generates Resume URL for Human**
```typescript
// Pattern for resume URL generation
const resumeUrl = `https://formbridge.app/resume/${submissionId}/${resumeToken}`;
// Example: https://formbridge.app/resume/sub_a1b2c3/rtok_v2_a1b2c3_ts1706529601

// Or with session binding (more secure for long-lived handoffs)
const sessionUrl = `https://formbridge.app/resume/${submissionId}?session=${sessionId}`;
// Server binds session to current resumeToken, rotates token on session operations
```

**Step 4: Human Opens Form and Fills Missing Fields**
```typescript
// Human opens URL, form loads current state using resumeToken
// Form UI makes update call:
setFields({
  submissionId: "sub_a1b2c3",
  resumeToken: "rtok_v2_a1b2c3_ts1706529601",
  actor: { kind: "human", id: "user_john", name: "John Doe" },
  fields: {
    tax_id: "12-3456789",
    w9_form: { uploadId: "upl_xyz", filename: "w9.pdf" }
  }
})

// Response (new token after human update)
{
  ok: true,
  submissionId: "sub_a1b2c3",
  state: "in_progress",
  resumeToken: "rtok_v3_a1b2c3_ts1706529700",
  updatedFields: ["tax_id", "w9_form"],
  missingFields: []
}
```

**Step 5: Agent Resumes and Completes Submission**
```typescript
// Agent polls or receives webhook notification that human completed their part
getSubmission({ submissionId: "sub_a1b2c3" })

// Response
{
  ok: true,
  submissionId: "sub_a1b2c3",
  state: "in_progress",
  resumeToken: "rtok_v3_a1b2c3_ts1706529700",
  fields: {
    legal_name: "Acme Corp",
    country: "US",
    contact_email: "finance@acme.corp",
    tax_id: "12-3456789",
    w9_form: { uploadId: "upl_xyz", filename: "w9.pdf" }
  },
  missingFields: []
}

// Agent validates and submits
submit({
  submissionId: "sub_a1b2c3",
  resumeToken: "rtok_v3_a1b2c3_ts1706529700",
  idempotencyKey: "idem_onboarding_bot_acme_final",
  actor: { kind: "agent", id: "onboarding_bot" }
})

// Response
{
  ok: true,
  submissionId: "sub_a1b2c3",
  state: "submitted",
  resumeToken: "rtok_v4_a1b2c3_ts1706529701"
}
```

#### 7.2.3 Version Rotation on Each Operation

Every mutating operation returns a **new** resume token. The previous token becomes stale immediately.

**Version Progression Example:**
```
Operation                           Token Returned              State
──────────────────────────────────────────────────────────────────────────────
createSubmission()                  rtok_v1_sub123_ts001        draft
setFields({ country: "US" })        rtok_v2_sub123_ts002        in_progress
setFields({ legal_name: "Acme" })   rtok_v3_sub123_ts003        in_progress
requestUpload("w9_form", ...)       rtok_v4_sub123_ts004        awaiting_upload
confirmUpload(uploadId)             rtok_v5_sub123_ts005        in_progress
submit()                            rtok_v6_sub123_ts006        submitted
review({ decision: "approved" })    rtok_v7_sub123_ts007        approved
[delivery succeeds]                 rtok_v8_sub123_ts008        finalized
```

**Why Rotation Matters:**
- Prevents race conditions when multiple actors access the same submission
- Each actor must use the latest token they received
- Stale tokens are rejected with `conflict` error, forcing caller to fetch latest state

#### 7.2.4 Conflict Detection Example

**Scenario:** Agent and human both try to update the same submission concurrently.

**Initial State:**
- Submission `sub_abc` is at `rtok_v5`
- Agent has `rtok_v5`
- Human has `rtok_v5` (loaded the form a minute ago)

**Timeline:**

```
T1: Agent calls setFields with rtok_v5 → succeeds, returns rtok_v6
T2: Human calls setFields with rtok_v5 → CONFLICT (token is stale)
```

**Human's Request (T2):**
```typescript
setFields({
  submissionId: "sub_abc",
  resumeToken: "rtok_v5",  // ← This is now stale
  actor: { kind: "human", id: "user_jane" },
  fields: { contact_email: "jane@example.com" }
})
```

**Error Response:**
```typescript
{
  ok: false,
  submissionId: "sub_abc",
  state: "in_progress",
  resumeToken: "rtok_v6",  // ← The current valid token
  error: {
    type: "conflict",
    message: "Resume token is stale. Another actor has modified this submission.",
    retryable: true,
    nextActions: [
      {
        action: "fetch_current_state",
        hint: "Call getSubmission() to retrieve the latest state and resumeToken, then retry your operation."
      }
    ]
  }
}
```

**Human's Recovery:**
```typescript
// Step 1: Fetch current state
const current = await getSubmission({ submissionId: "sub_abc" });
// Returns: { resumeToken: "rtok_v6", fields: { ... agent's changes ... } }

// Step 2: Merge changes (application logic)
const mergedFields = {
  ...current.fields,
  contact_email: "jane@example.com"  // Human's intended change
};

// Step 3: Retry with current token
setFields({
  submissionId: "sub_abc",
  resumeToken: "rtok_v6",  // ← Now using the current token
  actor: { kind: "human", id: "user_jane" },
  fields: { contact_email: "jane@example.com" }
})
// → Succeeds, returns rtok_v7
```

#### 7.2.5 Resume URL Generation Patterns

**Pattern 1: Direct Token Embedding (Simple, Short-Lived)**
```typescript
// Best for: Immediate handoffs (agent → human within minutes)
const resumeUrl = `${baseUrl}/resume/${submissionId}/${resumeToken}`;
// Example: https://formbridge.app/resume/sub_123/rtok_v2_123_ts001

// Security: Token visible in URL, short TTL recommended
// Expiration: Token expires when submission state changes or reaches terminal state
```

**Pattern 2: Session Binding (Secure, Long-Lived)**
```typescript
// Best for: Email links, async handoffs, multi-day workflows
// Step 1: Create a session that binds to current resumeToken
const session = await createResumeSession({
  submissionId: "sub_123",
  resumeToken: "rtok_v2_123_ts001",
  expiresInMs: 86400000,  // 24 hours
  allowedActors: [{ kind: "human", id: "user_jane" }]
});

// Step 2: Generate URL with session ID (not token)
const resumeUrl = `${baseUrl}/resume/${submissionId}?session=${session.id}`;
// Example: https://formbridge.app/resume/sub_123?session=sess_abc123

// Security: Token not in URL; session validates actor and proxies to current token
// Expiration: Session has independent TTL; survives token rotations
```

**Pattern 3: Magic Link with OTP (Highest Security)**
```typescript
// Best for: Sensitive data, compliance workflows, email-only access
// Step 1: Generate magic link with short-lived OTP
const magicLink = await createMagicLink({
  submissionId: "sub_123",
  resumeToken: "rtok_v2_123_ts001",
  recipientEmail: "jane@example.com",
  expiresInMs: 600000  // 10 minutes
});

// Step 2: Send email with link
const resumeUrl = `${baseUrl}/resume/${submissionId}?code=${magicLink.code}`;
// Example: https://formbridge.app/resume/sub_123?code=1a2b3c

// Step 3: User clicks link, enters email to verify
// Server validates email + code, issues session bound to resumeToken

// Security: Code single-use, email verification required
// Expiration: Code expires quickly; session created after verification
```

**Pattern 4: QR Code for In-Person Handoff**
```typescript
// Best for: Kiosk, in-person onboarding, device-to-device transfer
const qrData = {
  type: "formbridge_resume",
  submissionId: "sub_123",
  resumeToken: "rtok_v2_123_ts001",
  intakeId: "vendor_onboarding",
  expiresAt: "2026-01-29T12:00:00Z"
};

// Generate QR code encoding JSON
const qrCode = generateQRCode(JSON.stringify(qrData));

// Scanning device reconstructs URL or directly resumes via API
const resumeUrl = `${baseUrl}/resume/${qrData.submissionId}/${qrData.resumeToken}`;
```

**Comparison Table:**

| Pattern | Security | TTL | Use Case |
|---|---|---|---|
| Direct Token | Low | Short (minutes) | Immediate agent→human handoff, same session |
| Session Binding | Medium | Long (hours/days) | Email links, async workflows |
| Magic Link + OTP | High | Very short code + long session | Sensitive data, compliance, verified access |
| QR Code | Medium | Short (minutes) | In-person, kiosk, device-to-device |

**Implementation Recommendation:**
- Default to **Session Binding** for most handoffs
- Use **Magic Link + OTP** when handling PII, financial data, or regulatory requirements
- Use **Direct Token** only for real-time agent→human handoffs within the same session context

**→ See also:** [RESUME_TOKENS_DESIGN.md §6.4](./RESUME_TOKENS_DESIGN.md#64-cross-actor-handoff-flows) and [§6.5](./RESUME_TOKENS_DESIGN.md#65-url-generation-for-human-access) for detailed handoff implementation patterns, URL generation strategies, and security considerations.

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

#### 12.1.1 Submission ID-Based Endpoints

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

#### 12.1.2 Resume Token-Based Endpoints

Resume tokens enable stateless access to submissions without requiring submission IDs. These endpoints support agent-to-human handoffs and session recovery.

```
GET    /resume/{resumeToken}                     → getSubmission (by token)
PATCH  /resume/{resumeToken}                     → setFields (by token)
POST   /resume/{resumeToken}/validate            → validate (by token)
POST   /resume/{resumeToken}/submit              → submit (by token)
GET    /resume/{resumeToken}/events              → getEvents (by token)
```

**Access Pattern:**
- Resume token-based endpoints do not require authentication beyond the token itself
- The token acts as a scoped credential granting access to a specific submission
- Tokens expire per `tokenExpiresAt` timestamp in the submission record

**→ See also:** [RESUME_TOKENS_DESIGN.md §7](./RESUME_TOKENS_DESIGN.md#7-http-api-bindings) for complete HTTP API binding specification including error responses and CORS configuration.

**Example Usage:**
```http
GET /resume/rtok_v4_d4e5f6g7 HTTP/1.1
Host: api.formbridge.app

HTTP/1.1 200 OK
Content-Type: application/json

{
  "ok": true,
  "submissionId": "sub_abc123",
  "intakeId": "intake_vendor_onboarding",
  "state": "in_progress",
  "resumeToken": "rtok_v4_d4e5f6g7",
  "version": 4,
  "tokenExpiresAt": "2026-01-30T10:00:00Z",
  "fields": { "legal_name": "Acme Corp", "country": "US" },
  "schema": { /* ... */ }
}
```

#### 12.1.3 Concurrency Control Headers

All mutating operations (PATCH, POST, DELETE) support optimistic concurrency control via resume tokens and optional version headers.

**Request Headers:**

- **`If-Match: {resumeToken}`** — Required for all mutating operations. Ensures the operation applies to the expected state.
- **`X-Intake-Version: {version}`** — Optional. If provided, server validates that the submission is at this exact version number before applying the mutation.

**Response Headers:**

- **`ETag: {resumeToken}`** — The new resume token after a successful mutation (or current token for read-only operations)
- **`X-Intake-Version: {version}`** — Current version number after the operation

**Example (Successful Update):**
```http
PATCH /submissions/sub_abc123/fields HTTP/1.1
Host: api.formbridge.app
Content-Type: application/json
If-Match: rtok_v4_d4e5f6g7
X-Intake-Version: 4

{
  "fields": {
    "tax_id": "12-3456789"
  },
  "actor": { "kind": "agent", "id": "onboarding_bot" }
}

HTTP/1.1 200 OK
Content-Type: application/json
ETag: rtok_v5_e5f6g7h8
X-Intake-Version: 5

{
  "ok": true,
  "submissionId": "sub_abc123",
  "state": "in_progress",
  "resumeToken": "rtok_v5_e5f6g7h8",
  "version": 5,
  "tokenExpiresAt": "2026-01-30T10:00:00Z",
  "fields": {
    "legal_name": "Acme Corp",
    "country": "US",
    "tax_id": "12-3456789"
  }
}
```

**Example (Token Conflict):**
```http
PATCH /submissions/sub_abc123/fields HTTP/1.1
Host: api.formbridge.app
Content-Type: application/json
If-Match: rtok_v3_c3d4e5f6

{
  "fields": { "country": "CA" },
  "actor": { "kind": "agent", "id": "onboarding_bot" }
}

HTTP/1.1 409 Conflict
Content-Type: application/json
ETag: rtok_v5_e5f6g7h8
X-Intake-Version: 5

{
  "ok": false,
  "submissionId": "sub_abc123",
  "state": "in_progress",
  "resumeToken": "rtok_v5_e5f6g7h8",
  "version": 5,
  "error": {
    "type": "token_conflict",
    "message": "Resume token is stale. The submission was modified by another actor.",
    "retryable": true,
    "nextActions": [
      {
        "action": "fetch_current_state",
        "hint": "Call getSubmission() to retrieve version 5, merge your changes, and retry with rtok_v5_e5f6g7h8."
      }
    ]
  }
}
```

**Example (Token Expired):**
```http
PATCH /submissions/sub_abc123/fields HTTP/1.1
Host: api.formbridge.app
Content-Type: application/json
If-Match: rtok_v2_expired

{
  "fields": { "legal_name": "Acme Corp" },
  "actor": { "kind": "agent", "id": "onboarding_bot" }
}

HTTP/1.1 410 Gone
Content-Type: application/json
ETag: rtok_v5_current
X-Intake-Version: 5

{
  "ok": false,
  "submissionId": "sub_abc123",
  "state": "in_progress",
  "resumeToken": "rtok_v5_current",
  "version": 5,
  "error": {
    "type": "token_expired",
    "message": "Resume token has expired. Fetch the latest submission state to continue.",
    "retryable": false,
    "nextActions": [
      {
        "action": "fetch_current_state",
        "hint": "Call getSubmission() to retrieve the current resumeToken and retry."
      }
    ]
  }
}
```

#### 12.1.4 Status Codes

| Code | Meaning | Used When |
|---|---|---|
| `200 OK` | Success | Operation completed successfully |
| `201 Created` | Created | `createSubmission` succeeded |
| `400 Bad Request` | Invalid input | Malformed request, invalid token format |
| `404 Not Found` | Not found | Submission or resource doesn't exist |
| `409 Conflict` | Token conflict | Resume token is stale (another operation updated state) |
| `410 Gone` | Expired | Resume token or submission has expired |
| `422 Unprocessable Entity` | Validation failed | Field validation errors (see `IntakeError`) |

### 12.2 MCP Tool Binding

Each intake definition registers MCP tools with resume token support.

#### 12.2.1 Tool Definitions

```
formbridge_{intakeId}_create    → createSubmission
formbridge_{intakeId}_set       → setFields
formbridge_{intakeId}_validate  → validate
formbridge_{intakeId}_upload    → requestUpload
formbridge_{intakeId}_submit    → submit
formbridge_{intakeId}_status    → getSubmission
formbridge_{intakeId}_events    → getEvents
```

The tool input schemas are derived from the intake definition's JSON Schema, so agents discover fields through standard MCP `tools/list`.

#### 12.2.2 Resume Token Parameters

All MCP tools accept resume tokens for stateless access and concurrency control.

**Read-Only Tools** (`validate`, `status`, `events`):
```typescript
{
  // Option 1: Access by submission ID
  submissionId: string;
  actor: Actor;

  // Option 2: Access by resume token
  resumeToken: string;
}
```

**Mutating Tools** (`create`, `set`, `upload`, `submit`):
```typescript
{
  // Resume token (required for all operations except create)
  resumeToken: string;

  // Optional: version for double-checking
  version?: number;

  // Operation-specific fields
  fields?: Record<string, unknown>;
  actor: Actor;
  // ... other parameters
}
```

**Tool Input Schema Example** (`formbridge_vendor_onboarding_set`):
```json
{
  "type": "object",
  "properties": {
    "resumeToken": {
      "type": "string",
      "description": "Current resume token for optimistic concurrency control"
    },
    "version": {
      "type": "number",
      "description": "Optional: current version number for additional conflict detection"
    },
    "fields": {
      "type": "object",
      "description": "Fields to set or update",
      "properties": {
        "legal_name": { "type": "string" },
        "country": { "type": "string" },
        "tax_id": { "type": "string" }
      }
    },
    "actor": {
      "type": "object",
      "required": ["kind", "id"],
      "properties": {
        "kind": { "enum": ["agent", "human", "system"] },
        "id": { "type": "string" },
        "name": { "type": "string" }
      }
    }
  },
  "required": ["resumeToken", "fields", "actor"]
}
```

**Tool Output Schema** (All tools):
```json
{
  "type": "object",
  "properties": {
    "ok": { "type": "boolean" },
    "submissionId": { "type": "string" },
    "state": { "type": "string" },
    "resumeToken": { "type": "string" },
    "version": { "type": "number" },
    "tokenExpiresAt": { "type": "string", "format": "date-time" },
    "error": {
      "type": "object",
      "description": "Present if ok=false"
    }
  }
}
```

#### 12.2.3 Example MCP Tool Calls

**Create Submission:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "formbridge_vendor_onboarding_create",
    "arguments": {
      "intakeId": "intake_vendor_onboarding",
      "actor": { "kind": "agent", "id": "onboarding_bot" },
      "initialFields": {
        "legal_name": "Acme Corp",
        "country": "US"
      }
    }
  }
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"ok\":true,\"submissionId\":\"sub_abc123\",\"state\":\"in_progress\",\"resumeToken\":\"rtok_v1_a1b2c3d4\",\"version\":1,\"tokenExpiresAt\":\"2026-01-30T10:00:00Z\",\"fields\":{\"legal_name\":\"Acme Corp\",\"country\":\"US\"},\"missingFields\":[\"tax_id\",\"w9_document\"]}"
    }
  ]
}
```

**Set Fields (with resume token):**
```json
{
  "method": "tools/call",
  "params": {
    "name": "formbridge_vendor_onboarding_set",
    "arguments": {
      "resumeToken": "rtok_v1_a1b2c3d4",
      "version": 1,
      "fields": {
        "tax_id": "12-3456789"
      },
      "actor": { "kind": "agent", "id": "onboarding_bot" }
    }
  }
}
```

**Response (Success):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"ok\":true,\"submissionId\":\"sub_abc123\",\"state\":\"in_progress\",\"resumeToken\":\"rtok_v2_b2c3d4e5\",\"version\":2,\"tokenExpiresAt\":\"2026-01-30T10:00:00Z\",\"fields\":{\"legal_name\":\"Acme Corp\",\"country\":\"US\",\"tax_id\":\"12-3456789\"},\"missingFields\":[\"w9_document\"]}"
    }
  ]
}
```

**Response (Token Conflict):**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"ok\":false,\"submissionId\":\"sub_abc123\",\"state\":\"in_progress\",\"resumeToken\":\"rtok_v3_c3d4e5f6\",\"version\":3,\"error\":{\"type\":\"token_conflict\",\"message\":\"Resume token is stale. The submission was modified by another actor.\",\"retryable\":true,\"nextActions\":[{\"action\":\"fetch_current_state\",\"hint\":\"Call getSubmission() to retrieve version 3, merge your changes, and retry with rtok_v3_c3d4e5f6.\"}]}}"
    }
  ],
  "isError": true
}
```

**Get Submission by Resume Token:**
```json
{
  "method": "tools/call",
  "params": {
    "name": "formbridge_vendor_onboarding_status",
    "arguments": {
      "resumeToken": "rtok_v2_b2c3d4e5"
    }
  }
}
```

**Response:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"ok\":true,\"submissionId\":\"sub_abc123\",\"intakeId\":\"intake_vendor_onboarding\",\"state\":\"in_progress\",\"resumeToken\":\"rtok_v2_b2c3d4e5\",\"version\":2,\"tokenExpiresAt\":\"2026-01-30T10:00:00Z\",\"fields\":{\"legal_name\":\"Acme Corp\",\"country\":\"US\",\"tax_id\":\"12-3456789\"},\"schema\":{},\"missingFields\":[\"w9_document\"]}"
    }
  ]
}
```

**→ See also:** [RESUME_TOKENS_DESIGN.md §8](./RESUME_TOKENS_DESIGN.md#8-mcp-integration) for complete MCP integration specification including tool parameter bindings and error handling.

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
