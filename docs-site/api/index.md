# API Reference

FormBridge exposes a RESTful HTTP API built on [Hono](https://hono.dev/).

## Base URL

All endpoints are relative to your deployment URL. When running locally:

```
http://localhost:3000
```

## Authentication

Authentication is optional and configurable. When enabled, include a Bearer token in the `Authorization` header:

```
Authorization: Bearer fb_key_your_api_key
```

Requests without a valid token receive a `401 Unauthorized` response.

## Content Type

All requests and responses use `application/json` unless otherwise noted (e.g. JSONL event exports use `application/x-ndjson`).

## Actor Object

Many endpoints require an `actor` field identifying who is performing the action:

```json
{
  "kind": "agent",
  "id": "onboarding-bot",
  "name": "Onboarding Bot"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `kind` | string | Yes | One of `"agent"`, `"human"`, or `"system"` |
| `id` | string | Yes | Unique identifier for this actor |
| `name` | string | No | Human-readable display name |
| `metadata` | object | No | Arbitrary key-value metadata |

## Common Response Formats

### Success

Successful mutation responses include `ok: true` along with resource-specific fields:

```json
{
  "ok": true,
  "submissionId": "sub_abc123",
  "state": "draft",
  "resumeToken": "rt_xyz789"
}
```

### Error

Error responses include a structured error envelope:

```json
{
  "ok": false,
  "error": {
    "type": "not_found",
    "message": "Submission sub_abc123 not found",
    "retryable": false
  }
}
```

### Error Types

| Error Type | HTTP Status | Description |
|-----------|-------------|-------------|
| `not_found` | 404 | Resource does not exist |
| `invalid_request` | 400 | Malformed request body or missing required fields |
| `invalid_resume_token` | 400 | Resume token does not match current token |
| `validation_error` | 400 | Schema validation failed (includes `fields` array) |
| `invalid_state` | 409 | Operation not allowed in current submission state |
| `needs_approval` | 202 | Submission requires reviewer approval before proceeding |
| `internal_error` | 500 | Unexpected server error |
| `storage_error` | 500 | File storage backend error |

### Validation Error Details

When a validation error occurs, the response includes field-level details:

```json
{
  "ok": false,
  "error": {
    "type": "validation_error",
    "message": "Validation failed",
    "retryable": false,
    "fields": [
      {
        "field": "email",
        "message": "Invalid email format",
        "type": "invalid_format",
        "path": "email"
      }
    ],
    "nextActions": [
      {
        "type": "fill_field",
        "field": "email",
        "hint": "Provide a valid email address"
      }
    ]
  }
}
```

## Health Check

### `GET /health`

Returns server health status.

**Response:**

```json
{
  "ok": true,
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

## Intake Schema

### `GET /intake/:intakeId/schema`

Returns the JSON Schema for an intake definition.

**Response:**

```json
{
  "ok": true,
  "intakeId": "vendor-onboarding",
  "schema": {
    "type": "object",
    "properties": {
      "companyName": { "type": "string" },
      "taxId": { "type": "string", "pattern": "^\\d{2}-\\d{7}$" }
    },
    "required": ["companyName", "taxId"]
  }
}
```

| Status | Description |
|--------|-------------|
| 200 | Schema returned |
| 404 | Intake not found |
