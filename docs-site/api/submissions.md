# Submissions API

## Create Submission

`POST /intake/:intakeId/submissions`

Creates a new submission for the specified intake in `draft` state.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `actor` | [Actor](/api/#actor-object) | Yes | The actor creating the submission |
| `initialFields` | object | No | Initial field values to populate |
| `idempotencyKey` | string | No | Deduplication key — if a submission already exists with this key for this intake, it is returned instead |

```json
{
  "actor": { "kind": "agent", "id": "onboarding-bot" },
  "initialFields": {
    "companyName": "Acme Corp",
    "contactEmail": "alice@acme.com"
  },
  "idempotencyKey": "session-abc-attempt-1"
}
```

### Response

```json
{
  "ok": true,
  "submissionId": "sub_abc123",
  "state": "draft",
  "resumeToken": "rt_xyz789",
  "fields": {
    "companyName": "Acme Corp",
    "contactEmail": "alice@acme.com"
  },
  "fieldAttribution": {
    "companyName": { "kind": "agent", "id": "onboarding-bot" },
    "contactEmail": { "kind": "agent", "id": "onboarding-bot" }
  }
}
```

### Status Codes

| Status | Description |
|--------|-------------|
| 201 | Submission created |
| 200 | Existing submission returned (idempotency key match) |
| 400 | Invalid request body |
| 404 | Intake not found |

### curl Example

```bash
curl -X POST http://localhost:3000/intake/vendor-onboarding/submissions \
  -H "Content-Type: application/json" \
  -d '{
    "actor": { "kind": "agent", "id": "bot-1" },
    "initialFields": { "companyName": "Acme Corp" }
  }'
```

---

## Get Submission

`GET /intake/:intakeId/submissions/:submissionId`

Returns the full submission including fields, attribution, events, and deliveries.

### Response

```json
{
  "id": "sub_abc123",
  "intakeId": "vendor-onboarding",
  "state": "in_progress",
  "resumeToken": "rt_xyz789",
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-01-15T10:30:00Z",
  "fields": { "companyName": "Acme Corp" },
  "fieldAttribution": {
    "companyName": { "kind": "agent", "id": "bot-1" }
  },
  "createdBy": { "kind": "agent", "id": "bot-1" },
  "events": [],
  "deliveries": []
}
```

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Submission returned |
| 404 | Submission or intake not found |

### curl Example

```bash
curl http://localhost:3000/intake/vendor-onboarding/submissions/sub_abc123
```

---

## Update Fields

`PATCH /intake/:intakeId/submissions/:submissionId`

Updates one or more fields on a submission. Transitions `draft` to `in_progress` on first field update. Rotates the resume token.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `resumeToken` | string | Yes | Current resume token |
| `actor` | [Actor](/api/#actor-object) | Yes | The actor setting the fields |
| `fields` | object | Yes | Field values to set or update |

```json
{
  "resumeToken": "rt_xyz789",
  "actor": { "kind": "human", "id": "alice@acme.com" },
  "fields": {
    "taxId": "12-3456789",
    "address": "123 Main St"
  }
}
```

### Response

```json
{
  "ok": true,
  "submissionId": "sub_abc123",
  "state": "in_progress",
  "resumeToken": "rt_new_token",
  "fields": {
    "companyName": "Acme Corp",
    "taxId": "12-3456789",
    "address": "123 Main St"
  },
  "fieldAttribution": {
    "companyName": { "kind": "agent", "id": "bot-1" },
    "taxId": { "kind": "human", "id": "alice@acme.com" },
    "address": { "kind": "human", "id": "alice@acme.com" }
  }
}
```

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Fields updated |
| 400 | Invalid request, invalid resume token, or reserved field name |
| 404 | Submission not found |
| 409 | Submission in a terminal state |

### curl Example

```bash
curl -X PATCH http://localhost:3000/intake/vendor-onboarding/submissions/sub_abc123 \
  -H "Content-Type: application/json" \
  -d '{
    "resumeToken": "rt_xyz789",
    "actor": { "kind": "human", "id": "alice@acme.com" },
    "fields": { "taxId": "12-3456789" }
  }'
```

---

## Submit

`POST /intake/:intakeId/submissions/:submissionId/submit`

Submits a submission for processing. If the intake has approval gates, the submission transitions to `needs_review` and returns a `202` with error type `needs_approval`. Otherwise it transitions to `submitted`.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `resumeToken` | string | Yes | Current resume token |
| `actor` | [Actor](/api/#actor-object) | Yes | The actor submitting |
| `idempotencyKey` | string | No | Deduplication key for the submit operation |

```json
{
  "resumeToken": "rt_xyz789",
  "actor": { "kind": "human", "id": "alice@acme.com" }
}
```

### Response (no approval gates)

```json
{
  "ok": true,
  "submissionId": "sub_abc123",
  "state": "submitted",
  "resumeToken": "rt_new_token"
}
```

### Response (with approval gates — 202)

```json
{
  "ok": false,
  "submissionId": "sub_abc123",
  "state": "needs_review",
  "resumeToken": "rt_new_token",
  "error": {
    "type": "needs_approval",
    "message": "Submission requires approval before processing",
    "retryable": false
  }
}
```

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Submitted for processing |
| 202 | Submission requires approval (transitioned to `needs_review`) |
| 400 | Invalid request or resume token |
| 404 | Submission not found |
| 409 | Invalid state transition |

### curl Example

```bash
curl -X POST http://localhost:3000/intake/vendor-onboarding/submissions/sub_abc123/submit \
  -H "Content-Type: application/json" \
  -d '{
    "resumeToken": "rt_xyz789",
    "actor": { "kind": "human", "id": "alice@acme.com" }
  }'
```

---

## Generate Handoff URL

`POST /submissions/:submissionId/handoff`

Generates a resume URL for agent-to-human handoff. Emits a `handoff.link_issued` event.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `actor` | [Actor](/api/#actor-object) | No | The actor requesting the handoff |

```json
{
  "actor": { "kind": "agent", "id": "onboarding-bot" }
}
```

### Response

```json
{
  "resumeUrl": "http://localhost:3000/resume?token=rt_xyz789",
  "submissionId": "sub_abc123",
  "resumeToken": "rt_xyz789"
}
```

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Handoff URL generated |
| 400 | Invalid request |
| 404 | Submission not found |

### curl Example

```bash
curl -X POST http://localhost:3000/submissions/sub_abc123/handoff \
  -H "Content-Type: application/json" \
  -d '{ "actor": { "kind": "agent", "id": "bot-1" } }'
```

---

## Resume by Token

`GET /submissions/resume/:resumeToken`

Fetches a submission using its resume token. Used by the form renderer to load the submission for human completion.

### Response

```json
{
  "id": "sub_abc123",
  "intakeId": "vendor-onboarding",
  "state": "in_progress",
  "fields": {
    "companyName": "Acme Corp"
  },
  "fieldAttribution": {
    "companyName": { "kind": "agent", "id": "bot-1" }
  },
  "expiresAt": "2025-01-16T10:00:00Z",
  "schema": {
    "type": "object",
    "properties": { "companyName": { "type": "string" } }
  }
}
```

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Submission returned |
| 400 | Invalid token format |
| 403 | Submission has expired |
| 404 | No submission found for this token |

### curl Example

```bash
curl http://localhost:3000/submissions/resume/rt_xyz789
```

---

## Mark as Resumed

`POST /submissions/resume/:resumeToken/resumed`

Records that a human has opened a resume URL. Emits a `handoff.resumed` event.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `actor` | [Actor](/api/#actor-object) | No | The human who resumed the submission |

```json
{
  "actor": { "kind": "human", "id": "alice@acme.com" }
}
```

### Response

```json
{
  "ok": true,
  "eventId": "evt_k7x9m2"
}
```

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Resumed event recorded |
| 400 | Invalid token format |
| 403 | Submission has expired |
| 404 | No submission found for this token |

### curl Example

```bash
curl -X POST http://localhost:3000/submissions/resume/rt_xyz789/resumed \
  -H "Content-Type: application/json" \
  -d '{ "actor": { "kind": "human", "id": "alice@acme.com" } }'
```
