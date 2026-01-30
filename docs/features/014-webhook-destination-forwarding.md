# Feature 014 --- Webhook & Destination Forwarding

> **Status:** PLANNED | **Phase:** 3 | **Priority:** should | **Complexity:** medium | **Impact:** high
> **[Back to Feature Index](../FEATURES.md)**

## Summary

Implement automatic forwarding of accepted/approved submissions to configured webhook destination URLs. When a submission reaches the `submitted`, `approved`, or `finalized` state, the system constructs a JSON payload containing the full submission data and metadata, signs it with HMAC-SHA256, and sends it via HTTP POST to the configured destination. Failed deliveries are retried with exponential backoff (default 5 attempts). Delivery status is tracked per submission (pending, delivered, failed) and delivery events are emitted to the event stream. The `Destination` interface in `IntakeDefinition` already defines the shape (`kind: "webhook"`, `url`, `headers`, `retryPolicy`); this feature implements the runtime behavior. A dry-run mode allows testing webhook configuration without actually sending data.

## Dependencies

**Upstream:** Feature 3 (Submission Lifecycle & State Machine) -- webhook forwarding is triggered by submission state transitions. The `Destination` type is already defined in `src/types/intake-contract.ts`.

**Downstream:** Feature 22 (Pluggable Integrations Platform) -- webhooks are the first concrete destination type; the delivery infrastructure will be reused for queue-based and callback destinations.

**Internal task ordering:**
1. Task 1 (WebhookManager class) must complete before all other tasks.
2. Task 2 (delivery queue and retry logic) must complete before Task 3 (HMAC signing) and Task 5 (delivery tracking).
3. Task 3 (HMAC signing) can proceed in parallel with Task 4 (webhook configuration).
4. Task 4 (webhook configuration) must complete before Task 6 (dry-run mode).
5. Task 5 (delivery tracking) must complete before Task 8 (event integration).
6. Task 6 (dry-run mode) depends on Tasks 1, 2, 4.
7. Task 7 (custom headers) can proceed in parallel with Tasks 5--6.
8. Task 8 (event integration) depends on Tasks 1, 2, 5.
9. Task 9 (webhook management route) depends on Tasks 1, 4, 6.
10. Task 10 (integration tests) depends on all prior tasks.

## Architecture & Design

### Components and files to create
- `src/core/webhook-manager.ts` -- `WebhookManager` class orchestrating delivery lifecycle
- `src/core/delivery-queue.ts` -- `DeliveryQueue` interface and `InMemoryDeliveryQueue` implementation for managing pending deliveries with retry scheduling
- `src/routes/webhooks.ts` -- Express route factory `createWebhookRouter(webhookManager)` for webhook management endpoints
- `tests/webhook-manager.test.ts` -- unit tests for WebhookManager
- `tests/webhook-route.test.ts` -- integration tests for webhook API endpoints
- `tests/delivery-queue.test.ts` -- unit tests for delivery queue and retry logic

### Components and files to modify
- `src/core/submission-manager.ts` -- trigger webhook delivery when submission reaches `submitted`/`finalized` state (after `submit()` succeeds)
- `src/core/approval-manager.ts` -- trigger webhook delivery when submission is approved (after `approve()` succeeds)
- `src/types/intake-contract.ts` -- extend `Destination` interface with `secret` (HMAC key), `retryPolicy` details, and `dryRun` flag
- `src/types.ts` -- add `DeliveryStatus` type and delivery tracking fields to `Submission`
- `src/index.ts` -- export new modules

### Design decisions
- Webhook delivery is fire-and-forget from the caller's perspective: `SubmissionManager.submit()` and `ApprovalManager.approve()` enqueue the delivery and return immediately. Delivery happens asynchronously.
- The delivery queue is an in-memory queue with configurable retry policy. Production deployments should swap in a persistent queue (Redis, SQS, etc.) via the `DeliveryQueue` interface.
- HMAC-SHA256 signatures use the `X-FormBridge-Signature` header, computed over the raw JSON body using a per-destination secret.
- Retry policy defaults: maxRetries=5, initialDelayMs=1000, maxDelayMs=60000, backoffMultiplier=2. Configurable per destination.
- Delivery status is tracked on the submission record itself (avoiding a separate delivery table for the MVP). A `deliveries` array on the submission holds delivery attempt records.
- The payload is identical regardless of how the submission was created (HTTP, MCP, or mixed-mode), satisfying acceptance criterion 7.

### Patterns to follow
- Routes use the factory pattern `createWebhookRouter(webhookManager)`, consistent with existing route factories.
- Webhook configuration is part of the `IntakeDefinition.destination` field, already defined and used in `src/types/intake-contract.ts`.
- Error handling follows existing patterns: custom Error subclasses, HTTP status code mapping in route handlers.
- Event emission follows existing patterns: `IntakeEvent` with `delivery.attempted`, `delivery.succeeded`, `delivery.failed` types (already defined in `IntakeEventType`).

## Implementation Tasks

### Task 1: Implement WebhookManager Class

- [ ] Create `src/core/webhook-manager.ts` with `WebhookManager` class
- [ ] Define constructor accepting `DeliveryQueue`, `EventEmitter`, and optional configuration
- [ ] Implement `deliver(submission, destination)` method that constructs the webhook payload and enqueues delivery
- [ ] Construct JSON payload with structure: `{ submissionId, intakeId, state, fields, metadata: { createdAt, updatedAt, createdBy, fieldAttribution }, timestamp }`
- [ ] Implement `processDelivery(deliveryRecord)` method that performs the HTTP POST
- [ ] Use `fetch()` (Node 18+ built-in) or a lightweight HTTP client for POST requests
- [ ] Handle HTTP response: 2xx = success, 4xx = permanent failure (no retry), 5xx = transient failure (retry)
- [ ] Set 30-second timeout on outbound requests
- [ ] Add JSDoc documentation to all public methods

**Dependencies:** None
**Effort:** M
**Validation:** WebhookManager can construct a payload, serialize it as JSON, and send an HTTP POST. Success and failure paths are handled correctly.

### Task 2: Implement Delivery Queue with Exponential Backoff Retry

- [ ] Create `src/core/delivery-queue.ts` with `DeliveryQueue` interface
- [ ] Define `DeliveryRecord` type: `{ id, submissionId, destinationUrl, payload, status, attempts, maxRetries, nextRetryAt, createdAt, lastAttemptAt, lastError? }`
- [ ] Define `RetryPolicy` type: `{ maxRetries: number, initialDelayMs: number, maxDelayMs: number, backoffMultiplier: number }`
- [ ] Implement `InMemoryDeliveryQueue` with methods: `enqueue(record)`, `dequeue()`, `markSuccess(id)`, `markFailed(id, error)`, `getBySubmission(submissionId)`, `getPending()`
- [ ] Implement exponential backoff calculation: `delay = min(initialDelay * multiplier^attempt, maxDelay)` with jitter (random +/-10%)
- [ ] Implement a `processQueue()` method that dequeues ready-to-retry records and invokes the delivery callback
- [ ] Add a polling mechanism (setInterval) for processing the queue, configurable interval (default 5 seconds)
- [ ] Handle permanent failures (maxRetries exceeded): mark as `failed`, stop retrying
- [ ] Add unit tests for retry delay calculation, queue operations, and max-retry cutoff

**Dependencies:** Task 1
**Effort:** M
**Validation:** Queue enqueues and dequeues records. Retry delays follow exponential backoff with jitter. Permanent failures are detected after maxRetries. Queue processing invokes delivery callback for ready records.

### Task 3: Implement HMAC-SHA256 Payload Signing

- [ ] Add `secret` field to `Destination` interface in `src/types/intake-contract.ts` (optional string, used as HMAC key)
- [ ] Implement `signPayload(body: string, secret: string): string` utility in `webhook-manager.ts` using Node.js `crypto.createHmac('sha256', secret)`
- [ ] Add `X-FormBridge-Signature` header to webhook requests with value `sha256={hex-encoded HMAC}`
- [ ] Add `X-FormBridge-Timestamp` header with ISO 8601 delivery timestamp
- [ ] Include both timestamp and body in the HMAC input: `HMAC(secret, timestamp + "." + body)` to prevent replay attacks
- [ ] Skip signing if no `secret` is configured on the destination
- [ ] Add unit tests verifying signature computation against known test vectors
- [ ] Document the signature verification algorithm for webhook consumers

**Dependencies:** Task 1
**Effort:** S
**Validation:** Signature header is present when secret is configured. Signature matches expected HMAC-SHA256 output. Timestamp is included in HMAC input. Signature is absent when no secret is configured.

### Task 4: Webhook Configuration in Intake Definitions

- [ ] Extend `Destination` interface in `src/types/intake-contract.ts` with full retry policy fields
- [ ] Add `retryPolicy` type: `{ maxRetries?: number, initialDelayMs?: number, maxDelayMs?: number, backoffMultiplier?: number }`
- [ ] Add `dryRun?: boolean` flag to `Destination` for testing
- [ ] Add Zod validation schema for destination configuration
- [ ] Validate destination URL format (must be HTTPS in production, HTTP allowed in development)
- [ ] Validate secret is at least 32 characters when provided
- [ ] Load destination configuration from `IntakeDefinition.destination` when triggering delivery
- [ ] Add unit tests for destination configuration validation

**Dependencies:** None
**Effort:** S
**Validation:** Destination configuration validates correctly. Invalid URLs are rejected. Short secrets are rejected. Default retry policy values are applied when not specified.

### Task 5: Delivery Status Tracking

- [ ] Add `DeliveryStatus` type to `src/types.ts`: `"pending" | "delivered" | "failed"`
- [ ] Add `DeliveryAttempt` type: `{ attemptNumber, timestamp, statusCode?, error?, durationMs }`
- [ ] Add `deliveries` array to `Submission` type: `Array<{ destinationUrl, status: DeliveryStatus, attempts: DeliveryAttempt[], enqueuedAt, completedAt? }>`
- [ ] Update `WebhookManager` to record each delivery attempt on the submission
- [ ] Update submission state: after all deliveries succeed, transition to `finalized` if not already
- [ ] Update submission state: if any delivery permanently fails, emit `delivery.failed` event but do not block the submission
- [ ] Add query capability: `WebhookManager.getDeliveryStatus(submissionId)` returns delivery status summary
- [ ] Add unit tests for delivery status tracking through success, retry, and permanent failure scenarios

**Dependencies:** Tasks 1, 2
**Effort:** M
**Validation:** Delivery attempts are recorded on the submission. Status transitions from `pending` to `delivered` on success. Status transitions to `failed` after maxRetries exceeded. Each attempt records status code, error, and duration.

### Task 6: Implement Dry-Run Mode

- [ ] Add `dryRun` flag handling in `WebhookManager.deliver()`
- [ ] In dry-run mode: construct the full payload and headers (including HMAC signature), validate the destination URL, but do not send the HTTP request
- [ ] Return a `DryRunResult` with `{ payload, headers, destinationUrl, valid: boolean, errors?: string[] }`
- [ ] Add `POST /webhooks/test` endpoint to `createWebhookRouter` that accepts a destination config and submission ID, runs dry-run, and returns the result
- [ ] Log dry-run attempts at INFO level
- [ ] Emit a `delivery.attempted` event with `payload.dryRun: true` for audit purposes
- [ ] Add unit tests verifying dry-run does not make HTTP calls and returns the expected result

**Dependencies:** Tasks 1, 2, 4
**Effort:** S
**Validation:** Dry-run mode produces the full payload and headers without making HTTP requests. The test endpoint returns the payload that would be sent. Dry-run events are recorded in the audit trail.

### Task 7: Support Custom Headers Per Destination

- [ ] Read `headers` from `IntakeDefinition.destination.headers` (already defined in `Destination` interface)
- [ ] Merge custom headers with default headers (`Content-Type: application/json`, `X-FormBridge-Signature`, `X-FormBridge-Timestamp`, `User-Agent: FormBridge/0.1`)
- [ ] Custom headers must not override security headers (`X-FormBridge-Signature`, `X-FormBridge-Timestamp`)
- [ ] Validate custom header names (no restricted headers like `Host`, `Content-Length`)
- [ ] Add unit tests for header merging and restricted header rejection

**Dependencies:** Task 1
**Effort:** S
**Validation:** Custom headers are included in webhook requests. Security headers cannot be overridden. Restricted headers are rejected during validation.

### Task 8: Integrate Delivery Events with Event Stream

- [ ] Emit `delivery.attempted` event when a delivery attempt starts, with payload: `{ destinationUrl, attemptNumber, dryRun? }`
- [ ] Emit `delivery.succeeded` event on successful delivery, with payload: `{ destinationUrl, statusCode, durationMs, attemptNumber }`
- [ ] Emit `delivery.failed` event on permanent failure (maxRetries exceeded), with payload: `{ destinationUrl, lastError, totalAttempts, finalStatusCode? }`
- [ ] Ensure events use the system actor (`{ kind: "system", id: "webhook-manager" }`) since delivery is automated
- [ ] Append delivery events to the submission's `events` array and to the `EventStore` (if Feature 013 is available)
- [ ] Add unit tests verifying correct event emission for success, retry, and permanent failure scenarios

**Dependencies:** Tasks 1, 2, 5
**Effort:** S
**Validation:** Delivery lifecycle produces the correct sequence of events. Events appear in the submission event history. Event payloads contain delivery metadata.

### Task 9: Webhook Management API Route

- [ ] Create `src/routes/webhooks.ts` with `createWebhookRouter(webhookManager)` factory
- [ ] Implement `POST /webhooks/test` -- dry-run a webhook delivery for a given submission and destination config
- [ ] Implement `GET /submissions/:submissionId/deliveries` -- return delivery status and attempt history for a submission
- [ ] Implement `POST /submissions/:submissionId/deliveries/retry` -- manually retry a failed delivery
- [ ] Validate request bodies using Zod schemas
- [ ] Return appropriate HTTP status codes (200 success, 400 invalid input, 404 submission not found, 409 delivery not in failed state for retry)
- [ ] Add route to `src/index.ts` exports

**Dependencies:** Tasks 1, 4, 6
**Effort:** M
**Validation:** Test endpoint returns dry-run results. Deliveries endpoint returns status history. Retry endpoint re-enqueues failed deliveries. Invalid inputs return 400.

### Task 10: Integration Tests

- [ ] Write integration test: submission with webhook destination, verify delivery on submit
- [ ] Write integration test: submission with approval gate, verify delivery on approve
- [ ] Write integration test: webhook target returns 500, verify retry with exponential backoff
- [ ] Write integration test: webhook target returns 400, verify no retry (permanent failure)
- [ ] Write integration test: HMAC signature verification on the receiving end
- [ ] Write integration test: dry-run mode returns payload without HTTP call
- [ ] Write integration test: custom headers are sent in webhook request
- [ ] Write integration test: delivery events appear in submission event stream
- [ ] Use a local HTTP server (e.g., express on a random port) as the webhook target in tests

**Dependencies:** All prior tasks
**Effort:** L
**Validation:** All integration tests pass. Webhook delivery works end-to-end for both direct submission and approval flows. Retry logic handles transient failures. Delivery tracking records all attempts.

## Test Plan

| Type | Description | Target Count |
|------|------------|-------------|
| Unit | WebhookManager payload construction and delivery | 5--6 |
| Unit | Delivery queue operations (enqueue, dequeue, retry scheduling) | 6--8 |
| Unit | Exponential backoff delay calculation with jitter | 3--4 |
| Unit | HMAC-SHA256 signing and verification | 3--4 |
| Unit | Destination configuration validation | 4--5 |
| Unit | Delivery status tracking state transitions | 4--5 |
| Unit | Custom header merging and validation | 3--4 |
| Unit | Dry-run mode payload generation | 2--3 |
| Integration | End-to-end webhook delivery (submit, approve, retry, fail) | 6--8 |
| Integration | Webhook management API endpoints | 4--5 |
| E2E | Full lifecycle: create, submit, webhook delivery, event verification | 1--2 |

## Documentation Tasks

- [ ] Add JSDoc to all public interfaces and methods in `webhook-manager.ts` and `delivery-queue.ts`
- [ ] Document webhook API endpoints in `docs/API.md` (POST /webhooks/test, GET /submissions/:id/deliveries, POST /submissions/:id/deliveries/retry)
- [ ] Document webhook payload format and structure
- [ ] Document HMAC-SHA256 signature verification algorithm for webhook consumers (include code examples in Node.js and Python)
- [ ] Document retry policy configuration options
- [ ] Document destination configuration in intake definition schema

## Code Review Checklist

- [ ] Type safety verified -- all payload types, delivery records, and status transitions are typed
- [ ] Patterns consistent with existing codebase -- factory routes, Zod validation, event emission
- [ ] No regressions to existing features -- submission and approval flows work identically without webhook configuration
- [ ] Performance acceptable -- webhook delivery is async and non-blocking; queue processing does not block the event loop
- [ ] Security reviewed -- HMAC signing uses constant-time comparison, secrets are not logged, HTTPS enforced in production
- [ ] Error handling complete -- network errors, timeouts, invalid responses all handled gracefully

## Deployment & Release

- **Backward compatibility:** Webhook delivery is opt-in. Intake definitions without a `destination.url` or with `destination.kind !== "webhook"` are unaffected. Existing submissions are not retroactively delivered.
- **Migration steps:** No data migration required. The `deliveries` array on submissions defaults to empty. Existing `Destination` fields (`url`, `headers`) are already defined and will be used when populated.
- **Release steps:**
  1. Deploy WebhookManager, DeliveryQueue, and routes
  2. Configure a test intake definition with a webhook destination
  3. Verify delivery on submission and approval
  4. Monitor delivery success rate and latency
  5. Enable for production intake definitions

## Observability & Monitoring

- **Logging:** Log delivery attempts at INFO level (destination URL, attempt number, status code). Log delivery failures at WARN level (include error message, not payload). Log permanent failures at ERROR level.
- **Metrics to track:**
  - `webhook.delivery.attempts` counter (by destination, status)
  - `webhook.delivery.latency` histogram (by destination)
  - `webhook.delivery.success_rate` gauge (rolling 5-minute window)
  - `webhook.delivery.retries` counter
  - `webhook.delivery.permanent_failures` counter
  - `webhook.queue.size` gauge (pending deliveries)
- **Health checks:** DeliveryQueue health (queue is processing, no stuck items). Include in the existing `/health` endpoint.
- **Alerting recommendations:** Alert on permanent failure rate >5%. Alert on queue size >100 (indicates delivery backlog).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Webhook target is slow or unresponsive, causing queue growth | Medium | Medium | 30-second timeout per request; configurable maxRetries; queue size monitoring and alerting |
| HMAC secret is leaked or compromised | Low | High | Store secrets encrypted; rotate secrets via intake definition update; document secret rotation procedure |
| InMemoryDeliveryQueue loses pending deliveries on restart | High | Medium | Document limitation clearly; provide `DeliveryQueue` interface for persistent implementations (Redis, database); queue state is recoverable from submission delivery records |
| Webhook payload contains sensitive PII | Medium | High | Document that webhook payloads contain full submission data; recommend HTTPS-only destinations; log payloads only in debug mode |
| High submission volume overwhelms delivery queue | Low | Medium | Queue processing is async with configurable concurrency; document capacity limits; pluggable queue supports scaling |
| Retry storms when webhook target recovers from outage | Medium | Medium | Jitter in backoff prevents thundering herd; configurable maxRetries limits total attempts; circuit breaker pattern as future enhancement |

## Definition of Done

- [ ] All acceptance criteria met:
  1. Configure destination webhook URLs in intake definition
  2. Auto-forward as JSON POST on accepted/approved
  3. Payload includes submission data, metadata, intake ID
  4. HMAC-SHA256 signature header
  5. Exponential backoff retries (default 5)
  6. Delivery tracking (pending/delivered/failed)
  7. Identical payload for all submission sources
  8. Dry-run mode
  9. Custom headers per destination
  10. Delivery events in event stream
- [ ] Tests passing with adequate coverage (>85% for new code)
- [ ] Code reviewed and approved
- [ ] Documentation updated (API docs, webhook consumer guide, JSDoc)
- [ ] No regressions in existing features
