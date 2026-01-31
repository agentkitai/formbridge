# Webhooks API

FormBridge delivers finalized submissions to configured destinations via webhooks. The webhooks API lets you inspect delivery status and retry failed deliveries.

## List Deliveries

`GET /submissions/:submissionId/deliveries`

Returns all webhook delivery records for a submission.

### Response

```json
{
  "ok": true,
  "submissionId": "sub_abc123",
  "deliveries": [
    {
      "deliveryId": "del_001",
      "submissionId": "sub_abc123",
      "destinationUrl": "https://example.com/webhook",
      "status": "succeeded",
      "attempts": 1,
      "lastAttemptAt": "2025-01-15T10:35:00Z",
      "statusCode": 200,
      "createdAt": "2025-01-15T10:35:00Z"
    }
  ],
  "total": 1
}
```

### Delivery Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `deliveryId` | string | Unique delivery identifier |
| `submissionId` | string | Submission this delivery is for |
| `destinationUrl` | string | Webhook endpoint URL |
| `status` | string | `"pending"`, `"succeeded"`, or `"failed"` |
| `attempts` | number | Total delivery attempts so far |
| `lastAttemptAt` | string | ISO 8601 timestamp of last attempt |
| `nextRetryAt` | string | ISO 8601 timestamp of next scheduled retry (if pending) |
| `statusCode` | number | HTTP status code from destination (if attempted) |
| `error` | string | Error message from last failed attempt |
| `createdAt` | string | ISO 8601 timestamp when delivery was created |

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Deliveries returned |

### curl Example

```bash
curl http://localhost:3000/submissions/sub_abc123/deliveries
```

---

## Get Delivery

`GET /webhooks/deliveries/:deliveryId`

Returns a single delivery record by its ID.

### Response

```json
{
  "ok": true,
  "delivery": {
    "deliveryId": "del_001",
    "submissionId": "sub_abc123",
    "destinationUrl": "https://example.com/webhook",
    "status": "failed",
    "attempts": 3,
    "lastAttemptAt": "2025-01-15T11:00:00Z",
    "statusCode": 500,
    "error": "Internal Server Error",
    "createdAt": "2025-01-15T10:35:00Z"
  }
}
```

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Delivery returned |
| 404 | Delivery not found |

### curl Example

```bash
curl http://localhost:3000/webhooks/deliveries/del_001
```

---

## Retry Delivery

`POST /webhooks/deliveries/:deliveryId/retry`

Retries a failed webhook delivery. The delivery must be in `failed` status.

### Response

```json
{
  "ok": true,
  "deliveryId": "del_001",
  "status": "pending",
  "message": "Delivery retry scheduled"
}
```

### Status Codes

| Status | Description |
|--------|-------------|
| 200 | Retry scheduled |
| 404 | Delivery not found |
| 409 | Delivery is not in `failed` status |

### curl Example

```bash
curl -X POST http://localhost:3000/webhooks/deliveries/del_001/retry
```

---

## Signature Verification

FormBridge signs webhook payloads with HMAC-SHA256 so your endpoint can verify authenticity.

### Headers

Every webhook delivery includes these headers:

| Header | Description |
|--------|-------------|
| `X-FormBridge-Signature` | `sha256={hex_digest}` — HMAC-SHA256 of the raw request body using the webhook secret |
| `X-FormBridge-Timestamp` | ISO 8601 timestamp when the payload was signed |

### Verification Steps

1. Extract the hex digest from `X-FormBridge-Signature` (strip the `sha256=` prefix)
2. Compute HMAC-SHA256 of the raw request body using your webhook secret
3. Compare the computed digest with the extracted digest using a constant-time comparison
4. Optionally check `X-FormBridge-Timestamp` to reject stale deliveries

### Example (Node.js)

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyWebhook(body, signature, secret) {
  const digest = signature.replace('sha256=', '');
  const expected = createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return timingSafeEqual(
    Buffer.from(digest, 'hex'),
    Buffer.from(expected, 'hex')
  );
}
```

### Webhook Payload

The webhook POST body contains the finalized submission data:

```json
{
  "event": "submission.finalized",
  "submissionId": "sub_abc123",
  "intakeId": "vendor-onboarding",
  "state": "finalized",
  "fields": {
    "companyName": "Acme Corp",
    "taxId": "12-3456789"
  },
  "fieldAttribution": {
    "companyName": { "kind": "agent", "id": "bot-1" },
    "taxId": { "kind": "human", "id": "alice@acme.com" }
  },
  "timestamp": "2025-01-15T10:35:00Z"
}
```

### Retry Policy

Failed deliveries are retried with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1st retry | ~1 second |
| 2nd retry | ~2 seconds |
| 3rd retry | ~4 seconds |
| ... | Exponential up to max delay |

The exact retry parameters (`maxRetries`, `initialDelayMs`, `maxDelayMs`, `backoffMultiplier`) are configured per intake destination.
