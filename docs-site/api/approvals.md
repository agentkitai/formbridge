# Approvals API

Approval endpoints manage the review workflow for submissions with [approval gates](/guide/concepts#approval-gates). All actions require the submission to be in `needs_review` state and a valid `resumeToken`.

## Approve Submission

`POST /submissions/:submissionId/approve`

Approves a submission, transitioning it from `needs_review` to `approved`. Emits a `review.approved` event.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `resumeToken` | string | Yes | Current resume token |
| `actor` | [Actor](/api/#actor-object) | No | The reviewer approving (defaults to system actor) |
| `comment` | string | No | Optional approval comment |

```json
{
  "resumeToken": "rt_xyz789",
  "actor": { "kind": "human", "id": "reviewer@acme.com" },
  "comment": "All compliance checks passed"
}
```

### Response

```json
{
  "ok": true,
  "submissionId": "sub_abc123",
  "state": "approved",
  "resumeToken": "rt_new_token"
}
```

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Submission approved |
| 400 | Invalid request or resume token |
| 403 | Resume token mismatch |
| 404 | Submission not found |
| 409 | Submission not in `needs_review` state |

### curl Example

```bash
curl -X POST http://localhost:3000/submissions/sub_abc123/approve \
  -H "Content-Type: application/json" \
  -d '{
    "resumeToken": "rt_xyz789",
    "actor": { "kind": "human", "id": "reviewer@acme.com" },
    "comment": "Approved"
  }'
```

---

## Reject Submission

`POST /submissions/:submissionId/reject`

Rejects a submission, transitioning it from `needs_review` to `rejected` (terminal state). Emits a `review.rejected` event.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `resumeToken` | string | Yes | Current resume token |
| `actor` | [Actor](/api/#actor-object) | No | The reviewer rejecting |
| `reason` | string | Yes | Reason for rejection |
| `comment` | string | No | Additional comment |

```json
{
  "resumeToken": "rt_xyz789",
  "actor": { "kind": "human", "id": "reviewer@acme.com" },
  "reason": "Missing required W-9 documentation",
  "comment": "Please resubmit with tax forms"
}
```

### Response

```json
{
  "ok": true,
  "submissionId": "sub_abc123",
  "state": "rejected",
  "resumeToken": "rt_new_token"
}
```

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Submission rejected |
| 400 | Invalid request, missing reason, or invalid resume token |
| 403 | Resume token mismatch |
| 404 | Submission not found |
| 409 | Submission not in `needs_review` state |

### curl Example

```bash
curl -X POST http://localhost:3000/submissions/sub_abc123/reject \
  -H "Content-Type: application/json" \
  -d '{
    "resumeToken": "rt_xyz789",
    "actor": { "kind": "human", "id": "reviewer@acme.com" },
    "reason": "Incomplete information"
  }'
```

---

## Request Changes

`POST /submissions/:submissionId/request-changes`

Sends the submission back to `draft` state with field-level comments for the submitter to address. Emits a `field.updated` event with action `request_changes`.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `resumeToken` | string | Yes | Current resume token |
| `actor` | [Actor](/api/#actor-object) | No | The reviewer requesting changes |
| `fieldComments` | FieldComment[] | Yes | Field-level review comments |
| `comment` | string | No | Overall comment |

**FieldComment object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fieldPath` | string | Yes | Dot-notation path to the field (e.g. `"address.city"`) |
| `comment` | string | Yes | Reviewer's comment about this field |
| `suggestedValue` | any | No | Suggested replacement value |

```json
{
  "resumeToken": "rt_xyz789",
  "actor": { "kind": "human", "id": "reviewer@acme.com" },
  "fieldComments": [
    {
      "fieldPath": "taxId",
      "comment": "Format should be XX-XXXXXXX",
      "suggestedValue": "12-3456789"
    },
    {
      "fieldPath": "address",
      "comment": "Please provide full street address"
    }
  ],
  "comment": "A couple fields need corrections before approval"
}
```

### Response

```json
{
  "ok": true,
  "submissionId": "sub_abc123",
  "state": "draft",
  "resumeToken": "rt_new_token"
}
```

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Changes requested, submission returned to draft |
| 400 | Invalid request, missing fieldComments, or invalid resume token |
| 403 | Resume token mismatch |
| 404 | Submission not found |
| 409 | Submission not in `needs_review` state |

### curl Example

```bash
curl -X POST http://localhost:3000/submissions/sub_abc123/request-changes \
  -H "Content-Type: application/json" \
  -d '{
    "resumeToken": "rt_xyz789",
    "actor": { "kind": "human", "id": "reviewer@acme.com" },
    "fieldComments": [
      { "fieldPath": "taxId", "comment": "Invalid format" }
    ]
  }'
```
