# FormBridge Idempotency Design

**Version:** 0.1.0-draft
**Status:** Draft
**Authors:** Amit

---

## Abstract

This document defines the architecture and implementation strategy for idempotency in FormBridge submissions. Idempotency enables safe request retries by ensuring that duplicate requests with the same idempotency key produce identical responses without side effects. This is critical for AI agent workflows where network failures, timeouts, and error handling loops frequently trigger retries.

The design covers storage backend interfaces, concurrency handling, TTL management, key scoping, and integration with the FormBridge Intake Contract.

---

## Table of Contents

- [Abstract](#abstract)
- [1. Overview and Goals](#1-overview-and-goals)
  - [1.1 Motivation](#11-motivation)
  - [1.2 Design Goals](#12-design-goals)
  - [1.3 Scope](#13-scope)
- [2. Architecture](#2-architecture)
  - [2.1 High-Level Flow](#21-high-level-flow)
  - [2.2 Key Components](#22-key-components)
  - [2.3 Request Processing Logic](#23-request-processing-logic)
  - [2.4 Sequence Diagrams](#24-sequence-diagrams)
    - [2.4.1 Normal Flow: Initial Request + Replay](#241-normal-flow-initial-request--replay)
    - [2.4.2 Conflict Flow: Same Key, Different Payload](#242-conflict-flow-same-key-different-payload)
    - [2.4.3 Concurrent Requests Flow](#243-concurrent-requests-flow)
    - [2.4.4 TTL Expiration Flow](#244-ttl-expiration-flow)
- [3. Storage Backend Interface](#3-storage-backend-interface)
  - [3.1 Interface Definition](#31-interface-definition)
  - [3.2 In-Memory Implementation (Default)](#32-in-memory-implementation-default)
  - [3.3 Redis Implementation (Production)](#33-redis-implementation-production)
  - [3.4 Database Implementation (PostgreSQL/MySQL)](#34-database-implementation-postgresqlmysql)
- [4. Concurrency Model and Locking Strategy](#4-concurrency-model-and-locking-strategy)
  - [4.1 The Race Condition Problem](#41-the-race-condition-problem)
  - [4.2 Distributed Locking Strategy](#42-distributed-locking-strategy)
  - [4.3 Request Queuing and Wait Strategy](#43-request-queuing-and-wait-strategy)
  - [4.4 Concurrent Request Flow](#44-concurrent-request-flow)
  - [4.5 Timeout Handling and Edge Cases](#45-timeout-handling-and-edge-cases)
  - [4.6 Deadlock Prevention](#46-deadlock-prevention)
  - [4.7 Performance Considerations](#47-performance-considerations)
- [5. TTL and Expiration](#5-ttl-and-expiration)
  - [5.1 TTL Design](#51-ttl-design)
  - [5.2 When TTL Starts](#52-when-ttl-starts)
  - [5.3 Configurable TTL](#53-configurable-ttl)
  - [5.4 Expiration Behavior](#54-expiration-behavior)
  - [5.5 Cleanup Strategies](#55-cleanup-strategies)
- [6. Scope and Namespacing](#6-scope-and-namespacing)
  - [6.1 Key Scoping](#61-key-scoping)
  - [6.2 Rationale](#62-rationale)
  - [6.3 Key Format Recommendations](#63-key-format-recommendations)
  - [6.4 Key Validation](#64-key-validation)
  - [6.5 Collision Prevention](#65-collision-prevention)
  - [6.6 Key Generation Best Practices](#66-key-generation-best-practices)
- [7. Integration with Intake Contract](#7-integration-with-intake-contract)
  - [7.1 HTTP API](#71-http-api)
  - [7.2 MCP Tool Binding](#72-mcp-tool-binding)
  - [7.3 Event Stream Integration](#73-event-stream-integration)
- [8. Edge Cases and Failure Scenarios](#8-edge-cases-and-failure-scenarios)
  - [8.1 Network Timeout During Initial Request](#81-network-timeout-during-initial-request)
  - [8.2 Storage Backend Failure](#82-storage-backend-failure)
  - [8.3 Clock Skew in Distributed Systems](#83-clock-skew-in-distributed-systems)
  - [8.4 Key Collision Scenarios](#84-key-collision-scenarios)
  - [8.5 Additional Edge Cases](#85-additional-edge-cases)
- [9. Observability and Audit Trail](#9-observability-and-audit-trail)
  - [9.1 Metrics to Track](#91-metrics-to-track)
  - [9.2 Logging Recommendations](#92-logging-recommendations)
  - [9.3 Monitoring Alerts](#93-monitoring-alerts)
  - [9.4 Audit Trail Integration](#94-audit-trail-integration)
  - [9.5 Observability Best Practices](#95-observability-best-practices)
- [10. Summary](#10-summary)

---

## 1. Overview and Goals

### 1.1 Motivation

AI agents operate in unreliable network environments and often implement aggressive retry logic. Without idempotency:
- Network timeouts cause duplicate submissions
- Error handling loops create redundant records
- Agents cannot safely retry failed requests
- Data integrity suffers from accidental duplicates

FormBridge implements idempotency as a first-class feature, not an afterthought. Every submission operation that mutates state accepts an optional idempotency key and guarantees exactly-once semantics.

### 1.2 Design Goals

1. **Safe retries**: Duplicate requests with the same key return the original response
2. **Zero side effects**: Replayed requests do not trigger duplicate processing, webhooks, or state changes
3. **Transparent to clients**: Non-idempotent requests (no key) work normally
4. **Pluggable storage**: Support in-memory (development), Redis (production), and database backends
5. **Distributed-safe**: Handle concurrent requests across multiple server instances
6. **Time-bounded**: Keys expire after a configurable TTL to prevent unbounded storage growth
7. **Observable**: Replay events are logged and emitted to the audit stream

### 1.3 Scope

**In scope:**
- `createSubmission` with idempotency key
- `submit` (final submission) with idempotency key
- `setFields` with idempotency key
- Storage backend interface and implementations
- Concurrent request handling (locking)
- TTL and expiration
- Key scoping per intake definition

**Out of scope:**
- Read-only operations (`getSubmission`, `validate`) — these are naturally idempotent
- File upload URLs — uploads use separate upload tokens
- Webhook delivery retries — handled by external systems (e.g., Inngest, Temporal)

---

## 2. Architecture

### 2.1 High-Level Flow

```
┌─────────┐
│ Client  │
└────┬────┘
     │ POST /api/intakes/{id}/submit
     │ Idempotency-Key: idem_abc123xyz
     │ { fields: {...} }
     ▼
┌─────────────────────────────────────────────┐
│ FormBridge API Server                       │
│                                             │
│  1. Extract idempotency key from header     │
│  2. Check IdempotencyStore.exists(key)      │
│     ├─ Found → Return cached response       │
│     └─ Not found → Acquire lock             │
│  3. Process request normally                │
│  4. Store response in IdempotencyStore      │
│  5. Release lock, return response           │
└─────────────────────────────────────────────┘
     │
     ▼
┌──────────────────┐
│ IdempotencyStore │
│  (Redis / DB)    │
└──────────────────┘
```

### 2.2 Key Components

#### IdempotencyKey
- Format: `idem_{random}` or client-generated (UUIDv4 recommended)
- Scoped per intake definition: internal storage key is `{intakeId}:{idempotencyKey}`
- Case-sensitive
- Max length: 255 characters
- Must be URL-safe (no special characters requiring encoding)

#### CachedResponse
```typescript
interface CachedResponse {
  statusCode: number;
  body: unknown;              // The full JSON response body
  headers?: Record<string, string>;
  timestamp: number;          // Epoch milliseconds
  requestHash: string;        // SHA-256 of request payload (for conflict detection)
}
```

#### IdempotencyRecord
```typescript
interface IdempotencyRecord {
  key: string;                // Storage key: {intakeId}:{idempotencyKey}
  response: CachedResponse;
  expiresAt: number;          // Epoch milliseconds
  locked: boolean;            // Concurrency lock flag
  lockAcquiredAt?: number;    // When lock was acquired
  lockToken?: string;         // UUID for distributed locking
}
```

### 2.3 Request Processing Logic

```typescript
async function handleIdempotentRequest(
  intakeId: string,
  idempotencyKey: string | null,
  requestPayload: unknown,
  handler: () => Promise<Response>
): Promise<Response> {
  if (!idempotencyKey) {
    // Non-idempotent request: process normally
    return await handler();
  }

  const storageKey = `${intakeId}:${idempotencyKey}`;
  const requestHash = sha256(JSON.stringify(requestPayload));

  // Check for existing cached response
  const existing = await store.retrieve(storageKey);
  if (existing) {
    // Conflict detection: same key, different payload
    if (existing.requestHash !== requestHash) {
      throw new IdempotencyConflictError(
        `Idempotency key "${idempotencyKey}" already used with different payload`,
        { originalHash: existing.requestHash, currentHash: requestHash }
      );
    }

    // Replay: return cached response
    return {
      ...existing.response,
      headers: {
        ...existing.response.headers,
        'Idempotent-Replayed': 'true',
        'X-Original-Request-Time': new Date(existing.timestamp).toISOString()
      }
    };
  }

  // Acquire lock (blocks concurrent requests with same key)
  const lockToken = await store.acquireLock(storageKey, { timeoutMs: 30000 });

  try {
    // Double-check after acquiring lock (another request may have completed)
    const existingAfterLock = await store.retrieve(storageKey);
    if (existingAfterLock) {
      return { ...existingAfterLock.response };
    }

    // Process request
    const response = await handler();

    // Cache response
    await store.store(storageKey, {
      statusCode: response.status,
      body: await response.json(),
      headers: response.headers,
      timestamp: Date.now(),
      requestHash
    });

    return response;
  } finally {
    await store.releaseLock(storageKey, lockToken);
  }
}
```

### 2.4 Sequence Diagrams

This section provides detailed sequence diagrams for the key idempotency flows, illustrating how clients, servers, and storage interact in different scenarios.

#### 2.4.1 Normal Flow: Initial Request + Replay

Shows the typical idempotency flow where an initial request succeeds, then a retry with the same key returns the cached response.

```
Client                    API Server                  IdempotencyStore
  │                            │                              │
  │                            │                              │
  ├─ POST /submit ────────────►│                              │
  │  Idempotency-Key: abc123   │                              │
  │  { fields: {...} }         │                              │
  │                            │                              │
  │                            ├─ retrieve(abc123) ──────────►│
  │                            │                              │
  │                            │◄─ null (key not found) ──────┤
  │                            │                              │
  │                            ├─ acquireLock(abc123) ────────►│
  │                            │                              │
  │                            │◄─ lockToken: uuid-a ─────────┤
  │                            │                              │
  │                            ├─ retrieve(abc123) ──────────►│
  │                            │  (double-check)              │
  │                            │                              │
  │                            │◄─ null ──────────────────────┤
  │                            │                              │
  │                            │  [Process request]           │
  │                            │  - Validate fields           │
  │                            │  - Create submission         │
  │                            │  - Store in database         │
  │                            │                              │
  │                            ├─ store(abc123, response) ────►│
  │                            │  TTL: 24h                    │
  │                            │                              │
  │                            │◄─ OK ────────────────────────┤
  │                            │                              │
  │                            ├─ releaseLock(uuid-a) ────────►│
  │                            │                              │
  │                            │◄─ OK ────────────────────────┤
  │                            │                              │
  │◄─ 201 Created ─────────────┤                              │
  │  { submissionId: sub_001 } │                              │
  │                            │                              │
  │                            │                              │
  │  [Network timeout / retry] │                              │
  │                            │                              │
  ├─ POST /submit ────────────►│                              │
  │  Idempotency-Key: abc123   │                              │
  │  { fields: {...} }         │                              │
  │                            │                              │
  │                            ├─ retrieve(abc123) ──────────►│
  │                            │                              │
  │                            │◄─ cached response ───────────┤
  │                            │  { submissionId: sub_001 }   │
  │                            │                              │
  │                            │  [Hash matches - replay!]    │
  │                            │                              │
  │◄─ 200 OK ──────────────────┤                              │
  │  Idempotent-Replayed: true │                              │
  │  { submissionId: sub_001 } │                              │
  │                            │                              │
```

**Key points:**
- Initial request: Server checks cache (miss), acquires lock, processes, stores response
- Replay: Server checks cache (hit), validates request hash, returns cached response immediately
- No lock acquired on replay (fast path)
- Client receives same `submissionId` in both responses

#### 2.4.2 Conflict Flow: Same Key, Different Payload

Shows what happens when a client reuses an idempotency key with a different request payload, which is rejected with a conflict error.

```
Client                    API Server                  IdempotencyStore
  │                            │                              │
  │                            │                              │
  ├─ POST /submit ────────────►│                              │
  │  Idempotency-Key: abc123   │                              │
  │  { fields: {               │                              │
  │    companyName: "Acme"     │                              │
  │  }}                        │                              │
  │                            │                              │
  │                            ├─ retrieve(abc123) ──────────►│
  │                            │                              │
  │                            │◄─ null ──────────────────────┤
  │                            │                              │
  │                            ├─ acquireLock(abc123) ────────►│
  │                            │                              │
  │                            │◄─ lockToken: uuid-a ─────────┤
  │                            │                              │
  │                            │  [Process request]           │
  │                            │  requestHash: sha256(Acme)   │
  │                            │                              │
  │                            ├─ store(abc123, response) ────►│
  │                            │  requestHash: sha256(Acme)   │
  │                            │                              │
  │                            │◄─ OK ────────────────────────┤
  │                            │                              │
  │                            ├─ releaseLock(uuid-a) ────────►│
  │                            │                              │
  │                            │◄─ OK ────────────────────────┤
  │                            │                              │
  │◄─ 201 Created ─────────────┤                              │
  │  { submissionId: sub_001 } │                              │
  │                            │                              │
  │                            │                              │
  │  [Different payload!]      │                              │
  │                            │                              │
  ├─ POST /submit ────────────►│                              │
  │  Idempotency-Key: abc123   │                              │
  │  { fields: {               │                              │
  │    companyName: "Evil Corp"│                              │
  │  }}                        │                              │
  │                            │                              │
  │                            ├─ retrieve(abc123) ──────────►│
  │                            │                              │
  │                            │◄─ cached response ───────────┤
  │                            │  requestHash: sha256(Acme)   │
  │                            │                              │
  │                            │  [Calculate new hash]        │
  │                            │  requestHash: sha256(Evil)   │
  │                            │                              │
  │                            │  [Compare hashes]            │
  │                            │  sha256(Acme) ≠ sha256(Evil) │
  │                            │                              │
  │                            │  ❌ CONFLICT DETECTED!       │
  │                            │                              │
  │◄─ 409 Conflict ────────────┤                              │
  │  {                         │                              │
  │    error: {                │                              │
  │      type: "conflict",     │                              │
  │      message: "Key already │                              │
  │        used with different │                              │
  │        payload",           │                              │
  │      retryable: false      │                              │
  │    }                       │                              │
  │  }                         │                              │
  │                            │                              │
```

**Key points:**
- First request succeeds and stores response with request hash
- Second request with same key but different payload retrieves cached response
- Server compares request hashes: mismatch detected
- 409 Conflict returned (not retryable with same key)
- Client must generate new idempotency key to proceed

#### 2.4.3 Concurrent Requests Flow

Shows how distributed locking prevents race conditions when multiple requests with the same idempotency key arrive simultaneously.

```
Client A              Client B              API Server            IdempotencyStore
  │                      │                        │                      │
  │                      │                        │                      │
  ├─ POST /submit ──────────────────────────────►│                      │
  │  Key: abc123         │                        │                      │
  │  @ T0                │                        │                      │
  │                      │                        ├─ retrieve(abc123) ──►│
  │                      │                        │                      │
  │                      │                        │◄─ null ──────────────┤
  │                      │                        │                      │
  │                      │                        ├─ acquireLock(abc123)─►│
  │                      │                        │                      │
  │                      │                        │◄─ lockToken: uuid-a ─┤
  │                      │                        │  ✓ Lock acquired     │
  │                      │                        │                      │
  │                      ├─ POST /submit ─────────►│                      │
  │                      │  Key: abc123           │                      │
  │                      │  @ T0 + 5ms            │                      │
  │                      │                        │                      │
  │                      │                        ├─ retrieve(abc123) ──►│
  │                      │                        │                      │
  │                      │                        │◄─ null ──────────────┤
  │                      │                        │                      │
  │                      │                        ├─ acquireLock(abc123)─►│
  │                      │                        │                      │
  │                      │                        │◄─ [BLOCKED] ─────────┤
  │                      │                        │  (lock held by A)    │
  │                      │                        │                      │
  │                      │                        │  [Client B waits...] │
  │                      │                        │  [polling every 50ms]│
  │                      │                        │                      │
  │  [Client A processing]                        │                      │
  │                      │                        │  [Validate fields]   │
  │                      │                        │  [Create submission] │
  │                      │                        │  [Store in DB]       │
  │                      │                        │                      │
  │                      │                        ├─ store(abc123, resp)─►│
  │                      │                        │                      │
  │                      │                        │◄─ OK ────────────────┤
  │                      │                        │                      │
  │                      │                        ├─ releaseLock(uuid-a)─►│
  │                      │                        │                      │
  │                      │                        │◄─ OK ────────────────┤
  │                      │                        │  ✓ Lock released     │
  │                      │                        │                      │
  │◄─ 201 Created ──────────────────────────────┤                      │
  │  { submissionId:     │                        │                      │
  │    sub_001 }         │                        │                      │
  │                      │                        │                      │
  │                      │                        ├─ acquireLock(abc123)─►│
  │                      │                        │  (Client B retrying) │
  │                      │                        │                      │
  │                      │                        │◄─ lockToken: uuid-b ─┤
  │                      │                        │  ✓ Lock acquired     │
  │                      │                        │                      │
  │                      │                        ├─ retrieve(abc123) ──►│
  │                      │                        │  (double-check)      │
  │                      │                        │                      │
  │                      │                        │◄─ cached response ───┤
  │                      │                        │  { sub_001 }         │
  │                      │                        │                      │
  │                      │                        │  [Cache hit!]        │
  │                      │                        │  [No processing]     │
  │                      │                        │                      │
  │                      │                        ├─ releaseLock(uuid-b)─►│
  │                      │                        │                      │
  │                      │                        │◄─ OK ────────────────┤
  │                      │                        │                      │
  │                      │◄─ 200 OK ──────────────┤                      │
  │                      │  Idempotent-Replayed:  │                      │
  │                      │    true                │                      │
  │                      │  { submissionId:       │                      │
  │                      │    sub_001 }           │                      │
  │                      │                        │                      │
```

**Key points:**
- Client A arrives first, acquires lock, processes request
- Client B arrives shortly after, tries to acquire lock → BLOCKED
- Client B polls periodically (every 50ms) waiting for lock
- Client A completes, stores response, releases lock
- Client B acquires lock, double-checks cache → HIT
- Client B returns cached response without reprocessing
- Both clients receive identical response (same submissionId)
- No duplicate submissions created

#### 2.4.4 TTL Expiration Flow

Shows what happens when an idempotency key expires after the configured TTL, allowing the same key to be reused for a new submission.

```
Client                    API Server                  IdempotencyStore
  │                            │                              │
  │                            │                              │
  ├─ POST /submit @ T0 ───────►│                              │
  │  Idempotency-Key: abc123   │                              │
  │  { fields: {...} }         │                              │
  │                            │                              │
  │                            ├─ retrieve(abc123) ──────────►│
  │                            │                              │
  │                            │◄─ null ──────────────────────┤
  │                            │                              │
  │                            ├─ acquireLock(abc123) ────────►│
  │                            │                              │
  │                            │◄─ lockToken: uuid-a ─────────┤
  │                            │                              │
  │                            │  [Process request]           │
  │                            │                              │
  │                            ├─ store(abc123, response) ────►│
  │                            │  TTL: 24h                    │
  │                            │  expiresAt: T0 + 24h         │
  │                            │                              │
  │                            │◄─ OK ────────────────────────┤
  │                            │                              │
  │                            ├─ releaseLock(uuid-a) ────────►│
  │                            │                              │
  │                            │◄─ OK ────────────────────────┤
  │                            │                              │
  │◄─ 201 Created ─────────────┤                              │
  │  { submissionId: sub_001 } │                              │
  │                            │                              │
  │                            │                              │
  │  [Within TTL: 1 hour later @ T0 + 1h]                     │
  │                            │                              │
  ├─ POST /submit @ T0+1h ────►│                              │
  │  Idempotency-Key: abc123   │                              │
  │  { fields: {...} }         │                              │
  │                            │                              │
  │                            ├─ retrieve(abc123) ──────────►│
  │                            │                              │
  │                            │◄─ cached response ───────────┤
  │                            │  { submissionId: sub_001 }   │
  │                            │  expiresAt: T0 + 24h         │
  │                            │  (still valid!)              │
  │                            │                              │
  │◄─ 200 OK ──────────────────┤                              │
  │  Idempotent-Replayed: true │                              │
  │  { submissionId: sub_001 } │                              │
  │                            │                              │
  │                            │                              │
  │  [After TTL: 25 hours later @ T0 + 25h]                   │
  │                            │                              │
  │                            │                        [Background]      │
  │                            │                        cleanup or        │
  │                            │                        Redis EXPIRE      │
  │                            │                              │
  │                            │                        ├─ Delete(abc123) │
  │                            │                        │  (expired)       │
  │                            │                              │
  ├─ POST /submit @ T0+25h ───►│                              │
  │  Idempotency-Key: abc123   │                              │
  │  { fields: {...} }         │                              │
  │                            │                              │
  │                            ├─ retrieve(abc123) ──────────►│
  │                            │                              │
  │                            │◄─ null ──────────────────────┤
  │                            │  (key expired!)              │
  │                            │                              │
  │                            ├─ acquireLock(abc123) ────────►│
  │                            │                              │
  │                            │◄─ lockToken: uuid-b ─────────┤
  │                            │                              │
  │                            │  [Process as NEW request]    │
  │                            │  [Create NEW submission]     │
  │                            │                              │
  │                            ├─ store(abc123, response) ────►│
  │                            │  TTL: 24h                    │
  │                            │  expiresAt: T0+25h + 24h     │
  │                            │                              │
  │                            │◄─ OK ────────────────────────┤
  │                            │                              │
  │                            ├─ releaseLock(uuid-b) ────────►│
  │                            │                              │
  │                            │◄─ OK ────────────────────────┤
  │                            │                              │
  │◄─ 201 Created ─────────────┤                              │
  │  { submissionId: sub_002 } │                              │
  │  ↑ NEW submission ID!      │                              │
  │                            │                              │
```

**Key points:**
- Initial request (T0): Creates submission with ID `sub_001`, stores with 24h TTL
- Request at T0+1h (within TTL): Returns cached response, same ID `sub_001`
- TTL expires at T0+24h: Key automatically removed from storage
- Request at T0+25h (after TTL): Key not found, creates NEW submission `sub_002`
- Client receives different submission ID after expiration
- Idempotency key can be safely reused after expiration
- TTL prevents unbounded storage growth

---

## 3. Storage Backend Interface

The idempotency system is built on a pluggable storage interface. Implementations can use in-memory storage (development), Redis (production), or a database (when Redis is unavailable).

### 3.1 Interface Definition

```typescript
interface IdempotencyStore {
  /**
   * Check if an idempotency key exists.
   * @returns true if cached response exists and hasn't expired
   */
  exists(key: string): Promise<boolean>;

  /**
   * Retrieve cached response for an idempotency key.
   * @returns CachedResponse or null if not found/expired
   */
  retrieve(key: string): Promise<CachedResponse | null>;

  /**
   * Store a response for an idempotency key.
   * @param key Storage key (includes scope: {intakeId}:{idempotencyKey})
   * @param response The response to cache
   * @param ttlMs Time-to-live in milliseconds
   */
  store(key: string, response: CachedResponse, ttlMs: number): Promise<void>;

  /**
   * Acquire a distributed lock for concurrent request handling.
   * Blocks until lock is acquired or timeout is reached.
   * @returns Lock token (UUID) to pass to releaseLock
   * @throws LockTimeoutError if lock cannot be acquired within timeoutMs
   */
  acquireLock(key: string, options: { timeoutMs: number }): Promise<string>;

  /**
   * Release a previously acquired lock.
   * @param lockToken The token returned by acquireLock
   */
  releaseLock(key: string, lockToken: string): Promise<void>;

  /**
   * Delete an idempotency key (for testing or manual cleanup).
   */
  delete(key: string): Promise<void>;

  /**
   * Clean up expired keys (background process).
   * Only needed for storage backends without native TTL (in-memory, some DBs).
   */
  cleanup(): Promise<number>; // Returns number of keys deleted
}
```

### 3.2 In-Memory Implementation (Default)

```typescript
class InMemoryIdempotencyStore implements IdempotencyStore {
  private cache = new Map<string, IdempotencyRecord>();
  private locks = new Map<string, { token: string; expiresAt: number }>();

  async exists(key: string): Promise<boolean> {
    const record = this.cache.get(key);
    if (!record) return false;
    if (record.expiresAt < Date.now()) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  async retrieve(key: string): Promise<CachedResponse | null> {
    const record = this.cache.get(key);
    if (!record) return null;
    if (record.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return record.response;
  }

  async store(key: string, response: CachedResponse, ttlMs: number): Promise<void> {
    this.cache.set(key, {
      key,
      response,
      expiresAt: Date.now() + ttlMs,
      locked: false
    });
  }

  async acquireLock(key: string, options: { timeoutMs: number }): Promise<string> {
    const deadline = Date.now() + options.timeoutMs;
    const lockToken = crypto.randomUUID();

    while (Date.now() < deadline) {
      const existingLock = this.locks.get(key);

      // Check if lock is expired
      if (existingLock && existingLock.expiresAt < Date.now()) {
        this.locks.delete(key);
      }

      // Try to acquire lock
      if (!this.locks.has(key)) {
        this.locks.set(key, {
          token: lockToken,
          expiresAt: Date.now() + 30000 // Lock expires after 30s
        });
        return lockToken;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new LockTimeoutError(`Failed to acquire lock for key "${key}" within ${options.timeoutMs}ms`);
  }

  async releaseLock(key: string, lockToken: string): Promise<void> {
    const existingLock = this.locks.get(key);
    if (existingLock && existingLock.token === lockToken) {
      this.locks.delete(key);
    }
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    this.locks.delete(key);
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let deleted = 0;

    for (const [key, record] of this.cache.entries()) {
      if (record.expiresAt < now) {
        this.cache.delete(key);
        deleted++;
      }
    }

    for (const [key, lock] of this.locks.entries()) {
      if (lock.expiresAt < now) {
        this.locks.delete(key);
      }
    }

    return deleted;
  }
}
```

**Usage:**
- Default for development and testing
- Suitable for single-instance deployments
- **Not suitable for production multi-instance deployments** (no cross-process locking)

### 3.3 Redis Implementation (Production)

```typescript
class RedisIdempotencyStore implements IdempotencyStore {
  constructor(private redis: RedisClient) {}

  async exists(key: string): Promise<boolean> {
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  async retrieve(key: string): Promise<CachedResponse | null> {
    const data = await this.redis.get(key);
    if (!data) return null;
    return JSON.parse(data);
  }

  async store(key: string, response: CachedResponse, ttlMs: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(response), {
      PX: ttlMs // TTL in milliseconds
    });
  }

  async acquireLock(key: string, options: { timeoutMs: number }): Promise<string> {
    const lockKey = `lock:${key}`;
    const lockToken = crypto.randomUUID();
    const deadline = Date.now() + options.timeoutMs;

    while (Date.now() < deadline) {
      const acquired = await this.redis.set(lockKey, lockToken, {
        NX: true, // Only set if not exists
        PX: 30000 // Lock expires after 30s
      });

      if (acquired === 'OK') {
        return lockToken;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new LockTimeoutError(`Failed to acquire lock for key "${key}" within ${options.timeoutMs}ms`);
  }

  async releaseLock(key: string, lockToken: string): Promise<void> {
    const lockKey = `lock:${key}`;

    // Lua script for atomic compare-and-delete
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    await this.redis.eval(script, {
      keys: [lockKey],
      arguments: [lockToken]
    });
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async cleanup(): Promise<number> {
    // Redis handles expiration automatically via TTL
    return 0;
  }
}
```

**Configuration:**
```typescript
const store = new RedisIdempotencyStore(
  new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: 1 // Dedicated DB for idempotency
  })
);
```

**Benefits:**
- Native TTL support (no manual cleanup needed)
- Distributed locking across multiple server instances
- High performance (in-memory reads)
- Persistence options (RDB/AOF)

### 3.4 Database Implementation (PostgreSQL/MySQL)

```sql
-- Migration: Create idempotency_keys table
CREATE TABLE idempotency_keys (
  key VARCHAR(512) PRIMARY KEY,
  status_code INTEGER NOT NULL,
  response_body JSONB NOT NULL,
  response_headers JSONB,
  request_hash VARCHAR(64) NOT NULL,
  timestamp BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  locked BOOLEAN DEFAULT FALSE,
  lock_token UUID,
  lock_acquired_at BIGINT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_idempotency_keys_expires_at ON idempotency_keys(expires_at);
CREATE INDEX idx_idempotency_keys_locked ON idempotency_keys(locked) WHERE locked = TRUE;
```

```typescript
class DatabaseIdempotencyStore implements IdempotencyStore {
  constructor(private db: Database) {}

  async exists(key: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM idempotency_keys
       WHERE key = $1 AND expires_at > $2`,
      [key, Date.now()]
    );
    return result.rows.length > 0;
  }

  async retrieve(key: string): Promise<CachedResponse | null> {
    const result = await this.db.query(
      `SELECT status_code, response_body, response_headers, request_hash, timestamp
       FROM idempotency_keys
       WHERE key = $1 AND expires_at > $2`,
      [key, Date.now()]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      statusCode: row.status_code,
      body: row.response_body,
      headers: row.response_headers,
      requestHash: row.request_hash,
      timestamp: row.timestamp
    };
  }

  async store(key: string, response: CachedResponse, ttlMs: number): Promise<void> {
    await this.db.query(
      `INSERT INTO idempotency_keys (key, status_code, response_body, response_headers, request_hash, timestamp, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (key) DO NOTHING`,
      [
        key,
        response.statusCode,
        JSON.stringify(response.body),
        JSON.stringify(response.headers),
        response.requestHash,
        response.timestamp,
        Date.now() + ttlMs
      ]
    );
  }

  async acquireLock(key: string, options: { timeoutMs: number }): Promise<string> {
    const lockToken = crypto.randomUUID();
    const deadline = Date.now() + options.timeoutMs;

    while (Date.now() < deadline) {
      const result = await this.db.query(
        `UPDATE idempotency_keys
         SET locked = TRUE, lock_token = $1, lock_acquired_at = $2
         WHERE key = $3 AND (locked = FALSE OR lock_acquired_at < $4)
         RETURNING lock_token`,
        [
          lockToken,
          Date.now(),
          key,
          Date.now() - 30000 // Lock expires after 30s
        ]
      );

      if (result.rows.length > 0) {
        return lockToken;
      }

      await new Promise(resolve => setTimeout(resolve, 50));
    }

    throw new LockTimeoutError(`Failed to acquire lock for key "${key}" within ${options.timeoutMs}ms`);
  }

  async releaseLock(key: string, lockToken: string): Promise<void> {
    await this.db.query(
      `UPDATE idempotency_keys
       SET locked = FALSE, lock_token = NULL, lock_acquired_at = NULL
       WHERE key = $1 AND lock_token = $2`,
      [key, lockToken]
    );
  }

  async delete(key: string): Promise<void> {
    await this.db.query(`DELETE FROM idempotency_keys WHERE key = $1`, [key]);
  }

  async cleanup(): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM idempotency_keys WHERE expires_at < $1`,
      [Date.now()]
    );
    return result.rowCount || 0;
  }
}
```

**When to use:**
- Redis unavailable or cost-prohibitive
- Strong consistency requirements
- Need for complex queries on idempotency metadata
- Already using a database for submission storage

---

## 4. Concurrency Model and Locking Strategy

This section defines how FormBridge handles concurrent requests with the same idempotency key across distributed server instances. The design prevents race conditions, ensures exactly-once semantics, and provides predictable behavior under various failure scenarios.

### 4.1 The Race Condition Problem

Without proper locking, concurrent requests with the same idempotency key can cause:
- Both requests process simultaneously
- Duplicate side effects (webhooks, database writes, downstream API calls)
- Race condition: second request completes before first, first's result overwrites second's
- Inconsistent state: partial updates from multiple requests

**Example:**
```
Time →
0ms:  Client A sends request (key: abc123)
5ms:  Client B sends request (key: abc123)
10ms: Server A checks store → key not found
15ms: Server B checks store → key not found
20ms: Server A processes request
25ms: Server B processes request (DUPLICATE!)
30ms: Server A stores result
35ms: Server B stores result (OVERWRITES A's result!)
```

**Consequences:**
- **Duplicate submissions**: Two submission records created in database
- **Double webhooks**: External systems receive the same event twice
- **Lost work**: Server B's result overwrites Server A's result
- **Data corruption**: Inconsistent state if requests have different payloads

### 4.2 Distributed Locking Strategy

FormBridge uses **distributed advisory locks** to ensure only one request with a given idempotency key processes at a time, even across multiple server instances.

#### 4.2.1 Lock Protocol

**Standard flow:**
1. **Check cache**: Query `retrieve(key)` to see if response exists
   - If found and request hash matches → return cached response (no lock needed)
   - If found and request hash differs → throw `IdempotencyConflictError`
2. **Acquire lock**: Call `acquireLock(key, { timeoutMs: 30000 })`
   - Blocks until lock is acquired or timeout is reached
   - Returns unique lock token (UUID)
3. **Double-check cache**: Query `retrieve(key)` again after acquiring lock
   - Another instance may have completed while we were waiting
   - If found → release lock and return cached response
4. **Process request**: Execute business logic (validation, database writes, webhooks)
5. **Store response**: Call `store(key, response, ttlMs)`
6. **Release lock**: Call `releaseLock(key, lockToken)` in finally block
   - Always release, even if processing fails

**Lock Properties:**
- **Timeout**: 30 seconds (configurable)
  - Prevents deadlocks if a server crashes while holding lock
  - Long enough for typical request processing (validation, DB writes, webhooks)
  - Short enough to avoid excessive wait times
- **Token-based**: Lock identified by unique UUID token
  - Prevents accidental release by another process
  - Only the holder of the token can release the lock
- **Atomic**: Acquire and release are atomic operations
  - Redis: `SET key value NX PX 30000` (atomic set-if-not-exists with expiration)
  - Database: `UPDATE ... WHERE locked = FALSE` (row-level lock with transaction)
- **Auto-expiring**: Locks expire after timeout to prevent deadlocks
  - If server crashes, lock is automatically released after 30s
  - Prevents permanent deadlock from unrecoverable failures

#### 4.2.2 Distributed Lock Implementations

**Redis Implementation (Production):**
```typescript
async acquireLock(key: string, options: { timeoutMs: number }): Promise<string> {
  const lockKey = `lock:${key}`;
  const lockToken = crypto.randomUUID();
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() < deadline) {
    // SET NX PX is atomic: only sets if key doesn't exist, with expiration
    const acquired = await this.redis.set(lockKey, lockToken, {
      NX: true,      // Only set if not exists
      PX: 30000      // Lock expires after 30s (prevents deadlock)
    });

    if (acquired === 'OK') {
      return lockToken;
    }

    // Wait before retrying (exponential backoff in production)
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  throw new LockTimeoutError(`Failed to acquire lock for key "${key}" within ${options.timeoutMs}ms`);
}

async releaseLock(key: string, lockToken: string): Promise<void> {
  const lockKey = `lock:${key}`;

  // Lua script for atomic compare-and-delete
  // Only delete if the lock token matches (prevents releasing someone else's lock)
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  await this.redis.eval(script, {
    keys: [lockKey],
    arguments: [lockToken]
  });
}
```

**Database Implementation:**
```typescript
async acquireLock(key: string, options: { timeoutMs: number }): Promise<string> {
  const lockToken = crypto.randomUUID();
  const deadline = Date.now() + options.timeoutMs;

  while (Date.now() < deadline) {
    // Atomic UPDATE: only succeeds if lock is not held or expired
    const result = await this.db.query(
      `UPDATE idempotency_keys
       SET locked = TRUE, lock_token = $1, lock_acquired_at = $2
       WHERE key = $3 AND (locked = FALSE OR lock_acquired_at < $4)
       RETURNING lock_token`,
      [
        lockToken,
        Date.now(),
        key,
        Date.now() - 30000  // Lock expired if acquired > 30s ago
      ]
    );

    if (result.rows.length > 0) {
      return lockToken;
    }

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  throw new LockTimeoutError(`Failed to acquire lock for key "${key}" within ${options.timeoutMs}ms`);
}
```

**Why distributed locks matter:**
- **Multi-instance safety**: Locks work across multiple server instances (horizontal scaling)
- **No shared memory**: Each server instance has its own memory; Redis/DB provides coordination
- **Network partition tolerance**: Lock timeouts prevent indefinite blocking during network issues
- **Crash recovery**: Expired locks are automatically released after 30s

### 4.3 Request Queuing and Wait Strategy

When multiple requests arrive with the same idempotency key, the locking mechanism creates an implicit queue:

#### 4.3.1 Queuing Behavior

**Scenario: 3 concurrent requests with same key**
```
Time →   Request A          Request B          Request C
0ms:     arrive
1ms:     acquireLock ✓     arrive
2ms:     processing        acquireLock [WAIT]  arrive
3ms:     ...               [polling lock]      acquireLock [WAIT]
4ms:     ...               [polling lock]      [polling lock]
...
28ms:    store response    [polling lock]      [polling lock]
29ms:    releaseLock       acquireLock ✓       [polling lock]
30ms:    return 201        retrieve cache ✓    [polling lock]
31ms:                      releaseLock         acquireLock ✓
32ms:                      return 200          retrieve cache ✓
33ms:                                          releaseLock
34ms:                                          return 200
```

**Key observations:**
1. **No explicit queue**: Requests poll for lock availability (spin-lock pattern)
2. **Fairness**: Lock acquisition order is non-deterministic (depends on timing)
3. **Resource usage**: Waiting requests consume minimal resources (sleep between polls)
4. **Bounded wait**: All requests timeout after `timeoutMs` (default 30s)

#### 4.3.2 Polling Strategy

```typescript
// Simplified polling loop
const pollIntervalMs = 50;
const deadline = Date.now() + timeoutMs;

while (Date.now() < deadline) {
  const acquired = await tryAcquireLock(key, lockToken);
  if (acquired) {
    return lockToken;  // Got the lock!
  }

  // Sleep before retrying (avoids tight loop)
  await sleep(pollIntervalMs);
}

throw new LockTimeoutError("Lock acquisition timeout");
```

**Polling interval tuning:**
- **Too short** (1-10ms): High CPU usage, excessive Redis/DB queries
- **Too long** (500ms+): Slow response times, poor user experience
- **Sweet spot** (50-100ms): Balances responsiveness and resource usage

**Production optimization: Exponential backoff**
```typescript
let backoffMs = 50;
const maxBackoffMs = 1000;

while (Date.now() < deadline) {
  const acquired = await tryAcquireLock(key, lockToken);
  if (acquired) return lockToken;

  await sleep(backoffMs);
  backoffMs = Math.min(backoffMs * 1.5, maxBackoffMs);  // Exponential backoff
}
```

#### 4.3.3 Queue Depth Limiting (Optional)

For high-traffic scenarios, limit concurrent waiters to prevent thundering herd:

```typescript
const MAX_WAITERS = 10;
const waiterCounts = new Map<string, number>();

async function acquireLockWithLimit(key: string, options): Promise<string> {
  const currentWaiters = waiterCounts.get(key) || 0;

  if (currentWaiters >= MAX_WAITERS) {
    throw new TooManyWaitersError(
      `Too many concurrent requests for idempotency key "${key}". ` +
      `Please retry after a short delay.`
    );
  }

  waiterCounts.set(key, currentWaiters + 1);

  try {
    return await acquireLock(key, options);
  } finally {
    waiterCounts.set(key, currentWaiters);
  }
}
```

**When to use:**
- High request rates with many retries
- Protection against denial-of-service (intentional or accidental)
- Resource-constrained environments

### 4.4 Concurrent Request Flow

```
Client A                    Server (Lock)               Storage
   │                             │                         │
   ├─ POST (key: abc123) ───────►│                         │
   │                             ├─ retrieve(abc123) ─────►│
   │                             │◄─ null ─────────────────┤
   │                             ├─ acquireLock(abc123) ──►│
   │                             │◄─ OK (token: uuid-a) ───┤
   │                             ├─ retrieve(abc123) ─────►│  (double-check)
   │                             │◄─ null ─────────────────┤
   │                             │                         │
   │         [Processing...]     │                         │
   │                             │                         │
Client B                         │                         │
   │                             │                         │
   ├─ POST (key: abc123) ───────►│                         │
   │                             ├─ retrieve(abc123) ─────►│
   │                             │◄─ null ─────────────────┤
   │                             ├─ acquireLock(abc123) ──►│
   │                             │  [BLOCKED - polling] ───┤
   │                             │       [50ms wait]       │
   │                             │  [BLOCKED - polling] ───┤
   │                             │       [50ms wait]       │
   │                             │         ...             │
Client A                         │                         │
   │                             ├─ store(abc123, resp) ──►│
   │◄─ 201 Created ──────────────┤                         │
   │                             ├─ releaseLock(uuid-a) ──►│
   │                             │◄─ OK ───────────────────┤
   │                             │                         │
Client B                         │                         │
   │                             ├─ acquireLock(abc123) ──►│
   │                             │◄─ OK (token: uuid-b) ───┤
   │                             ├─ retrieve(abc123) ─────►│  (double-check)
   │                             │◄─ cached response ──────┤
   │◄─ 200 OK (replayed) ────────┤                         │
   │    Idempotent-Replayed: true│                         │
   │                             ├─ releaseLock(uuid-b) ──►│
   │                             │◄─ OK ───────────────────┤
```

**Flow explanation:**
1. **Client A** checks cache (miss), acquires lock, processes request
2. **Client B** checks cache (miss), tries to acquire lock → **blocked**
3. **Client B** polls every 50ms waiting for lock to be released
4. **Client A** completes, stores response, releases lock
5. **Client B** acquires lock, checks cache → **hit**, returns cached response
6. **Client B** never processes request (idempotent replay)

### 4.5 Timeout Handling and Edge Cases

#### 4.5.1 Lock Acquisition Timeout

**Scenario:** Request waits for lock but times out before acquiring it.

```typescript
try {
  const lockToken = await store.acquireLock(key, { timeoutMs: 30000 });
  // ... process request ...
} catch (error) {
  if (error instanceof LockTimeoutError) {
    // Lock acquisition timed out after 30s
    throw new IdempotencyError(
      `Request timed out waiting for concurrent request to complete. ` +
      `This typically means the first request is taking longer than expected. ` +
      `Please retry after a short delay.`,
      { retryable: true, retryAfterMs: 5000 }
    );
  }
}
```

**Client behavior:**
- Receives 503 Service Unavailable (temporary failure)
- Should retry after suggested delay (5s)
- Retry will either:
  - Find cached response (first request completed)
  - Acquire lock (first request failed/timed out)

**Prevention:**
- Increase lock acquisition timeout for slow operations
- Optimize request processing time
- Monitor lock wait times and alert on excessive delays

#### 4.5.2 Lock Expiration During Processing

**Scenario:** Request acquires lock, processes for > 30s, lock expires before completion.

```
Time →
0s:   Request A acquires lock
...   [Processing for 32 seconds]
30s:  Lock expires automatically
31s:  Request B acquires lock
32s:  Request A completes and tries to store
32s:  Request B starts processing (DUPLICATE!)
```

**Mitigation: Conditional Write**

**Redis:**
```typescript
// Only store if key doesn't exist (first write wins)
const stored = await redis.set(key, value, { NX: true, PX: ttlMs });
if (!stored) {
  // Another request already stored a response
  logger.warn("Response already cached by another request");
}
```

**Database:**
```typescript
// ON CONFLICT DO NOTHING: only first write succeeds
await db.query(
  `INSERT INTO idempotency_keys (key, ...) VALUES ($1, ...)
   ON CONFLICT (key) DO NOTHING`,
  [key, ...]
);
```

**Result:**
- Request A's store operation fails silently (key already exists)
- Request B's store operation succeeds (first write)
- Both requests return the same cached response
- **No duplicate processing** because lock prevented concurrent execution

**Prevention:**
- Monitor request processing times
- Increase lock timeout for known slow operations
- Optimize business logic to complete within timeout

#### 4.5.3 Server Crash While Holding Lock

**Scenario:** Server crashes or network partition occurs while holding lock.

```
Time →
0s:   Request A acquires lock on Server 1
1s:   Server 1 crashes
...   [Lock held in Redis/DB]
30s:  Lock expires automatically
31s:  Request B acquires lock and processes normally
```

**Auto-recovery:**
- Lock expires after 30s (self-healing)
- No manual intervention required
- Request B processes normally after lock expiration

**Detection:**
- Monitor lock age: alert if locks held > 25s
- Track lock expirations: high expiration rate indicates crashes or timeouts

#### 4.5.4 Network Partition Between App and Storage

**Scenario:** Network partition between application server and Redis/DB.

**During partition:**
- Lock acquisition fails (cannot reach Redis/DB)
- Requests fail immediately (no partial state)
- Error: `503 Service Unavailable - Cannot acquire lock`

**After partition heals:**
- Requests resume normally
- Expired locks are cleaned up automatically

**Resilience:**
- Use Redis Sentinel or Redis Cluster for high availability
- Database replication and failover for database backend
- Circuit breaker pattern: stop trying after N consecutive failures

### 4.6 Deadlock Prevention

**FormBridge's design prevents deadlocks:**

1. **Lock ordering**: Each request only acquires one lock (no multi-lock scenarios)
2. **Lock timeouts**: All locks expire after 30s (prevents permanent deadlock)
3. **No nested locks**: Locks are not re-entrant or nested
4. **Token-based release**: Only lock holder can release (no accidental release)

**Anti-pattern avoided:**
```typescript
// ❌ This would cause deadlocks:
await acquireLock(key1);
await acquireLock(key2);  // If another request locks key2 then key1
```

**FormBridge pattern:**
```typescript
// ✅ Single lock per request:
await acquireLock(key);
// ... process ...
await releaseLock(key);
```

### 4.7 Performance Considerations

**Lock overhead:**
- **Fast path** (cache hit, no lock needed): ~1-2ms (single Redis/DB query)
- **Lock acquisition** (no contention): ~2-5ms (Redis SET NX)
- **Lock wait** (with contention): 50ms-30s (depends on first request duration)

**Optimization strategies:**
1. **Early cache check**: Check cache before acquiring lock (saves lock overhead on replays)
2. **Lock-free reads**: Read operations never acquire locks
3. **Conditional writes**: Use `NX` or `ON CONFLICT DO NOTHING` (prevents overwrites)
4. **Connection pooling**: Reuse Redis/DB connections (reduces latency)
5. **Monitor lock wait times**: Alert on excessive waits (indicates scaling or optimization needs)

**Scaling:**
- **Horizontal**: Add more app servers (locks coordinate across instances)
- **Redis**: Single-instance Redis can handle 100k+ locks/sec
- **Database**: Use connection pooling and read replicas for read-heavy workloads

---

## 5. TTL and Expiration

### 5.1 TTL Design

Idempotency keys have a **time-to-live (TTL)** to prevent unbounded storage growth. After TTL expires, the key is treated as if it never existed.

**Default TTL: 24 hours (86,400,000 milliseconds)**

**Rationale:**
- Long enough for agents to retry failed requests within a reasonable timeframe
- Short enough to prevent storage bloat
- Aligns with typical retry windows (seconds to hours, not days)

### 5.2 When TTL Starts

TTL starts when the **response is first cached**, not when the request is received.

**Example:**
- Request received at 10:00 AM
- Request processes for 5 minutes
- Response cached at 10:05 AM
- **TTL expires at 10:05 AM + 24h = 10:05 AM next day**

### 5.3 Configurable TTL

TTL can be configured:
1. **Globally**: Default for all intakes
2. **Per-intake**: Override in intake definition
3. **Per-request**: `X-Idempotency-TTL` header (optional, for testing)

```typescript
// Intake definition
{
  "id": "vendor-onboarding",
  "idempotency": {
    "enabled": true,
    "ttlMs": 86400000 // 24 hours
  }
}
```

```bash
# Per-request override (testing only)
curl -X POST /api/intakes/vendor-onboarding/submit \
  -H "Idempotency-Key: test_key_123" \
  -H "X-Idempotency-TTL: 3600000" \
  -d '{"fields": {...}}'
```

### 5.4 Expiration Behavior

**What happens when a key expires:**
1. Key is no longer found in storage
2. Request with expired key is treated as a new request
3. No error is thrown — expiration is transparent to the client

**Client perspective:**
```
Time 0:    POST (key: abc123) → 201 Created (submissionId: sub_001)
Time 1h:   POST (key: abc123) → 200 OK (replayed, sub_001)
Time 25h:  POST (key: abc123) → 201 Created (submissionId: sub_002) ← NEW submission!
```

**Note:** The client receives a **different submissionId** after expiration, signaling that this is a new submission, not a replay.

### 5.5 Cleanup Strategies

#### Redis: Automatic (EXPIRE)
Redis natively handles TTL via the `EXPIRE` command. No manual cleanup needed.

```typescript
await redis.set(key, value, { PX: ttlMs }); // Automatically expires
```

#### In-Memory: Background Cleanup
In-memory store requires periodic cleanup to remove expired keys.

```typescript
// Run every 5 minutes
setInterval(async () => {
  const deleted = await store.cleanup();
  logger.info(`Cleaned up ${deleted} expired idempotency keys`);
}, 5 * 60 * 1000);
```

#### Database: Periodic Deletion
Database store requires a background job to delete expired rows.

```sql
-- Cleanup query (run every hour)
DELETE FROM idempotency_keys WHERE expires_at < EXTRACT(EPOCH FROM NOW()) * 1000;
```

**Alternative: Soft delete with archive**
```sql
-- Move expired keys to archive table
INSERT INTO idempotency_keys_archive
SELECT * FROM idempotency_keys WHERE expires_at < NOW();

DELETE FROM idempotency_keys WHERE expires_at < NOW();
```

---

## 6. Scope and Namespacing

### 6.1 Key Scoping

Idempotency keys are **scoped per intake definition**, not globally. The same idempotency key can be reused across different intakes without conflict.

**Storage key format:**
```
{intakeId}:{idempotencyKey}
```

**Examples:**
- Intake: `vendor-onboarding`, Key: `abc123` → Storage: `vendor-onboarding:abc123`
- Intake: `access-request`, Key: `abc123` → Storage: `access-request:abc123`

These are distinct keys and do not conflict.

### 6.2 Rationale

**Why scope per intake?**
1. **Isolation**: Different workflows have different semantics — collision should be impossible
2. **Key generation**: Clients can use simple sequential keys (workflow-specific) without global coordination
3. **Multi-tenancy**: Same client can use the same key pattern across different intakes

**Example:**
An agent managing multiple workflows:
```typescript
// Onboarding workflow
await formbridge.submit("vendor-onboarding", {
  idempotencyKey: "workflow-123:step-1",
  fields: {...}
});

// Access request workflow (same key, different intake)
await formbridge.submit("access-request", {
  idempotencyKey: "workflow-123:step-1", // No conflict!
  fields: {...}
});
```

### 6.3 Key Format Recommendations

**Recommended formats:**

1. **Random (most common)**
   ```
   idem_{uuid}
   idem_7f3a9d2e-8c4b-4f1a-9d6e-2c8f1b3e4a5d
   ```
   - Use `crypto.randomUUID()` or equivalent
   - Guaranteed unique (collision probability: negligible)

2. **Workflow-based**
   ```
   {workflowId}_{stepId}
   workflow-abc123_step-onboarding
   ```
   - Semantic meaning embedded in key
   - Useful for debugging and audit trails
   - Client must ensure uniqueness across retries

3. **Timestamp-based (not recommended)**
   ```
   {timestamp}_{random}
   20240129T120000Z_abc123
   ```
   - Sortable, but timestamp collisions possible
   - Better: Use UUIDv7 (timestamp-ordered UUIDs)

**Anti-patterns:**
- ❌ Sequential integers (`1`, `2`, `3`) — conflicts likely, no randomness
- ❌ User input (`user-123-submission`) — predictable, security risk
- ❌ Derived from payload (`hash(fields)`) — defeats the purpose (same payload = same hash, but we want explicit control)

### 6.4 Key Validation

**Rules:**
- Length: 1-255 characters
- Allowed characters: `a-z A-Z 0-9 _ - .` (URL-safe)
- Case-sensitive: `abc123` ≠ `ABC123`
- Must not contain: spaces, `#`, `/`, `?`, `&`, `=`, `%`

**Validation logic:**
```typescript
function validateIdempotencyKey(key: string): void {
  if (key.length < 1 || key.length > 255) {
    throw new Error("Idempotency key must be 1-255 characters");
  }

  if (!/^[a-zA-Z0-9_.-]+$/.test(key)) {
    throw new Error("Idempotency key contains invalid characters");
  }
}
```

### 6.5 Collision Prevention

**Within an intake:**
- Clients are responsible for generating unique keys
- UUIDs provide ~zero collision probability
- Sequential keys require client-side coordination

**Across intakes:**
- Namespace isolation prevents collisions
- Storage key includes `{intakeId}:` prefix

**Across environments:**
- Use separate Redis databases or table prefixes
  - Dev: `dev:{intakeId}:{key}`
  - Prod: `prod:{intakeId}:{key}`

**Conflict detection:**
When the same key is reused with a different payload, FormBridge returns an `IdempotencyConflictError`:

```typescript
{
  "ok": false,
  "error": {
    "type": "conflict",
    "message": "Idempotency key 'idem_abc123' already used with different payload",
    "retryable": false
  }
}
```

**Resolution:**
- Client must generate a new idempotency key
- Or retrieve the existing submission using the original key

### 6.6 Key Generation Best Practices

This section provides practical guidance for different client scenarios and use cases.

#### 6.6.1 For AI Agents

**Recommended approach: UUIDv4 per operation**

```python
import uuid

# Generate fresh key for each logical operation
idempotency_key = f"idem_{uuid.uuid4()}"

# Store key in agent's context for retries
agent_context.current_submission_key = idempotency_key

# Submit with key
result = formbridge.submit(
    intake_id="vendor-onboarding",
    fields={"companyName": "Acme Corp"},
    idempotency_key=idempotency_key
)

# If retry needed, use SAME key
if needs_retry:
    result = formbridge.submit(
        intake_id="vendor-onboarding",
        fields={"companyName": "Acme Corp"},
        idempotency_key=agent_context.current_submission_key  # Same key!
    )
```

**Key insights:**
- Generate key **once** when starting an operation
- **Persist key** in agent's memory/context
- **Reuse key** for all retries of that operation
- Generate **new key** for new logical operations

#### 6.6.2 For Multi-Step Workflows

**Approach: Workflow ID + Step ID**

```typescript
// Workflow-scoped key generation
function generateWorkflowKey(workflowId: string, stepId: string): string {
  return `workflow-${workflowId}_step-${stepId}`;
}

// Use throughout workflow
const workflowId = "onboard-vendor-123";

// Step 1: Create submission
await formbridge.createSubmission("vendor-onboarding", {
  idempotencyKey: generateWorkflowKey(workflowId, "create"),
  initialFields: { companyName: "Acme Corp" }
});

// Step 2: Set additional fields
await formbridge.setFields(submissionId, {
  idempotencyKey: generateWorkflowKey(workflowId, "set-tax-info"),
  fields: { taxId: "12-3456789" }
});

// Step 3: Final submission
await formbridge.submit(submissionId, {
  idempotencyKey: generateWorkflowKey(workflowId, "submit")
});
```

**Benefits:**
- Semantic meaning in audit logs
- Deterministic retry behavior per step
- Workflow-level coordination

**Caution:** Ensure `workflowId` is unique. Use UUIDs if uncertain:
```typescript
const workflowId = crypto.randomUUID(); // e.g., "7f3a9d2e-..."
```

#### 6.6.3 For HTTP Clients

**Approach: Generate on request, cache for retries**

```javascript
// Client-side key management
class FormBridgeClient {
  constructor() {
    this.requestCache = new Map();
  }

  async submit(intakeId, fields) {
    const requestSignature = `${intakeId}:${JSON.stringify(fields)}`;

    // Check if we've already started this request
    let idempotencyKey = this.requestCache.get(requestSignature);

    if (!idempotencyKey) {
      // First attempt: generate new key
      idempotencyKey = `idem_${crypto.randomUUID()}`;
      this.requestCache.set(requestSignature, idempotencyKey);
    }

    // Make request with key
    const response = await fetch(`/api/intakes/${intakeId}/submit`, {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields })
    });

    if (response.ok) {
      // Success: remove from cache
      this.requestCache.delete(requestSignature);
    }

    return response;
  }
}
```

**Automatic retry example:**
```javascript
async function submitWithRetry(client, intakeId, fields, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.submit(intakeId, fields);

      if (response.ok) {
        return await response.json();
      }

      if (response.status === 409) {
        // Idempotency conflict: don't retry
        throw new Error("Idempotency conflict - key reused with different data");
      }

      if (attempt === maxRetries) {
        throw new Error(`Failed after ${maxRetries} attempts`);
      }

      // Exponential backoff
      await sleep(Math.pow(2, attempt) * 1000);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }
}
```

#### 6.6.4 For User-Facing Applications

**Approach: Generate on form load, include in all submissions**

```typescript
// React example
function VendorOnboardingForm() {
  // Generate key once when component mounts
  const idempotencyKey = useMemo(() => `idem_${crypto.randomUUID()}`, []);

  const handleSubmit = async (fields: FormFields) => {
    try {
      const response = await formbridge.submit("vendor-onboarding", {
        fields,
        idempotencyKey
      });

      // Show success
      setStatus("submitted");
    } catch (error) {
      // Show error, allow user to retry
      setStatus("error");
      // Retry will use SAME key (from useMemo)
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button type="submit">Submit</button>
      {status === "error" && (
        <button onClick={() => handleSubmit(currentFields)}>
          Retry Submission
        </button>
      )}
    </form>
  );
}
```

**Key lifecycle:**
- Generate when form loads
- Use same key for all retries during that session
- Generate new key if user refreshes page

#### 6.6.5 For Background Jobs and Queues

**Approach: Derive from job ID**

```typescript
// Queue message
interface SubmissionJob {
  jobId: string;           // Unique job identifier
  intakeId: string;
  fields: Record<string, unknown>;
}

// Worker
async function processSubmissionJob(job: SubmissionJob) {
  // Derive idempotency key from job ID
  const idempotencyKey = `job_${job.jobId}`;

  try {
    await formbridge.submit(job.intakeId, {
      fields: job.fields,
      idempotencyKey
    });
  } catch (error) {
    if (error.type === "conflict") {
      // Job already processed (duplicate delivery)
      console.log(`Job ${job.jobId} already processed`);
      return; // ACK the message
    }

    throw error; // Requeue for retry
  }
}
```

**Benefits:**
- Job redelivery is safe (same key)
- No need for separate deduplication store
- Works with any queue system (SQS, RabbitMQ, Kafka, etc.)

**Alternative: Include idempotency key in job payload**
```typescript
interface SubmissionJob {
  jobId: string;
  idempotencyKey: string;  // Pre-generated when job created
  intakeId: string;
  fields: Record<string, unknown>;
}
```

#### 6.6.6 For Testing

**Approach: Deterministic keys for test repeatability**

```typescript
// Test helper
function generateTestKey(testName: string, iteration: number = 1): string {
  return `test_${testName}_${iteration}`;
}

describe("Vendor onboarding", () => {
  beforeEach(async () => {
    // Clean up test keys
    await idempotencyStore.delete(generateTestKey("vendor-onboarding", 1));
  });

  it("should handle duplicate submissions", async () => {
    const key = generateTestKey("vendor-onboarding", 1);
    const fields = { companyName: "Acme Corp" };

    // First submission
    const response1 = await formbridge.submit("vendor-onboarding", {
      fields,
      idempotencyKey: key
    });
    expect(response1.submissionId).toBe("sub_001");

    // Duplicate submission
    const response2 = await formbridge.submit("vendor-onboarding", {
      fields,
      idempotencyKey: key
    });
    expect(response2.submissionId).toBe("sub_001"); // Same ID
    expect(response2.replayed).toBe(true);
  });
});
```

#### 6.6.7 Common Pitfalls to Avoid

**❌ Don't generate a new key on every retry**
```typescript
// WRONG: Each retry gets a new key
for (let i = 0; i < 3; i++) {
  const key = `idem_${uuid.v4()}`; // ❌ NEW key each time
  await submit({ idempotencyKey: key });
}
```

**✅ Generate once, reuse for retries**
```typescript
// CORRECT: Same key for all retries
const key = `idem_${uuid.v4()}`; // ✓ Generated once
for (let i = 0; i < 3; i++) {
  await submit({ idempotencyKey: key }); // ✓ Same key
}
```

**❌ Don't derive keys from request payload**
```typescript
// WRONG: Key changes if payload changes
const key = sha256(JSON.stringify(fields)); // ❌ Not idempotent if fields change
```

**✅ Generate keys independently of payload**
```typescript
// CORRECT: Key is independent of payload
const key = `idem_${uuid.v4()}`; // ✓ Generated before payload
```

**❌ Don't reuse keys across different operations**
```typescript
// WRONG: Same key for different logical operations
const key = `idem_abc123`;
await formbridge.createSubmission("vendor-onboarding", { idempotencyKey: key });
await formbridge.submit(submissionId, { idempotencyKey: key }); // ❌ Same key!
```

**✅ Generate unique keys per operation**
```typescript
// CORRECT: Different keys for different operations
await formbridge.createSubmission("vendor-onboarding", {
  idempotencyKey: `idem_${uuid.v4()}` // ✓ Unique for create
});
await formbridge.submit(submissionId, {
  idempotencyKey: `idem_${uuid.v4()}` // ✓ Unique for submit
});
```

#### 6.6.8 Key Lifecycle Summary

**Lifecycle stages:**
1. **Generation**: Create a unique key when starting an operation
2. **Persistence**: Store key in memory/context for potential retries
3. **Reuse**: Use same key for all retries of that operation
4. **Expiration**: Key expires after TTL (default 24h)
5. **Cleanup**: Remove key from local cache after successful completion

**Decision tree:**

```
Starting a new operation?
├─ Yes → Generate NEW key (uuid.v4())
│       └─ Store key in context/memory
│
└─ No → Retrying an operation?
        ├─ Yes → Reuse EXISTING key from context
        │
        └─ No → Different operation?
                └─ Yes → Generate NEW key
```

---

## 7. Integration with Intake Contract

### 7.1 HTTP API

Idempotency key is passed via the `Idempotency-Key` header:

```bash
curl -X POST /api/intakes/vendor-onboarding/submit \
  -H "Idempotency-Key: idem_abc123xyz" \
  -H "Content-Type: application/json" \
  -d '{"fields": {"companyName": "Acme Corp"}}'
```

**Response (initial request):**
```json
HTTP/1.1 201 Created
Content-Type: application/json

{
  "ok": true,
  "submissionId": "sub_abc123",
  "state": "submitted"
}
```

**Response (replayed request):**
```json
HTTP/1.1 200 OK
Idempotent-Replayed: true
X-Original-Request-Time: 2024-01-29T12:00:00Z
Content-Type: application/json

{
  "ok": true,
  "submissionId": "sub_abc123",
  "state": "submitted"
}
```

### 7.2 MCP Tool Binding

For MCP tools, idempotency key is passed as a parameter:

```typescript
// MCP tool: formbridge_vendor-onboarding_submit
{
  "name": "formbridge_vendor-onboarding_submit",
  "description": "Submit vendor onboarding form",
  "inputSchema": {
    "type": "object",
    "properties": {
      "fields": { "type": "object" },
      "idempotencyKey": {
        "type": "string",
        "description": "Optional idempotency key for safe retries"
      }
    }
  }
}
```

**Agent usage:**
```python
# Generate idempotency key
idempotency_key = f"idem_{uuid.uuid4()}"

# Call tool with idempotency key
result = mcp_client.call_tool(
  "formbridge_vendor-onboarding_submit",
  {
    "fields": {"companyName": "Acme Corp"},
    "idempotencyKey": idempotency_key
  }
)

# Retry on failure (safe!)
if not result.success:
  result = mcp_client.call_tool(
    "formbridge_vendor-onboarding_submit",
    {
      "fields": {"companyName": "Acme Corp"},
      "idempotencyKey": idempotency_key  # Same key!
    }
  )
```

### 7.3 Event Stream Integration

Idempotent replays emit a `submission.replayed` event:

```typescript
{
  "eventId": "evt_replay_001",
  "submissionId": "sub_abc123",
  "type": "submission.replayed",
  "timestamp": "2024-01-29T12:05:00Z",
  "actor": {
    "type": "agent",
    "id": "agent_xyz"
  },
  "payload": {
    "idempotencyKey": "idem_abc123xyz",
    "originalEventId": "evt_submit_001",
    "replayNumber": 2
  }
}
```

This enables audit trails that distinguish original submissions from replays.

---

## 8. Edge Cases and Failure Scenarios

This section documents edge cases, failure modes, and error recovery strategies for the idempotency system. Understanding these scenarios is critical for building resilient agents and maintaining data integrity in production.

### 8.1 Network Timeout During Initial Request

**Scenario:** Client sends a request with an idempotency key, but the network times out before receiving a response. The server may or may not have processed the request.

#### 8.1.1 Problem

```
Time →  Client                    Server                   Storage
0s:     POST (key: abc123) ──────►│
1s:                               ├─ Process request
2s:                               ├─ Store response ──────►│
3s:     [Network timeout!]        ├─ Send response
        [No response received]    │  [Response lost]
```

**Client's dilemma:**
- Did the server process the request? Unknown.
- Should client retry? Yes, but with the same key.
- Will retry cause duplicate processing? No (idempotency prevents this).

#### 8.1.2 Solution: Safe Retry with Same Key

```typescript
async function submitWithRetry(
  intakeId: string,
  fields: Record<string, unknown>,
  idempotencyKey: string,
  maxAttempts: number = 3
): Promise<Response> {
  const timeoutMs = 30000; // 30 second timeout per attempt

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(`/api/intakes/${intakeId}/submit`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': idempotencyKey, // Same key!
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

      // Server returned error: check if retryable
      const error = await response.json();
      if (!error.retryable) {
        throw new Error(`Non-retryable error: ${error.message}`);
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        // Timeout: retry with exponential backoff
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`Request timed out. Retrying in ${backoffMs}ms...`);
        await sleep(backoffMs);
        continue;
      }

      if (attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw new Error(`Failed after ${maxAttempts} attempts`);
}
```

**Key insight:** The same idempotency key ensures that:
- If the first request succeeded (but response was lost), the retry returns the cached result
- If the first request failed, the retry processes normally
- No duplicate submissions are created

#### 8.1.3 Expected Outcomes

| First Request | Retry Request | Result |
|---|---|---|
| Succeeded (timeout after response sent) | Retrieves cached response | `200 OK` with `Idempotent-Replayed: true` |
| Failed before processing | Processes normally | `201 Created` or error |
| Still processing when retry arrives | Waits for lock | Returns same result once first completes |

### 8.2 Storage Backend Failure

**Scenario:** The idempotency storage backend (Redis/DB) is unavailable or experiencing errors.

#### 8.2.1 Types of Storage Failures

| Failure Type | Example | Impact on Idempotency |
|---|---|---|
| Connection failure | Redis unreachable | Cannot check or store keys |
| Read failure | Redis GET timeout | Cannot detect replays |
| Write failure | Redis SET timeout | Cannot cache responses |
| Eviction | Redis OOM, key evicted | Lost idempotency guarantee |
| Network partition | Split-brain scenario | Inconsistent state across regions |

#### 8.2.2 Handling Strategy: Graceful Degradation

**Option 1: Fail Fast (Recommended for Production)**

When storage is unavailable, reject requests with idempotency keys:

```typescript
async function handleIdempotentRequest(
  intakeId: string,
  idempotencyKey: string | null,
  requestPayload: unknown,
  handler: () => Promise<Response>
): Promise<Response> {
  if (!idempotencyKey) {
    // Non-idempotent request: process normally
    return await handler();
  }

  try {
    // Check if storage is healthy
    await store.healthCheck();
  } catch (error) {
    logger.error("Idempotency store unavailable", { error });

    return {
      status: 503,
      body: {
        ok: false,
        error: {
          type: "service_unavailable",
          message: "Idempotency service is temporarily unavailable. Please retry in a few seconds.",
          retryable: true,
          retryAfterMs: 5000
        }
      }
    };
  }

  // Normal idempotency flow
  const existing = await store.retrieve(storageKey);
  // ... (rest of implementation)
}
```

**Benefits:**
- Prevents duplicate submissions when idempotency cannot be guaranteed
- Clear error signal to clients
- Maintains data integrity

**Option 2: Degrade to Non-Idempotent (Use with Caution)**

Process requests without idempotency when storage is unavailable:

```typescript
try {
  const existing = await store.retrieve(storageKey);
  // ... idempotency flow
} catch (error) {
  logger.warn("Idempotency store failure, processing without idempotency", {
    error,
    idempotencyKey
  });

  // Process request without idempotency
  const response = await handler();

  // Try to cache response (best effort)
  try {
    await store.store(storageKey, response);
  } catch (storeError) {
    logger.error("Failed to cache response", { storeError });
  }

  return response;
}
```

**Risks:**
- Retries may cause duplicate submissions
- Only acceptable for development or non-critical workflows

#### 8.2.3 Circuit Breaker Pattern

Prevent cascading failures by implementing a circuit breaker:

```typescript
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  private readonly failureThreshold = 5;
  private readonly resetTimeoutMs = 60000; // 1 minute

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'half-open';
      } else {
        throw new Error("Circuit breaker is OPEN - storage backend unavailable");
      }
    }

    try {
      const result = await fn();

      if (this.state === 'half-open') {
        this.reset();
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      logger.error("Circuit breaker OPENED - too many storage failures");
    }
  }

  private reset(): void {
    this.failureCount = 0;
    this.state = 'closed';
    logger.info("Circuit breaker CLOSED - storage recovered");
  }
}

// Usage
const circuitBreaker = new CircuitBreaker();

async function retrieveWithCircuitBreaker(key: string) {
  return await circuitBreaker.execute(() => store.retrieve(key));
}
```

#### 8.2.4 Monitoring and Alerts

**Metrics to track:**
- Storage operation latency (p50, p95, p99)
- Storage error rate (read/write failures)
- Circuit breaker state transitions
- Idempotency cache hit rate

**Alerting thresholds:**
- **Critical**: Storage error rate > 5% for 1 minute
- **Warning**: Storage p99 latency > 500ms
- **Info**: Circuit breaker opened

### 8.3 Clock Skew in Distributed Systems

**Scenario:** System clocks are out of sync across server instances or storage backends, causing incorrect TTL calculations and lock expiration behavior.

#### 8.3.1 Problem: TTL Calculation Errors

```
Server A (clock ahead by +10 minutes):
  expiresAt = Date.now() + 86400000
  expiresAt = 1706533200000 (10:00 AM + 10 min skew + 24h)

Server B (accurate clock):
  Current time: 1706529600000 (10:00 AM)
  Checks key: expiresAt (1706533200000) > now (1706529600000) ✓ Valid

  60 minutes later...
  Current time: 1706533200000 (11:00 AM)
  Checks key: expiresAt (1706533200000) > now (1706533200000) ✗ Expired!

  Key expires 23 hours early due to clock skew!
```

#### 8.3.2 Solution: Use Storage Backend's Time

**Principle:** Use the storage backend's clock, not application server clocks.

**Redis Implementation:**
```typescript
async function storeWithRedisTime(
  key: string,
  response: CachedResponse,
  ttlMs: number
): Promise<void> {
  // Use Redis TIME command to get server's timestamp
  const [seconds, microseconds] = await redis.time();
  const redisTimestamp = seconds * 1000 + Math.floor(microseconds / 1000);

  const enrichedResponse = {
    ...response,
    timestamp: redisTimestamp, // Use Redis time, not Date.now()
    expiresAt: redisTimestamp + ttlMs
  };

  // Redis handles expiration with its own clock
  await redis.set(key, JSON.stringify(enrichedResponse), {
    PX: ttlMs // Redis manages TTL internally
  });
}

async function isExpiredWithRedisTime(key: string): Promise<boolean> {
  const data = await redis.get(key);
  if (!data) return true; // Key doesn't exist = expired

  // If key exists, Redis hasn't expired it yet
  // Trust Redis's TTL mechanism
  return false;
}
```

**Database Implementation:**
```sql
-- Use database timestamp functions, not application time
INSERT INTO idempotency_keys (key, response_body, timestamp, expires_at)
VALUES (
  $1,
  $2,
  EXTRACT(EPOCH FROM NOW()) * 1000,           -- DB timestamp
  EXTRACT(EPOCH FROM NOW()) * 1000 + $3       -- DB time + TTL
);

-- Check expiration using DB time
SELECT * FROM idempotency_keys
WHERE key = $1
  AND expires_at > EXTRACT(EPOCH FROM NOW()) * 1000;
```

**Benefits:**
- Consistent time source across all instances
- No dependency on server clock synchronization
- Accurate TTL behavior

#### 8.3.3 Lock Expiration and Clock Skew

**Problem:** Lock timeouts calculated with skewed clocks can cause premature or delayed expiration.

**Solution: Relative Timeouts**

```typescript
// ❌ Absolute timestamp (vulnerable to clock skew)
const lockExpiresAt = Date.now() + 30000;
await redis.set(lockKey, lockToken);
// Later: if (Date.now() > lockExpiresAt) { expired = true; }

// ✅ Relative timeout (clock-skew resistant)
await redis.set(lockKey, lockToken, {
  PX: 30000 // Redis manages expiration with its own clock
});
// Redis automatically expires lock after 30s (relative to Redis time)
```

#### 8.3.4 Timestamp Comparison in Distributed Systems

**Anti-pattern:** Comparing timestamps from different systems

```typescript
// ❌ WRONG: Mixing timestamps from different clocks
const requestTimestamp = Date.now(); // Server A clock
const cachedTimestamp = cachedResponse.timestamp; // Server B clock (when response was cached)

if (requestTimestamp - cachedTimestamp > 60000) {
  // This comparison is meaningless if clocks are skewed!
}
```

**Best practice:** Use sequence numbers or version vectors for ordering

```typescript
// ✅ CORRECT: Use monotonic counters or storage backend time
const requestId = await redis.incr("request_counter");
// Ordering is guaranteed by atomic counter, not wall clock
```

#### 8.3.5 Mitigation Strategies

| Strategy | Description | Effectiveness |
|---|---|---|
| **NTP synchronization** | Keep server clocks in sync with Network Time Protocol | Reduces skew to <100ms |
| **Storage backend time** | Use Redis TIME or database NOW() | Eliminates skew entirely |
| **Relative TTLs** | Use `EXPIRE` / `PX` instead of absolute timestamps | Clock-skew resistant |
| **Monotonic IDs** | Use sequence numbers for ordering, not timestamps | Skew-proof |
| **Health checks** | Monitor clock skew and alert when > threshold | Early detection |

**Recommended approach:** Combine NTP synchronization + storage backend time for defense in depth.

### 8.4 Key Collision Scenarios

**Scenario:** Multiple clients inadvertently use the same idempotency key, either by chance or due to poor key generation strategies.

#### 8.4.1 Collision Types

**Type 1: Accidental Collision (Random Keys)**

Probability of UUID collision: `~0` (negligible)

```typescript
// UUIDv4 collision probability
const totalUUIDs = Math.pow(2, 122); // 5.3 × 10^36 possible UUIDs
const collisionProbability = 1 / totalUUIDs; // ~0

// To have a 50% chance of collision, need:
const uuidsFor50PercentCollision = Math.sqrt(totalUUIDs); // ~2.7 × 10^18 UUIDs
```

**Verdict:** Not a practical concern with proper UUID generation.

**Type 2: Intentional Reuse (Same Client, Same Operation)**

This is the **intended behavior**:

```typescript
const key = "idem_abc123";

// Initial request
await submit({ idempotencyKey: key, fields: { name: "Acme" } });
// → 201 Created

// Retry (network timeout)
await submit({ idempotencyKey: key, fields: { name: "Acme" } });
// → 200 OK (replayed)
```

**Type 3: Malicious Reuse (Same Key, Different Payload)**

```typescript
// Client A
await submit({
  idempotencyKey: "shared_key",
  fields: { name: "Acme Corp" }
});

// Client B (different payload!)
await submit({
  idempotencyKey: "shared_key",
  fields: { name: "Evil Corp" } // Different!
});
// → 409 Conflict
```

**Response:**
```json
{
  "ok": false,
  "error": {
    "type": "conflict",
    "message": "Idempotency key 'shared_key' already used with different payload",
    "retryable": false
  }
}
```

#### 8.4.2 Conflict Detection Mechanism

**Request Hash Calculation:**
```typescript
function calculateRequestHash(payload: unknown): string {
  // Normalize JSON to ensure consistent hashing
  const normalized = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
```

**Conflict Check:**
```typescript
const requestHash = calculateRequestHash(requestPayload);
const existing = await store.retrieve(storageKey);

if (existing) {
  if (existing.requestHash !== requestHash) {
    // Same key, different payload = CONFLICT
    throw new IdempotencyConflictError(
      `Idempotency key "${idempotencyKey}" already used with different payload`,
      {
        originalHash: existing.requestHash,
        currentHash: requestHash,
        originalTimestamp: existing.timestamp
      }
    );
  }

  // Same key, same payload = REPLAY (safe)
  return existing.response;
}
```

#### 8.4.3 Hash Collision Resistance

**SHA-256 Properties:**
- Output size: 256 bits (64 hex characters)
- Collision resistance: Computationally infeasible to find two inputs with same hash
- Birthday attack threshold: ~2^128 operations (astronomically large)

**Practical consideration:**
```typescript
// Probability of SHA-256 hash collision
const hashSpace = Math.pow(2, 256);
const collisionProbability = 1 / hashSpace; // ~3 × 10^-77

// More likely to be struck by lightning while being eaten by a shark
// while winning the lottery... multiple times
```

**Verdict:** Hash collisions are not a practical concern.

#### 8.4.4 Sequential Key Collision (Poor Key Generation)

**Anti-pattern:**
```typescript
// ❌ Multiple clients using sequential keys
// Client A
for (let i = 0; i < 100; i++) {
  await submit({ idempotencyKey: `request-${i}` });
}

// Client B (runs concurrently)
for (let i = 0; i < 100; i++) {
  await submit({ idempotencyKey: `request-${i}` }); // COLLISION!
}
```

**Result:** Conflicts when Client B reaches a key already used by Client A.

**Solution: Include client/workflow ID**
```typescript
// ✅ Scoped sequential keys
const clientId = crypto.randomUUID();

for (let i = 0; i < 100; i++) {
  await submit({ idempotencyKey: `${clientId}-${i}` }); // No collision
}
```

#### 8.4.5 Namespace Isolation

**Built-in protection:** Keys are scoped per intake

```typescript
// Storage keys include intake ID
const storageKey = `${intakeId}:${idempotencyKey}`;

// Example
"vendor-onboarding:abc123" !== "access-request:abc123"
```

**Cross-intake isolation:**
- Same idempotency key can be used across different intakes
- No conflict because storage keys are different

#### 8.4.6 Collision Response Strategy

| Collision Type | Detection | Response | Status Code |
|---|---|---|---|
| Accidental (random UUIDs) | Request hash mismatch | Reject with conflict error | 409 Conflict |
| Intentional replay (same payload) | Request hash match | Return cached response | 200 OK |
| Malicious reuse (different payload) | Request hash mismatch | Reject with conflict error | 409 Conflict |
| Sequential collision (poor keygen) | Request hash mismatch | Reject with conflict error | 409 Conflict |

**Client handling:**
```typescript
try {
  const response = await submit({ idempotencyKey, fields });
} catch (error) {
  if (error.type === 'conflict') {
    // Generate new key and retry
    const newKey = `idem_${crypto.randomUUID()}`;
    return await submit({ idempotencyKey: newKey, fields });
  }
  throw error;
}
```

### 8.5 Additional Edge Cases

#### 8.5.1 Response Larger Than Storage Limit

**Problem:** Response body exceeds storage backend limits (e.g., Redis max value size: 512MB)

**Solution:**
```typescript
const MAX_RESPONSE_SIZE = 1024 * 1024; // 1MB limit

async function store(key: string, response: CachedResponse): Promise<void> {
  const serialized = JSON.stringify(response);

  if (serialized.length > MAX_RESPONSE_SIZE) {
    logger.warn("Response too large for idempotency cache", {
      key,
      size: serialized.length
    });

    // Store error marker instead of full response
    const marker = {
      statusCode: 507,
      body: {
        error: "Response too large to cache for idempotency"
      },
      timestamp: Date.now(),
      requestHash: response.requestHash
    };

    await this.store(key, marker);
    return;
  }

  await this.redis.set(key, serialized, { PX: ttlMs });
}
```

#### 8.5.2 Lock Starvation Under Heavy Contention

**Problem:** Many concurrent requests for the same key cause some requests to time out waiting for lock.

**Solution: Queue depth limiting**
```typescript
const MAX_WAITERS_PER_KEY = 10;
const waiterCounts = new Map<string, number>();

async function acquireLock(key: string, options: { timeoutMs: number }): Promise<string> {
  const waiters = waiterCounts.get(key) || 0;

  if (waiters >= MAX_WAITERS_PER_KEY) {
    throw new TooManyWaitersError(
      `Too many concurrent requests for key "${key}". ` +
      `Maximum ${MAX_WAITERS_PER_KEY} waiters allowed. ` +
      `Please retry after a delay.`
    );
  }

  waiterCounts.set(key, waiters + 1);

  try {
    return await acquireLockImpl(key, options);
  } finally {
    waiterCounts.set(key, (waiterCounts.get(key) || 1) - 1);
  }
}
```

#### 8.5.3 Idempotency Key in URL vs Header vs Body

**Recommendation: Header (Idempotency-Key)**

Rationale:
- Not part of request payload (doesn't affect business logic)
- Widely supported by HTTP libraries
- Follows Stripe API convention (industry standard)

**Alternative: Query parameter** (not recommended)
```bash
# ❌ Not recommended: key in URL
POST /api/intakes/vendor-onboarding/submit?idempotencyKey=abc123
```

Problems:
- Key appears in logs, exposing retry patterns
- URL length limits
- Not RESTful (not identifying a resource)

**Alternative: Request body** (acceptable for non-HTTP transports)
```typescript
// ✅ Acceptable for MCP tools, gRPC, etc.
{
  "fields": {...},
  "idempotencyKey": "abc123"
}
```

---

## 9. Observability and Audit Trail

Comprehensive observability is essential for operating idempotency in production. This section defines metrics, logging, monitoring alerts, and audit trail integration to ensure operators can detect, diagnose, and resolve issues quickly.

### 9.1 Metrics to Track

#### 9.1.1 Request-Level Metrics

**`idempotency.request.total`** (counter)
- Labels: `intake_id`, `operation` (create/submit/setFields), `replayed` (true/false)
- Description: Total number of requests processed with idempotency keys
- Use: Track overall idempotent request volume and replay rate

**`idempotency.request.replayed`** (counter)
- Labels: `intake_id`, `operation`
- Description: Number of requests served from idempotency cache (replays)
- Use: Identify excessive retry behavior from specific clients or intakes

**`idempotency.request.duration_ms`** (histogram)
- Labels: `intake_id`, `operation`, `replayed`
- Buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
- Description: Request processing time from receipt to response
- Use: Compare latency of original vs replayed requests; detect performance regressions

**`idempotency.cache_hit_rate`** (gauge)
- Labels: `intake_id`
- Description: Ratio of replayed requests to total idempotent requests (rolling 5-minute window)
- Use: Detect retry storms (rate > 30% may indicate client issues)

#### 9.1.2 Storage Backend Metrics

**`idempotency.storage.operation.total`** (counter)
- Labels: `operation` (store/retrieve/acquireLock/releaseLock), `status` (success/error), `backend` (redis/postgres/memory)
- Description: Total storage operations performed
- Use: Track storage operation volume and error rates by operation type

**`idempotency.storage.operation.duration_ms`** (histogram)
- Labels: `operation`, `backend`
- Buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000]
- Description: Storage operation latency
- Use: Detect storage performance degradation; inform capacity planning

**`idempotency.storage.error_rate`** (gauge)
- Labels: `operation`, `backend`
- Description: Rolling 1-minute error rate for storage operations
- Use: Trigger circuit breaker; alert on storage health issues

**`idempotency.storage.connection_pool.active`** (gauge)
- Labels: `backend`
- Description: Current number of active connections to storage backend
- Use: Monitor connection pool saturation; detect connection leaks

**`idempotency.storage.connection_pool.exhausted`** (counter)
- Labels: `backend`
- Description: Number of times connection pool was exhausted
- Use: Alert on capacity issues; inform scaling decisions

#### 9.1.3 Lock Contention Metrics

**`idempotency.lock.acquired.total`** (counter)
- Labels: `intake_id`
- Description: Total number of locks successfully acquired
- Use: Baseline for lock usage patterns

**`idempotency.lock.wait_time_ms`** (histogram)
- Labels: `intake_id`
- Buckets: [0, 10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000]
- Description: Time spent waiting to acquire lock
- Use: Detect lock contention; identify hot keys causing blocking

**`idempotency.lock.timeout.total`** (counter)
- Labels: `intake_id`
- Description: Number of lock acquisition timeouts (requests gave up waiting)
- Use: Alert on excessive contention; may indicate need for key sharding

**`idempotency.lock.held_duration_ms`** (histogram)
- Labels: `intake_id`, `operation`
- Buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000]
- Description: Duration locks are held before release
- Use: Identify slow request processing causing lock contention

**`idempotency.lock.abandoned.total`** (counter)
- Labels: `intake_id`
- Description: Locks cleaned up by dead lock detection (lock holder crashed/timed out)
- Use: Alert on server crashes or network issues; audit trail

#### 9.1.4 Circuit Breaker Metrics

**`idempotency.circuit_breaker.state`** (gauge)
- Labels: `backend`
- Values: 0 (closed), 1 (open), 2 (half-open)
- Description: Current circuit breaker state
- Use: Alert when circuit breaker opens; correlate with storage outages

**`idempotency.circuit_breaker.opened.total`** (counter)
- Labels: `backend`
- Description: Number of times circuit breaker has opened
- Use: Track storage reliability; inform SLA reporting

**`idempotency.circuit_breaker.rejected_requests.total`** (counter)
- Labels: `backend`, `operation`
- Description: Requests rejected while circuit breaker was open
- Use: Measure impact of storage outages on user requests

#### 9.1.5 Conflict Detection Metrics

**`idempotency.conflict.total`** (counter)
- Labels: `intake_id`, `conflict_type` (payload_mismatch/key_collision)
- Description: Number of idempotency conflicts detected
- Use: Detect client bugs (same key, different payload); alert on key collision attacks

**`idempotency.conflict.retry_after_conflict`** (counter)
- Labels: `intake_id`
- Description: Clients retrying with new key after conflict error
- Use: Track client error recovery behavior

#### 9.1.6 TTL and Expiration Metrics

**`idempotency.key.expired.total`** (counter)
- Labels: `intake_id`, `reason` (ttl_elapsed/explicit_delete)
- Description: Number of idempotency keys that have expired
- Use: Validate TTL configuration; audit key lifecycle

**`idempotency.key.active_count`** (gauge)
- Labels: `intake_id`
- Description: Current number of active (non-expired) idempotency keys
- Use: Monitor storage capacity; forecast growth

**`idempotency.key.average_lifetime_ms`** (histogram)
- Labels: `intake_id`
- Buckets: [60000, 300000, 600000, 1800000, 3600000, 21600000, 86400000]
- Description: Time between key creation and expiration
- Use: Optimize TTL settings; identify long-lived keys

### 9.2 Logging Recommendations

#### 9.2.1 Structured Log Format

All idempotency-related logs must be structured JSON with the following standard fields:

```typescript
interface IdempotencyLogEntry {
  timestamp: string;           // ISO 8601
  level: "debug" | "info" | "warn" | "error";
  component: "idempotency";
  event: string;               // Event type (see below)
  intakeId: string;
  submissionId?: string;
  idempotencyKey?: string;     // Hashed or truncated for security
  operation: string;           // create | submit | setFields
  actor?: {
    type: "agent" | "human";
    id: string;
  };
  duration_ms?: number;
  metadata?: Record<string, unknown>;
}
```

**Security Note:** Never log full idempotency keys. Hash or truncate them:
```typescript
function hashKey(key: string): string {
  return `${key.substring(0, 8)}...${crypto.createHash('sha256').update(key).digest('hex').substring(0, 8)}`;
}
```

#### 9.2.2 Log Events by Severity

**DEBUG Level** (verbose, disabled in production by default):
```typescript
// Lock acquisition details
{
  level: "debug",
  event: "idempotency.lock.attempt",
  idempotencyKey: "idem_abc...def123",
  intakeId: "vendor_onboarding",
  metadata: { attemptNumber: 2, queuePosition: 3 }
}

// Cache lookup
{
  level: "debug",
  event: "idempotency.cache.lookup",
  idempotencyKey: "idem_abc...def123",
  result: "miss",
  storage_duration_ms: 5
}
```

**INFO Level** (normal operations):
```typescript
// Replay served from cache
{
  level: "info",
  event: "idempotency.replay",
  intakeId: "vendor_onboarding",
  submissionId: "sub_xyz789",
  idempotencyKey: "idem_abc...def123",
  operation: "submit",
  actor: { type: "agent", id: "agent_456" },
  original_timestamp: "2026-01-28T10:00:00Z",
  replay_count: 2,
  duration_ms: 12
}

// New request processed (cache miss)
{
  level: "info",
  event: "idempotency.processed",
  intakeId: "vendor_onboarding",
  submissionId: "sub_xyz789",
  idempotencyKey: "idem_abc...def123",
  operation: "submit",
  actor: { type: "agent", id: "agent_456" },
  duration_ms: 458,
  metadata: { cached: true, response_size_bytes: 2048 }
}

// Key expiration
{
  level: "info",
  event: "idempotency.key.expired",
  idempotencyKey: "idem_abc...def123",
  intakeId: "vendor_onboarding",
  ttl_ms: 86400000,
  lifetime_ms: 86401234,
  reason: "ttl_elapsed"
}
```

**WARN Level** (potential issues requiring attention):
```typescript
// Lock contention detected
{
  level: "warn",
  event: "idempotency.lock.contention",
  idempotencyKey: "idem_abc...def123",
  intakeId: "vendor_onboarding",
  wait_time_ms: 2500,
  queue_depth: 8,
  metadata: { message: "High lock wait time - potential hot key" }
}

// Circuit breaker opened
{
  level: "warn",
  event: "idempotency.circuit_breaker.opened",
  backend: "redis",
  failure_count: 5,
  threshold: 5,
  metadata: { last_error: "ETIMEDOUT", recent_errors: [...] }
}

// Storage latency spike
{
  level: "warn",
  event: "idempotency.storage.slow",
  operation: "retrieve",
  backend: "redis",
  duration_ms: 850,
  threshold_ms: 500,
  metadata: { p99_baseline_ms: 120 }
}

// Abandoned lock detected
{
  level: "warn",
  event: "idempotency.lock.abandoned",
  idempotencyKey: "idem_abc...def123",
  lock_age_ms: 45000,
  lock_holder: "server_instance_3",
  metadata: { message: "Lock cleaned up - holder may have crashed" }
}
```

**ERROR Level** (failures requiring immediate attention):
```typescript
// Idempotency conflict (same key, different payload)
{
  level: "error",
  event: "idempotency.conflict",
  idempotencyKey: "idem_abc...def123",
  intakeId: "vendor_onboarding",
  conflict_type: "payload_mismatch",
  actor: { type: "agent", id: "agent_456" },
  metadata: {
    original_hash: "a3f5...",
    current_hash: "b7e2...",
    original_timestamp: "2026-01-28T10:00:00Z"
  }
}

// Storage operation failed
{
  level: "error",
  event: "idempotency.storage.error",
  operation: "store",
  backend: "redis",
  error: "ECONNREFUSED",
  error_message: "Connection refused - Redis unreachable",
  retry_attempt: 2,
  metadata: { host: "redis.internal", port: 6379 }
}

// Lock acquisition timeout
{
  level: "error",
  event: "idempotency.lock.timeout",
  idempotencyKey: "idem_abc...def123",
  intakeId: "vendor_onboarding",
  wait_time_ms: 30000,
  timeout_ms: 30000,
  metadata: { message: "Lock acquisition timed out - request aborted" }
}

// Response too large to cache
{
  level: "error",
  event: "idempotency.cache.oversized",
  idempotencyKey: "idem_abc...def123",
  intakeId: "vendor_onboarding",
  response_size_bytes: 1048576,
  max_size_bytes: 524288,
  metadata: { message: "Response exceeds cache size limit - idempotency not guaranteed for this key" }
}
```

#### 9.2.3 Log Sampling

For high-volume deployments, implement adaptive sampling to reduce log costs:

```typescript
// Sample DEBUG logs at 1% in production
const shouldLog = (level: string, event: string): boolean => {
  if (level === "debug") {
    return Math.random() < 0.01; // 1% sample rate
  }
  if (level === "info" && event === "idempotency.cache.lookup") {
    return Math.random() < 0.1; // 10% sample rate for cache lookups
  }
  return true; // Always log WARN and ERROR
};
```

### 9.3 Monitoring Alerts

#### 9.3.1 Critical Alerts (Page On-Call)

**Storage Unavailable**
- **Condition:** `idempotency.storage.error_rate > 0.05` (5%) for 2 consecutive minutes
- **Impact:** Idempotency guarantees broken; agents may create duplicate submissions
- **Response:**
  1. Check storage backend health (Redis/DB connection, memory, CPU)
  2. Review recent deployments or config changes
  3. Activate circuit breaker if not already open
  4. Consider failing open (disable idempotency temporarily) if storage unrecoverable
- **Runbook:** `docs/runbooks/idempotency-storage-outage.md`

**Circuit Breaker Open**
- **Condition:** `idempotency.circuit_breaker.state == 1` (open)
- **Impact:** All idempotent requests failing fast; no retry protection
- **Response:**
  1. Investigate storage backend issues (check previous alert)
  2. Monitor `idempotency.circuit_breaker.rejected_requests` to assess user impact
  3. Once storage recovered, circuit breaker will auto-transition to half-open
- **Runbook:** `docs/runbooks/circuit-breaker-recovery.md`

**Excessive Lock Timeouts**
- **Condition:** `rate(idempotency.lock.timeout.total[5m]) > 10` (10 lock timeouts per 5 minutes)
- **Impact:** Requests failing due to lock contention; poor user experience
- **Response:**
  1. Identify hot keys: `topk(5, idempotency.lock.wait_time_ms) by (intake_id, idempotency_key)`
  2. Check if specific client/agent retrying excessively
  3. Consider implementing queue depth limiting (see §8.5.2)
  4. Increase lock timeout if requests legitimately slow
- **Runbook:** `docs/runbooks/lock-contention.md`

**Idempotency Conflict Storm**
- **Condition:** `rate(idempotency.conflict.total[1m]) > 5` (5 conflicts per minute)
- **Impact:** Possible client bug or key collision attack
- **Response:**
  1. Group by `intake_id` and `idempotency_key` to identify source
  2. Review recent client deployments
  3. Check if client is generating keys incorrectly (e.g., not including enough entropy)
  4. Consider rate-limiting or blocking misbehaving clients
- **Runbook:** `docs/runbooks/idempotency-conflicts.md`

#### 9.3.2 Warning Alerts (Review During Business Hours)

**High Replay Rate**
- **Condition:** `idempotency.cache_hit_rate > 0.30` (30%) for 10 minutes
- **Impact:** Clients retrying excessively; possible network issues or aggressive retry logic
- **Response:**
  1. Identify clients with highest replay rates
  2. Review client retry configuration (backoff, max attempts)
  3. Check for network issues between clients and API
  4. Educate client developers on retry best practices

**Storage Latency Spike**
- **Condition:** `histogram_quantile(0.99, idempotency.storage.operation.duration_ms) > 500ms` for 5 minutes
- **Impact:** Slow request processing; poor user experience
- **Response:**
  1. Check storage backend metrics (CPU, memory, disk I/O)
  2. Review storage query performance (slow queries, missing indexes)
  3. Consider scaling storage backend (vertical or horizontal)
  4. Review cache eviction policies if using Redis

**Connection Pool Exhaustion**
- **Condition:** `idempotency.storage.connection_pool.exhausted > 0` in last hour
- **Impact:** Storage operations queued/delayed; increased latency
- **Response:**
  1. Increase connection pool size if headroom available
  2. Audit connection leaks (connections not released)
  3. Consider scaling storage backend
  4. Review request concurrency and rate limiting

**Abandoned Locks**
- **Condition:** `rate(idempotency.lock.abandoned.total[5m]) > 1` (1+ abandoned lock per 5 minutes)
- **Impact:** Possible server crashes or long garbage collection pauses
- **Response:**
  1. Correlate with application server restarts/crashes
  2. Review application logs for OOM errors, segfaults
  3. Check for long GC pauses (Java, .NET) or event loop blocking (Node.js)
  4. Consider reducing lock timeout if not necessary

#### 9.3.3 Informational Alerts (Dashboard Only)

**Key Expiration Rate**
- **Metric:** `rate(idempotency.key.expired.total[1h])`
- **Use:** Baseline expiration patterns; validate TTL configuration

**Active Key Count Growth**
- **Metric:** `increase(idempotency.key.active_count[24h])`
- **Use:** Forecast storage capacity needs; detect intake volume growth

**Lock Contention by Intake**
- **Metric:** `avg(idempotency.lock.wait_time_ms) by (intake_id)`
- **Use:** Identify intakes with high concurrency; optimize submission flow

### 9.4 Audit Trail Integration

Idempotency events must be emitted to the FormBridge audit event stream (see INTAKE_CONTRACT_SPEC.md §10) to enable compliance, debugging, and analytics.

#### 9.4.1 Event Types

**`idempotency.key.created`**
```typescript
{
  eventType: "idempotency.key.created",
  eventId: "evt_abc123",
  timestamp: "2026-01-28T10:00:00Z",
  actor: { type: "agent", id: "agent_456" },
  metadata: {
    intakeId: "vendor_onboarding",
    submissionId: "sub_xyz789",
    idempotencyKey: "idem_abc...def123", // Hashed
    operation: "submit",
    ttl_ms: 86400000,
    expiresAt: "2026-01-29T10:00:00Z"
  }
}
```

**`idempotency.replay`**
```typescript
{
  eventType: "idempotency.replay",
  eventId: "evt_abc124",
  timestamp: "2026-01-28T10:05:00Z",
  actor: { type: "agent", id: "agent_456" },
  metadata: {
    intakeId: "vendor_onboarding",
    submissionId: "sub_xyz789",
    idempotencyKey: "idem_abc...def123",
    operation: "submit",
    replayCount: 2,
    originalTimestamp: "2026-01-28T10:00:00Z",
    timeSinceOriginal_ms: 300000
  }
}
```

**`idempotency.conflict`**
```typescript
{
  eventType: "idempotency.conflict",
  eventId: "evt_abc125",
  timestamp: "2026-01-28T10:10:00Z",
  actor: { type: "agent", id: "agent_789" }, // Different actor!
  metadata: {
    intakeId: "vendor_onboarding",
    idempotencyKey: "idem_abc...def123",
    conflictType: "payload_mismatch",
    originalRequestHash: "a3f5...",
    conflictingRequestHash: "b7e2...",
    originalTimestamp: "2026-01-28T10:00:00Z",
    originalActor: { type: "agent", id: "agent_456" }
  }
}
```

**`idempotency.key.expired`**
```typescript
{
  eventType: "idempotency.key.expired",
  eventId: "evt_abc126",
  timestamp: "2026-01-29T10:00:00Z",
  metadata: {
    intakeId: "vendor_onboarding",
    submissionId: "sub_xyz789",
    idempotencyKey: "idem_abc...def123",
    ttl_ms: 86400000,
    lifetime_ms: 86400123,
    replayCount: 5,
    reason: "ttl_elapsed"
  }
}
```

**`idempotency.lock.contention`**
```typescript
{
  eventType: "idempotency.lock.contention",
  eventId: "evt_abc127",
  timestamp: "2026-01-28T10:15:00Z",
  actor: { type: "agent", id: "agent_999" },
  metadata: {
    intakeId: "vendor_onboarding",
    idempotencyKey: "idem_abc...def123",
    waitTime_ms: 5000,
    queueDepth: 12,
    lockHolder: "server_instance_2"
  }
}
```

#### 9.4.2 Retention and Compliance

- **Audit events:** Retained for 90 days minimum (configurable per compliance requirements)
- **Metrics:** Retained for 30 days at full granularity, 1 year at aggregated granularity
- **Logs:** Retained for 14 days (structured JSON logs in centralized logging platform)

#### 9.4.3 Privacy Considerations

- **PII redaction:** Idempotency keys and request payloads must not contain PII
- **Key hashing:** Log only hashed/truncated idempotency keys, never full keys
- **GDPR compliance:** Audit events must support deletion on user request (delete by `actor.id`)

### 9.5 Observability Best Practices

1. **Use distributed tracing:** Attach idempotency key to trace context to correlate replays across retries
2. **Dashboard templates:** Provide pre-built Grafana/Datadog dashboards for idempotency monitoring
3. **Synthetic monitoring:** Periodically test idempotency behavior with synthetic requests (same key, verify replay)
4. **Chaos testing:** Simulate storage outages, network partitions, and clock skew in staging
5. **Capacity planning:** Monitor `idempotency.key.active_count` and storage backend metrics to forecast scaling needs
6. **Client instrumentation:** Provide client SDKs with built-in metrics and retry telemetry

---

## 10. Summary

This design provides:
- **Safe retries**: Agents can retry failed requests without fear of duplicates
- **Pluggable storage**: Supports in-memory (dev), Redis (prod), and database backends
- **Distributed-safe**: Locking prevents race conditions in multi-instance deployments
- **Time-bounded**: TTL prevents unbounded storage growth
- **Auditable**: Replay events tracked in submission records and event stream
- **Resilient**: Comprehensive edge case handling for network failures, storage outages, clock skew, and key collisions
- **Observable**: Rich metrics, structured logging, and monitoring alerts for production operations

**Next steps:**
- Implement `IdempotencyStore` interface and in-memory/Redis implementations
- Integrate idempotency handling into `createSubmission`, `setFields`, and `submit` operations
- Add tests for concurrent requests, TTL expiration, and conflict detection
- Add tests for edge cases: network timeouts, storage failures, clock skew scenarios
- Update INTAKE_CONTRACT_SPEC.md §8 with detailed semantics
- Configure observability stack: metrics collection, log aggregation, alerting rules
- Create runbooks for critical alerts and incident response
