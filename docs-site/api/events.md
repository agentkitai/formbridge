# Events API

The events API provides access to the immutable [event stream](/guide/concepts#event-stream) for each submission. Events record every action with actor attribution and are the source of truth for submission history.

## Get Events

`GET /submissions/:submissionId/events`

Returns the event stream for a submission with optional filtering and pagination.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | string | — | Comma-separated event types to include (e.g. `"field.updated,submission.submitted"`) |
| `actorKind` | string | — | Filter by actor kind: `agent`, `human`, or `system` |
| `since` | string | — | ISO 8601 timestamp — only return events after this time |
| `until` | string | — | ISO 8601 timestamp — only return events before this time |
| `limit` | number | 100 | Maximum number of events to return |
| `offset` | number | 0 | Number of events to skip (for pagination) |

### Response

```json
{
  "submissionId": "sub_abc123",
  "events": [
    {
      "eventId": "evt_001",
      "type": "submission.created",
      "submissionId": "sub_abc123",
      "ts": "2025-01-15T10:00:00Z",
      "actor": { "kind": "agent", "id": "bot-1" },
      "state": "draft",
      "version": 1,
      "payload": {}
    },
    {
      "eventId": "evt_002",
      "type": "field.updated",
      "submissionId": "sub_abc123",
      "ts": "2025-01-15T10:05:00Z",
      "actor": { "kind": "agent", "id": "bot-1" },
      "state": "in_progress",
      "version": 2,
      "payload": {
        "diffs": [
          { "fieldPath": "companyName", "previousValue": null, "newValue": "Acme Corp" }
        ]
      }
    }
  ],
  "pagination": {
    "offset": 0,
    "limit": 100,
    "total": 2,
    "hasMore": false
  }
}
```

### Event Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `eventId` | string | Unique event identifier |
| `type` | string | [Event type](/guide/concepts#event-types) |
| `submissionId` | string | Submission this event belongs to |
| `ts` | string | ISO 8601 timestamp |
| `actor` | object | Actor who triggered the event (`kind`, `id`, `name?`) |
| `state` | string | Submission state at the time of this event |
| `version` | number | Monotonically increasing version number |
| `payload` | object | Event-specific data (field diffs, reasons, etc.) |

::: info
Resume tokens are automatically redacted from event payloads for security. The `payload` field will never contain raw token values.
:::

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Events returned |
| 400 | Invalid query parameters |
| 404 | Submission not found |

### curl Examples

```bash
# Get all events
curl http://localhost:3000/submissions/sub_abc123/events

# Filter by event type
curl "http://localhost:3000/submissions/sub_abc123/events?type=field.updated,submission.submitted"

# Filter by actor kind and time range
curl "http://localhost:3000/submissions/sub_abc123/events?actorKind=human&since=2025-01-15T00:00:00Z"

# Paginate
curl "http://localhost:3000/submissions/sub_abc123/events?limit=10&offset=20"
```

---

## Export Events

`GET /submissions/:submissionId/events/export`

Downloads the event stream as a file. Supports JSON and JSONL (newline-delimited JSON) formats for integration with external log processing systems.

### Query Parameters

Same as [Get Events](#get-events), plus:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `jsonl` | Output format: `json` or `jsonl` |

### Response

**JSONL format** (`application/x-ndjson`):

Each line is a complete JSON event object:

```
{"eventId":"evt_001","type":"submission.created","submissionId":"sub_abc123","ts":"2025-01-15T10:00:00Z","actor":{"kind":"agent","id":"bot-1"},"state":"draft","version":1}
{"eventId":"evt_002","type":"field.updated","submissionId":"sub_abc123","ts":"2025-01-15T10:05:00Z","actor":{"kind":"agent","id":"bot-1"},"state":"in_progress","version":2}
```

**JSON format** (`application/json`):

Returns a JSON array of event objects (same shape as the `events` array in Get Events).

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Export file returned |
| 400 | Invalid query parameters |
| 404 | Submission not found |

### curl Examples

```bash
# Export as JSONL (default)
curl http://localhost:3000/submissions/sub_abc123/events/export -o events.jsonl

# Export as JSON
curl "http://localhost:3000/submissions/sub_abc123/events/export?format=json" -o events.json

# Export only agent events
curl "http://localhost:3000/submissions/sub_abc123/events/export?actorKind=agent" -o agent-events.jsonl
```
