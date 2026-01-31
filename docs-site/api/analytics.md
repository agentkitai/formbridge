# Analytics API

The analytics API provides aggregate metrics and time-series data across all intakes and submissions. These endpoints power the [admin dashboard](/guide/concepts#submission-state-machine) and can be used for external monitoring.

## Summary

`GET /analytics/summary`

Returns aggregate counts and recent activity across all intakes.

### Response

```json
{
  "totalIntakes": 5,
  "totalSubmissions": 142,
  "pendingApprovals": 3,
  "submissionsByState": {
    "draft": 12,
    "in_progress": 8,
    "submitted": 15,
    "needs_review": 3,
    "approved": 2,
    "finalized": 95,
    "rejected": 4,
    "cancelled": 2,
    "expired": 1
  },
  "recentActivity": [
    {
      "eventId": "evt_latest",
      "type": "submission.finalized",
      "submissionId": "sub_xyz",
      "ts": "2025-01-15T10:35:00Z",
      "actor": { "kind": "system", "id": "delivery-engine" },
      "state": "finalized",
      "version": 8
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `totalIntakes` | number | Number of registered intake definitions |
| `totalSubmissions` | number | Total submissions across all intakes |
| `pendingApprovals` | number | Submissions currently in `needs_review` state |
| `submissionsByState` | object | Submission counts keyed by state name |
| `recentActivity` | EventRecord[] | Most recent events across all submissions |

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Summary returned |

### curl Example

```bash
curl http://localhost:3000/analytics/summary
```

---

## Volume

`GET /analytics/volume`

Returns a daily time series of submission creation counts.

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | number | 30 | Number of days to look back (max: 365) |

### Response

```json
[
  { "date": "2025-01-13", "count": 5 },
  { "date": "2025-01-14", "count": 12 },
  { "date": "2025-01-15", "count": 8 }
]
```

### Response Fields (per item)

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | Date in `YYYY-MM-DD` format |
| `count` | number | Number of submissions created on this date |

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Volume data returned |

### curl Examples

```bash
# Last 30 days (default)
curl http://localhost:3000/analytics/volume

# Last 7 days
curl "http://localhost:3000/analytics/volume?days=7"

# Full year
curl "http://localhost:3000/analytics/volume?days=365"
```

---

## Intake Metrics

`GET /analytics/intakes`

Returns per-intake metrics including total submissions, state breakdowns, and completion rates.

### Response

```json
[
  {
    "intakeId": "vendor-onboarding",
    "total": 85,
    "byState": {
      "draft": 3,
      "in_progress": 2,
      "submitted": 5,
      "finalized": 70,
      "rejected": 3,
      "cancelled": 2
    },
    "completionRate": 0.82
  },
  {
    "intakeId": "it-access-request",
    "total": 57,
    "byState": {
      "draft": 9,
      "submitted": 10,
      "finalized": 25,
      "needs_review": 3,
      "rejected": 1,
      "expired": 9
    },
    "completionRate": 0.44
  }
]
```

### Response Fields (per item)

| Field | Type | Description |
|-------|------|-------------|
| `intakeId` | string | Intake identifier |
| `total` | number | Total submissions for this intake |
| `byState` | object | Submission counts grouped by state |
| `completionRate` | number | Fraction of submissions that reached `finalized` (0–1) |

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Intake metrics returned |

### curl Example

```bash
curl http://localhost:3000/analytics/intakes
```

---

## Funnel

`GET /analytics/funnel`

Returns funnel data showing how submissions progress through the state machine. Each entry shows how many submissions reached a given state and what percentage of total that represents.

### Response

```json
[
  { "state": "draft", "count": 142, "percentage": 100 },
  { "state": "in_progress", "count": 130, "percentage": 91.5 },
  { "state": "submitted", "count": 115, "percentage": 81.0 },
  { "state": "needs_review", "count": 20, "percentage": 14.1 },
  { "state": "approved", "count": 18, "percentage": 12.7 },
  { "state": "finalized", "count": 95, "percentage": 66.9 },
  { "state": "rejected", "count": 4, "percentage": 2.8 },
  { "state": "cancelled", "count": 2, "percentage": 1.4 },
  { "state": "expired", "count": 1, "percentage": 0.7 }
]
```

### Response Fields (per item)

| Field | Type | Description |
|-------|------|-------------|
| `state` | string | State machine state |
| `count` | number | Number of submissions that reached this state |
| `percentage` | number | Percentage of total submissions (0–100) |

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Funnel data returned |

### curl Example

```bash
curl http://localhost:3000/analytics/funnel
```
