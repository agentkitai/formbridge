# Resume Tokens Design

**Version:** 0.1.0-draft
**Status:** Draft
**Authors:** Amit
**Related:** [Intake Contract Specification](./INTAKE_CONTRACT_SPEC.md) §7

---

## Abstract

Resume tokens enable pausable, resumable submission sessions with optimistic concurrency control. When a submission is created or updated, the server issues an opaque resume token that serves as both a capability credential and a version identifier. Any actor—the original agent, a different agent, or a human—can use this token to retrieve the current submission state and continue from where it left off, without requiring shared authentication. Tokens support ETag-style versioning to prevent conflicting concurrent edits through optimistic concurrency control.

This design solves three critical problems:
1. **MCP elicitation timeout flaw:** Long-running data collection causes fatal request timeouts
2. **No pause-gather-resume workflow:** Existing tools lack support for iterative data gathering
3. **Cross-actor collaboration:** Enable mixed-mode workflows where an agent starts a submission and a human (or different agent) completes it

Resume tokens are the foundation of FormBridge's mixed-mode collaboration pattern and make submissions resilient to timeouts, process restarts, and actor handoffs.

---

## Table of Contents

1. [Overview](#1-overview)
   - 1.1 [Motivation](#11-motivation)
   - 1.2 [Design Goals](#12-design-goals)
   - 1.3 [Key Requirements](#13-key-requirements)
2. [Architecture](#2-architecture)
   - 2.1 [High-Level Flow](#21-high-level-flow)
   - 2.2 [Token Lifecycle](#22-token-lifecycle)
   - 2.3 [Component Interactions](#23-component-interactions)
3. [Token Format and Generation](#3-token-format-and-generation)
   - 3.1 [Token Format Specification](#31-token-format-specification)
   - 3.2 [Generation Algorithm](#32-generation-algorithm)
   - 3.3 [Token Encoding](#33-token-encoding)
   - 3.4 [Security Considerations](#34-security-considerations)
4. [Optimistic Concurrency Control and Versioning](#4-optimistic-concurrency-control-and-versioning)
   - 4.1 [Overview of Optimistic Concurrency](#41-overview-of-optimistic-concurrency)
   - 4.2 [ETag-Style Version Mechanism](#42-etag-style-version-mechanism)
   - 4.3 [Version Increment Strategy](#43-version-increment-strategy)
   - 4.4 [Conflict Detection and Resolution](#44-conflict-detection-and-resolution)
   - 4.5 [409 Conflict Response Format](#45-409-conflict-response-format)
   - 4.6 [Version in Response Headers and Body](#46-version-in-response-headers-and-body)
   - 4.7 [Sequence Diagrams for Concurrent Edits](#47-sequence-diagrams-for-concurrent-edits)
5. [Token Storage, Expiration, and Lifecycle Management](#5-token-storage-expiration-and-lifecycle-management)
   - 5.1 [Storage Backend Architecture](#51-storage-backend-architecture)
   - 5.2 [Token-to-Submission Mapping](#52-token-to-submission-mapping)
   - 5.3 [TTL Configuration and Expiration Policy](#53-ttl-configuration-and-expiration-policy)
   - 5.4 [Expiration Behavior and Error Responses](#54-expiration-behavior-and-error-responses)
   - 5.5 [Cleanup Strategies](#55-cleanup-strategies)
   - 5.6 [Storage Backend Interface Specification](#56-storage-backend-interface-specification)
6. [Cross-Actor Handoff and Authentication Bypass](#6-cross-actor-handoff-and-authentication-bypass)
   - 6.1 [Overview](#61-overview)
   - 6.2 [Authentication Bypass Rationale](#62-authentication-bypass-rationale)
   - 6.3 [Security Trade-offs](#63-security-trade-offs)
   - 6.4 [Cross-Actor Handoff Flows](#64-cross-actor-handoff-flows)
   - 6.5 [URL Generation for Human Access](#65-url-generation-for-human-access)
   - 6.6 [Security Best Practices for Cross-Actor Handoff](#66-security-best-practices-for-cross-actor-handoff)
   - 6.7 [Comparison with Traditional Authentication](#67-comparison-with-traditional-authentication)
7. [HTTP API Bindings](#7-http-api-bindings)
   - 7.1 [Overview](#71-overview)
   - 7.2 [GET /submissions/:resumeToken](#72-get-submissionsresumetoken)
   - 7.3 [PATCH /submissions/:resumeToken](#73-patch-submissionsresumetoken)
   - 7.4 [HTTP Headers and Versioning](#74-http-headers-and-versioning)
   - 7.5 [Error Responses](#75-error-responses)
   - 7.6 [CORS and Preflight](#76-cors-and-preflight)
8. [MCP Integration](#8-mcp-integration)
   - 8.1 [Overview](#81-overview)
   - 8.2 [MCP Tool Parameter Bindings](#82-mcp-tool-parameter-bindings)
   - 8.3 [Resume Token in MCP Responses](#83-resume-token-in-mcp-responses)
   - 8.4 [Integration with INTAKE_CONTRACT_SPEC Operations](#84-integration-with-intake_contract_spec-operations)
   - 8.5 [MCP-Specific Error Handling](#85-mcp-specific-error-handling)
9. [Event Stream](#9-event-stream)
   - 9.1 [Overview](#91-overview)
   - 9.2 [Event Types](#92-event-types)
   - 9.3 [Event Payload Specification](#93-event-payload-specification)
   - 9.4 [Event Emission Triggers](#94-event-emission-triggers)
   - 9.5 [Event Storage and Replay](#95-event-storage-and-replay)
   - 9.6 [Monitoring and Alerting](#96-monitoring-and-alerting)
10. [Edge Cases](#10-edge-cases)
   - 10.1 [Expired Token Access](#101-expired-token-access)
   - 10.2 [Concurrent Updates](#102-concurrent-updates)
   - 10.3 [Token Theft and Unauthorized Access](#103-token-theft-and-unauthorized-access)
   - 10.4 [Replay Attacks](#104-replay-attacks)
   - 10.5 [Token Rotation Edge Cases](#105-token-rotation-edge-cases)
   - 10.6 [Cross-Actor Race Conditions](#106-cross-actor-race-conditions)
   - 10.7 [Submission State Transitions](#107-submission-state-transitions)
11. [Failure Scenarios and Recovery](#11-failure-scenarios-and-recovery)
   - 11.1 [Storage Backend Failures](#111-storage-backend-failures)
   - 11.2 [Clock Skew and Time Synchronization](#112-clock-skew-and-time-synchronization)
   - 11.3 [Network Partitions](#113-network-partitions)
   - 11.4 [Token Generation Failures](#114-token-generation-failures)
   - 11.5 [Database Transaction Failures](#115-database-transaction-failures)
   - 11.6 [Cascading Failures](#116-cascading-failures)
   - 11.7 [Recovery Strategies](#117-recovery-strategies)
12. [Observability](#12-observability)
   - 12.1 [Metrics](#121-metrics)
   - 12.2 [Logging](#122-logging)
   - 12.3 [Tracing](#123-tracing)
   - 12.4 [Alerting](#124-alerting)
   - 12.5 [Dashboards](#125-dashboards)
   - 12.6 [SLIs and SLOs](#126-slis-and-slos)

---

## 1. Overview

### 1.1 Motivation

**The MCP Elicitation Timeout Problem**

MCP's `elicitation/create` operation has a fatal flaw: long-running data collection causes request timeouts. When an AI agent needs to gather data from multiple sources—fetching documents, calling APIs, processing files—the elicitation session times out before the agent can respond. This makes MCP elicitation unsuitable for any non-trivial data collection task.

**The Missing Pause-Gather-Resume Pattern**

No existing tool supports the pause-gather-resume workflow that agents need:
1. Start a submission with known data
2. Discover missing fields through validation
3. **Pause** the submission while gathering additional data (seconds, minutes, or hours)
4. **Resume** with the new data without session loss
5. Repeat until complete

This pattern is essential for:
- Multi-step data collection with external dependencies
- Long-running workflows that exceed HTTP timeout limits
- Resilience to process crashes or network failures
- Handoff between different actors (agent → human → agent)

**Cross-Actor Collaboration**

Real-world data collection often requires mixed-mode collaboration:
- An AI agent gathers 80% of required information automatically
- The agent identifies fields it cannot fill (e.g., subjective questions, missing access)
- The agent hands off to a human with a resume link
- The human completes the remaining 20%
- The agent (or system) submits the finalized data

This cross-actor handoff requires a capability token that works without shared authentication credentials.

**→ See also:** [INTAKE_CONTRACT_SPEC.md §2](./INTAKE_CONTRACT_SPEC.md#2-submission-lifecycle) for the complete submission lifecycle and state machine that resume tokens enable.

### 1.2 Design Goals

1. **Opaque and Secure**
   - Tokens are cryptographically random (not sequential or predictable)
   - Cannot be guessed or enumerated
   - URL-safe for use in links and query parameters
   - Constant-time comparison to prevent timing attacks

2. **Cross-Actor Capability**
   - Token possession grants access (bearer token pattern)
   - No shared authentication required between actors
   - Enables agent → human → agent handoff flows
   - Works in links, QR codes, and API calls

3. **Optimistic Concurrency**
   - Tokens double as version identifiers (ETag-style)
   - Stale tokens are rejected with 409 Conflict
   - Prevents lost updates and data corruption
   - Forces actors to fetch current state before updating

4. **Expiration and Lifecycle**
   - Configurable TTL (default: 7 days)
   - Expired tokens return 410 Gone with original submission ID
   - Tokens expire when submission reaches terminal state
   - Graceful degradation with clear error messages

5. **Audit Trail**
   - Token creation emitted as event
   - Token usage tracked (actor, timestamp, operation)
   - Expiration logged
   - Full provenance for compliance and debugging

### 1.3 Key Requirements

**Functional Requirements:**
- FR-1: Creating a draft submission returns a resume token in the response
- FR-2: Resume token can retrieve current submission state (GET with token)
- FR-3: Resume token can update a submission (PATCH with token)
- FR-4: Tokens include version information for optimistic concurrency
- FR-5: PATCH requests with stale version return 409 Conflict with current state
- FR-6: Tokens are opaque strings (not guessable, not sequential)
- FR-7: Tokens have configurable expiration (default: 7 days)
- FR-8: Expired tokens return 410 Gone with the original submission ID
- FR-9: Token-based access works without authentication

**Non-Functional Requirements:**
- NFR-1: Token generation must be cryptographically secure (CSPRNG)
- NFR-2: Token lookup must be O(1) or O(log n) with caching
- NFR-3: Token comparison must be constant-time to prevent timing attacks
- NFR-4: System must support millions of concurrent active tokens
- NFR-5: Token expiration must not require active cleanup (lazy deletion acceptable)

---

## 2. Architecture

### 2.1 High-Level Flow

Resume tokens follow a simple capability-based access model:

```
┌─────────┐                                ┌──────────────┐
│  Actor  │                                │  FormBridge  │
│ (Agent, │                                │    Server    │
│  Human, │                                └──────────────┘
│ System) │                                        │
└─────────┘                                        │
     │                                             │
     │  1. createSubmission(intakeId, data)       │
     ├────────────────────────────────────────────>│
     │                                             │
     │         ┌────────────────────────┐          │
     │         │  Generate Token        │          │
     │         │  token = random_256()  │          │
     │         │  version = 1           │          │
     │         │  expires = now + 7d    │          │
     │         └────────────────────────┘          │
     │                                             │
     │  { submissionId, resumeToken, version }    │
     │<────────────────────────────────────────────┤
     │                                             │
     │                                             │
     │  2. setFields(resumeToken, version, data)  │
     ├────────────────────────────────────────────>│
     │                                             │
     │         ┌────────────────────────┐          │
     │         │  Validate Token        │          │
     │         │  Check Version         │          │
     │         │  Update Fields         │          │
     │         │  Rotate Token          │          │
     │         │  version = 2           │          │
     │         └────────────────────────┘          │
     │                                             │
     │  { ok: true, resumeToken_v2, version: 2 }  │
     │<────────────────────────────────────────────┤
     │                                             │
     │                                             │
     │  [Actor hands off resumeToken_v2]          │
     │  ════════════════════════════════>         │
     │                                    │        │
     │                               ┌─────────┐  │
     │                               │Different│  │
     │                               │  Actor  │  │
     │                               └─────────┘  │
     │                                    │        │
     │  3. getSubmission(resumeToken_v2) │        │
     │                                    ├───────>│
     │                                    │        │
     │         ┌────────────────────────┐ │        │
     │         │  Validate Token        │ │        │
     │         │  Return Current State  │ │        │
     │         │  (no version rotation) │ │        │
     │         └────────────────────────┘ │        │
     │                                    │        │
     │  { submission, version: 2, resumeToken_v2 }│
     │                                    │<───────┤
     │                                    │        │
     │                                             │
     │  4. setFields(resumeToken_v2, version: 2)  │
     │                                    ├───────>│
     │                                    │        │
     │         ┌────────────────────────┐ │        │
     │         │  Version Match ✓       │ │        │
     │         │  Update Fields         │ │        │
     │         │  Rotate Token          │ │        │
     │         │  version = 3           │ │        │
     │         └────────────────────────┘ │        │
     │                                    │        │
     │  { ok: true, resumeToken_v3, version: 3 }  │
     │                                    │<───────┤
     │                                             │
```

**Token Flow Summary:**

1. **Token Issuance:** Every successful submission creation or update returns a new resume token and version number
2. **Token Usage:** Actors present the token to retrieve or update submission state
3. **Version Validation:** Write operations check that the provided version matches current version
4. **Token Rotation:** Every state-changing operation issues a new token (old token becomes stale)
5. **Cross-Actor Handoff:** Token can be passed to different actors without re-authentication

### 2.2 Token Lifecycle

Resume tokens have a well-defined lifecycle tied to the submission state:

```
┌──────────────────────────────────────────────────────────────┐
│                     Token Lifecycle                          │
└──────────────────────────────────────────────────────────────┘

  CREATED              ACTIVE               ROTATED            EXPIRED
     │                   │                     │                  │
     │   ┌───────────┐   │   ┌──────────┐     │   ┌──────────┐   │
     ├──>│submission │──>│   │ Actor    │     │   │ Version  │   │
     │   │.created   │   │   │ performs │────>│   │ conflict │   │
     │   │event      │   │   │ write op │     │   │ (stale)  │   │
     │   └───────────┘   │   └──────────┘     │   └──────────┘   │
     │                   │                     │                  │
     │                   │   ┌──────────┐     │                  │
     │                   │   │ Actor    │     │                  │
     │                   │   │ performs │     │                  │
     │                   │   │ read op  │     │                  │
     │                   │   │ (no rot) │     │                  │
     │                   │   └──────────┘     │                  │
     │                   │                     │                  │
     │                   │ ──── TTL ──────────────────────────> │
     │                   │                                        │
     │                   └─── Terminal State ──────────────────> │
     │                        (finalized, cancelled, expired)    │
     │                                                            │
     └────────────────────────────────────────────────────────────┘

Legend:
  CREATED:  Token generated and bound to submission
  ACTIVE:   Token is valid and can be used for operations
  ROTATED:  Token replaced by newer version (stale but may be referenced)
  EXPIRED:  Token past TTL or submission in terminal state
```

**State Transitions:**

- **CREATED → ACTIVE:** Token is generated and returned to caller
- **ACTIVE → ACTIVE:** Read operations (getSubmission) don't rotate token
- **ACTIVE → ROTATED:** Write operations (setFields, submit) rotate token
- **ACTIVE → EXPIRED:** TTL elapsed or submission reaches terminal state
- **ROTATED → EXPIRED:** Stale tokens eventually expire (lazy cleanup)

**Expiration Triggers:**

1. **TTL Expiration:** Token age exceeds configured TTL (default 7 days)
2. **Terminal State:** Submission finalized, cancelled, or expired
3. **Explicit Revocation:** Administrative token revocation (optional)

### 2.3 Component Interactions

The resume token system interacts with several FormBridge components:

```
┌──────────────────────────────────────────────────────────────────┐
│                     Component Architecture                        │
└──────────────────────────────────────────────────────────────────┘

   ┌─────────────┐
   │   HTTP API  │
   │  /resume/*  │
   └──────┬──────┘
          │
          │ (token, version)
          ▼
   ┌──────────────────┐           ┌──────────────────┐
   │  Token Validator │──────────>│ Token Store      │
   │  - Verify token  │           │ - In-memory map  │
   │  - Check expiry  │           │ - Redis          │
   │  - Check version │           │ - Database       │
   └────────┬─────────┘           └──────────────────┘
            │                              ▲
            │ submissionId                 │
            ▼                              │ (store token)
   ┌──────────────────┐                   │
   │ Submission Store │───────────────────┘
   │ - Get by ID      │
   │ - Update fields  │
   │ - Validate       │
   └────────┬─────────┘
            │
            │ (emit events)
            ▼
   ┌──────────────────┐
   │   Event Stream   │
   │ - token.created  │
   │ - token.rotated  │
   │ - token.expired  │
   │ - token.conflict │
   └──────────────────┘
```

**Component Responsibilities:**

1. **HTTP API Layer:**
   - Accept resume token in URL path or header
   - Extract version from request (header or body)
   - Route to token validator

2. **Token Validator:**
   - Verify token exists and is not expired
   - Validate version matches current for write operations
   - Resolve token to submission ID
   - Return 410 Gone for expired tokens
   - Return 409 Conflict for version mismatches

3. **Token Store:**
   - Map tokens to submission IDs
   - Store token metadata (created, expires, version)
   - Support fast O(1) lookup
   - Handle expiration (lazy or active cleanup)
   - Pluggable backend (memory, Redis, database)

4. **Submission Store:**
   - Maintain submission state and fields
   - Update version on state changes
   - Generate and store new tokens on rotation
   - Validate operations against current state

5. **Event Stream:**
   - Emit token lifecycle events
   - Provide audit trail for token usage
   - Enable monitoring and alerting
   - Support compliance requirements

**Data Flow for Write Operation:**

1. Client sends `PATCH /resume/{token}` with version and data
2. HTTP API extracts token from path, version from header/body
3. Token Validator looks up token in Token Store
4. Token Validator resolves token → submission ID
5. Token Validator checks version matches current
6. Submission Store updates fields and increments version
7. Submission Store generates new resume token
8. Token Store maps new token → submission ID
9. Event Stream emits `token.rotated` event
10. Response includes new token and version

---

## 3. Token Format and Generation

### 3.1 Token Format Specification

Resume tokens are opaque bearer credentials that grant access to a submission without requiring authentication. The token format is designed to be secure, URL-safe, and resistant to enumeration attacks.

**Format Requirements:**

- **Opaqueness:** Tokens MUST be opaque strings with no embedded structure or metadata visible to callers
- **Length:** 256 bits (32 bytes) of entropy, encoded to 43 characters
- **Character Set:** URL-safe base64url alphabet: `[A-Za-z0-9_-]` (RFC 4648 §5)
- **No Padding:** base64url encoding without padding characters (`=`) for clean URLs
- **No Structure:** No hyphens, prefixes, or version indicators that reveal internal format
- **Uniqueness:** Global uniqueness across all submissions and time

**Example Token:**

```
rtok_kQp8zX3mN9jR2vL7wY4tS6hF1cB5nM8xZ0aW3dE9uG2iK7pQ4fT6bV1sJ9oL3
```

**Format Breakdown:**

```
rtok_  ← prefix for human identification (optional, not part of crypto material)
kQp8zX3mN9jR2vL7wY4tS6hF1cB5nM8xZ0aW3dE9uG2iK7pQ4fT6bV1sJ9oL3
└────────────────────────────────────────────────────┘
           43 characters base64url-encoded
           (256 bits / 6 bits per char ≈ 43 chars)
```

**Anti-Patterns (DO NOT USE):**

- ❌ Sequential IDs: `rtok_000001`, `rtok_000002` (guessable)
- ❌ Embedded metadata: `rtok_sub123_v5_exp2026` (leaks information)
- ❌ UUIDs with hyphens: `550e8400-e29b-41d4-a716-446655440000` (not URL-safe)
- ❌ Short tokens: `rtok_abc123` (insufficient entropy)
- ❌ Predictable patterns: timestamp + counter (enumerable)

**Why 256 bits?**

- **Security Margin:** 2^256 possible tokens ≈ 10^77 combinations
- **Collision Resistance:** Negligible collision probability even with billions of tokens
- **Future-Proof:** Resistant to brute-force attacks with current and foreseeable computing power
- **Industry Standard:** Matches NIST recommendations for cryptographic secrets

### 3.2 Generation Algorithm

Tokens MUST be generated using a cryptographically secure random number generator (CSPRNG). Predictable or pseudo-random generators are explicitly prohibited.

**Recommended Implementation (Node.js):**

```typescript
import { randomBytes } from 'node:crypto';

function generateResumeToken(): string {
  // Generate 32 bytes (256 bits) of cryptographically secure random data
  const tokenBytes = randomBytes(32);

  // Encode as base64url (RFC 4648 §5) without padding
  const base64url = tokenBytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Optional: Add prefix for human identification
  return `rtok_${base64url}`;
}
```

**Alternative: UUID v4 (Acceptable but Less Preferred):**

```typescript
import { randomUUID } from 'node:crypto';

function generateResumeToken(): string {
  // UUID v4 provides 122 bits of entropy (less than our 256-bit target)
  const uuid = randomUUID().replace(/-/g, ''); // Remove hyphens

  // Optionally combine multiple UUIDs for more entropy
  const uuid1 = randomUUID().replace(/-/g, '');
  const uuid2 = randomUUID().replace(/-/g, '');
  const combined = `${uuid1}${uuid2}`.slice(0, 43); // 244 bits

  return `rtok_${combined}`;
}
```

**Algorithm Requirements:**

1. **CSPRNG Source:** Use platform CSPRNG (e.g., `/dev/urandom`, `crypto.randomBytes`, `SecureRandom`)
2. **No Seeding:** Never seed with predictable values (timestamp, counter, process ID)
3. **No Patterns:** Avoid combining timestamps, sequential counters, or hashed user data
4. **Atomic Generation:** Token generation must be thread-safe and atomic
5. **Uniqueness Check:** Optional collision check (probability is negligible but can add defense-in-depth)

**Platform-Specific Implementations:**

```python
# Python
import secrets

def generate_resume_token() -> str:
    token_bytes = secrets.token_bytes(32)
    base64url = base64.urlsafe_b64encode(token_bytes).decode('ascii').rstrip('=')
    return f"rtok_{base64url}"
```

```go
// Go
import (
    "crypto/rand"
    "encoding/base64"
)

func GenerateResumeToken() (string, error) {
    tokenBytes := make([]byte, 32)
    if _, err := rand.Read(tokenBytes); err != nil {
        return "", err
    }
    base64url := base64.RawURLEncoding.EncodeToString(tokenBytes)
    return "rtok_" + base64url, nil
}
```

```java
// Java
import java.security.SecureRandom;
import java.util.Base64;

public String generateResumeToken() {
    SecureRandom random = new SecureRandom();
    byte[] tokenBytes = new byte[32];
    random.nextBytes(tokenBytes);
    String base64url = Base64.getUrlEncoder()
        .withoutPadding()
        .encodeToString(tokenBytes);
    return "rtok_" + base64url;
}
```

**DO NOT Use These Methods:**

- ❌ `Math.random()` (JavaScript) — not cryptographically secure
- ❌ `random.randint()` (Python) — not cryptographically secure
- ❌ Timestamp-based generation — predictable and enumerable
- ❌ Hashed user IDs — linkable to user data, not random
- ❌ Database auto-increment IDs — sequential and guessable

### 3.3 Token Encoding

Resume tokens use **base64url encoding** (RFC 4648 §5) to ensure compatibility with URLs, HTTP headers, and JSON payloads.

**Encoding Properties:**

```
Input:  32 bytes (256 bits) of random data
        [0xA3, 0x7F, 0x2C, 0x9B, ...] (binary)

Output: 43 characters base64url
        "o38slx9v2k..." (URL-safe ASCII)
```

**Base64url Alphabet:**

```
A-Z (26 chars)  → Values 0-25
a-z (26 chars)  → Values 26-51
0-9 (10 chars)  → Values 52-61
-   (1 char)    → Value 62
_   (1 char)    → Value 63
```

**Comparison with Standard Base64:**

| Aspect | Standard Base64 | Base64url (Our Choice) |
|--------|----------------|------------------------|
| Alphabet | `+/` | `-_` (URL-safe) |
| Padding | `=` required | `=` omitted |
| URL usage | Requires escaping | Direct URL usage ✓ |
| Query params | `%2B`, `%2F` | No escaping needed ✓ |
| JSON | Works | Works ✓ |
| Headers | Works | Works ✓ |

**Example Encoding Scenarios:**

```
1. URL Path:
   GET /resume/rtok_kQp8zX3mN9jR2vL7wY4tS6hF1cB5nM8xZ0aW3dE9uG
   ✓ No escaping required

2. Query Parameter:
   GET /api/submit?token=rtok_kQp8zX3mN9jR2vL7wY4tS6hF1cB5nM8xZ0aW3dE9uG
   ✓ No escaping required

3. HTTP Header:
   X-Resume-Token: rtok_kQp8zX3mN9jR2vL7wY4tS6hF1cB5nM8xZ0aW3dE9uG
   ✓ Works directly

4. JSON Response:
   { "resumeToken": "rtok_kQp8zX3mN9jR2vL7wY4tS6hF1cB5nM8xZ0aW3dE9uG" }
   ✓ No escaping needed
```

**Why Not Hexadecimal?**

Hexadecimal encoding (0-9, a-f) would require 64 characters for 256 bits:

```
Hex:        64 characters for 256 bits (4 bits per char)
Base64url:  43 characters for 256 bits (6 bits per char)

Savings: 33% shorter tokens with base64url
```

Shorter tokens mean:
- Smaller URL footprint
- Better user experience (shorter links)
- Reduced bandwidth
- Easier to visually scan (when needed)

### 3.4 Security Considerations

Resume tokens are bearer credentials — possession grants access. Security is critical.

#### 3.4.1 Non-Guessability

**Requirement:** Tokens MUST be computationally infeasible to guess or enumerate.

**Analysis:**

With 256 bits of entropy from a CSPRNG:

```
Possible tokens:     2^256 ≈ 1.16 × 10^77
Atoms in universe:   ~10^80

Brute-force probability (1 billion guesses/sec for 1 year):
  Attempts:      3.15 × 10^16 (31.5 quadrillion)
  Success rate:  2.7 × 10^-61 (effectively zero)
```

**Protection Measures:**

1. **Rate Limiting:** Limit token validation attempts per IP/client
2. **Monitoring:** Alert on unusual token validation patterns
3. **No Sequential Fallback:** Never generate tokens with reduced entropy "for convenience"

#### 3.4.2 Constant-Time Comparison

**Requirement:** Token validation MUST use constant-time comparison to prevent timing attacks.

**Vulnerable Implementation (DO NOT USE):**

```typescript
// ❌ INSECURE: Early-exit comparison leaks timing information
function validateToken(provided: string, stored: string): boolean {
  if (provided.length !== stored.length) return false;

  for (let i = 0; i < provided.length; i++) {
    if (provided[i] !== stored[i]) {
      return false; // ← Early exit leaks position of mismatch
    }
  }
  return true;
}
```

**Secure Implementation:**

```typescript
// ✓ SECURE: Constant-time comparison (Node.js)
import { timingSafeEqual } from 'node:crypto';

function validateToken(provided: string, stored: string): boolean {
  // Convert to buffers for constant-time comparison
  const providedBuf = Buffer.from(provided, 'utf-8');
  const storedBuf = Buffer.from(stored, 'utf-8');

  // Early length check (length is not secret)
  if (providedBuf.length !== storedBuf.length) {
    return false;
  }

  // Constant-time comparison
  return timingSafeEqual(providedBuf, storedBuf);
}
```

**Platform-Specific Implementations:**

```python
# Python
import hmac

def validate_token(provided: str, stored: str) -> bool:
    return hmac.compare_digest(provided, stored)
```

```go
// Go
import "crypto/subtle"

func ValidateToken(provided, stored string) bool {
    return subtle.ConstantTimeCompare(
        []byte(provided),
        []byte(stored),
    ) == 1
}
```

**Why Constant-Time Matters:**

Timing attacks can recover token characters one by one:

```
Attempt: rtok_aaaaa... → 10μs (fail on char 6)
Attempt: rtok_baaaa... → 10μs (fail on char 6)
Attempt: rtok_kaaaa... → 11μs (fail on char 7) ← 'k' is correct!
Attempt: rtok_kPaaa... → 11μs (fail on char 7)
Attempt: rtok_kQaaa... → 12μs (fail on char 8) ← 'Q' is correct!

... repeat for all 43 characters
```

With constant-time comparison, all attempts take the same time regardless of match position.

#### 3.4.3 Token Storage

**Requirement:** Tokens stored in databases MUST be indexed for fast lookup but protected from exposure.

**Storage Schema:**

```sql
CREATE TABLE resume_tokens (
  token_hash CHAR(64) PRIMARY KEY,        -- SHA-256 hash of token
  submission_id UUID NOT NULL,
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,

  INDEX idx_submission_version (submission_id, version),
  INDEX idx_expires_at (expires_at)       -- For cleanup queries
);
```

**Best Practices:**

1. **Hash Tokens (Optional):** Store SHA-256 hash of token, not plaintext
   - Protects against database leaks
   - Trade-off: Cannot display token to user after storage
   - Recommendation: Store plaintext for better UX, rely on access controls

2. **Encrypt at Rest:** Database should use encryption at rest (LUKS, TDE)

3. **Access Control:** Restrict database access to application service accounts only

4. **Audit Logging:** Log all token validations (timestamp, IP, success/failure)

5. **Secure Transmission:** Always transmit tokens over TLS (HTTPS)

#### 3.4.4 Token Expiration

**Requirement:** Tokens MUST expire to limit the window of compromise.

**Expiration Policy:**

```typescript
interface TokenMetadata {
  token: string;
  submissionId: string;
  version: number;
  createdAt: Date;
  expiresAt: Date;           // createdAt + TTL
  lastUsedAt?: Date;
}

const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

function isTokenExpired(metadata: TokenMetadata): boolean {
  return Date.now() > metadata.expiresAt.getTime();
}
```

**Expiration Triggers:**

1. **Time-Based:** Token age exceeds TTL (default: 7 days)
2. **State-Based:** Submission reaches terminal state (finalized, cancelled, expired)
3. **Rotation-Based:** Token is superseded by newer version (becomes stale)
4. **Administrative:** Manual revocation by operator

**Expired Token Response:**

```typescript
// HTTP 410 Gone
{
  "ok": false,
  "error": {
    "type": "expired",
    "message": "Resume token has expired",
    "submissionId": "sub_kx9m2p7q",  // ← Return ID for client recovery
    "expiredAt": "2026-02-05T10:00:00Z",
    "retryable": false
  }
}
```

#### 3.4.5 Token Rotation

**Requirement:** Tokens MUST be rotated on every state-changing operation to prevent replay attacks.

**Rotation Strategy:**

```typescript
async function setFields(
  currentToken: string,
  version: number,
  fields: Record<string, unknown>
): Promise<OperationResult> {

  // 1. Validate current token
  const tokenMeta = await validateResumeToken(currentToken);
  if (!tokenMeta) {
    return { ok: false, error: { type: 'expired' } };
  }

  // 2. Check version (optimistic concurrency)
  if (tokenMeta.version !== version) {
    return { ok: false, error: { type: 'conflict', currentVersion: tokenMeta.version } };
  }

  // 3. Update submission
  await updateSubmissionFields(tokenMeta.submissionId, fields);

  // 4. Generate new token
  const newToken = generateResumeToken();
  const newVersion = version + 1;

  // 5. Store new token and invalidate old token
  await storeResumeToken({
    token: newToken,
    submissionId: tokenMeta.submissionId,
    version: newVersion,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + DEFAULT_TTL)
  });

  await invalidateToken(currentToken); // Mark old token as stale

  // 6. Emit rotation event
  await emitEvent({
    type: 'token.rotated',
    submissionId: tokenMeta.submissionId,
    payload: { oldVersion: version, newVersion }
  });

  return {
    ok: true,
    resumeToken: newToken,
    version: newVersion
  };
}
```

**Read Operations (No Rotation):**

```typescript
async function getSubmission(token: string): Promise<Submission> {
  const tokenMeta = await validateResumeToken(token);
  if (!tokenMeta) {
    throw new Error('Token expired');
  }

  // No token rotation on reads
  const submission = await fetchSubmission(tokenMeta.submissionId);

  return {
    ...submission,
    resumeToken: token,  // ← Return same token (no rotation)
    version: tokenMeta.version
  };
}
```

#### 3.4.6 Cross-Actor Security

**Requirement:** Tokens enable cross-actor collaboration while maintaining audit trails.

**Security Invariants:**

1. **Bearer Token Model:** Possession of token = authorization to act
2. **No Authentication Required:** Token alone grants access (no username/password)
3. **Actor Identification:** Every operation requires actor metadata for audit trail
4. **Handoff Transparency:** Token can be passed between actors without re-authentication

**Audit Trail:**

```typescript
interface TokenUsageEvent {
  eventId: string;
  type: 'token.used';
  submissionId: string;
  token: string;              // (or token hash)
  actor: Actor;
  operation: 'get' | 'set' | 'submit';
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  failureReason?: string;
}
```

**Example Handoff Flow:**

```
1. Agent creates submission
   → Token: rtok_abc...
   → Actor: { kind: 'agent', id: 'onboarding_bot' }
   → Event: token.created

2. Agent generates handoff link
   → Link: https://app.com/forms/continue?token=rtok_abc...
   → Event: handoff.link_issued

3. Human opens link
   → Token: rtok_abc... (same token)
   → Actor: { kind: 'human', id: 'user_jane', email: 'jane@example.com' }
   → Event: token.used (different actor)

4. Human updates fields
   → Old token: rtok_abc...
   → New token: rtok_xyz...
   → Actor: { kind: 'human', id: 'user_jane' }
   → Event: token.rotated

5. Agent resumes
   → Token: rtok_xyz...
   → Actor: { kind: 'agent', id: 'onboarding_bot' }
   → Event: token.used (agent resumed after human)
```

The audit trail shows the complete chain of custody across actor handoffs.

#### 3.4.7 Defense in Depth

**Additional Security Measures:**

1. **Rate Limiting:**
   ```
   Limit: 100 token validations per IP per minute
   Burst: 10 validations per second
   Response: 429 Too Many Requests
   ```

2. **Anomaly Detection:**
   - Alert on tokens accessed from multiple geographic regions
   - Alert on rapid token validation failures (potential brute-force)
   - Alert on tokens used after long dormancy

3. **HTTPS Only:**
   - Tokens MUST only be transmitted over TLS
   - Set `Strict-Transport-Security` header
   - Reject HTTP requests with tokens

4. **Token Prefix:**
   - Use `rtok_` prefix for secret scanning tools (GitHub, GitGuardian)
   - Enables automated detection if tokens leak into public repos

5. **Secure Defaults:**
   - Default TTL: 7 days (not infinite)
   - Auto-expire on terminal states
   - No token reuse after rotation

---

## 4. Optimistic Concurrency Control and Versioning

### 4.1 Overview of Optimistic Concurrency

Resume tokens implement **optimistic concurrency control (OCC)** to prevent conflicting concurrent edits without pessimistic locking. This approach assumes conflicts are rare and validates version compatibility at commit time rather than acquiring locks during reads.

**Why Optimistic Concurrency for Resume Tokens?**

1. **Long-Lived Sessions:** Submissions may remain open for hours or days across actor handoffs
2. **Distributed Actors:** Multiple actors (agents, humans, systems) may access the same submission
3. **No Shared Context:** Actors don't coordinate — an agent and human may edit concurrently
4. **Scalability:** Pessimistic locks would block actors and create deadlock risks
5. **User Experience:** Actors work on local state then sync, rather than waiting for locks

**Core Principle:**

Instead of preventing concurrent access, OCC detects conflicts when they occur and requires the actor to reconcile:

```
Read → Modify Locally → Attempt Write with Version → Conflict Detection → Reconcile or Retry
```

This pattern is familiar from HTTP ETags (RFC 7232), Git merge conflicts, and database row versioning.

**Design Invariants:**

- **DI-1:** Every submission has a monotonically increasing version number
- **DI-2:** Every resume token embeds the submission version it represents
- **DI-3:** Write operations MUST provide the expected version
- **DI-4:** If expected version ≠ current version, operation is rejected with 409 Conflict
- **DI-5:** Read operations return current version but don't modify it
- **DI-6:** Successful writes increment version and issue a new token

### 4.2 ETag-Style Version Mechanism

FormBridge's versioning follows the **HTTP ETag pattern** (RFC 7232 §2.3) where versions serve as entity tags for conditional requests.

**Version as Entity Tag:**

```typescript
interface SubmissionVersion {
  version: number;           // Monotonic counter (1, 2, 3, ...)
  etag: string;              // HTTP ETag format: `"<version>"`
  lastModified: Date;        // RFC 7231 timestamp
}

// Example
{
  version: 42,
  etag: '"42"',
  lastModified: new Date('2026-01-29T14:30:00Z')
}
```

**ETag Format:**

```
ETag: "42"            ← Strong ETag (exact version match required)
```

We use **strong ETags** (no `W/` prefix) because submissions require exact version matching:
- Weak ETags allow semantically equivalent representations
- Strong ETags enforce byte-for-byte equivalence
- Resume tokens need strong validation to prevent lost updates

**Comparison with HTTP ETags:**

| Aspect | HTTP ETag (RFC 7232) | Resume Token Version |
|--------|---------------------|---------------------|
| Purpose | Cache validation | Concurrency control |
| Format | Opaque quoted string | Integer + quoted ETag |
| Matching | `If-Match`, `If-None-Match` | Explicit version parameter |
| Strong vs Weak | Both supported | Strong only |
| Generation | Content hash or version | Monotonic counter |
| Rotation | Per resource modification | Per submission write + token rotation |

**Version Number Properties:**

```typescript
// Version lifecycle
{
  initialVersion: 1,           // First version on creation
  increment: 1,                 // Always increment by 1
  maxVersion: Number.MAX_SAFE_INTEGER,  // 2^53 - 1 ≈ 9 quadrillion
  type: 'monotonic_counter'     // Never decreases, never skips
}
```

**Why Integer Versions Instead of Content Hashes?**

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| Content Hash (SHA-256) | Deterministic, detects any change | 64 chars, expensive to compute, no ordering | ❌ Rejected |
| UUIDs | Globally unique | No ordering, 36 chars, hard to debug | ❌ Rejected |
| Timestamps | Ordered | Clock skew issues, not monotonic | ❌ Rejected |
| **Monotonic Counter** | Simple, ordered, compact, debuggable | Requires centralized state | ✅ **Selected** |

Monotonic counters are:
- **Human-readable:** Version 42 is easier to debug than `a3f2c9b...`
- **Compact:** 1-10 digits vs 32-64 characters
- **Ordered:** Version 43 > 42 (supports range queries, debugging)
- **Efficient:** No hashing overhead

### 4.3 Version Increment Strategy

Versions follow a strict increment-on-write policy with clear rules for different operations.

**Increment Rules:**

```typescript
type OperationType =
  | 'create'          // Initial submission creation
  | 'setFields'       // Update field values (PATCH)
  | 'submit'          // Finalize submission
  | 'getSubmission'   // Read current state (GET)
  | 'validate'        // Validate without writing

const VERSION_INCREMENT_RULES = {
  create:         { incrementsVersion: true,  initialVersion: 1 },
  setFields:      { incrementsVersion: true,  versionCheckRequired: true },
  submit:         { incrementsVersion: true,  versionCheckRequired: true },
  getSubmission:  { incrementsVersion: false, versionCheckRequired: false },
  validate:       { incrementsVersion: false, versionCheckRequired: false }
} as const;
```

**Detailed Increment Behavior:**

1. **Creation (POST /submissions):**
   ```typescript
   // Initial submission creation
   const submission = await createSubmission(intakeId, initialData);

   expect(submission.version).toBe(1);  // Always starts at version 1
   expect(submission.resumeToken).toBeDefined();
   ```

2. **Field Updates (PATCH /resume/:token):**
   ```typescript
   // Each update increments version
   const v1 = await setFields(token_v1, { version: 1, data: { name: 'Alice' } });
   expect(v1.version).toBe(2);  // 1 → 2

   const v2 = await setFields(token_v2, { version: 2, data: { email: 'alice@example.com' } });
   expect(v2.version).toBe(3);  // 2 → 3
   ```

3. **Read Operations (GET /resume/:token):**
   ```typescript
   // Reads don't increment version
   const read1 = await getSubmission(token_v3);
   expect(read1.version).toBe(3);  // Version unchanged

   const read2 = await getSubmission(token_v3);
   expect(read2.version).toBe(3);  // Still unchanged
   ```

4. **Submission Finalization (POST /resume/:token/submit):**
   ```typescript
   // Final submission increments version
   const final = await submitSubmission(token_v3, { version: 3 });
   expect(final.version).toBe(4);  // 3 → 4
   expect(final.status).toBe('finalized');
   ```

**Version Increment Algorithm:**

```typescript
async function performWriteOperation(
  operation: WriteOperation,
  token: string,
  expectedVersion: number,
  payload: unknown
): Promise<OperationResult> {

  // 1. Validate token and resolve submission
  const tokenMeta = await validateToken(token);
  const submission = await getSubmission(tokenMeta.submissionId);

  // 2. Check version (optimistic concurrency control)
  if (submission.version !== expectedVersion) {
    return {
      ok: false,
      error: {
        type: 'version_conflict',
        expected: expectedVersion,
        current: submission.version
      },
      statusCode: 409
    };
  }

  // 3. Perform operation
  const updatedSubmission = await applyOperation(submission, operation, payload);

  // 4. Increment version atomically
  const newVersion = submission.version + 1;

  // 5. Generate new token
  const newToken = generateResumeToken();

  // 6. Atomic write: update submission + version + token
  await atomicUpdate({
    submissionId: submission.id,
    newVersion,
    newToken,
    data: updatedSubmission
  });

  // 7. Invalidate old token
  await invalidateToken(token);

  // 8. Emit event
  await emitEvent({
    type: 'submission.updated',
    version: newVersion,
    previousVersion: submission.version
  });

  return {
    ok: true,
    version: newVersion,
    resumeToken: newToken,
    statusCode: 200
  };
}
```

**Atomicity Guarantees:**

Version increments MUST be atomic with the data update to prevent split-brain scenarios:

```sql
-- ✓ CORRECT: Atomic update with version check
UPDATE submissions
SET
  data = $1,
  version = version + 1,
  updated_at = NOW()
WHERE
  id = $2
  AND version = $3  -- ← Optimistic lock
RETURNING version;

-- ❌ WRONG: Non-atomic update (race condition)
SELECT version FROM submissions WHERE id = $1;  -- Read
-- (another actor updates here)
UPDATE submissions SET data = $2, version = $3 WHERE id = $1;  -- Lost update!
```

**Version Overflow Handling:**

```typescript
const MAX_SAFE_VERSION = Number.MAX_SAFE_INTEGER; // 2^53 - 1

function checkVersionOverflow(currentVersion: number): void {
  if (currentVersion >= MAX_SAFE_VERSION - 1000) {
    // Approaching overflow (leaving safety margin)
    logger.warn('Submission version approaching MAX_SAFE_INTEGER', {
      currentVersion,
      submissionId: submission.id
    });

    // Optional: Archive submission and create continuation
    // Or: Reject further updates
  }
}
```

In practice, reaching 9 quadrillion versions is computationally infeasible. At 1 update/second, it would take 285 million years.

### 4.4 Conflict Detection and Resolution

Conflicts occur when multiple actors modify a submission concurrently. FormBridge detects conflicts at write time and returns actionable error responses.

**Conflict Scenario:**

```
Time    Actor A                          Actor B
────────────────────────────────────────────────────────────
t0      GET /resume/token_v5
        ← { version: 5, data: {...} }
                                         GET /resume/token_v5
                                         ← { version: 5, data: {...} }
t1      [Modify locally]
                                         [Modify locally]
t2      PATCH /resume/token_v5
        body: { version: 5, ... }
        ← { ok: true, version: 6 }
        ✓ Success! Version: 5 → 6
                                         PATCH /resume/token_v5
                                         body: { version: 5, ... }
                                         ← 409 Conflict (expected: 5, current: 6)
                                         ✗ Conflict detected!
t3                                       GET /resume/token_v6
                                         ← { version: 6, data: {...} }
                                         [Reconcile changes]
                                         PATCH /resume/token_v6
                                         body: { version: 6, ... }
                                         ← { ok: true, version: 7 }
                                         ✓ Success after reconciliation
```

**Conflict Detection Algorithm:**

```typescript
interface ConflictDetectionResult {
  hasConflict: boolean;
  expectedVersion: number;
  currentVersion: number;
  conflictingFields?: string[];
}

function detectVersionConflict(
  expectedVersion: number,
  currentVersion: number
): ConflictDetectionResult {

  if (expectedVersion === currentVersion) {
    return {
      hasConflict: false,
      expectedVersion,
      currentVersion
    };
  }

  // Version mismatch = conflict
  return {
    hasConflict: true,
    expectedVersion,
    currentVersion
  };
}
```

**Conflict Resolution Strategies:**

| Strategy | When to Use | Actor Responsibility | Server Responsibility |
|----------|-------------|---------------------|----------------------|
| **Client Retry** | Simple conflicts, idempotent updates | Fetch latest, retry with new version | Return 409 with current state |
| **Three-Way Merge** | Complex field-level conflicts | Merge local changes with server state | Return full current state in 409 |
| **Last-Write-Wins** | Timestamp-based reconciliation (not recommended) | Overwrite with latest data | Accept without version check (dangerous) |
| **Manual Resolution** | Human intervention needed | Prompt user to review conflicts | Store both versions for comparison |

**Recommended Strategy: Client Retry with Three-Way Merge**

```typescript
async function setFieldsWithRetry(
  token: string,
  version: number,
  updates: FieldUpdates,
  maxRetries: number = 3
): Promise<OperationResult> {

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await setFields(token, version, updates);

    if (result.ok) {
      return result;  // Success
    }

    if (result.error?.type === 'version_conflict') {
      // Conflict detected — fetch current state
      const current = await getSubmission(token);

      // Three-way merge: base → local → remote
      const merged = mergeUpdates({
        base: result.error.baseState,      // State at version we read
        local: updates,                     // Our changes
        remote: current.data                // Current server state
      });

      // Retry with merged updates and current version
      token = current.resumeToken;
      version = current.version;
      updates = merged;

      continue;  // Retry with reconciled changes
    }

    // Non-retryable error
    return result;
  }

  // Max retries exceeded
  return {
    ok: false,
    error: {
      type: 'max_retries_exceeded',
      message: 'Failed to update after multiple conflicts'
    }
  };
}
```

**Field-Level Conflict Detection (Advanced):**

For fine-grained conflict detection, track which fields changed:

```typescript
interface ConflictDetails {
  conflictingFields: {
    field: string;
    localValue: unknown;
    remoteValue: unknown;
    baseValue: unknown;        // Value when we read
  }[];
  autoMergeable: boolean;       // Can merge without human input
}

function detectFieldConflicts(
  base: Submission,
  local: FieldUpdates,
  remote: Submission
): ConflictDetails {

  const conflicts = [];

  for (const [field, localValue] of Object.entries(local)) {
    const baseValue = base.data[field];
    const remoteValue = remote.data[field];

    // No conflict if remote didn't change
    if (deepEqual(baseValue, remoteValue)) {
      continue;  // Safe to apply local change
    }

    // No conflict if local and remote made same change
    if (deepEqual(localValue, remoteValue)) {
      continue;  // Concurrent identical updates (idempotent)
    }

    // Conflict: both changed the field differently
    conflicts.push({
      field,
      localValue,
      remoteValue,
      baseValue
    });
  }

  return {
    conflictingFields: conflicts,
    autoMergeable: conflicts.length === 0
  };
}
```

**Example: Auto-Mergeable vs. Manual Conflict**

```typescript
// Scenario 1: Auto-mergeable (different fields modified)
const base    = { name: 'Alice', email: '', phone: '' };
const local   = { name: 'Alice', email: 'alice@example.com', phone: '' };
const remote  = { name: 'Alice', email: '', phone: '555-0100' };
const merged  = { name: 'Alice', email: 'alice@example.com', phone: '555-0100' };
// ✓ No conflict — different fields

// Scenario 2: Requires manual resolution (same field modified)
const base    = { name: 'Alice', email: '', phone: '' };
const local   = { name: 'Alice Smith', email: '', phone: '' };
const remote  = { name: 'Alice Jones', email: '', phone: '' };
// ✗ Conflict on 'name' field — human decision needed
```

### 4.5 409 Conflict Response Format

When a version conflict is detected, the server returns **HTTP 409 Conflict** with a structured error response that enables client-side reconciliation.

**Response Structure:**

```typescript
interface ConflictResponse {
  ok: false;
  error: {
    type: 'version_conflict';
    message: string;
    expected: number;           // Version client provided
    current: number;            // Current version on server
    submission: Submission;     // Full current state for reconciliation
    resumeToken: string;        // Token for current version
    etag: string;               // ETag header value
    lastModified: string;       // ISO 8601 timestamp
    conflictDetails?: {
      fields: string[];         // Optional: which fields conflict
      canAutoMerge: boolean;
    };
  };
}
```

**Example 409 Response:**

```http
HTTP/1.1 409 Conflict
Content-Type: application/json
ETag: "12"
X-Resume-Token: rtok_kQp8zX3mN9jR2vL7wY4tS6hF1cB5nM8xZ0aW3dE9uG2iK7pQ
Cache-Control: no-cache

{
  "ok": false,
  "error": {
    "type": "version_conflict",
    "message": "Submission was modified by another actor. Expected version 11, but current version is 12.",
    "expected": 11,
    "current": 12,
    "submission": {
      "id": "sub_kx9m2p7q",
      "intakeId": "intake_abc123",
      "status": "draft",
      "version": 12,
      "data": {
        "name": "Alice Smith",
        "email": "alice@example.com",
        "phone": "555-0199"
      },
      "validation": {
        "valid": false,
        "missing": ["address"]
      },
      "createdAt": "2026-01-29T10:00:00Z",
      "updatedAt": "2026-01-29T14:30:22Z"
    },
    "resumeToken": "rtok_kQp8zX3mN9jR2vL7wY4tS6hF1cB5nM8xZ0aW3dE9uG2iK7pQ",
    "etag": "\"12\"",
    "lastModified": "2026-01-29T14:30:22Z",
    "conflictDetails": {
      "fields": ["phone"],
      "canAutoMerge": false
    }
  }
}
```

**Response Headers:**

```http
ETag: "12"                          # Current version as strong ETag
X-Resume-Token: rtok_...            # Token for current version
Last-Modified: Wed, 29 Jan 2026 14:30:22 GMT
Cache-Control: no-cache             # Don't cache conflict responses
Retry-After: 0                      # Client can retry immediately
```

**Client Handling:**

```typescript
async function handleConflictResponse(response: ConflictResponse) {
  const { error } = response;

  console.warn(`Version conflict: expected ${error.expected}, current ${error.current}`);

  // Option 1: Automatic retry with current state
  if (error.conflictDetails?.canAutoMerge) {
    return await retryWithMerge(error.submission, error.resumeToken);
  }

  // Option 2: Prompt user to resolve manually
  const resolution = await promptUserConflictResolution({
    localChanges: myChanges,
    remoteChanges: error.submission.data,
    conflictingFields: error.conflictDetails?.fields
  });

  // Option 3: Discard local changes and use server state
  return await acceptServerState(error.submission);

  // Option 4: Force overwrite (use with caution)
  // This requires fetching current state first to get the latest version
  const current = await getSubmission(error.resumeToken);
  return await setFields(current.resumeToken, current.version, myChanges);
}
```

**Conflict Response Best Practices:**

1. **Always Include Full State:** Return the complete current submission for reconciliation
2. **Provide Both Tokens:** Return both the stale token (for audit) and current token (for retry)
3. **Use Standard HTTP Codes:** 409 Conflict is semantically correct for version mismatches
4. **Include Retry Guidance:** Set `Retry-After: 0` to indicate immediate retry is acceptable
5. **Don't Cache Conflicts:** Set `Cache-Control: no-cache` to prevent stale conflict responses
6. **Emit Conflict Events:** Log conflicts for monitoring and alerting

### 4.6 Version in Response Headers and Body

Versions are exposed in both HTTP headers (for standard cache control) and response bodies (for programmatic access).

**Response Header Format:**

```http
# Strong ETag (exact version match required)
ETag: "42"

# Weak ETag (not used — semantically equivalent not acceptable)
# W/"42"  ← DO NOT USE

# Last-Modified (RFC 7231 timestamp)
Last-Modified: Wed, 29 Jan 2026 14:30:00 GMT

# Resume token (custom header)
X-Resume-Token: rtok_kQp8zX3mN9jR2vL7wY4tS6hF1cB5nM8xZ0aW3dE9uG2iK7pQ

# Version metadata (custom header, optional)
X-Submission-Version: 42
```

**Response Body Format:**

```json
{
  "ok": true,
  "submission": {
    "id": "sub_kx9m2p7q",
    "version": 42,
    "data": {...}
  },
  "resumeToken": "rtok_kQp8zX3mN9jR2vL7wY4tS6hF1cB5nM8xZ0aW3dE9uG2iK7pQ",
  "version": 42,
  "etag": "\"42\""
}
```

**Conditional Request Support:**

Clients can use standard HTTP conditional headers:

```http
# Conditional update (only if version matches)
PATCH /resume/rtok_abc123 HTTP/1.1
If-Match: "42"
Content-Type: application/json

{
  "data": {
    "name": "Alice"
  }
}
```

Server validation:

```typescript
function validateConditionalRequest(req: Request, submission: Submission): boolean {
  const ifMatch = req.headers['if-match'];

  if (ifMatch) {
    const expectedETag = ifMatch.replace(/"/g, '');  // Remove quotes
    const currentETag = String(submission.version);

    if (expectedETag !== currentETag) {
      // ETag mismatch — return 412 Precondition Failed
      throw new PreconditionFailedError({
        expected: expectedETag,
        current: currentETag
      });
    }
  }

  return true;
}
```

**Header vs. Body Version:**

| Location | Use Case | Pros | Cons |
|----------|----------|------|------|
| **ETag Header** | HTTP cache validation, conditional requests | Standard, works with proxies/CDNs | Requires header parsing |
| **X-Resume-Token Header** | Token-based access without parsing body | Fast, works with HEAD requests | Custom header |
| **Body (version field)** | Programmatic access, JSON APIs | Easy to parse, always in sync with data | Requires reading full response body |

**Recommended Approach: Provide All Three**

```typescript
function buildSuccessResponse(submission: Submission, token: string): Response {
  return {
    status: 200,
    headers: {
      'ETag': `"${submission.version}"`,
      'X-Resume-Token': token,
      'X-Submission-Version': String(submission.version),
      'Last-Modified': submission.updatedAt.toUTCString(),
      'Cache-Control': 'no-cache'  // Version changes frequently
    },
    body: {
      ok: true,
      submission,
      resumeToken: token,
      version: submission.version,
      etag: `"${submission.version}"`
    }
  };
}
```

### 4.7 Sequence Diagrams for Concurrent Edits

This section illustrates common concurrent edit scenarios with detailed sequence diagrams.

#### 4.7.1 Successful Concurrent Reads (No Conflict)

Multiple actors reading the same submission concurrently is safe and doesn't cause conflicts:

```
Actor A          Actor B          FormBridge Server
   │                │                     │
   │  GET /resume/token_v5               │
   ├───────────────────────────────────>│
   │                │                     │
   │                │  GET /resume/token_v5
   │                ├──────────────────>│
   │                │                     │
   │                │                ┌────────────────┐
   │                │                │ Read operation │
   │                │                │ No version     │
   │                │                │ increment      │
   │                │                └────────────────┘
   │                │                     │
   │ { version: 5, token_v5, data }      │
   │<─────────────────────────────────────┤
   │                │                     │
   │                │ { version: 5, token_v5, data }
   │                │<─────────────────────┤
   │                │                     │
```

**Result:** Both actors receive version 5. No conflict. Token remains valid.

#### 4.7.2 Sequential Writes (No Conflict)

Actors writing sequentially with correct versions:

```
Actor A                         FormBridge Server
   │                                   │
   │  PATCH /resume/token_v5           │
   │  body: { version: 5, data }       │
   ├─────────────────────────────────>│
   │                                   │
   │                              ┌─────────────────┐
   │                              │ Check: v5 = v5 ✓│
   │                              │ Update data     │
   │                              │ Version: 5 → 6  │
   │                              │ Rotate token    │
   │                              └─────────────────┘
   │                                   │
   │  { ok: true, version: 6, token_v6 }
   │<───────────────────────────────────┤
   │                                   │
   │                                   │
   │  PATCH /resume/token_v6           │
   │  body: { version: 6, data }       │
   ├─────────────────────────────────>│
   │                                   │
   │                              ┌─────────────────┐
   │                              │ Check: v6 = v6 ✓│
   │                              │ Update data     │
   │                              │ Version: 6 → 7  │
   │                              │ Rotate token    │
   │                              └─────────────────┘
   │                                   │
   │  { ok: true, version: 7, token_v7 }
   │<───────────────────────────────────┤
   │                                   │
```

**Result:** Both writes succeed. Versions increment: 5 → 6 → 7.

#### 4.7.3 Concurrent Writes (Conflict Detected)

Two actors write concurrently — one succeeds, one gets 409 Conflict:

```
Actor A          Actor B          FormBridge Server
   │                │                     │
   │  GET /resume/token_v10              │
   ├───────────────────────────────────>│
   │                │                     │
   │ { version: 10, data: {...} }        │
   │<─────────────────────────────────────┤
   │                │                     │
   │                │  GET /resume/token_v10
   │                ├──────────────────>│
   │                │                     │
   │                │ { version: 10, data: {...} }
   │                │<─────────────────────┤
   │                │                     │
   │ [Modify data locally]               │
   │                │                     │
   │                │ [Modify data locally]
   │                │                     │
   │  PATCH /resume/token_v10            │
   │  body: { version: 10, data: {name: 'Alice'} }
   ├───────────────────────────────────>│
   │                │                     │
   │                │                ┌────────────────────┐
   │                │                │ Check: v10 = v10 ✓ │
   │                │                │ Update: name=Alice│
   │                │                │ Version: 10 → 11   │
   │                │                │ Rotate: token_v11  │
   │                │                └────────────────────┘
   │                │                     │
   │ { ok: true, version: 11, token_v11 }│
   │<─────────────────────────────────────┤
   │                │                     │
   │                │                     │
   │                │  PATCH /resume/token_v10
   │                │  body: { version: 10, data: {email: 'bob@example.com'} }
   │                ├──────────────────>│
   │                │                     │
   │                │                ┌────────────────────┐
   │                │                │ Check: v10 ≠ v11 ✗ │
   │                │                │ CONFLICT!          │
   │                │                └────────────────────┘
   │                │                     │
   │                │ HTTP 409 Conflict   │
   │                │ {                   │
   │                │   expected: 10,     │
   │                │   current: 11,      │
   │                │   submission: {...},│
   │                │   token_v11         │
   │                │ }                   │
   │                │<─────────────────────┤
   │                │                     │
   │                │ [Reconcile changes] │
   │                │                     │
   │                │  GET /resume/token_v11
   │                ├──────────────────>│
   │                │                     │
   │                │ { version: 11, data: {name: 'Alice'} }
   │                │<─────────────────────┤
   │                │                     │
   │                │ [Merge: keep name=Alice, add email]
   │                │                     │
   │                │  PATCH /resume/token_v11
   │                │  body: { version: 11, data: {name: 'Alice', email: 'bob@example.com'} }
   │                ├──────────────────>│
   │                │                     │
   │                │                ┌────────────────────┐
   │                │                │ Check: v11 = v11 ✓ │
   │                │                │ Update: merged data│
   │                │                │ Version: 11 → 12   │
   │                │                │ Rotate: token_v12  │
   │                │                └────────────────────┘
   │                │                     │
   │                │ { ok: true, version: 12, token_v12 }
   │                │<─────────────────────┤
   │                │                     │
```

**Result:** Actor A wins the race (version 10 → 11). Actor B detects conflict, fetches current state (version 11), merges changes, and successfully updates (version 11 → 12). Final state includes both changes.

#### 4.7.4 Stale Token Rejection

Actor tries to use an old token after it has been rotated:

```
Actor A                         FormBridge Server
   │                                   │
   │  PATCH /resume/token_v8           │
   │  body: { version: 8, data }       │
   ├─────────────────────────────────>│
   │                                   │
   │  { ok: true, version: 9, token_v9 }
   │<───────────────────────────────────┤
   │                                   │
   │  [Ignores new token, still has token_v8]
   │                                   │
   │  PATCH /resume/token_v8 (stale!)  │
   │  body: { version: 8, data }       │
   ├─────────────────────────────────>│
   │                                   │
   │                              ┌─────────────────┐
   │                              │ Token lookup:   │
   │                              │ token_v8 → STALE│
   │                              │ (rotated at v9) │
   │                              └─────────────────┘
   │                                   │
   │  HTTP 409 Conflict                │
   │  {                                │
   │    type: 'version_conflict',      │
   │    expected: 8,                   │
   │    current: 9,                    │
   │    message: 'Token has been rotated'
   │  }                                │
   │<───────────────────────────────────┤
   │                                   │
```

**Result:** Stale token rejected. Actor must use token_v9 to proceed.

#### 4.7.5 Cross-Actor Handoff with Version Continuity

Agent starts submission, human continues, agent resumes:

```
Agent            Human            FormBridge Server
  │                │                     │
  │ POST /submissions                   │
  │ body: { intakeId, data }            │
  ├───────────────────────────────────>│
  │                │                     │
  │                │                ┌──────────────────┐
  │                │                │ Create submission│
  │                │                │ Version: 1       │
  │                │                │ Token: token_v1  │
  │                │                └──────────────────┘
  │                │                     │
  │ { version: 1, token_v1, ... }       │
  │<─────────────────────────────────────┤
  │                │                     │
  │ [Generate handoff link with token_v1]
  │                │                     │
  │  https://app.com/forms?token=token_v1
  │────────────────>│                    │
  │                │                     │
  │                │  GET /resume/token_v1
  │                ├──────────────────>│
  │                │                     │
  │                │ { version: 1, data, actor: 'agent' }
  │                │<─────────────────────┤
  │                │                     │
  │                │ [Human edits form]  │
  │                │                     │
  │                │  PATCH /resume/token_v1
  │                │  body: { version: 1, data: {...}, actor: 'human' }
  │                ├──────────────────>│
  │                │                     │
  │                │                ┌──────────────────┐
  │                │                │ Check: v1 = v1 ✓ │
  │                │                │ Update data      │
  │                │                │ Version: 1 → 2   │
  │                │                │ Actor: human     │
  │                │                │ Token: token_v2  │
  │                │                └──────────────────┘
  │                │                     │
  │                │ { ok: true, version: 2, token_v2 }
  │                │<─────────────────────┤
  │                │                     │
  │                │ [Human saves token_v2 for agent]
  │                │                     │
  │  token_v2      │                     │
  │<────────────────┤                    │
  │                │                     │
  │ PATCH /resume/token_v2              │
  │ body: { version: 2, data, actor: 'agent' }
  ├───────────────────────────────────>│
  │                │                     │
  │                │                ┌──────────────────┐
  │                │                │ Check: v2 = v2 ✓ │
  │                │                │ Update data      │
  │                │                │ Version: 2 → 3   │
  │                │                │ Actor: agent     │
  │                │                │ Token: token_v3  │
  │                │                └──────────────────┘
  │                │                     │
  │ { ok: true, version: 3, token_v3 }  │
  │<─────────────────────────────────────┤
  │                │                     │
```

**Result:** Seamless handoff across actors. Version continuity maintained: 1 (agent) → 2 (human) → 3 (agent). Audit trail shows actor transitions.

#### 4.7.6 Optimistic Concurrency with Validation Errors

Actor updates submission but validation fails — version still increments:

```
Actor A                         FormBridge Server
   │                                   │
   │  PATCH /resume/token_v5           │
   │  body: {                          │
   │    version: 5,                    │
   │    data: { email: 'invalid' }     │
   │  }                                │
   ├─────────────────────────────────>│
   │                                   │
   │                              ┌─────────────────┐
   │                              │ Check: v5 = v5 ✓│
   │                              │ Update data     │
   │                              │ Version: 5 → 6  │
   │                              │ Validate...     │
   │                              │ ✗ Invalid email │
   │                              └─────────────────┘
   │                                   │
   │  { ok: true, version: 6, token_v6,│
   │    validation: {                  │
   │      valid: false,                │
   │      errors: ['email: invalid']   │
   │    }                              │
   │  }                                │
   │<───────────────────────────────────┤
   │                                   │
```

**Result:** Update succeeds (version increments), but validation fails. Client can fix errors and submit again with version 6.

---

## 5. Token Storage, Expiration, and Lifecycle Management

### 5.1 Storage Backend Architecture

Resume tokens require persistent storage to map opaque token strings to submission identifiers and track token metadata (version, expiration, usage). The storage backend must support high-throughput lookups (O(1) or O(log n)) while handling millions of concurrent active tokens.

**Storage Requirements:**

1. **Fast Lookups:** Token validation is on the critical path for every request
2. **Durability:** Tokens must survive server restarts and deployments
3. **Expiration:** Support TTL-based automatic cleanup
4. **Scalability:** Handle millions of tokens across distributed deployments
5. **Consistency:** Token rotation requires atomic read-modify-write operations

**Supported Storage Backends:**

FormBridge supports three storage backend strategies, each with different trade-offs:

```
┌────────────────────────────────────────────────────────────────────┐
│                     Storage Backend Options                         │
└────────────────────────────────────────────────────────────────────┘

┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│   In-Memory      │          │      Redis       │          │   PostgreSQL     │
│   (Development)  │          │   (Production)   │          │   (Production)   │
└──────────────────┘          └──────────────────┘          └──────────────────┘
       │                              │                              │
       │ Lookup: O(1)                │ Lookup: O(1)                │ Lookup: O(1) w/ index
       │ Durability: ✗ (lost on restart) │ Durability: ✓ (RDB/AOF) │ Durability: ✓ (WAL)
       │ Expiration: Manual sweep    │ Expiration: Native TTL      │ Expiration: TTL query
       │ Scalability: Single process │ Scalability: Redis Cluster  │ Scalability: Replicas
       │ Consistency: Strong         │ Consistency: Strong         │ Consistency: Strong (ACID)
       │                              │                              │
       │ Use Case:                   │ Use Case:                   │ Use Case:
       │ - Local development         │ - Production (preferred)    │ - Production (alternative)
       │ - Testing                   │ - High-throughput           │ - Unified storage
       │ - Single-node setups        │ - Low latency               │ - ACID requirements
       └──────────────────────────────┴─────────────────────────────┴──────────────────┘
```

**Comparison Matrix:**

| Aspect | In-Memory | Redis | PostgreSQL |
|--------|-----------|-------|------------|
| **Lookup Speed** | Fastest (~1μs) | Fast (~100μs) | Moderate (~1-5ms) |
| **Durability** | ❌ Lost on restart | ✅ RDB snapshots + AOF | ✅ ACID with WAL |
| **TTL Support** | Manual | ✅ Native `EXPIRE` | Index-based queries |
| **Horizontal Scaling** | ❌ Single process | ✅ Redis Cluster | ✅ Read replicas |
| **Operational Complexity** | Lowest | Moderate | Higher (DB maintenance) |
| **Memory Efficiency** | Highest | High | Lower (row overhead) |
| **Recommended For** | Dev/test | Production | Unified storage |

**Architecture Diagram:**

```
┌──────────────────────────────────────────────────────────────┐
│                   Token Storage Layer                         │
└──────────────────────────────────────────────────────────────┘

   ┌──────────────────────┐
   │  Application Layer   │
   │  (HTTP API, MCP)     │
   └──────────┬───────────┘
              │
              │ validateToken(token)
              │ storeToken(metadata)
              │ invalidateToken(token)
              ▼
   ┌──────────────────────────────┐
   │  TokenStore Interface        │  ← Pluggable abstraction
   │  - get(token): Metadata      │
   │  - set(token, metadata): void│
   │  - delete(token): void       │
   │  - cleanup(before): count    │
   └──────────┬───────────────────┘
              │
              │ Backend implementation
              ▼
   ┌──────────────────────────────────────────────────┐
   │                                                   │
   ├────────────┬────────────────┬─────────────────┤
   │            │                │                 │
   ▼            ▼                ▼                 ▼
┌─────────┐ ┌─────────┐ ┌──────────────┐ ┌──────────────┐
│ Memory  │ │  Redis  │ │  PostgreSQL  │ │   Hybrid     │
│ Map     │ │ Cluster │ │  Table       │ │ (Redis+PG)   │
└─────────┘ └─────────┘ └──────────────┘ └──────────────┘
```

**Backend Selection Logic:**

```typescript
function selectStorageBackend(config: StorageConfig): TokenStore {
  const { backend, redisUrl, databaseUrl, inMemoryMaxTokens } = config;

  switch (backend) {
    case 'redis':
      if (!redisUrl) {
        throw new Error('REDIS_URL required for redis backend');
      }
      return new RedisTokenStore(redisUrl);

    case 'postgres':
      if (!databaseUrl) {
        throw new Error('DATABASE_URL required for postgres backend');
      }
      return new PostgresTokenStore(databaseUrl);

    case 'memory':
      logger.warn('In-memory token store: tokens will be lost on restart');
      return new InMemoryTokenStore({ maxTokens: inMemoryMaxTokens });

    case 'hybrid':
      // Redis for hot storage, Postgres for durability
      return new HybridTokenStore({
        hot: new RedisTokenStore(redisUrl),
        cold: new PostgresTokenStore(databaseUrl)
      });

    default:
      throw new Error(`Unknown storage backend: ${backend}`);
  }
}
```

### 5.2 Token-to-Submission Mapping

The core function of token storage is maintaining the bidirectional mapping between resume tokens and submission identifiers.

**Data Model:**

```typescript
interface TokenMetadata {
  // Token identity
  token: string;                  // Opaque resume token (e.g., "rtok_kQp8zX...")
  tokenHash?: string;             // Optional: SHA-256 hash for security

  // Submission binding
  submissionId: string;           // UUID of the submission
  intakeId: string;               // Intake this submission belongs to

  // Version tracking
  version: number;                // Current submission version

  // Lifecycle timestamps
  createdAt: Date;                // When token was generated
  expiresAt: Date;                // Expiration timestamp (createdAt + TTL)
  lastUsedAt?: Date;              // Last access timestamp (optional)

  // Status tracking
  status: TokenStatus;            // active | rotated | expired | revoked

  // Audit metadata
  createdBy?: Actor;              // Actor who triggered token creation
  rotatedFrom?: string;           // Previous token (if this is a rotation)
}

type TokenStatus = 'active' | 'rotated' | 'expired' | 'revoked';

interface Actor {
  kind: 'agent' | 'human' | 'system';
  id: string;
  name?: string;
}
```

**Storage Schema (PostgreSQL):**

```sql
CREATE TABLE resume_tokens (
  -- Primary key: token or token hash
  token_hash CHAR(64) PRIMARY KEY,           -- SHA-256 of token (security)

  -- Original token (optional, for recovery)
  token_encrypted TEXT,                      -- Encrypted token value

  -- Submission binding
  submission_id UUID NOT NULL,
  intake_id UUID NOT NULL,

  -- Version tracking
  version INTEGER NOT NULL,

  -- Lifecycle
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,

  -- Audit
  created_by_kind VARCHAR(20),
  created_by_id VARCHAR(255),
  rotated_from_hash CHAR(64),

  -- Indexes for fast lookups
  CONSTRAINT resume_tokens_status_check CHECK (status IN ('active', 'rotated', 'expired', 'revoked'))
);

-- Indexes
CREATE INDEX idx_resume_tokens_submission ON resume_tokens(submission_id, version);
CREATE INDEX idx_resume_tokens_expires_at ON resume_tokens(expires_at) WHERE status = 'active';
CREATE INDEX idx_resume_tokens_status ON resume_tokens(status);
CREATE INDEX idx_resume_tokens_intake ON resume_tokens(intake_id);

-- Foreign key (if submissions table exists in same DB)
-- ALTER TABLE resume_tokens ADD CONSTRAINT fk_submission
--   FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE;
```

**Storage Schema (Redis):**

Redis uses key-value storage with namespacing:

```
Key Pattern: "rtok:{token_hash}"
Value: JSON-serialized TokenMetadata
TTL: Automatic expiration via EXPIRE command

Example:
Key:   "rtok:a3f2c9b8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0"
Value: {
  "token": "rtok_kQp8zX3mN9jR2vL7wY4tS6hF1cB5nM8xZ0aW3dE9uG2iK7pQ",
  "submissionId": "sub_kx9m2p7q",
  "intakeId": "intake_abc123",
  "version": 5,
  "createdAt": "2026-01-29T10:00:00Z",
  "expiresAt": "2026-02-05T10:00:00Z",
  "status": "active"
}
TTL:   604800 seconds (7 days)
```

Redis commands:

```bash
# Store token with automatic expiration
SET rtok:a3f2c9b8... '{"submissionId":"sub_kx9m2p7q",...}' EX 604800

# Retrieve token
GET rtok:a3f2c9b8...

# Check TTL
TTL rtok:a3f2c9b8...

# Delete token (on rotation)
DEL rtok:a3f2c9b8...

# Atomic get-and-update last_used_at
GETEX rtok:a3f2c9b8... EXAT 1738665600  # Refresh expiration
```

**Mapping Operations:**

```typescript
class TokenStore {
  /**
   * Store a new token mapping
   */
  async set(metadata: TokenMetadata): Promise<void> {
    const tokenHash = this.hashToken(metadata.token);
    const ttlSeconds = Math.floor(
      (metadata.expiresAt.getTime() - Date.now()) / 1000
    );

    await this.backend.set(tokenHash, metadata, { ttl: ttlSeconds });
  }

  /**
   * Retrieve token metadata
   */
  async get(token: string): Promise<TokenMetadata | null> {
    const tokenHash = this.hashToken(token);
    const metadata = await this.backend.get(tokenHash);

    if (!metadata) {
      return null;  // Token not found or expired
    }

    // Check expiration (defense in depth)
    if (Date.now() > metadata.expiresAt.getTime()) {
      await this.delete(token);  // Lazy cleanup
      return null;
    }

    // Update last_used_at (optional)
    if (this.config.trackLastUsed) {
      await this.touchToken(token);
    }

    return metadata;
  }

  /**
   * Delete a token (on rotation or expiration)
   */
  async delete(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    await this.backend.delete(tokenHash);
  }

  /**
   * Find tokens by submission ID (for debugging/admin)
   */
  async findBySubmission(submissionId: string): Promise<TokenMetadata[]> {
    return await this.backend.query({
      where: { submissionId, status: 'active' }
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async touchToken(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    await this.backend.update(tokenHash, {
      lastUsedAt: new Date()
    });
  }
}
```

**Reverse Mapping (Submission → Token):**

Some operations require finding the current active token for a submission:

```typescript
/**
 * Get the current active token for a submission
 * (Used for handoff links, admin tools)
 */
async function getCurrentToken(submissionId: string): Promise<string | null> {
  // Query storage for active token with highest version
  const tokens = await tokenStore.findBySubmission(submissionId);

  if (tokens.length === 0) {
    return null;  // No active token
  }

  // Return token with highest version
  const latestToken = tokens.reduce((max, token) =>
    token.version > max.version ? token : max
  );

  return latestToken.token;
}
```

**Why Hash Tokens in Storage?**

Storing SHA-256 hashes instead of plaintext tokens provides defense-in-depth:

```
Threat Model:
- Database backup leaked → Hashed tokens cannot be used
- SQL injection → Attacker cannot extract usable tokens
- Insider threat → DBA cannot access active sessions

Trade-off:
- Cannot display token to user after storage
- Slightly slower lookups (negligible with indexed hash)

Recommendation:
- Hash tokens in PostgreSQL (compliance-sensitive environments)
- Store plaintext in Redis (better UX, rely on access controls)
```

### 5.3 TTL Configuration and Expiration Policy

Resume tokens have a configurable time-to-live (TTL) that balances security (shorter is better) with usability (longer supports asynchronous workflows).

**Default TTL Configuration:**

```typescript
interface TTLConfig {
  // Default token expiration
  defaultTTL: number;             // Default: 7 days (604800000 ms)

  // Per-intake overrides
  intakeOverrides?: Map<string, number>;  // Custom TTL per intake

  // Maximum TTL allowed
  maxTTL: number;                 // Default: 30 days (hard limit)

  // Minimum TTL allowed
  minTTL: number;                 // Default: 1 hour (prevent abuse)

  // Grace period before hard expiration
  gracePeriod?: number;           // Default: 1 hour (soft warnings)
}

const DEFAULT_TTL_CONFIG: TTLConfig = {
  defaultTTL: 7 * 24 * 60 * 60 * 1000,      // 7 days
  maxTTL: 30 * 24 * 60 * 60 * 1000,         // 30 days
  minTTL: 60 * 60 * 1000,                   // 1 hour
  gracePeriod: 60 * 60 * 1000               // 1 hour
};
```

**TTL Calculation:**

```typescript
function calculateTokenExpiration(
  config: TTLConfig,
  intake: Intake,
  overrideTTL?: number
): Date {
  let ttl: number;

  // Priority: explicit override > intake-specific > default
  if (overrideTTL !== undefined) {
    ttl = overrideTTL;
  } else if (config.intakeOverrides?.has(intake.id)) {
    ttl = config.intakeOverrides.get(intake.id)!;
  } else {
    ttl = config.defaultTTL;
  }

  // Enforce bounds
  ttl = Math.max(config.minTTL, Math.min(ttl, config.maxTTL));

  // Calculate expiration timestamp
  const expiresAt = new Date(Date.now() + ttl);

  return expiresAt;
}
```

**Example Usage:**

```typescript
// Create token with default TTL (7 days)
const token1 = await createResumeToken(submission);
// expiresAt: 2026-02-05T10:00:00Z

// Create token with custom TTL (24 hours)
const token2 = await createResumeToken(submission, {
  ttl: 24 * 60 * 60 * 1000
});
// expiresAt: 2026-01-30T10:00:00Z

// Per-intake TTL override (compliance intake: 1 hour)
const config = {
  defaultTTL: 7 * 24 * 60 * 60 * 1000,
  intakeOverrides: new Map([
    ['intake_compliance', 60 * 60 * 1000]  // 1 hour for sensitive intakes
  ])
};
```

**Expiration Triggers:**

Tokens can expire due to multiple triggers:

```typescript
enum ExpirationReason {
  TTL_ELAPSED = 'ttl_elapsed',           // Time-based expiration
  SUBMISSION_FINALIZED = 'finalized',    // Submission reached terminal state
  SUBMISSION_CANCELLED = 'cancelled',    // Submission cancelled
  SUBMISSION_EXPIRED = 'expired',        // Submission TTL expired
  TOKEN_ROTATED = 'rotated',             // Token superseded by new version
  ADMIN_REVOKED = 'admin_revoked'        // Manual revocation
}

function shouldTokenExpire(
  token: TokenMetadata,
  submission: Submission
): { expired: boolean; reason?: ExpirationReason } {

  // 1. Check TTL
  if (Date.now() > token.expiresAt.getTime()) {
    return { expired: true, reason: ExpirationReason.TTL_ELAPSED };
  }

  // 2. Check submission state
  if (submission.status === 'finalized') {
    return { expired: true, reason: ExpirationReason.SUBMISSION_FINALIZED };
  }

  if (submission.status === 'cancelled') {
    return { expired: true, reason: ExpirationReason.SUBMISSION_CANCELLED };
  }

  if (submission.status === 'expired') {
    return { expired: true, reason: ExpirationReason.SUBMISSION_EXPIRED };
  }

  // 3. Check if token has been rotated
  if (token.status === 'rotated') {
    return { expired: true, reason: ExpirationReason.TOKEN_ROTATED };
  }

  // 4. Check admin revocation
  if (token.status === 'revoked') {
    return { expired: true, reason: ExpirationReason.ADMIN_REVOKED };
  }

  return { expired: false };
}
```

**Grace Period for Soft Expiration:**

Implement a grace period to warn clients before hard expiration:

```typescript
interface ExpirationWarning {
  token: string;
  expiresAt: Date;
  timeRemaining: number;        // Milliseconds until expiration
  gracePeriod: boolean;         // True if in grace period
}

function checkExpirationWarning(
  token: TokenMetadata,
  gracePeriod: number
): ExpirationWarning | null {

  const timeRemaining = token.expiresAt.getTime() - Date.now();

  if (timeRemaining <= 0) {
    return null;  // Already expired
  }

  if (timeRemaining <= gracePeriod) {
    return {
      token: token.token,
      expiresAt: token.expiresAt,
      timeRemaining,
      gracePeriod: true
    };
  }

  return null;  // Not in grace period
}

// Include warning in response
function buildTokenResponse(token: TokenMetadata): TokenResponse {
  const warning = checkExpirationWarning(token, 60 * 60 * 1000);  // 1 hour

  return {
    resumeToken: token.token,
    version: token.version,
    expiresAt: token.expiresAt.toISOString(),
    ...(warning && {
      warning: {
        message: `Token will expire in ${Math.floor(warning.timeRemaining / 1000 / 60)} minutes`,
        timeRemaining: warning.timeRemaining
      }
    })
  };
}
```

**Configuration via Environment Variables:**

```bash
# Default TTL (7 days)
TOKEN_TTL_DEFAULT=604800000

# Maximum TTL (30 days)
TOKEN_TTL_MAX=2592000000

# Minimum TTL (1 hour)
TOKEN_TTL_MIN=3600000

# Grace period (1 hour)
TOKEN_GRACE_PERIOD=3600000

# Per-intake overrides (JSON)
TOKEN_TTL_OVERRIDES='{"intake_compliance":3600000,"intake_public":1209600000}'
```

### 5.4 Expiration Behavior and Error Responses

When a token expires, the server returns a structured error response that enables client recovery.

**410 Gone Response Format:**

```typescript
interface ExpiredTokenResponse {
  ok: false;
  error: {
    type: 'token_expired';
    message: string;
    reason: ExpirationReason;

    // Enable client recovery
    submissionId: string;         // Original submission ID
    expiresAt: string;            // When token expired (ISO 8601)
    expiredFor: number;           // Milliseconds since expiration

    // Recovery options
    canRecover: boolean;          // Can submission still be accessed?
    recoveryMethod?: string;      // How to recover (e.g., "authenticate")
    alternateAccess?: string;     // URL for authenticated access
  };
}
```

**Example Expired Token Response:**

```http
HTTP/1.1 410 Gone
Content-Type: application/json
Cache-Control: no-cache
X-Submission-Id: sub_kx9m2p7q

{
  "ok": false,
  "error": {
    "type": "token_expired",
    "message": "Resume token has expired. The token was valid for 7 days and expired 2 hours ago.",
    "reason": "ttl_elapsed",
    "submissionId": "sub_kx9m2p7q",
    "expiresAt": "2026-02-05T10:00:00Z",
    "expiredFor": 7200000,
    "canRecover": true,
    "recoveryMethod": "authenticate",
    "alternateAccess": "https://app.formbridge.com/submissions/sub_kx9m2p7q"
  }
}
```

**Expiration Response Builder:**

```typescript
function buildExpiredTokenResponse(
  token: TokenMetadata,
  submission: Submission,
  reason: ExpirationReason
): ExpiredTokenResponse {

  const expiredFor = Date.now() - token.expiresAt.getTime();
  const canRecover = submission.status !== 'finalized' &&
                     submission.status !== 'cancelled';

  return {
    ok: false,
    error: {
      type: 'token_expired',
      message: formatExpirationMessage(reason, expiredFor),
      reason,
      submissionId: submission.id,
      expiresAt: token.expiresAt.toISOString(),
      expiredFor,
      canRecover,
      ...(canRecover && {
        recoveryMethod: 'authenticate',
        alternateAccess: `${BASE_URL}/submissions/${submission.id}`
      })
    }
  };
}

function formatExpirationMessage(
  reason: ExpirationReason,
  expiredFor: number
): string {
  const duration = Math.floor(expiredFor / 1000 / 60);  // Minutes

  switch (reason) {
    case ExpirationReason.TTL_ELAPSED:
      return `Resume token has expired. The token was valid for 7 days and expired ${duration} minutes ago.`;

    case ExpirationReason.SUBMISSION_FINALIZED:
      return `Resume token is no longer valid because the submission has been finalized.`;

    case ExpirationReason.TOKEN_ROTATED:
      return `Resume token has been superseded by a newer version. Please use the latest token from your most recent operation.`;

    case ExpirationReason.ADMIN_REVOKED:
      return `Resume token has been revoked by an administrator.`;

    default:
      return `Resume token has expired (reason: ${reason}).`;
  }
}
```

**Client Handling:**

```typescript
async function handleExpiredToken(response: ExpiredTokenResponse): Promise<void> {
  const { error } = response;

  console.error(`Token expired: ${error.message}`);
  console.log(`Submission ID: ${error.submissionId}`);

  if (error.canRecover) {
    // Option 1: Authenticate and access via submission ID
    const authenticated = await authenticateUser();
    if (authenticated) {
      const submission = await getSubmissionById(error.submissionId);
      return continueWithSubmission(submission);
    }

    // Option 2: Request new token via authentication
    const newToken = await requestNewToken(error.submissionId);
    return continueWithToken(newToken);
  } else {
    // Cannot recover — submission is in terminal state
    throw new Error('Submission cannot be modified (finalized or cancelled)');
  }
}
```

**Different Expiration Reasons:**

```typescript
// Example 1: TTL elapsed
{
  "error": {
    "type": "token_expired",
    "reason": "ttl_elapsed",
    "message": "Resume token has expired. The token was valid for 7 days and expired 2 hours ago.",
    "submissionId": "sub_kx9m2p7q",
    "canRecover": true
  }
}

// Example 2: Submission finalized
{
  "error": {
    "type": "token_expired",
    "reason": "finalized",
    "message": "Resume token is no longer valid because the submission has been finalized.",
    "submissionId": "sub_kx9m2p7q",
    "canRecover": false
  }
}

// Example 3: Token rotated
{
  "error": {
    "type": "token_expired",
    "reason": "rotated",
    "message": "Resume token has been superseded by a newer version. Please use the latest token from your most recent operation.",
    "submissionId": "sub_kx9m2p7q",
    "canRecover": true,
    "hint": "Check the response from your last setFields or submit operation for the new token."
  }
}
```

### 5.5 Cleanup Strategies

Expired tokens must be cleaned up to prevent unbounded storage growth. FormBridge supports both passive (lazy) and active cleanup strategies.

**Cleanup Strategy Comparison:**

| Strategy | When Cleanup Occurs | Pros | Cons | Recommended For |
|----------|-------------------|------|------|----------------|
| **Lazy (Passive)** | On access | No background jobs | Expired tokens accumulate | Low-traffic systems |
| **Active (Scheduled)** | Periodic background job | Bounded storage growth | Requires scheduler | Production systems |
| **Hybrid** | Both | Best of both | More complex | High-scale production |
| **Storage-Native** | Automatic (Redis TTL) | No application logic | Backend-specific | Redis deployments |

#### 5.5.1 Lazy Cleanup (Passive)

Expired tokens are cleaned up when accessed:

```typescript
async function validateToken(token: string): Promise<TokenMetadata | null> {
  const metadata = await tokenStore.get(token);

  if (!metadata) {
    return null;  // Token not found
  }

  // Check expiration
  if (Date.now() > metadata.expiresAt.getTime()) {
    // Lazy cleanup: delete expired token
    await tokenStore.delete(token);

    // Emit expiration event
    await emitEvent({
      type: 'token.expired',
      submissionId: metadata.submissionId,
      reason: 'ttl_elapsed',
      expiredAt: metadata.expiresAt
    });

    return null;  // Token expired
  }

  return metadata;
}
```

**Pros:**
- No background jobs required
- Simple implementation
- Works with any storage backend

**Cons:**
- Expired tokens accumulate if never accessed
- Storage grows unbounded for abandoned sessions
- No proactive cleanup

**Best For:**
- Development environments
- Low-traffic applications
- Short TTLs (< 24 hours)

#### 5.5.2 Active Cleanup (Scheduled)

Periodic background job sweeps expired tokens:

```typescript
class TokenCleanupScheduler {
  private interval: number = 60 * 60 * 1000;  // 1 hour
  private batchSize: number = 1000;

  async start(): Promise<void> {
    setInterval(() => this.cleanupExpiredTokens(), this.interval);
  }

  private async cleanupExpiredTokens(): Promise<void> {
    const startTime = Date.now();
    let totalDeleted = 0;

    try {
      // Find expired tokens in batches
      let hasMore = true;
      while (hasMore) {
        const expiredTokens = await this.findExpiredTokens(this.batchSize);

        if (expiredTokens.length === 0) {
          hasMore = false;
          break;
        }

        // Delete batch
        await this.deleteTokenBatch(expiredTokens);
        totalDeleted += expiredTokens.length;

        // Emit events
        await this.emitExpirationEvents(expiredTokens);

        // Check if more batches exist
        hasMore = expiredTokens.length === this.batchSize;
      }

      const duration = Date.now() - startTime;
      logger.info('Token cleanup completed', {
        deleted: totalDeleted,
        durationMs: duration
      });

    } catch (error) {
      logger.error('Token cleanup failed', { error });
    }
  }

  private async findExpiredTokens(limit: number): Promise<TokenMetadata[]> {
    // Query storage for expired tokens
    return await tokenStore.query({
      where: {
        expiresAt: { lt: new Date() },
        status: 'active'
      },
      limit
    });
  }

  private async deleteTokenBatch(tokens: TokenMetadata[]): Promise<void> {
    // Batch delete for efficiency
    await tokenStore.deleteBatch(tokens.map(t => t.token));
  }

  private async emitExpirationEvents(tokens: TokenMetadata[]): Promise<void> {
    for (const token of tokens) {
      await emitEvent({
        type: 'token.expired',
        submissionId: token.submissionId,
        reason: 'ttl_elapsed',
        expiredAt: token.expiresAt
      });
    }
  }
}
```

**SQL Query for Batch Cleanup:**

```sql
-- PostgreSQL: Find and delete expired tokens
WITH expired AS (
  SELECT token_hash
  FROM resume_tokens
  WHERE expires_at < NOW()
    AND status = 'active'
  LIMIT 1000
)
DELETE FROM resume_tokens
WHERE token_hash IN (SELECT token_hash FROM expired)
RETURNING token_hash, submission_id, expires_at;
```

**Configuration:**

```typescript
interface CleanupConfig {
  enabled: boolean;               // Enable active cleanup
  interval: number;               // Cleanup interval (ms)
  batchSize: number;              // Tokens per batch
  maxDuration: number;            // Max cleanup duration (ms)
  retainExpired: number;          // Retain expired tokens for N days (audit)
}

const DEFAULT_CLEANUP_CONFIG: CleanupConfig = {
  enabled: true,
  interval: 60 * 60 * 1000,       // 1 hour
  batchSize: 1000,
  maxDuration: 5 * 60 * 1000,     // 5 minutes
  retainExpired: 7 * 24 * 60 * 60 * 1000  // 7 days
};
```

**Pros:**
- Bounded storage growth
- Proactive cleanup before access
- Predictable resource usage

**Cons:**
- Requires background job infrastructure
- CPU/IO overhead during cleanup
- Potential lock contention

**Best For:**
- Production environments
- High-traffic applications
- Long TTLs (> 24 hours)

#### 5.5.3 Hybrid Cleanup

Combine lazy and active strategies:

```typescript
class HybridCleanupStrategy {
  private scheduler: TokenCleanupScheduler;

  async validateToken(token: string): Promise<TokenMetadata | null> {
    const metadata = await tokenStore.get(token);

    if (metadata && this.isExpired(metadata)) {
      // Lazy cleanup on access
      await this.deleteToken(token);
      return null;
    }

    return metadata;
  }

  async startActiveCleanup(): Promise<void> {
    // Active cleanup runs independently
    this.scheduler = new TokenCleanupScheduler();
    await this.scheduler.start();
  }

  private isExpired(metadata: TokenMetadata): boolean {
    return Date.now() > metadata.expiresAt.getTime();
  }
}
```

**Pros:**
- Best of both worlds
- Immediate cleanup on access
- Periodic sweep for abandoned tokens

**Cons:**
- More complex implementation
- Potential duplicate cleanup logic

**Best For:**
- High-scale production systems
- Mixed workload patterns

#### 5.5.4 Storage-Native Cleanup (Redis)

Redis supports native TTL-based expiration:

```typescript
class RedisTokenStore implements TokenStore {
  async set(metadata: TokenMetadata): Promise<void> {
    const ttlSeconds = Math.floor(
      (metadata.expiresAt.getTime() - Date.now()) / 1000
    );

    // Redis automatically deletes key after TTL
    await this.redis.setex(
      `rtok:${this.hashToken(metadata.token)}`,
      ttlSeconds,
      JSON.stringify(metadata)
    );
  }

  async get(token: string): Promise<TokenMetadata | null> {
    const key = `rtok:${this.hashToken(token)}`;
    const data = await this.redis.get(key);

    if (!data) {
      // Token expired (Redis deleted it) or never existed
      return null;
    }

    return JSON.parse(data);
  }
}
```

**Pros:**
- No application cleanup logic needed
- Automatic memory reclamation
- O(1) expiration checking

**Cons:**
- Redis-specific (not portable)
- No expiration events
- No audit trail for expired tokens

**Best For:**
- Redis-backed deployments
- Stateless applications
- Ephemeral token storage

**Retention for Audit Trail:**

For compliance, retain expired token metadata:

```sql
-- Archive expired tokens before deletion
INSERT INTO resume_tokens_archive (
  token_hash, submission_id, version, created_at, expires_at, expired_at
)
SELECT
  token_hash, submission_id, version, created_at, expires_at, NOW()
FROM resume_tokens
WHERE expires_at < NOW() - INTERVAL '7 days'
  AND status = 'active';

-- Then delete from active table
DELETE FROM resume_tokens
WHERE expires_at < NOW() - INTERVAL '7 days'
  AND status = 'active';
```

### 5.6 Storage Backend Interface Specification

The `TokenStore` interface defines the contract for all storage backend implementations.

**Interface Definition:**

```typescript
interface TokenStore {
  /**
   * Store a new token with metadata
   * @throws StorageError if operation fails
   */
  set(metadata: TokenMetadata): Promise<void>;

  /**
   * Retrieve token metadata by token string
   * @returns Token metadata or null if not found/expired
   */
  get(token: string): Promise<TokenMetadata | null>;

  /**
   * Delete a token (on rotation or expiration)
   * @returns true if token existed, false otherwise
   */
  delete(token: string): Promise<boolean>;

  /**
   * Batch delete tokens (for cleanup)
   */
  deleteBatch(tokens: string[]): Promise<number>;

  /**
   * Query tokens by criteria (for admin/debugging)
   */
  query(criteria: TokenQueryCriteria): Promise<TokenMetadata[]>;

  /**
   * Update token metadata (e.g., last_used_at)
   */
  update(token: string, updates: Partial<TokenMetadata>): Promise<void>;

  /**
   * Count tokens matching criteria
   */
  count(criteria?: TokenQueryCriteria): Promise<number>;

  /**
   * Health check for storage backend
   */
  healthCheck(): Promise<HealthStatus>;
}

interface TokenQueryCriteria {
  submissionId?: string;
  intakeId?: string;
  status?: TokenStatus | TokenStatus[];
  expiresAt?: { lt?: Date; gt?: Date };
  createdAt?: { lt?: Date; gt?: Date };
  limit?: number;
  offset?: number;
}

interface HealthStatus {
  healthy: boolean;
  latencyMs: number;
  errorRate?: number;
  details?: Record<string, unknown>;
}
```

**Implementation Example (PostgreSQL):**

```typescript
class PostgresTokenStore implements TokenStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async set(metadata: TokenMetadata): Promise<void> {
    const tokenHash = this.hashToken(metadata.token);

    await this.pool.query(
      `INSERT INTO resume_tokens (
        token_hash, submission_id, intake_id, version,
        status, created_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (token_hash) DO UPDATE SET
        submission_id = EXCLUDED.submission_id,
        version = EXCLUDED.version,
        expires_at = EXCLUDED.expires_at`,
      [
        tokenHash,
        metadata.submissionId,
        metadata.intakeId,
        metadata.version,
        metadata.status,
        metadata.createdAt,
        metadata.expiresAt
      ]
    );
  }

  async get(token: string): Promise<TokenMetadata | null> {
    const tokenHash = this.hashToken(token);

    const result = await this.pool.query(
      `SELECT * FROM resume_tokens
       WHERE token_hash = $1
         AND expires_at > NOW()
         AND status = 'active'`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToMetadata(result.rows[0]);
  }

  async delete(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);

    const result = await this.pool.query(
      `DELETE FROM resume_tokens WHERE token_hash = $1`,
      [tokenHash]
    );

    return result.rowCount > 0;
  }

  async deleteBatch(tokens: string[]): Promise<number> {
    const hashes = tokens.map(t => this.hashToken(t));

    const result = await this.pool.query(
      `DELETE FROM resume_tokens WHERE token_hash = ANY($1)`,
      [hashes]
    );

    return result.rowCount;
  }

  async query(criteria: TokenQueryCriteria): Promise<TokenMetadata[]> {
    const { where, params } = this.buildWhereClause(criteria);
    const limit = criteria.limit || 100;
    const offset = criteria.offset || 0;

    const result = await this.pool.query(
      `SELECT * FROM resume_tokens
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return result.rows.map(row => this.mapRowToMetadata(row));
  }

  async count(criteria?: TokenQueryCriteria): Promise<number> {
    const { where, params } = criteria
      ? this.buildWhereClause(criteria)
      : { where: 'TRUE', params: [] };

    const result = await this.pool.query(
      `SELECT COUNT(*) FROM resume_tokens WHERE ${where}`,
      params
    );

    return parseInt(result.rows[0].count, 10);
  }

  async update(token: string, updates: Partial<TokenMetadata>): Promise<void> {
    const tokenHash = this.hashToken(token);
    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (updates.lastUsedAt) {
      setClauses.push(`last_used_at = $${values.length + 1}`);
      values.push(updates.lastUsedAt);
    }

    if (updates.status) {
      setClauses.push(`status = $${values.length + 1}`);
      values.push(updates.status);
    }

    if (setClauses.length === 0) {
      return;  // Nothing to update
    }

    values.push(tokenHash);

    await this.pool.query(
      `UPDATE resume_tokens SET ${setClauses.join(', ')}
       WHERE token_hash = $${values.length}`,
      values
    );
  }

  async healthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      await this.pool.query('SELECT 1');
      const latencyMs = Date.now() - startTime;

      return {
        healthy: true,
        latencyMs,
        details: {
          backend: 'postgres',
          poolSize: this.pool.totalCount,
          idleConnections: this.pool.idleCount
        }
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        details: { error: error.message }
      };
    }
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private mapRowToMetadata(row: any): TokenMetadata {
    return {
      token: '',  // Not stored in plaintext
      submissionId: row.submission_id,
      intakeId: row.intake_id,
      version: row.version,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at
    };
  }

  private buildWhereClause(criteria: TokenQueryCriteria): {
    where: string;
    params: unknown[];
  } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (criteria.submissionId) {
      params.push(criteria.submissionId);
      conditions.push(`submission_id = $${params.length}`);
    }

    if (criteria.intakeId) {
      params.push(criteria.intakeId);
      conditions.push(`intake_id = $${params.length}`);
    }

    if (criteria.status) {
      const statuses = Array.isArray(criteria.status)
        ? criteria.status
        : [criteria.status];
      params.push(statuses);
      conditions.push(`status = ANY($${params.length})`);
    }

    if (criteria.expiresAt?.lt) {
      params.push(criteria.expiresAt.lt);
      conditions.push(`expires_at < $${params.length}`);
    }

    if (criteria.expiresAt?.gt) {
      params.push(criteria.expiresAt.gt);
      conditions.push(`expires_at > $${params.length}`);
    }

    return {
      where: conditions.length > 0 ? conditions.join(' AND ') : 'TRUE',
      params
    };
  }
}
```

**Implementation Example (Redis):**

```typescript
class RedisTokenStore implements TokenStore {
  private redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  async set(metadata: TokenMetadata): Promise<void> {
    const key = this.buildKey(metadata.token);
    const ttlSeconds = Math.floor(
      (metadata.expiresAt.getTime() - Date.now()) / 1000
    );

    await this.redis.setex(
      key,
      Math.max(ttlSeconds, 1),  // Minimum 1 second
      JSON.stringify(metadata)
    );
  }

  async get(token: string): Promise<TokenMetadata | null> {
    const key = this.buildKey(token);
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data);
  }

  async delete(token: string): Promise<boolean> {
    const key = this.buildKey(token);
    const result = await this.redis.del(key);
    return result > 0;
  }

  async deleteBatch(tokens: string[]): Promise<number> {
    if (tokens.length === 0) return 0;

    const keys = tokens.map(t => this.buildKey(t));
    return await this.redis.del(...keys);
  }

  async query(criteria: TokenQueryCriteria): Promise<TokenMetadata[]> {
    // Redis doesn't support efficient querying — use secondary index or scan
    const pattern = this.buildPattern(criteria);
    const keys = await this.scanKeys(pattern, criteria.limit || 100);

    const pipeline = this.redis.pipeline();
    keys.forEach(key => pipeline.get(key));
    const results = await pipeline.exec();

    return results
      .map(([err, data]) => (err ? null : JSON.parse(data as string)))
      .filter((metadata): metadata is TokenMetadata =>
        metadata !== null && this.matchesCriteria(metadata, criteria)
      );
  }

  async count(criteria?: TokenQueryCriteria): Promise<number> {
    const pattern = criteria ? this.buildPattern(criteria) : 'rtok:*';
    let count = 0;
    let cursor = '0';

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        1000
      );
      cursor = newCursor;
      count += keys.length;
    } while (cursor !== '0');

    return count;
  }

  async update(token: string, updates: Partial<TokenMetadata>): Promise<void> {
    // Get current metadata, merge updates, and set with original TTL
    const current = await this.get(token);
    if (!current) return;

    const updated = { ...current, ...updates };
    const key = this.buildKey(token);
    const ttl = await this.redis.ttl(key);

    if (ttl > 0) {
      await this.redis.setex(key, ttl, JSON.stringify(updated));
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      await this.redis.ping();
      const latencyMs = Date.now() - startTime;
      const info = await this.redis.info('stats');

      return {
        healthy: true,
        latencyMs,
        details: {
          backend: 'redis',
          connected: true,
          info: this.parseRedisInfo(info)
        }
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        details: { error: error.message }
      };
    }
  }

  private buildKey(token: string): string {
    const tokenHash = this.hashToken(token);
    return `rtok:${tokenHash}`;
  }

  private buildPattern(criteria: TokenQueryCriteria): string {
    // Limited pattern matching in Redis
    return 'rtok:*';
  }

  private async scanKeys(pattern: string, limit: number): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [newCursor, matchedKeys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        1000
      );
      cursor = newCursor;
      keys.push(...matchedKeys);

      if (keys.length >= limit) break;
    } while (cursor !== '0');

    return keys.slice(0, limit);
  }

  private matchesCriteria(
    metadata: TokenMetadata,
    criteria: TokenQueryCriteria
  ): boolean {
    if (criteria.submissionId && metadata.submissionId !== criteria.submissionId) {
      return false;
    }

    if (criteria.status) {
      const statuses = Array.isArray(criteria.status)
        ? criteria.status
        : [criteria.status];
      if (!statuses.includes(metadata.status)) {
        return false;
      }
    }

    return true;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private parseRedisInfo(info: string): Record<string, string> {
    const lines = info.split('\r\n');
    const parsed: Record<string, string> = {};

    for (const line of lines) {
      const [key, value] = line.split(':');
      if (key && value) {
        parsed[key] = value;
      }
    }

    return parsed;
  }
}
```

**Factory Pattern for Backend Selection:**

```typescript
class TokenStoreFactory {
  static create(config: StorageConfig): TokenStore {
    switch (config.backend) {
      case 'postgres':
        return new PostgresTokenStore(config.databaseUrl);

      case 'redis':
        return new RedisTokenStore(config.redisUrl);

      case 'memory':
        return new InMemoryTokenStore(config);

      case 'hybrid':
        return new HybridTokenStore({
          hot: new RedisTokenStore(config.redisUrl),
          cold: new PostgresTokenStore(config.databaseUrl)
        });

      default:
        throw new Error(`Unknown storage backend: ${config.backend}`);
    }
  }
}

// Usage
const tokenStore = TokenStoreFactory.create({
  backend: process.env.TOKEN_STORAGE_BACKEND || 'redis',
  redisUrl: process.env.REDIS_URL,
  databaseUrl: process.env.DATABASE_URL
});
```

---

## 6. Cross-Actor Handoff and Authentication Bypass

### 6.1 Overview

Resume tokens enable **cross-actor collaboration** without requiring shared authentication credentials. This is a foundational capability of FormBridge: an AI agent can start a submission, hand it off to a human reviewer with a simple URL, and the human can continue the submission without logging in or sharing API keys.

This section documents:
- Why tokens bypass traditional authentication
- Security trade-offs of bearer token access
- Agent → Human → Agent handoff flows
- URL generation for human-accessible resume links
- Sequence diagrams showing multi-actor collaboration patterns

### 6.2 Authentication Bypass Rationale

**The Problem with Traditional Auth**

Traditional authentication models require all actors to share credentials or have accounts in the same system:

```
❌ Agent authentication via API key
❌ Human authentication via username/password
❌ Different actor = different credential type
❌ No seamless handoff between actors
```

This breaks down for cross-actor workflows:
- **Agent → Human:** Agent would need to provision a user account for the human
- **Human → Agent:** Human would need to generate an API key for the agent
- **Agent A → Agent B:** Would require shared key infrastructure or service accounts
- **Time-delayed handoff:** Credentials might expire before handoff occurs

**Resume Tokens as Capability Credentials**

Resume tokens solve this using the **bearer token pattern:**

> **Possession of the token IS the authorization.**

No separate authentication step is required. If you have a valid, non-expired resume token, you can access and modify the submission it references.

**Design Principle:**
```
token = cryptographic_random(256_bits)
capability = "read + write access to submission X until expiry"
security = cryptographic_randomness + HTTPS + expiration + audit_trail
```

**Why This Works:**

1. **Unguessable Tokens**
   - 256-bit entropy = 2^256 possible values
   - Brute-force attack would require 10^67 years at 1 billion guesses/second
   - Tokens are effectively unforgeable

2. **HTTPS Transport**
   - Tokens transmitted over encrypted channels
   - Man-in-the-middle attacks prevented by TLS
   - Network eavesdropping ineffective

3. **Expiration Limits Exposure**
   - Default 7-day TTL limits the window of vulnerability
   - Expired tokens become useless to attackers
   - Submission-level TTL provides additional boundary

4. **Audit Trail for Accountability**
   - Every token access logged with actor metadata
   - Suspicious patterns can be detected
   - Post-mortem analysis possible if token is compromised

### 6.3 Security Trade-offs

**What We Gain:**

✅ **Frictionless Handoff**
   - Zero setup for human recipient
   - Works across organizational boundaries
   - No credential provisioning or management

✅ **Time-Delayed Collaboration**
   - Token remains valid for days
   - Actors don't need to be online simultaneously
   - Resilient to process crashes and restarts

✅ **Multi-Actor Workflows**
   - Agent → Human → Reviewer → Agent
   - Each actor uses the same token mechanism
   - No special cases for different actor types

✅ **MCP Compatibility**
   - Tokens work in stateless MCP contexts
   - No session management required
   - No authentication callback flows

**What We Give Up:**

⚠️ **Token Leakage Risk**
   - If token is exposed (logs, screenshots, shoulder surfing), attacker gains access
   - Mitigation: Short TTL, audit trail, one-time-use rotation (future enhancement)

⚠️ **No Per-Actor Permissions**
   - All actors with the token have the same access level
   - Cannot distinguish between agent and human actions (except via actor metadata)
   - Mitigation: Submission state machine prevents destructive operations; approval gates require explicit human review

⚠️ **Revocation Challenge**
   - Rotating the token invalidates access for ALL actors
   - No selective revocation (e.g., "block agent but not human")
   - Mitigation: Short TTL means leaked tokens expire quickly; submission can be cancelled

⚠️ **Potential for Misuse**
   - Actor with token could share it with unauthorized parties
   - Submission data is exposed to anyone with the token
   - Mitigation: Audit trail tracks all access; intake definitions should not request PII without approval gates

**Risk Mitigation Summary:**

| Risk | Likelihood | Impact | Mitigations |
|------|-----------|--------|-------------|
| Token leaked in logs | Low | Medium | Token prefix (`rtok_`) for secret scanning, structured logging with token redaction |
| Token shared via insecure channel (email, SMS) | Medium | Medium | 7-day expiration, HTTPS-only URLs, user education |
| Token stolen via network intercept | Very Low | High | HTTPS mandatory, HSTS headers, certificate pinning (future) |
| Malicious actor modifies submission | Low | Medium | Audit trail with IP/actor metadata, state machine prevents destructive ops, approval gates |
| Token enumeration attack | Very Low | Critical | 256-bit entropy = infeasible, rate limiting on token validation, anomaly detection |

**Security Posture:**

Resume tokens are **appropriate for**:
- Collaborative data collection workflows
- Time-bounded submissions (default 7-day TTL)
- Non-sensitive or semi-sensitive data
- Workflows requiring frictionless handoff

Resume tokens are **NOT appropriate for**:
- Long-lived access (> 30 days without active use)
- Highly sensitive PII or financial data without approval gates
- Regulatory-compliance scenarios requiring multi-factor authentication
- Scenarios where revocation must be instantaneous and actor-specific

For high-security scenarios, combine resume tokens with:
- Approval gates (§2.2 of INTAKE_CONTRACT_SPEC.md)
- Field-level encryption for sensitive data
- Additional authentication for terminal operations (submit, approve)
- Shorter TTL (e.g., 24 hours)

### 6.4 Cross-Actor Handoff Flows

#### 6.4.1 Agent → Human Handoff

**Scenario:** Agent gathers 80% of data, identifies fields requiring human judgment, hands off.

```
┌─────────────┐                             ┌──────────────┐                        ┌───────┐
│ AI Agent    │                             │  FormBridge  │                        │ Human │
│             │                             │    Server    │                        │       │
└─────────────┘                             └──────────────┘                        └───────┘
       │                                             │                                    │
       │ 1. createSubmission(intakeId)              │                                    │
       ├────────────────────────────────────────────>│                                    │
       │                                             │                                    │
       │ { submissionId, resumeToken_v1, version:1 }│                                    │
       │<────────────────────────────────────────────┤                                    │
       │                                             │                                    │
       │ 2. setFields(resumeToken_v1, {             │                                    │
       │      vendor_name: "Acme Corp",             │                                    │
       │      ein: "12-3456789",                    │                                    │
       │      address: "..." })                     │                                    │
       ├────────────────────────────────────────────>│                                    │
       │                                             │                                    │
       │ { ok: true, resumeToken_v2, version: 2 }   │                                    │
       │<────────────────────────────────────────────┤                                    │
       │                                             │                                    │
       │ 3. validate(resumeToken_v2)                │                                    │
       ├────────────────────────────────────────────>│                                    │
       │                                             │                                    │
       │ { ok: false, error: {                      │                                    │
       │     type: "missing",                       │                                    │
       │     fields: [{                             │                                    │
       │       path: "insurance_carrier",           │                                    │
       │       code: "required",                    │                                    │
       │       message: "Insurance carrier required"│                                    │
       │     }, {                                   │                                    │
       │       path: "coverage_amount",             │                                    │
       │       code: "required"                     │                                    │
       │     }],                                    │                                    │
       │     nextActions: [{                        │                                    │
       │       action: "collect_field",             │                                    │
       │       field: "insurance_carrier",          │                                    │
       │       hint: "Agent cannot access..."       │                                    │
       │     }]                                     │                                    │
       │   },                                       │                                    │
       │   resumeToken_v3, version: 3               │                                    │
       │ }                                          │                                    │
       │<────────────────────────────────────────────┤                                    │
       │                                             │                                    │
       │ [Agent determines it cannot proceed]        │                                    │
       │                                             │                                    │
       │ 4. Generate handoff URL:                   │                                    │
       │    https://forms.example.com/resume/       │                                    │
       │    {resumeToken_v3}                        │                                    │
       │                                             │                                    │
       │ 5. Notify human via email/Slack:           │                                    │
       │    "Please complete the vendor onboarding  │                                    │
       │     form. Missing fields: insurance info." │                                    │
       │                                             │                                    │
       │    [Click here to continue]                │                                    │
       │    https://forms.example.com/resume/rtok_...                                   │
       ├────────────────────────────────────────────────────────────────────────────────>│
       │                                             │                                    │
       │                                             │  6. Human clicks link              │
       │                                             │<───────────────────────────────────┤
       │                                             │                                    │
       │                                             │  7. Server validates token,        │
       │                                             │     renders form with pre-filled   │
       │                                             │     data and highlights missing    │
       │                                             │     fields                         │
       │                                             │                                    │
       │                                             │  8. Human fills insurance_carrier, │
       │                                             │     coverage_amount                │
       │                                             │<───────────────────────────────────┤
       │                                             │                                    │
       │                                             │  { resumeToken_v4, version: 4 }    │
       │                                             │────────────────────────────────────>│
       │                                             │                                    │
       │                                             │  9. Human clicks "Submit"          │
       │                                             │<───────────────────────────────────┤
       │                                             │                                    │
       │                                             │  10. Submission moves to           │
       │                                             │      "submitted" or "needs_review" │
       │                                             │                                    │
       │ 11. Webhook: submission.completed          │                                    │
       │<────────────────────────────────────────────┤                                    │
       │                                             │                                    │
       │ [Agent receives completion event and       │                                    │
       │  proceeds with next workflow step]         │                                    │
```

**Key Points:**

1. **Token Continuity:** Same token chain (`v1 → v2 → v3 → v4`) spans both actors
2. **No Authentication:** Human clicks URL and immediately sees form (no login)
3. **Pre-filled Context:** All agent-gathered data is already in the form
4. **Clear Next Actions:** Missing fields are highlighted; agent's hint displayed
5. **Version Tracking:** Each update increments version; no data loss

#### 6.4.2 Human → Agent Handoff

**Scenario:** Human starts submission manually, pauses to gather documents, agent completes submission programmatically.

```
┌───────┐                        ┌──────────────┐                        ┌─────────────┐
│ Human │                        │  FormBridge  │                        │ AI Agent    │
│       │                        │    Server    │                        │             │
└───────┘                        └──────────────┘                        └─────────────┘
    │                                    │                                        │
    │ 1. Visit form URL                 │                                        │
    ├──────────────────────────────────>│                                        │
    │                                    │                                        │
    │ 2. Fill initial fields:           │                                        │
    │    company_name, contact_email    │                                        │
    ├──────────────────────────────────>│                                        │
    │                                    │                                        │
    │ { resumeToken_v1, version: 1 }    │                                        │
    │<──────────────────────────────────┤                                        │
    │                                    │                                        │
    │ 3. Click "Save and Continue Later"│                                        │
    ├──────────────────────────────────>│                                        │
    │                                    │                                        │
    │ { resumeUrl: "https://forms.      │                                        │
    │   example.com/resume/rtok_..." }  │                                        │
    │<──────────────────────────────────┤                                        │
    │                                    │                                        │
    │ [Human emails resume URL to agent]│                                        │
    │    "Please complete this form     │                                        │
    │     programmatically with data    │                                        │
    │     from our CRM."                │                                        │
    ├───────────────────────────────────────────────────────────────────>│
    │                                    │                                        │
    │                                    │  4. Extract token from URL            │
    │                                    │     resumeToken = parse_url(url)      │
    │                                    │                                        │
    │                                    │  5. getSubmission(resumeToken_v1)     │
    │                                    │<───────────────────────────────────────┤
    │                                    │                                        │
    │                                    │  { submissionId, version: 1,          │
    │                                    │    fields: {                          │
    │                                    │      company_name: "Acme Corp",       │
    │                                    │      contact_email: "joe@acme.com"    │
    │                                    │    },                                 │
    │                                    │    schema: {...},                     │
    │                                    │    missingFields: ["tax_id", ...],    │
    │                                    │    resumeToken_v1                     │
    │                                    │  }                                    │
    │                                    │────────────────────────────────────────>│
    │                                    │                                        │
    │                                    │  6. Agent fetches data from CRM       │
    │                                    │                                        │
    │                                    │  7. setFields(resumeToken_v1, {       │
    │                                    │       tax_id: "12-3456789",           │
    │                                    │       annual_revenue: 5000000,        │
    │                                    │       ... })                          │
    │                                    │<───────────────────────────────────────┤
    │                                    │                                        │
    │                                    │  { ok: true, resumeToken_v2,          │
    │                                    │    version: 2 }                       │
    │                                    │────────────────────────────────────────>│
    │                                    │                                        │
    │                                    │  8. submit(resumeToken_v2)            │
    │                                    │<───────────────────────────────────────┤
    │                                    │                                        │
    │                                    │  { ok: true, state: "submitted",      │
    │                                    │    submissionId }                     │
    │                                    │────────────────────────────────────────>│
    │                                    │                                        │
    │ 9. Email: "Your submission is     │                                        │
    │    complete. ID: sub_abc123"      │                                        │
    │<──────────────────────────────────┤                                        │
```

**Key Points:**

1. **URL as Handoff Mechanism:** Human shares resume URL via email/Slack
2. **Agent Parses URL:** Extracts token from path or query parameter
3. **Agent Fetches Context:** Calls `getSubmission(token)` to see human's work
4. **Agent Completes:** Programmatically fills remaining fields and submits
5. **Human Notified:** Receives confirmation email when agent finishes

#### 6.4.3 Agent A → Agent B Handoff

**Scenario:** Agent A starts submission but lacks access to certain APIs; hands off to Agent B with different credentials.

```
┌──────────┐                   ┌──────────────┐                   ┌──────────┐
│ Agent A  │                   │  FormBridge  │                   │ Agent B  │
│(CRM Bot) │                   │    Server    │                   │(Tax Bot) │
└──────────┘                   └──────────────┘                   └──────────┘
     │                                │                                 │
     │ 1. createSubmission(           │                                 │
     │      "vendor-onboarding")      │                                 │
     ├───────────────────────────────>│                                 │
     │                                │                                 │
     │ { resumeToken_v1, version: 1 } │                                 │
     │<───────────────────────────────┤                                 │
     │                                │                                 │
     │ 2. setFields(resumeToken_v1, { │                                 │
     │      vendor_name: "...",       │                                 │
     │      contact_info: "..." })    │                                 │
     ├───────────────────────────────>│                                 │
     │                                │                                 │
     │ { resumeToken_v2, version: 2 } │                                 │
     │<───────────────────────────────┤                                 │
     │                                │                                 │
     │ 3. validate(resumeToken_v2)    │                                 │
     ├───────────────────────────────>│                                 │
     │                                │                                 │
     │ { ok: false,                   │                                 │
     │   error: { fields: [{          │                                 │
     │     path: "tax_id",            │                                 │
     │     code: "required"           │                                 │
     │   }] },                        │                                 │
     │   resumeToken_v3, version: 3   │                                 │
     │ }                              │                                 │
     │<───────────────────────────────┤                                 │
     │                                │                                 │
     │ [Agent A lacks tax API access] │                                 │
     │                                │                                 │
     │ 4. Publish to message queue:   │                                 │
     │    { topic: "tax-enrichment",  │                                 │
     │      payload: {                │                                 │
     │        resumeToken: rtok_v3,   │                                 │
     │        vendor_name: "..."      │                                 │
     │      }                         │                                 │
     │    }                           │                                 │
     ├────────────────────────────────────────────────────────────────>│
     │                                │                                 │
     │                                │  5. Agent B receives message,   │
     │                                │     looks up tax ID             │
     │                                │                                 │
     │                                │  6. setFields(resumeToken_v3, { │
     │                                │       tax_id: "12-3456789" })   │
     │                                │<────────────────────────────────┤
     │                                │                                 │
     │                                │  { resumeToken_v4, version: 4 } │
     │                                │─────────────────────────────────>│
     │                                │                                 │
     │                                │  7. Publish completion event    │
     │                                │     to message queue            │
     │                                │                                 │
     │ 8. Agent A receives completion │                                 │
     │    event, continues workflow   │                                 │
     │<───────────────────────────────────────────────────────────────┤│
     │                                │                                 │
     │ 9. submit(resumeToken_v4)      │                                 │
     ├───────────────────────────────>│                                 │
```

**Key Points:**

1. **Asynchronous Handoff:** Agent A publishes to message queue; Agent B subscribes
2. **Decoupled Agents:** Agents don't know about each other; token is coordination primitive
3. **Stateless Context:** Agent B fetches submission state via token (optional step omitted for brevity)
4. **Event-Driven:** Completion event signals Agent A to continue

#### 6.4.4 Multi-Hop Handoff: Agent → Human → Reviewer → Agent

**Scenario:** Complex approval workflow with multiple actors.

```
Agent A           FormBridge          Human Filler       Human Reviewer      Agent B
  │                    │                     │                    │             │
  │ 1. Create          │                     │                    │             │
  │ submission         │                     │                    │             │
  ├───────────────────>│                     │                    │             │
  │ (resumeToken_v1)   │                     │                    │             │
  │<───────────────────┤                     │                    │             │
  │                    │                     │                    │             │
  │ 2. Fill 50% data   │                     │                    │             │
  ├───────────────────>│                     │                    │             │
  │ (resumeToken_v2)   │                     │                    │             │
  │<───────────────────┤                     │                    │             │
  │                    │                     │                    │             │
  │ 3. Send URL to     │                     │                    │             │
  │    human filler    │                     │                    │             │
  ├─────────────────────────────────────────>│                    │             │
  │                    │                     │                    │             │
  │                    │ 4. Human accesses   │                    │             │
  │                    │    via token        │                    │             │
  │                    │<────────────────────┤                    │             │
  │                    │                     │                    │             │
  │                    │ 5. Fill remaining   │                    │             │
  │                    │    fields           │                    │             │
  │                    │<────────────────────┤                    │             │
  │                    │ (resumeToken_v3)    │                    │             │
  │                    │─────────────────────>│                    │             │
  │                    │                     │                    │             │
  │                    │ 6. Click "Submit    │                    │             │
  │                    │    for Review"      │                    │             │
  │                    │<────────────────────┤                    │             │
  │                    │                     │                    │             │
  │                    │ state → "needs_review"                   │             │
  │                    │                     │                    │             │
  │                    │ 7. Email reviewer with approval URL      │             │
  │                    │    https://forms.example.com/approve/    │             │
  │                    │    {approvalToken}                       │             │
  │                    │──────────────────────────────────────────>│             │
  │                    │                     │                    │             │
  │                    │ 8. Reviewer validates data               │             │
  │                    │<─────────────────────────────────────────┤             │
  │                    │                     │                    │             │
  │                    │ 9. approve(approvalToken)                │             │
  │                    │<─────────────────────────────────────────┤             │
  │                    │                     │                    │             │
  │                    │ state → "approved"  │                    │             │
  │                    │                     │                    │             │
  │                    │ 10. Webhook: submission.approved         │             │
  │                    │──────────────────────────────────────────────────────>│
  │                    │                     │                    │             │
  │                    │ 11. Agent B processes approved submission│             │
  │                    │     (e.g., create vendor record in ERP)  │             │
```

**Key Points:**

1. **Multiple Token Types:** Resume tokens for editing, approval tokens for review
2. **State Transitions:** Submission progresses through states as actors complete tasks
3. **Webhook Notifications:** Agents subscribe to events to trigger next steps
4. **Clear Roles:** Each actor has specific capabilities tied to their token type

### 6.5 URL Generation for Human Access

#### 6.5.1 Resume URL Format

**Standard Format:**

```
https://{domain}/resume/{resumeToken}
```

**Examples:**

```
https://forms.example.com/resume/rtok_Kx8mP2nQ5vY7zAcF9hJtLwXbNqS3uD6gEiRoMaUpWjZ4fT1
https://intake.acme.com/resume/rtok_9aB3cD5eF7gH1iJ2kL4mN6oP8qR0sT9uV1wX3yZ5A7bC9dE1f
```

**Query Parameter Alternative (optional):**

```
https://forms.example.com/resume?token=rtok_...
```

**With Context Hints (optional):**

```
https://forms.example.com/resume/rtok_...?intake=vendor-onboarding&hint=insurance_fields
```

Query parameters do NOT affect token validation — they are purely for UX (e.g., pre-selecting a form template or highlighting specific fields).

#### 6.5.2 URL Generation API

**Server-Side Generation:**

```typescript
interface ResumeUrlOptions {
  resumeToken: string;
  baseUrl?: string;        // Default: inferred from request or config
  queryParams?: Record<string, string>;  // Optional context hints
}

function generateResumeUrl(options: ResumeUrlOptions): string {
  const baseUrl = options.baseUrl || config.get('PUBLIC_BASE_URL');
  const url = new URL(`/resume/${options.resumeToken}`, baseUrl);

  if (options.queryParams) {
    Object.entries(options.queryParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  return url.toString();
}

// Usage in API response
const response = {
  ok: true,
  submissionId: 'sub_abc123',
  resumeToken: 'rtok_...',
  resumeUrl: generateResumeUrl({
    resumeToken: resumeToken,
    queryParams: {
      intake: 'vendor-onboarding',
      source: 'agent_handoff'
    }
  })
};
```

**Client-Side Generation (Agent):**

Agents can construct URLs themselves if they know the base URL:

```python
def generate_resume_url(base_url: str, resume_token: str, **kwargs) -> str:
    """Generate a resume URL for human access."""
    url = f"{base_url}/resume/{resume_token}"

    if kwargs:
        query = "&".join(f"{k}={v}" for k, v in kwargs.items())
        url = f"{url}?{query}"

    return url

# Example
resume_url = generate_resume_url(
    base_url="https://forms.example.com",
    resume_token=resume_token,
    intake="vendor-onboarding",
    hint="Please fill the insurance fields"
)

# Send to human
send_email(
    to="vendor@acme.com",
    subject="Complete Your Vendor Onboarding",
    body=f"Please complete the form: {resume_url}"
)
```

#### 6.5.3 QR Code Generation

For mobile or in-person handoff:

```typescript
import QRCode from 'qrcode';

async function generateResumeQRCode(resumeToken: string): Promise<string> {
  const url = generateResumeUrl({ resumeToken });

  // Generate QR code as data URL
  const qrDataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    width: 300,
    margin: 2
  });

  return qrDataUrl;
}

// Usage: Display QR code in agent UI or send via email
const qrCode = await generateResumeQRCode(resumeToken);
// <img src="{qrCode}" alt="Scan to continue submission" />
```

#### 6.5.4 Deep Link for Mobile Apps

If FormBridge has a mobile app:

```
formbridge://resume/{resumeToken}
```

With universal link fallback:

```
https://forms.example.com/resume/{resumeToken}
```

Mobile app handles both schemes; web browser opens standard form.

### 6.6 Security Best Practices for Cross-Actor Handoff

#### 6.6.1 Token Transmission

**✅ DO:**

- Transmit tokens over HTTPS only
- Include tokens in URL paths (not HTTP headers when sharing with humans)
- Use `rtok_` prefix for secret scanning in logs
- Generate short-lived tokens for high-security scenarios

**❌ DON'T:**

- Send tokens via unencrypted email (use HTTPS links instead)
- Log full tokens in server logs (hash or truncate)
- Include tokens in analytics or tracking pixels
- Reuse tokens across different submissions

#### 6.6.2 Human Communication

**Email Template (Secure):**

```
Subject: Action Required: Complete Vendor Onboarding Form

Hello,

An AI agent has partially completed your vendor onboarding form. Please click the link below to review and finish:

https://forms.example.com/resume/rtok_...

This link is unique to your submission and expires in 7 days. Do not share it with others.

---
The FormBridge Team
```

**Slack Message (Secure):**

```
🤖 Agent has prepared a vendor onboarding form for you.

Missing fields: Insurance carrier, Coverage amount

👉 Continue here: https://forms.example.com/resume/rtok_...

⏳ Expires in 7 days
```

#### 6.6.3 Audit Trail for Cross-Actor Access

Every token access emits a structured event:

```typescript
interface TokenAccessEvent {
  eventType: 'token.accessed';
  timestamp: string;  // ISO 8601
  resumeToken: string;  // Hashed for privacy
  submissionId: string;
  actor: {
    type: 'agent' | 'human' | 'system';
    id?: string;  // Agent ID, user ID, or service name
    ipAddress?: string;
    userAgent?: string;
  };
  operation: 'getSubmission' | 'setFields' | 'submit' | 'validate';
  outcome: 'success' | 'failure';
  reason?: string;  // For failures: "token_expired", "version_conflict", etc.
}
```

**Example Event:**

```json
{
  "eventType": "token.accessed",
  "timestamp": "2024-01-15T14:23:45Z",
  "resumeToken": "sha256:a3f5b8...",  // Hashed
  "submissionId": "sub_abc123",
  "actor": {
    "type": "human",
    "ipAddress": "203.0.113.42",
    "userAgent": "Mozilla/5.0..."
  },
  "operation": "setFields",
  "outcome": "success"
}
```

**Monitoring Alerts:**

- **Multiple IPs accessing same token:** Potential token sharing or theft
- **High-frequency token access:** Potential enumeration attack or bot
- **Token access after expiration:** Misconfigured client or attack attempt
- **Geographic anomaly:** Token accessed from unexpected country

### 6.7 Comparison with Traditional Authentication

| Aspect | Resume Tokens | Traditional Auth (OAuth/JWT) |
|--------|--------------|------------------------------|
| **Authentication** | Possession = authorization | Requires login + credential validation |
| **Cross-Actor Handoff** | Seamless (share URL) | Complex (provision accounts, share credentials) |
| **Time-Delayed Collaboration** | Excellent (7-day TTL) | Challenging (session expiration, refresh tokens) |
| **MCP Compatibility** | Native (stateless) | Poor (requires callback flows, session storage) |
| **Security Posture** | Good (entropy + HTTPS + TTL) | Excellent (user accounts, MFA, fine-grained permissions) |
| **Revocation** | Submission-level (cancel) | User-level (block account, revoke tokens) |
| **Audit Trail** | Token-level (all access logged) | User-level (login events, API calls) |
| **Setup Complexity** | None (instant access) | High (user provisioning, OAuth flow, key management) |
| **Use Case Fit** | Short-lived collaborative workflows | Long-lived user sessions with persistent identity |

**When to Use Resume Tokens:**

- ✅ Agent-human collaboration workflows
- ✅ Time-bounded data collection (days to weeks)
- ✅ Frictionless handoff is critical
- ✅ No persistent user identity required
- ✅ MCP/stateless contexts

**When to Use Traditional Auth:**

- ✅ Long-lived user accounts (months to years)
- ✅ Fine-grained permissions per user
- ✅ Regulatory compliance requiring MFA
- ✅ Revocation must be instant and selective
- ✅ User identity is central to workflow

**Hybrid Approach:**

For maximum flexibility, support BOTH:

```
Authenticated User → Long-lived session + fine-grained permissions
Resume Token → Short-lived capability for specific submission
```

Example: Authenticated admin can view all submissions; resume token holder can only access one submission.

---

## 7. HTTP API Bindings

### 7.1 Overview

Resume tokens are exposed via two primary HTTP endpoints that enable stateless, capability-based access to submission state. These endpoints implement the pause-gather-resume pattern at the HTTP layer, allowing any actor with a valid resume token to retrieve current state (GET) or apply updates (PATCH) without authentication.

**→ See also:** [INTAKE_CONTRACT_SPEC.md §12.1](./INTAKE_CONTRACT_SPEC.md#121-httpjson-binding) for the complete HTTP/JSON binding specification including all endpoint definitions and status codes.

**Design Principles:**

1. **Token in Path:** Resume token is part of the URL path (`/submissions/:resumeToken`) for simplicity and compatibility with standard HTTP clients.
2. **Optimistic Concurrency via Headers:** Version information in `ETag` and `If-Match` headers for idiomatic HTTP conditional requests.
3. **Standard HTTP Semantics:** GET is read-only, PATCH is partial update, standard status codes (200, 304, 409, 410).
4. **CORS-Friendly:** Support for cross-origin requests to enable browser-based human collaboration.

**Key URLs:**

```
GET    /submissions/:resumeToken          # Retrieve current state
PATCH  /submissions/:resumeToken          # Update fields
```

### 7.2 GET /submissions/:resumeToken

Retrieves the current state of a submission using its resume token.

**Request:**

```http
GET /submissions/rtok_K8n4xZmP9qL2vFwT7jR3sYbN6hC1dE5a HTTP/1.1
Host: formbridge.example.com
Accept: application/json
```

**Success Response (200 OK):**

```http
HTTP/1.1 200 OK
Content-Type: application/json
ETag: "v2-rtok_K8n4xZmP9qL2vFwT7jR3sYbN6hC1dE5a"
Cache-Control: no-store

{
  "ok": true,
  "submissionId": "sub_abc123",
  "state": "in_progress",
  "resumeToken": "rtok_K8n4xZmP9qL2vFwT7jR3sYbN6hC1dE5a",
  "version": 2,
  "schema": {
    "type": "object",
    "properties": {
      "companyName": { "type": "string" },
      "taxId": { "type": "string" }
    },
    "required": ["companyName", "taxId"]
  },
  "fields": {
    "companyName": "Acme Corp"
  },
  "missingFields": ["taxId"],
  "expiresAt": "2024-01-22T14:23:45Z",
  "createdAt": "2024-01-15T14:23:45Z",
  "updatedAt": "2024-01-16T10:15:30Z"
}
```

**Conditional GET (304 Not Modified):**

Client can use `If-None-Match` to avoid redundant data transfer:

```http
GET /submissions/rtok_K8n4xZmP9qL2vFwT7jR3sYbN6hC1dE5a HTTP/1.1
Host: formbridge.example.com
If-None-Match: "v2-rtok_K8n4xZmP9qL2vFwT7jR3sYbN6hC1dE5a"
```

```http
HTTP/1.1 304 Not Modified
ETag: "v2-rtok_K8n4xZmP9qL2vFwT7jR3sYbN6hC1dE5a"
```

**Error Response (410 Gone - Token Expired):**

```http
HTTP/1.1 410 Gone
Content-Type: application/json

{
  "ok": false,
  "error": {
    "type": "expired",
    "message": "Resume token has expired",
    "submissionId": "sub_abc123",
    "expiredAt": "2024-01-22T14:23:45Z"
  }
}
```

**Error Response (404 Not Found - Invalid Token):**

```http
HTTP/1.1 404 Not Found
Content-Type: application/json

{
  "ok": false,
  "error": {
    "type": "invalid_token",
    "message": "Resume token not found or invalid"
  }
}
```

### 7.3 PATCH /submissions/:resumeToken

Updates fields on a submission with optimistic concurrency control.

**Request:**

```http
PATCH /submissions/rtok_K8n4xZmP9qL2vFwT7jR3sYbN6hC1dE5a HTTP/1.1
Host: formbridge.example.com
Content-Type: application/json
If-Match: "v2-rtok_K8n4xZmP9qL2vFwT7jR3sYbN6hC1dE5a"

{
  "fields": {
    "taxId": "12-3456789"
  },
  "actor": {
    "type": "human",
    "name": "Jane Doe",
    "email": "jane@example.com"
  }
}
```

**Success Response (200 OK):**

```http
HTTP/1.1 200 OK
Content-Type: application/json
ETag: "v3-rtok_N9m5aYnQ0rM3wGxU8kS4tZcO7iD2eF6b"

{
  "ok": true,
  "submissionId": "sub_abc123",
  "state": "in_progress",
  "resumeToken": "rtok_N9m5aYnQ0rM3wGxU8kS4tZcO7iD2eF6b",
  "version": 3,
  "fields": {
    "companyName": "Acme Corp",
    "taxId": "12-3456789"
  },
  "missingFields": [],
  "updatedAt": "2024-01-16T11:00:00Z"
}
```

**Conflict Response (409 Conflict - Stale Version):**

```http
HTTP/1.1 409 Conflict
Content-Type: application/json
ETag: "v4-rtok_P0n6bZoR1sN4xHyV9lT5uAdP8jE3fG7c"

{
  "ok": false,
  "error": {
    "type": "conflict",
    "message": "Resume token version mismatch - submission was updated by another actor",
    "current": {
      "version": 4,
      "resumeToken": "rtok_P0n6bZoR1sN4xHyV9lT5uAdP8jE3fG7c",
      "updatedAt": "2024-01-16T10:55:00Z",
      "updatedBy": {
        "type": "agent",
        "name": "Claude"
      }
    },
    "yourVersion": 2,
    "retryable": true,
    "nextActions": [
      {
        "action": "fetch_current_state",
        "hint": "Use GET /submissions/:resumeToken with current token to fetch latest state, then retry with new version"
      }
    ]
  }
}
```

**Validation Error Response (400 Bad Request):**

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json
ETag: "v2-rtok_K8n4xZmP9qL2vFwT7jR3sYbN6hC1dE5a"

{
  "ok": false,
  "submissionId": "sub_abc123",
  "state": "awaiting_input",
  "resumeToken": "rtok_K8n4xZmP9qL2vFwT7jR3sYbN6hC1dE5a",
  "error": {
    "type": "invalid",
    "message": "Validation failed for 1 field",
    "fields": [
      {
        "path": "taxId",
        "code": "invalid_format",
        "message": "Tax ID must be in format XX-XXXXXXX",
        "expected": "^\\d{2}-\\d{7}$",
        "received": "12-3456789"
      }
    ],
    "retryable": true,
    "nextActions": [
      {
        "action": "collect_field",
        "field": "taxId",
        "hint": "Provide tax ID in correct format (XX-XXXXXXX)"
      }
    ]
  }
}
```

### 7.4 HTTP Headers and Versioning

**ETag Format:**

```
ETag: "v{version}-{resumeToken}"
```

Example: `"v2-rtok_K8n4xZmP9qL2vFwT7jR3sYbN6hC1dE5a"`

**Conditional Request Headers:**

| Header | Usage | Semantics |
|--------|-------|-----------|
| `If-Match` | PATCH requests | Proceed only if current ETag matches (optimistic lock) |
| `If-None-Match` | GET requests | Return 304 if ETag matches (cache validation) |

**Version Mismatch Behavior:**

```
Client sends:  If-Match: "v2-rtok_abc123"
Server has:    ETag: "v4-rtok_xyz789"
Response:      409 Conflict with current state
```

**Cache Control:**

```http
Cache-Control: no-store
```

Resume tokens are ephemeral and version-sensitive. Responses must not be cached by intermediaries.

### 7.5 Error Responses

**Standard Error Envelope:**

All error responses follow this structure:

```typescript
{
  ok: false,
  submissionId?: string,       // Omitted for 404
  state?: SubmissionState,     // Current state if known
  resumeToken?: string,        // Current token if known
  error: {
    type: string,
    message: string,
    fields?: FieldError[],
    current?: {                // For 409 conflicts
      version: number,
      resumeToken: string,
      updatedAt: string,
      updatedBy: Actor
    },
    yourVersion?: number,      // For 409 conflicts
    retryable: boolean,
    nextActions?: NextAction[]
  }
}
```

**HTTP Status Code Mapping:**

| Status | Error Type | Retryable | Cause |
|--------|-----------|-----------|-------|
| 400 | `invalid` | Yes | Field validation failed |
| 404 | `invalid_token` | No | Token does not exist |
| 409 | `conflict` | Yes | Version mismatch (stale token) |
| 410 | `expired` | No | Token expired (TTL or terminal state) |
| 422 | `missing` | Yes | Required fields not provided |
| 500 | `internal_error` | Yes | Server error |
| 503 | `service_unavailable` | Yes | Temporary unavailability |

### 7.6 CORS and Preflight

**CORS Headers:**

```http
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, PATCH, OPTIONS
Access-Control-Allow-Headers: Content-Type, If-Match, If-None-Match
Access-Control-Expose-Headers: ETag, Content-Type
Access-Control-Max-Age: 86400
```

**Preflight Request:**

```http
OPTIONS /submissions/rtok_K8n4xZmP9qL2vFwT7jR3sYbN6hC1dE5a HTTP/1.1
Host: formbridge.example.com
Origin: https://app.example.com
Access-Control-Request-Method: PATCH
Access-Control-Request-Headers: Content-Type, If-Match
```

**Preflight Response:**

```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: GET, PATCH, OPTIONS
Access-Control-Allow-Headers: Content-Type, If-Match, If-None-Match
Access-Control-Max-Age: 86400
```

**Security Note:** Wildcard CORS (`*`) is acceptable because resume tokens are bearer credentials. Any origin with a valid token has legitimate access.

---

## 8. MCP Integration

### 8.1 Overview

Resume tokens integrate seamlessly with the Model Context Protocol (MCP), enabling AI agents to implement pause-gather-resume workflows without encountering the fatal timeout flaw in MCP's `elicitation/create` operation.

**→ See also:** [INTAKE_CONTRACT_SPEC.md §12.2](./INTAKE_CONTRACT_SPEC.md#122-mcp-tool-binding) for the complete MCP tool binding specification including tool definitions and output schemas.

MCP tools (`createSubmission`, `setFields`, `validate`, `submit`) accept resume tokens as optional parameters and return updated tokens in responses, allowing agents to:

1. Create a submission and receive a resume token
2. Pause to gather additional data (no timeout pressure)
3. Resume with the token and continue updating fields
4. Repeat indefinitely until submission is complete

This design makes FormBridge MCP tools **stateless and timeout-proof** — a critical advantage over native MCP elicitation.

### 8.2 MCP Tool Parameter Bindings

**Core Principle:** Resume tokens are **optional** in all operations except when required for conflict resolution.

#### 8.2.1 `createSubmission`

**Parameters:**

```typescript
{
  intakeId: string;
  idempotencyKey?: string;
  actor?: Actor;
  initialFields?: Record<string, unknown>;
  ttlMs?: number;
  // No resumeToken parameter - this operation creates one
}
```

**Returns:**

```typescript
{
  ok: true;
  submissionId: string;
  state: "draft" | "in_progress";
  resumeToken: string;              // ← New token issued
  version: 1;
  schema: JSONSchema;
  missingFields?: string[];
}
```

**MCP Tool Declaration:**

```json
{
  "name": "formbridge_create_submission",
  "description": "Create a new submission for an intake definition. Returns a resumeToken that can be used to continue the submission later without timeout.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "intakeId": { "type": "string" },
      "initialFields": { "type": "object" },
      "actor": { "type": "object" }
    },
    "required": ["intakeId"]
  }
}
```

#### 8.2.2 `setFields`

**Parameters:**

```typescript
{
  submissionId?: string;             // Either submissionId OR resumeToken required
  resumeToken?: string;              // Preferred: use token for stateless access
  version?: number;                  // Optional: version for optimistic concurrency
  fields: Record<string, unknown>;
  actor?: Actor;
}
```

**Returns:**

```typescript
{
  ok: true;
  submissionId: string;
  state: SubmissionState;
  resumeToken: string;               // ← Updated token (rotated)
  version: number;                   // ← Incremented version
  fields: Record<string, unknown>;
  missingFields?: string[];
  updatedAt: string;
}
```

**MCP Tool Declaration:**

```json
{
  "name": "formbridge_set_fields",
  "description": "Update fields on a submission. Use resumeToken from previous operation to continue without timeout. Returns updated resumeToken for next operation.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "resumeToken": { "type": "string", "description": "Resume token from createSubmission or previous setFields" },
      "version": { "type": "number", "description": "Optional: current version for conflict detection" },
      "fields": { "type": "object" },
      "actor": { "type": "object" }
    },
    "required": ["resumeToken", "fields"]
  }
}
```

#### 8.2.3 `validate`

**Parameters:**

```typescript
{
  submissionId?: string;
  resumeToken?: string;              // Preferred
}
```

**Returns:**

```typescript
{
  ok: true;
  submissionId: string;
  state: SubmissionState;
  resumeToken: string;               // ← Same token (no rotation for read-only)
  version: number;
  valid: boolean;
  missingFields?: string[];
  invalidFields?: FieldError[];
}
```

**MCP Tool Declaration:**

```json
{
  "name": "formbridge_validate_submission",
  "description": "Validate a submission without submitting. Use resumeToken to check validation status. Read-only operation.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "resumeToken": { "type": "string" }
    },
    "required": ["resumeToken"]
  }
}
```

#### 8.2.4 `submit`

**Parameters:**

```typescript
{
  submissionId?: string;
  resumeToken?: string;              // Preferred
  version?: number;                  // Optional: final version check
  actor?: Actor;
}
```

**Returns:**

```typescript
{
  ok: true;
  submissionId: string;
  state: "submitted" | "needs_review" | "finalized";
  resumeToken: string;               // ← Final token (expired if finalized)
  version: number;
  submittedAt: string;
}
```

**MCP Tool Declaration:**

```json
{
  "name": "formbridge_submit",
  "description": "Submit a completed submission. Use resumeToken to finalize. This is the terminal operation.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "resumeToken": { "type": "string" },
      "version": { "type": "number", "description": "Optional: final version check before submit" },
      "actor": { "type": "object" }
    },
    "required": ["resumeToken"]
  }
}
```

### 8.3 Resume Token in MCP Responses

**Every MCP response includes:**

1. **`resumeToken`**: Current token to use for next operation
2. **`version`**: Current version for optimistic concurrency
3. **`state`**: Current submission state

**Token Rotation on Mutations:**

- **Read operations** (`validate`, `getSubmission`): Return same token
- **Write operations** (`setFields`, `submit`): Return new token (rotated)

**Example Agent Flow:**

```typescript
// Step 1: Create submission
const r1 = await mcp.call("formbridge_create_submission", {
  intakeId: "vendor_onboarding",
  initialFields: { companyName: "Acme Corp" }
});
// r1.resumeToken = "rtok_abc123", version = 1

// Step 2: Agent pauses to fetch tax ID from external API (10 seconds)
await sleep(10000);
const taxId = await fetchTaxIdFromAPI();

// Step 3: Resume with token (no timeout!)
const r2 = await mcp.call("formbridge_set_fields", {
  resumeToken: r1.resumeToken,
  version: r1.version,
  fields: { taxId }
});
// r2.resumeToken = "rtok_xyz789", version = 2

// Step 4: Validate
const r3 = await mcp.call("formbridge_validate_submission", {
  resumeToken: r2.resumeToken
});
// r3.resumeToken = "rtok_xyz789" (same, read-only), version = 2

// Step 5: Submit
const r4 = await mcp.call("formbridge_submit", {
  resumeToken: r3.resumeToken,
  version: r3.version
});
// r4.state = "submitted"
```

### 8.4 Integration with INTAKE_CONTRACT_SPEC Operations

Resume tokens augment all operations defined in [INTAKE_CONTRACT_SPEC.md §4](./INTAKE_CONTRACT_SPEC.md#4-operations) (Operations):

| INTAKE_CONTRACT Operation | Resume Token Support | Token Behavior |
|---------------------------|---------------------|----------------|
| `createSubmission` (§4.1) | Returns new token | Always creates token |
| `setFields` (§4.2) | Accepts + returns token | Rotates token on success |
| `validate` (§4.3) | Accepts + returns token | Returns same token (read-only) |
| `submit` (§4.4) | Accepts + returns token | Returns final token (may expire) |
| `uploadFile` (§4.5) | Accepts + returns token | Rotates token after upload completes |
| `getSubmission` (§4.6) | Accepts + returns token | Returns same token (read-only) |
| `cancel` (§4.7) | Accepts token | Expires token immediately |

**Token-First vs. ID-First Access:**

```typescript
// Option 1: Token-first (stateless, no auth required)
await setFields({
  resumeToken: "rtok_abc123",
  fields: { taxId: "12-3456789" }
});

// Option 2: ID-first (requires authentication)
await setFields({
  submissionId: "sub_abc123",
  fields: { taxId: "12-3456789" }
}, { auth: userToken });
```

**Recommendation:** MCP tools should **always use token-first access** to avoid authentication complexity.

### 8.5 MCP-Specific Error Handling

**Conflict Error (Version Mismatch):**

```json
{
  "ok": false,
  "error": {
    "type": "conflict",
    "message": "Resume token version mismatch",
    "current": {
      "version": 4,
      "resumeToken": "rtok_new789"
    },
    "yourVersion": 2,
    "retryable": true,
    "nextActions": [
      {
        "action": "fetch_current_state",
        "hint": "Call formbridge_validate_submission with resumeToken 'rtok_new789' to get current state, then retry"
      }
    ]
  }
}
```

**Expired Token Error:**

```json
{
  "ok": false,
  "error": {
    "type": "expired",
    "message": "Resume token has expired",
    "submissionId": "sub_abc123",
    "retryable": false,
    "nextActions": [
      {
        "action": "create_new_submission",
        "hint": "Token expired. Create new submission with formbridge_create_submission"
      }
    ]
  }
}
```

**Agent Recovery Pattern:**

```typescript
try {
  const result = await mcp.call("formbridge_set_fields", {
    resumeToken: currentToken,
    version: currentVersion,
    fields: updates
  });
  currentToken = result.resumeToken;
  currentVersion = result.version;
} catch (error) {
  if (error.type === "conflict") {
    // Fetch current state and retry
    const current = await mcp.call("formbridge_validate_submission", {
      resumeToken: error.current.resumeToken
    });
    currentToken = current.resumeToken;
    currentVersion = current.version;
    // Retry with updated state
  } else if (error.type === "expired") {
    // Start over
    const newSubmission = await mcp.call("formbridge_create_submission", {
      intakeId: originalIntakeId,
      initialFields: latestFields
    });
    currentToken = newSubmission.resumeToken;
  }
}
```

---

## 9. Event Stream

### 9.1 Overview

Every resume token operation emits structured events to an audit stream, providing full provenance for compliance, debugging, and monitoring. Events capture **who** performed **what action** on **which submission** at **what time**, with **what outcome**.

The event stream is append-only, immutable, and serves as the source of truth for submission history. Events enable:

1. **Audit Compliance:** Full trail of all actors and operations
2. **Debugging:** Reconstruct exact sequence of state changes
3. **Monitoring:** Detect anomalies (token sharing, enumeration attacks)
4. **Analytics:** Measure completion rates, time-to-submit, handoff patterns

### 9.2 Event Types

Resume token lifecycle emits five core event types:

| Event Type | Emitted When | Payload Includes |
|-----------|-------------|-----------------|
| `token.created` | New resume token generated | `submissionId`, `resumeToken` (hashed), `version`, `expiresAt`, `actor` |
| `token.accessed` | Token used to read state (GET) | `operation: "getSubmission"`, `actor`, `outcome: "success"` |
| `token.updated` | Token used to mutate state (PATCH) | `operation: "setFields"`, `fieldsChanged`, `newVersion`, `newResumeToken` (hashed), `actor` |
| `token.conflict` | Version mismatch detected (409) | `attemptedVersion`, `currentVersion`, `actor`, `rejectedFields` |
| `token.expired` | Token reaches TTL or terminal state | `reason: "ttl" | "terminal_state"`, `finalState`, `expiredAt` |

**Additional Integration Events:**

| Event Type | Emitted When | Payload Includes |
|-----------|-------------|-----------------|
| `token.submitted` | Submission finalized via token | `operation: "submit"`, `finalState`, `actor` |
| `token.cancelled` | Submission cancelled via token | `operation: "cancel"`, `reason`, `actor` |
| `token.handed_off` | Token accessed by different actor type | `previousActor`, `currentActor`, `handoffDetected: true` |

### 9.3 Event Payload Specification

**Base Event Structure:**

```typescript
interface ResumeTokenEvent {
  eventId: string;                   // Unique event ID (uuid)
  eventType: string;                 // Event type (see §9.2)
  timestamp: string;                 // ISO 8601 UTC
  submissionId: string;              // Submission this event relates to
  resumeTokenHash: string;           // SHA-256 hash of token (for privacy)
  version?: number;                  // Submission version (if applicable)
  actor: Actor;                      // Who performed this action
  operation?: string;                // Operation attempted
  outcome: "success" | "failure";    // Did the operation succeed?
  metadata?: Record<string, unknown>; // Event-specific details
}

interface Actor {
  type: "agent" | "human" | "system";
  id?: string;                       // Agent ID, user ID, or system component
  name?: string;                     // Display name
  ipAddress?: string;                // Source IP (for security monitoring)
  userAgent?: string;                // User agent (for human actors)
}
```

### 9.4 Event Emission Triggers

**9.4.1 token.created**

**Trigger:** New resume token generated (submission creation or token rotation)

**Payload:**

```json
{
  "eventId": "evt_01HQZXY9JK2M3N4P5Q6R7S8T9U",
  "eventType": "token.created",
  "timestamp": "2024-01-15T14:23:45.123Z",
  "submissionId": "sub_abc123",
  "resumeTokenHash": "sha256:a3f5b8c2d1e9f0a7b4c6d8e2f1a3b5c7d9e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8",
  "version": 1,
  "actor": {
    "type": "agent",
    "id": "claude-opus-4",
    "name": "Claude"
  },
  "operation": "createSubmission",
  "outcome": "success",
  "metadata": {
    "intakeId": "vendor_onboarding",
    "expiresAt": "2024-01-22T14:23:45.123Z",
    "ttlMs": 604800000
  }
}
```

**9.4.2 token.accessed**

**Trigger:** Resume token used for read operation (GET, validate)

**Payload:**

```json
{
  "eventId": "evt_01HQZXY9JK2M3N4P5Q6R7S8T9V",
  "eventType": "token.accessed",
  "timestamp": "2024-01-16T10:15:30.456Z",
  "submissionId": "sub_abc123",
  "resumeTokenHash": "sha256:a3f5b8c2d1e9f0a7b4c6d8e2f1a3b5c7d9e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8",
  "version": 1,
  "actor": {
    "type": "human",
    "ipAddress": "203.0.113.42",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
  },
  "operation": "getSubmission",
  "outcome": "success",
  "metadata": {
    "responseTimeMs": 45
  }
}
```

**9.4.3 token.updated**

**Trigger:** Resume token used for write operation (setFields, submit)

**Payload:**

```json
{
  "eventId": "evt_01HQZXY9JK2M3N4P5Q6R7S8T9W",
  "eventType": "token.updated",
  "timestamp": "2024-01-16T11:00:00.789Z",
  "submissionId": "sub_abc123",
  "resumeTokenHash": "sha256:a3f5b8c2d1e9f0a7b4c6d8e2f1a3b5c7d9e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8",
  "version": 2,
  "actor": {
    "type": "human",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "ipAddress": "203.0.113.42"
  },
  "operation": "setFields",
  "outcome": "success",
  "metadata": {
    "fieldsChanged": ["taxId"],
    "newVersion": 3,
    "newResumeTokenHash": "sha256:b4g6c9d3f2e0a8c5b7d9e1f3a4b6c8d0e2f4a6b8c0d2e4f6a8c0d2e4f6a8b0",
    "stateTransition": "in_progress -> in_progress"
  }
}
```

**9.4.4 token.conflict**

**Trigger:** Version mismatch detected (409 Conflict response)

**Payload:**

```json
{
  "eventId": "evt_01HQZXY9JK2M3N4P5Q6R7S8T9X",
  "eventType": "token.conflict",
  "timestamp": "2024-01-16T11:05:00.123Z",
  "submissionId": "sub_abc123",
  "resumeTokenHash": "sha256:a3f5b8c2d1e9f0a7b4c6d8e2f1a3b5c7d9e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8",
  "version": 2,
  "actor": {
    "type": "agent",
    "id": "claude-opus-4",
    "name": "Claude"
  },
  "operation": "setFields",
  "outcome": "failure",
  "metadata": {
    "reason": "version_mismatch",
    "attemptedVersion": 2,
    "currentVersion": 4,
    "currentResumeTokenHash": "sha256:c5h7d0e4g3f1b9d6c8e0f2a4b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1",
    "rejectedFields": ["taxId"]
  }
}
```

**9.4.5 token.expired**

**Trigger:** Token expires due to TTL or terminal state

**Payload:**

```json
{
  "eventId": "evt_01HQZXY9JK2M3N4P5Q6R7S8T9Y",
  "eventType": "token.expired",
  "timestamp": "2024-01-22T14:23:45.123Z",
  "submissionId": "sub_abc123",
  "resumeTokenHash": "sha256:a3f5b8c2d1e9f0a7b4c6d8e2f1a3b5c7d9e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8",
  "version": 5,
  "actor": {
    "type": "system",
    "id": "ttl-reaper"
  },
  "operation": "expire",
  "outcome": "success",
  "metadata": {
    "reason": "ttl",
    "finalState": "in_progress",
    "expiresAt": "2024-01-22T14:23:45.123Z"
  }
}
```

**9.4.6 token.handed_off**

**Trigger:** Token accessed by different actor type than previous access

**Payload:**

```json
{
  "eventId": "evt_01HQZXY9JK2M3N4P5Q6R7S8T9Z",
  "eventType": "token.handed_off",
  "timestamp": "2024-01-16T12:00:00.000Z",
  "submissionId": "sub_abc123",
  "resumeTokenHash": "sha256:b4g6c9d3f2e0a8c5b7d9e1f3a4b6c8d0e2f4a6b8c0d2e4f6a8c0d2e4f6a8b0",
  "version": 3,
  "actor": {
    "type": "human",
    "name": "Jane Doe",
    "ipAddress": "203.0.113.42"
  },
  "operation": "getSubmission",
  "outcome": "success",
  "metadata": {
    "handoffDetected": true,
    "previousActor": {
      "type": "agent",
      "id": "claude-opus-4"
    },
    "currentActor": {
      "type": "human",
      "name": "Jane Doe"
    }
  }
}
```

### 9.5 Event Storage and Replay

**Storage Requirements:**

1. **Append-Only:** Events are immutable once written
2. **Indexed by:** `submissionId`, `timestamp`, `eventType`, `actor.type`
3. **Retention:** Minimum 90 days (configurable per compliance requirements)
4. **Queryable:** Support filtering by submission, date range, event type, actor

**Storage Backends:**

| Backend | Use Case | Trade-offs |
|---------|----------|-----------|
| PostgreSQL JSONB | Small-medium scale, relational data | Simple, transactional, limited throughput |
| Elasticsearch | High-volume, complex queries | Fast search, operational overhead |
| AWS DynamoDB | Serverless, high scale | Infinite scale, pay-per-use, eventual consistency |
| Event Store (e.g., EventStoreDB) | Event sourcing architecture | Purpose-built, complex setup |

**Event Replay:**

Reconstruct submission history by replaying events in chronological order:

```sql
SELECT * FROM resume_token_events
WHERE submissionId = 'sub_abc123'
ORDER BY timestamp ASC;
```

**Event Aggregation:**

Generate analytics by aggregating events:

```sql
-- Average time from creation to submission
SELECT AVG(submit_time - create_time) AS avg_completion_time
FROM (
  SELECT
    submissionId,
    MIN(timestamp) FILTER (WHERE eventType = 'token.created') AS create_time,
    MIN(timestamp) FILTER (WHERE eventType = 'token.submitted') AS submit_time
  FROM resume_token_events
  GROUP BY submissionId
) AS completion_times;
```

### 9.6 Monitoring and Alerting

**Key Metrics:**

| Metric | Query | Alert Threshold |
|--------|-------|----------------|
| Token creation rate | `COUNT(*) WHERE eventType = 'token.created' GROUP BY hour` | > 1000/hour (DDoS?) |
| Conflict rate | `COUNT(*) WHERE eventType = 'token.conflict' / COUNT(*) WHERE eventType = 'token.updated'` | > 5% (poor UX) |
| Expiration rate | `COUNT(*) WHERE eventType = 'token.expired' AND reason = 'ttl'` | > 50% (TTL too short?) |
| Handoff rate | `COUNT(*) WHERE eventType = 'token.handed_off'` | Track for analytics |
| Average operations per submission | `COUNT(*) WHERE eventType IN ('token.updated', 'token.accessed') GROUP BY submissionId` | Track for UX insights |

**Security Alerts:**

| Alert | Trigger | Action |
|-------|---------|--------|
| **Token enumeration** | Same IP accesses > 100 different tokens in 1 minute | Rate-limit IP, investigate |
| **Geographic anomaly** | Token accessed from country different from creation | Flag for review |
| **Replay attack** | Expired token accessed multiple times | Block IP, log incident |
| **High conflict rate** | Single submission has > 10 conflicts | Investigate concurrent access pattern |

**Example Monitoring Dashboard:**

```
┌─────────────────────────────────────────────────────────────┐
│ Resume Token Health (Last 24h)                              │
├─────────────────────────────────────────────────────────────┤
│ Tokens Created:        1,234                                │
│ Tokens Expired (TTL):    45  (3.6%)                         │
│ Tokens Submitted:       890  (72.1%)                        │
│ Active Tokens:          299                                 │
│                                                             │
│ Conflicts:               12  (0.97% of updates)             │
│ Handoffs Detected:      156  (12.6% of submissions)         │
│                                                             │
│ Avg Ops/Submission:     4.2                                 │
│ Avg Time to Submit:     2h 15m                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Edge Cases

This section documents edge cases that require special handling in the resume tokens system.

### 10.1 Expired Token Access

**Scenario:** Client attempts to use a token that has expired due to TTL or terminal state.

**Behavior:**

1. **TTL Expiration:**
   - Token has exceeded configured TTL (default: 7 days)
   - Return `410 Gone` with original submission ID
   - Client can use submission ID to request new token (if authenticated)

**Example Response:**

```http
HTTP/1.1 410 Gone
Content-Type: application/json

{
  "error": "token_expired",
  "message": "Resume token has expired due to TTL",
  "submissionId": "sub_abc123",
  "expiredAt": "2024-01-22T14:23:45.123Z",
  "reason": "ttl"
}
```

2. **Terminal State Expiration:**
   - Submission reached `submitted` or `rejected` state
   - Token invalidated immediately
   - Return `410 Gone` with terminal state information

**Example Response:**

```http
HTTP/1.1 410 Gone
Content-Type: application/json

{
  "error": "token_expired",
  "message": "Resume token expired because submission reached terminal state",
  "submissionId": "sub_abc123",
  "finalState": "submitted",
  "submittedAt": "2024-01-20T09:30:00.000Z",
  "reason": "terminal_state"
}
```

**Client Handling:**
- Parse `submissionId` from error response
- For TTL expiration: request new token via authenticated API
- For terminal state: treat as completed workflow
- Display user-friendly message about completion or expiration

### 10.2 Concurrent Updates

**Scenario:** Multiple actors attempt to update the same submission simultaneously.

**Case 1: Sequential Updates (No Conflict)**

```
Actor A: GET /submissions/tok_v1  → version: 1, token: tok_v1
Actor B: GET /submissions/tok_v1  → version: 1, token: tok_v1
Actor A: PATCH /submissions/tok_v1 (version: 1) → SUCCESS, version: 2, token: tok_v2
Actor B: PATCH /submissions/tok_v1 (version: 1) → 409 CONFLICT
```

**Actor B Response:**

```json
{
  "error": "version_conflict",
  "message": "Submission has been modified by another actor",
  "current": {
    "version": 2,
    "resumeToken": "tok_v2",
    "fields": { ... },
    "lastModifiedBy": {
      "type": "agent",
      "name": "Claude"
    }
  },
  "attempted": {
    "version": 1,
    "fields": { "taxId": "12-3456789" }
  }
}
```

**Client Recovery:**
1. Extract `current.resumeToken` and `current.version` from 409 response
2. Merge attempted changes with current state (manual or automatic)
3. Retry PATCH with new token and version

**Case 2: Rapid Fire Updates**

Agent making multiple rapid updates must chain operations:

```javascript
// ❌ WRONG: Parallel updates cause conflicts
Promise.all([
  patchSubmission(token, { field1: "a" }),
  patchSubmission(token, { field2: "b" }),
  patchSubmission(token, { field3: "c" })
]);

// ✅ CORRECT: Sequential updates with token rotation
let currentToken = initialToken;
currentToken = await patchSubmission(currentToken, { field1: "a" });
currentToken = await patchSubmission(currentToken, { field2: "b" });
currentToken = await patchSubmission(currentToken, { field3: "c" });
```

### 10.3 Token Theft and Unauthorized Access

**Scenario:** Resume token is leaked or stolen (e.g., logs, screenshots, URLs shared publicly).

**Risk Assessment:**

| Exposure Vector | Risk Level | Mitigation |
|----------------|------------|-----------|
| **URL parameter in browser history** | Medium | Use POST body instead of URL params for sensitive operations |
| **Server logs with full URLs** | High | Implement token redaction in logs (show first/last 8 chars only) |
| **Screenshot of web UI** | Medium | Implement token masking in UI, short TTLs |
| **Man-in-the-middle (HTTP)** | Critical | **Always use HTTPS**, enable HSTS |
| **Cross-site scripting (XSS)** | High | Implement CSP headers, sanitize inputs |

**Detection:**

Monitor for suspicious token usage patterns:

```sql
-- Detect token used from multiple IPs in short time
SELECT resumeTokenHash, COUNT(DISTINCT actor.ipAddress) AS ip_count
FROM resume_token_events
WHERE timestamp > NOW() - INTERVAL '5 minutes'
GROUP BY resumeTokenHash
HAVING COUNT(DISTINCT actor.ipAddress) > 3;
```

**Response:**

1. **Immediate:** Revoke token, emit security event
2. **Notify:** Alert submission creator of suspicious activity
3. **Audit:** Log all token access with IP, user agent, timestamp
4. **Rotate:** Issue new token to legitimate user via authenticated channel

**Prevention:**

```javascript
// Token redaction in logs
function redactToken(token) {
  if (token.length < 16) return "[REDACTED]";
  return `${token.slice(0, 8)}...${token.slice(-8)}`;
}

logger.info(`Token accessed: ${redactToken(resumeToken)}`);
// Output: "Token accessed: tok_RTo9...wX4a8Zq3"
```

### 10.4 Replay Attacks

**Scenario:** Attacker captures a valid token and replays it after token rotation.

**Attack Pattern:**

```
1. Legitimate user: PATCH /submissions/tok_v1 → Success, new token: tok_v2
2. Attacker intercepts tok_v1 (expired but not yet cleaned up)
3. Attacker: GET /submissions/tok_v1 → Should FAIL
```

**Defense Mechanism:**

1. **Immediate Invalidation:** Old token becomes invalid the moment new token is issued
2. **Single-Use for Writes:** PATCH/POST operations ALWAYS rotate token
3. **Version Checking:** Old token has stale version, triggers 409 Conflict
4. **Expired Token Tracking:** Log repeated access attempts to expired tokens

**Detection Query:**

```sql
-- Detect replay attack attempts
SELECT resumeTokenHash, COUNT(*) AS attempt_count
FROM resume_token_events
WHERE eventType = 'token.accessed'
  AND outcome = 'failure'
  AND metadata->>'reason' = 'token_expired'
  AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY resumeTokenHash
HAVING COUNT(*) > 5;
```

**Alert Trigger:**
- More than 5 attempts to use expired token in 1 hour
- Same IP accessing multiple different expired tokens
- Geographic anomaly (token used from different country than creation)

**Response:**
```json
{
  "error": "token_expired",
  "message": "This token is no longer valid",
  "reason": "rotated",
  "rotatedAt": "2024-01-16T11:00:00.789Z",
  "securityNote": "This access attempt has been logged"
}
```

### 10.5 Token Rotation Edge Cases

**Case 1: Client Doesn't Store New Token**

Agent performs PATCH but fails to store returned token:

```javascript
// ❌ Client bug: ignores new token
await fetch(`/submissions/${oldToken}`, {
  method: 'PATCH',
  body: JSON.stringify({ fields: { taxId: "123" } })
});
// Next request uses oldToken again → 410 Gone
```

**Server Response:**

```json
{
  "error": "token_expired",
  "message": "Token has been rotated",
  "reason": "rotated",
  "submissionId": "sub_abc123",
  "hint": "Use the resumeToken from the previous PATCH response"
}
```

**Client Recovery:**
- If client has submission ID: GET /submissions/:id (authenticated) to get fresh token
- If no submission ID: workflow is lost, must restart

**Best Practice:**
```javascript
// ✅ Always capture new token
const response = await patchSubmission(token, fields);
currentToken = response.resumeToken; // Update local state
currentVersion = response.version;
```

**Case 2: Network Failure During Rotation**

```
1. Client: PATCH /submissions/tok_v1
2. Server: Processes update, rotates to tok_v2, begins sending response
3. Network: Connection lost
4. Client: Never receives tok_v2
```

**Recovery:**

Client should implement idempotency with submission ID:

```javascript
try {
  const response = await patchSubmission(token, fields);
  return response.resumeToken;
} catch (error) {
  if (error.code === 'NETWORK_ERROR') {
    // Retry with same token
    // If token was rotated, will get 410 with submissionId
    // Use submissionId to fetch current state
  }
}
```

### 10.6 Cross-Actor Race Conditions

**Scenario:** Agent hands off to human, but agent continues operating simultaneously.

**Timeline:**

```
10:00:00 - Agent: PATCH /submissions/tok_v1 → tok_v2 (version 2)
10:00:05 - Agent: Sends email to human with tok_v2
10:00:10 - Agent: (Thinks operation failed, retries)
          PATCH /submissions/tok_v2 → tok_v3 (version 3)
10:00:30 - Human: Clicks link with tok_v2 → 410 Gone
```

**Prevention:**

1. **Agent Protocol:** Agent MUST stop all operations after handoff
2. **Human Feedback:** UI shows "Agent is still working..." if recent activity detected
3. **Grace Period:** Implement 30-second grace period where old token still readable (GET only)

**Detection:**

```javascript
// Detect rapid handoff
if (event.eventType === 'token.handed_off') {
  const recentActivity = await getEvents({
    submissionId: event.submissionId,
    since: Date.now() - 60000, // Last 60 seconds
    actorType: 'agent'
  });

  if (recentActivity.length > 0) {
    logger.warn('Handoff detected but agent still active', {
      submissionId: event.submissionId
    });
  }
}
```

**UI Handling:**

```javascript
// Human opens link
const response = await fetch(`/submissions/${tokenFromEmail}`);

if (response.status === 410) {
  const { submissionId } = await response.json();
  // Attempt to fetch current state
  const current = await fetch(`/submissions/by-id/${submissionId}`);

  if (current.recentActivity.byAgent) {
    showMessage('The AI agent is still working on this submission. Please wait...');
  } else {
    showMessage('This link has expired. The submission may have been updated.');
  }
}
```

### 10.7 Submission State Transitions

**Scenario:** Token used while submission is transitioning between states.

**Case 1: Attempting to Update Submitted Submission**

```
1. Submission state: in_progress
2. Actor A: GET /submissions/tok_v3 → state: in_progress
3. Actor B: POST /submissions/tok_v3/submit → state: submitted
4. Actor A: PATCH /submissions/tok_v3 (version 3) → 410 Gone
```

**Response:**

```json
{
  "error": "token_expired",
  "message": "Cannot modify submission in terminal state",
  "submissionId": "sub_abc123",
  "currentState": "submitted",
  "reason": "terminal_state"
}
```

**Case 2: Validation State Changes**

```
1. Submission: missingFields: ["taxId", "address"]
2. Actor: PATCH (sets taxId)
3. Server: Re-runs validation
4. New state: missingFields: ["address"]
```

Client must handle dynamic validation:

```javascript
const response = await patchSubmission(token, { taxId: "123" });

// Fields may have changed due to validation
if (response.validation.missingFields.length > 0) {
  console.log('Still missing:', response.validation.missingFields);
}

// readyToSubmit flag may have changed
if (response.validation.readyToSubmit) {
  // Can now submit
  await submitSubmission(response.resumeToken);
}
```

---

## 11. Failure Scenarios and Recovery

This section documents failure scenarios, their impacts, and recovery strategies.

### 11.1 Storage Backend Failures

**Scenario 1: Token Store Unavailable**

Redis/DynamoDB/PostgreSQL becomes unavailable during token lookup.

**Impact:**
- Token validation fails
- All resume token operations fail
- New submissions cannot issue tokens

**Error Response:**

```http
HTTP/1.1 503 Service Unavailable
Retry-After: 30

{
  "error": "service_unavailable",
  "message": "Token storage backend is temporarily unavailable",
  "retryAfter": 30,
  "fallbackAction": "use_submission_id"
}
```

**Recovery Strategy:**

1. **Circuit Breaker:** After 5 consecutive failures, open circuit for 60 seconds
2. **Fallback:** Direct clients to use submission ID + authentication
3. **Monitoring:** Alert operations team immediately (P1 incident)
4. **Client Retry:** Exponential backoff with jitter

```javascript
async function getSubmissionWithRetry(token, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await getSubmission(token);
    } catch (error) {
      if (error.status === 503) {
        const delay = Math.min(1000 * Math.pow(2, i) + Math.random() * 1000, 30000);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Token service unavailable after retries');
}
```

**Scenario 2: Partial Storage Failure**

Token stored in cache but not persisted to durable storage.

**Detection:**

```javascript
// Write-through cache implementation
async function storeToken(token, metadata) {
  // Write to cache
  await cache.set(token, metadata, { ttl: 600 });

  try {
    // Write to durable storage
    await db.insert('resume_tokens', { token, ...metadata });
  } catch (error) {
    // CRITICAL: Cache has token but DB doesn't
    logger.error('Token storage inconsistency detected', { token, error });

    // Invalidate cache to prevent inconsistent state
    await cache.delete(token);

    throw new Error('Token storage failed');
  }
}
```

**Recovery:**
- Invalidate cache entry
- Return error to client
- Client retries operation (new token generated)

### 11.2 Clock Skew and Time Synchronization

**Scenario:** Server clocks drift, causing incorrect TTL expiration.

**Case 1: Server Clock Ahead**

```
Server A (clock +30 min): Issues token with expiresAt = "2024-01-16T12:30:00Z"
Server B (clock correct):  Validates token at "2024-01-16T12:05:00Z"
                           Sees token expired (12:05 < 12:30)
```

**Detection:**

```javascript
// Monitor clock skew
const now = Date.now();
const dbTime = await db.query('SELECT EXTRACT(EPOCH FROM NOW()) * 1000 AS time');
const skew = Math.abs(now - dbTime.rows[0].time);

if (skew > 5000) { // 5 second threshold
  logger.error('Clock skew detected', {
    localTime: now,
    dbTime: dbTime.rows[0].time,
    skewMs: skew
  });
}
```

**Mitigation:**

1. **Use Database Time:** Always use database server time for TTL calculations

```javascript
// ❌ WRONG: Use application server time
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

// ✅ CORRECT: Use database time
const result = await db.query(`
  INSERT INTO resume_tokens (token, expires_at)
  VALUES ($1, NOW() + INTERVAL '7 days')
  RETURNING expires_at
`, [token]);
```

2. **NTP Synchronization:** Configure all servers to use NTP
3. **Tolerance Window:** Accept tokens within 5-minute grace period

```javascript
function isTokenExpired(expiresAt) {
  const now = Date.now();
  const grace = 5 * 60 * 1000; // 5 minutes
  return now > (expiresAt.getTime() + grace);
}
```

### 11.3 Network Partitions

**Scenario:** Network partition causes split-brain behavior.

**Case 1: Multi-Region Deployment**

```
Region A (US-EAST): Actor A updates submission → version 2
                    Network partition occurs
Region B (EU-WEST): Actor B updates submission → version 2 (!)
                    Partition heals
                    Conflict: Two version 2 states exist
```

**Prevention:**

1. **Single-Region Writes:** Route all writes to primary region
2. **Read-Only Replicas:** Secondary regions serve reads only
3. **Quorum Writes:** Require majority acknowledgment before confirming write

**Detection:**

```sql
-- Detect version conflicts
SELECT submission_id, version, COUNT(*) AS conflict_count
FROM resume_token_history
GROUP BY submission_id, version
HAVING COUNT(*) > 1;
```

**Recovery:**

```javascript
// Conflict resolution (last-write-wins)
async function resolveConflict(submissionId, version) {
  const conflictingWrites = await db.query(`
    SELECT * FROM resume_token_history
    WHERE submission_id = $1 AND version = $2
    ORDER BY timestamp DESC
  `, [submissionId, version]);

  const winner = conflictingWrites[0]; // Most recent
  const losers = conflictingWrites.slice(1);

  // Revert losing writes
  for (const loser of losers) {
    await db.query(`
      UPDATE resume_tokens
      SET version = version + 1,
          conflicted_at = NOW(),
          conflicted_reason = 'network_partition'
      WHERE token = $1
    `, [loser.token]);

    // Emit reconciliation event
    emitEvent('token.conflict_resolved', {
      submissionId,
      winningWrite: winner,
      losingWrite: loser
    });
  }
}
```

### 11.4 Token Generation Failures

**Scenario:** Random number generator fails or produces weak randomness.

**Detection:**

```javascript
// Test entropy quality
function validateTokenEntropy(token) {
  const bytes = Buffer.from(token, 'base64url');

  // Check for all zeros (RNG failure)
  if (bytes.every(b => b === 0)) {
    throw new Error('RNG failure: all zeros');
  }

  // Check for insufficient entropy (simple test)
  const unique = new Set(bytes).size;
  if (unique < bytes.length / 2) {
    throw new Error('RNG failure: low entropy');
  }

  return true;
}

// Generate token with validation
function generateResumeToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  validateTokenEntropy(token);
  return `tok_RT${token}`;
}
```

**Fallback:**

```javascript
// Fallback to /dev/urandom on crypto failure
function generateTokenWithFallback() {
  try {
    return crypto.randomBytes(32);
  } catch (error) {
    logger.error('crypto.randomBytes failed, using fallback', { error });

    // Fallback to reading /dev/urandom directly
    const fs = require('fs');
    const buffer = Buffer.alloc(32);
    const fd = fs.openSync('/dev/urandom', 'r');
    fs.readSync(fd, buffer, 0, 32, null);
    fs.closeSync(fd);

    return buffer;
  }
}
```

**Monitoring:**

```javascript
// Monitor token uniqueness
const recentTokens = new Set();

function checkTokenCollision(token) {
  if (recentTokens.has(token)) {
    logger.critical('TOKEN COLLISION DETECTED', { token });
    throw new Error('Token collision - RNG may be compromised');
  }

  recentTokens.add(token);

  // Keep last 10,000 tokens in memory
  if (recentTokens.size > 10000) {
    const oldest = recentTokens.values().next().value;
    recentTokens.delete(oldest);
  }
}
```

### 11.5 Database Transaction Failures

**Scenario:** Token created but submission update fails (or vice versa).

**Problem:**

```javascript
// ❌ WRONG: Non-atomic operations
async function createSubmissionWithToken(data) {
  const submission = await db.insert('submissions', data);
  const token = generateToken();
  // ⚠️ If this fails, submission exists without token
  await db.insert('resume_tokens', { token, submissionId: submission.id });
  return { submission, token };
}
```

**Solution: Database Transaction**

```javascript
// ✅ CORRECT: Atomic transaction
async function createSubmissionWithToken(data) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // Create submission
    const submissionResult = await client.query(`
      INSERT INTO submissions (intake_id, fields, state)
      VALUES ($1, $2, 'draft')
      RETURNING id, created_at
    `, [data.intakeId, data.fields]);

    const submission = submissionResult.rows[0];

    // Generate token
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Store token
    await client.query(`
      INSERT INTO resume_tokens (token, submission_id, version, expires_at)
      VALUES ($1, $2, 1, $3)
    `, [token, submission.id, expiresAt]);

    await client.query('COMMIT');

    return { submission, token };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction failed', { error });
    throw error;
  } finally {
    client.release();
  }
}
```

**Idempotency for Retry:**

```javascript
// Idempotent token generation
async function createSubmissionWithToken(data, idempotencyKey) {
  // Check if already created
  const existing = await db.query(`
    SELECT s.id, rt.token
    FROM submissions s
    JOIN resume_tokens rt ON rt.submission_id = s.id
    WHERE s.idempotency_key = $1
  `, [idempotencyKey]);

  if (existing.rows.length > 0) {
    return existing.rows[0]; // Return existing
  }

  // Create new (transaction as above)
  // ...
}
```

### 11.6 Cascading Failures

**Scenario:** Token validation failures cause overload, causing more failures.

**Sequence:**

```
1. Storage backend slows down (high latency)
2. Token validation takes 5+ seconds
3. HTTP requests timeout
4. Clients retry
5. More requests → more load → slower storage
6. Complete system failure
```

**Prevention:**

1. **Request Timeout:** Hard limit on token validation time

```javascript
async function validateTokenWithTimeout(token, timeoutMs = 1000) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Token validation timeout')), timeoutMs);
  });

  try {
    return await Promise.race([
      validateToken(token),
      timeoutPromise
    ]);
  } catch (error) {
    if (error.message === 'Token validation timeout') {
      metrics.increment('token.validation.timeout');
      throw new ServiceUnavailableError('Token validation timeout');
    }
    throw error;
  }
}
```

2. **Circuit Breaker:** Stop sending requests to failing backend

```javascript
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failures = 0;
    this.threshold = threshold;
    this.timeout = timeout;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
      logger.error('Circuit breaker opened', { failures: this.failures });
    }
  }
}

const tokenValidationCircuit = new CircuitBreaker();

async function validateToken(token) {
  return await tokenValidationCircuit.execute(() =>
    tokenStore.validate(token)
  );
}
```

3. **Rate Limiting:** Prevent thundering herd

```javascript
// Per-IP rate limit
const rateLimiter = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 100;

  if (!rateLimiter.has(ip)) {
    rateLimiter.set(ip, { count: 1, windowStart: now });
    return true;
  }

  const record = rateLimiter.get(ip);

  if (now - record.windowStart > windowMs) {
    // Reset window
    record.count = 1;
    record.windowStart = now;
    return true;
  }

  record.count++;

  if (record.count > maxRequests) {
    throw new TooManyRequestsError('Rate limit exceeded');
  }

  return true;
}
```

### 11.7 Recovery Strategies

**Strategy 1: Graceful Degradation**

When token system fails, fall back to authenticated API:

```javascript
// Client-side recovery
async function getSubmission(tokenOrId, authToken = null) {
  try {
    // Try resume token first
    return await fetch(`/submissions/${tokenOrId}`);
  } catch (error) {
    if (error.status === 503 && authToken) {
      // Fallback to authenticated API
      logger.info('Resume token unavailable, using authenticated fallback');
      return await fetch(`/submissions/by-id/${tokenOrId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    }
    throw error;
  }
}
```

**Strategy 2: Token Reconstruction**

Rebuild token index from submission database:

```javascript
// Recovery script
async function rebuildTokenIndex() {
  logger.info('Starting token index rebuild');

  const submissions = await db.query(`
    SELECT id, resume_token, version, expires_at
    FROM submissions
    WHERE state NOT IN ('submitted', 'rejected')
      AND expires_at > NOW()
  `);

  for (const sub of submissions.rows) {
    try {
      await tokenStore.set(sub.resume_token, {
        submissionId: sub.id,
        version: sub.version,
        expiresAt: sub.expires_at
      });
    } catch (error) {
      logger.error('Failed to rebuild token', {
        submissionId: sub.id,
        error
      });
    }
  }

  logger.info('Token index rebuild complete', {
    total: submissions.rows.length
  });
}
```

**Strategy 3: Hot Standby**

Maintain standby token store that syncs continuously:

```javascript
// Dual-write to primary and standby
async function storeToken(token, metadata) {
  const primaryWrite = tokenStore.primary.set(token, metadata);
  const standbyWrite = tokenStore.standby.set(token, metadata)
    .catch(err => logger.warn('Standby write failed', { err }));

  // Wait for primary, best-effort standby
  await primaryWrite;
  // Don't await standby (async)
}

// Failover to standby on primary failure
async function getToken(token) {
  try {
    return await tokenStore.primary.get(token);
  } catch (error) {
    logger.error('Primary token store failed, trying standby', { error });
    return await tokenStore.standby.get(token);
  }
}
```

**Strategy 4: Write-Ahead Log**

Buffer token operations to handle temporary storage failures:

```javascript
// WAL for token operations
const tokenWAL = [];

async function storeTokenWithWAL(token, metadata) {
  // Append to WAL first
  tokenWAL.push({ op: 'set', token, metadata, timestamp: Date.now() });

  try {
    await tokenStore.set(token, metadata);
    // Remove from WAL on success
    tokenWAL.shift();
  } catch (error) {
    logger.error('Token store failed, operation buffered in WAL', { error });

    // Replay WAL when storage recovers
    setInterval(replayWAL, 10000); // Every 10 seconds
  }
}

async function replayWAL() {
  if (tokenWAL.length === 0) return;

  logger.info('Replaying token WAL', { operations: tokenWAL.length });

  for (const op of [...tokenWAL]) {
    try {
      if (op.op === 'set') {
        await tokenStore.set(op.token, op.metadata);
      }
      // Remove from WAL on success
      tokenWAL.shift();
    } catch (error) {
      logger.error('WAL replay failed, will retry', { error });
      break; // Stop replay, will retry later
    }
  }
}
```

---

## 12. Observability

This section defines comprehensive observability requirements for the resume tokens system.

### 12.1 Metrics

**12.1.1 Token Lifecycle Metrics**

```javascript
// Metric definitions
const metrics = {
  // Creation
  'token.created.count': 'counter',
  'token.created.duration': 'histogram', // Time to generate token

  // Access
  'token.accessed.count': 'counter', // By operation: get, patch
  'token.accessed.duration': 'histogram', // Validation time

  // Expiration
  'token.expired.count': 'counter', // By reason: ttl, terminal_state
  'token.ttl_remaining': 'gauge', // Histogram of TTL at access time

  // Conflicts
  'token.conflict.count': 'counter', // Version conflicts
  'token.conflict.rate': 'gauge', // Conflicts / total updates

  // Handoffs
  'token.handoff.count': 'counter', // Cross-actor handoffs
  'token.handoff.duration': 'histogram', // Time from agent to human

  // Errors
  'token.validation.error': 'counter', // By error type
  'token.storage.error': 'counter', // Storage backend failures
};
```

**Prometheus Example:**

```prometheus
# Token creation rate
rate(formbridge_token_created_count[5m])

# Token validation latency (p99)
histogram_quantile(0.99, formbridge_token_accessed_duration)

# Conflict rate
formbridge_token_conflict_count / formbridge_token_accessed_count{operation="patch"}

# Active tokens
formbridge_token_created_count - formbridge_token_expired_count
```

**12.1.2 Storage Backend Metrics**

```javascript
const storageMetrics = {
  // Performance
  'token_store.get.duration': 'histogram',
  'token_store.set.duration': 'histogram',
  'token_store.delete.duration': 'histogram',

  // Errors
  'token_store.error.count': 'counter', // By operation, error_type

  // Capacity
  'token_store.size': 'gauge', // Total tokens stored
  'token_store.memory_usage': 'gauge', // If in-memory cache

  // Hit rate (if cached)
  'token_store.cache.hit': 'counter',
  'token_store.cache.miss': 'counter',
};
```

**12.1.3 Business Metrics**

```javascript
const businessMetrics = {
  // Submission completion
  'submission.created_to_submitted.duration': 'histogram',
  'submission.operations_per_submission': 'histogram',

  // Actor patterns
  'submission.single_actor.count': 'counter', // Completed by one actor
  'submission.multi_actor.count': 'counter', // Required handoff

  // Abandonment
  'submission.abandoned.count': 'counter', // Expired without completion
  'submission.abandonment_rate': 'gauge',
};
```

### 12.2 Logging

**12.2.1 Log Levels**

```javascript
// Token accessed (INFO)
logger.info('Token accessed', {
  tokenHash: sha256(token).slice(0, 16),
  submissionId: 'sub_abc123',
  operation: 'getSubmission',
  actorType: 'human',
  version: 2,
  durationMs: 45
});

// Token conflict (WARN)
logger.warn('Token version conflict detected', {
  tokenHash: sha256(token).slice(0, 16),
  submissionId: 'sub_abc123',
  attemptedVersion: 2,
  currentVersion: 4,
  actorType: 'agent'
});

// Token theft suspected (ERROR)
logger.error('Suspicious token usage detected', {
  tokenHash: sha256(token).slice(0, 16),
  submissionId: 'sub_abc123',
  reason: 'geographic_anomaly',
  creationCountry: 'US',
  accessCountry: 'RU',
  ipAddress: '203.0.113.42'
});

// Storage failure (CRITICAL)
logger.critical('Token storage backend failure', {
  operation: 'validateToken',
  backend: 'redis',
  error: error.message,
  downtime: '30s'
});
```

**12.2.2 Structured Logging Format**

```json
{
  "timestamp": "2024-01-16T11:05:23.456Z",
  "level": "INFO",
  "service": "formbridge-api",
  "component": "resume-tokens",
  "event": "token.accessed",
  "tokenHash": "a3f5b8c2d1e9f0a7",
  "submissionId": "sub_abc123",
  "operation": "getSubmission",
  "actor": {
    "type": "human",
    "ipAddress": "203.0.113.42",
    "userAgent": "Mozilla/5.0..."
  },
  "version": 2,
  "durationMs": 45,
  "outcome": "success"
}
```

**12.2.3 Log Retention**

| Log Level | Retention | Storage |
|-----------|-----------|---------|
| DEBUG | 7 days | Hot storage |
| INFO | 30 days | Hot storage |
| WARN | 90 days | Warm storage |
| ERROR | 1 year | Cold storage |
| CRITICAL | 3 years | Archive |

**12.2.4 Sensitive Data Redaction**

```javascript
// NEVER log full tokens
❌ logger.info('Token accessed', { token: 'tok_RTa3f5b8c2...' });

// ✅ Always hash or redact
✅ logger.info('Token accessed', {
  tokenHash: sha256(token).slice(0, 16),
  tokenPrefix: token.slice(0, 12) + '...',
});
```

### 12.3 Tracing

**12.3.1 Distributed Tracing**

```javascript
// OpenTelemetry instrumentation
const { trace } = require('@opentelemetry/api');

async function getSubmission(resumeToken) {
  const tracer = trace.getTracer('formbridge-resume-tokens');

  return await tracer.startActiveSpan('getSubmission', async (span) => {
    span.setAttribute('token.hash', sha256(resumeToken).slice(0, 16));
    span.setAttribute('operation', 'get');

    try {
      // Validate token
      const validation = await tracer.startActiveSpan('validateToken', async (span) => {
        span.setAttribute('storage.backend', 'redis');
        const result = await tokenStore.validate(resumeToken);
        span.setAttribute('token.version', result.version);
        return result;
      });

      // Fetch submission
      const submission = await tracer.startActiveSpan('fetchSubmission', async (span) => {
        span.setAttribute('submission.id', validation.submissionId);
        return await db.getSubmission(validation.submissionId);
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return submission;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

**12.3.2 Trace Context Propagation**

```javascript
// Propagate trace context across actor handoff
const handoffMetadata = {
  resumeToken: newToken,
  traceId: trace.getActiveSpan()?.spanContext().traceId,
  spanId: trace.getActiveSpan()?.spanContext().spanId,
};

// Human continues trace
const { trace, context } = require('@opentelemetry/api');
const remoteContext = trace.setSpanContext(context.active(), {
  traceId: handoffMetadata.traceId,
  spanId: handoffMetadata.spanId,
});
```

**12.3.3 Key Spans to Instrument**

- `createSubmissionWithToken` - Full submission creation flow
- `validateToken` - Token validation (storage lookup + expiry check)
- `rotateToken` - Token rotation during PATCH
- `resolveConflict` - Conflict detection and resolution
- `expireToken` - Token expiration logic

### 12.4 Alerting

**12.4.1 Critical Alerts (P0/P1)**

```yaml
# Alert: Token storage backend down
- alert: TokenStorageBackendDown
  expr: up{job="redis-token-store"} == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Token storage backend is down"
    description: "Redis token store has been down for 1 minute"
    runbook: "https://docs.formbridge.io/runbooks/token-storage-down"

# Alert: High token validation latency
- alert: TokenValidationHighLatency
  expr: histogram_quantile(0.99, formbridge_token_accessed_duration) > 1000
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Token validation latency high (p99 > 1s)"
    description: "99th percentile token validation time is {{ $value }}ms"

# Alert: High conflict rate
- alert: HighTokenConflictRate
  expr: |
    rate(formbridge_token_conflict_count[5m]) /
    rate(formbridge_token_accessed_count{operation="patch"}[5m]) > 0.05
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "High token conflict rate (>5%)"
    description: "Token conflict rate is {{ $value | humanizePercentage }}"

# Alert: Suspected token theft
- alert: SuspectedTokenTheft
  expr: rate(formbridge_token_accessed_error{reason="geographic_anomaly"}[5m]) > 0
  for: 1m
  labels:
    severity: high
  annotations:
    summary: "Suspected token theft detected"
    description: "Tokens accessed from suspicious geographic locations"
    action: "Review security logs immediately"
```

**12.4.2 Capacity Alerts**

```yaml
# Alert: Token store capacity
- alert: TokenStoreNearCapacity
  expr: formbridge_token_store_size / token_store_max_size > 0.8
  for: 15m
  labels:
    severity: warning
  annotations:
    summary: "Token store is 80% full"
    description: "Consider increasing token store capacity"

# Alert: High token creation rate (potential abuse)
- alert: HighTokenCreationRate
  expr: rate(formbridge_token_created_count[5m]) > 100
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "Unusually high token creation rate"
    description: "Token creation rate is {{ $value }} tokens/second"
```

### 12.5 Dashboards

**12.5.1 Operations Dashboard**

```
┌─────────────────────────────────────────────────────────────┐
│ Resume Tokens - Operations Dashboard                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Token Lifecycle                                              │
│ ├─ Created (last 24h):     1,234     ▲ 12% vs yesterday     │
│ ├─ Active tokens:            456                             │
│ ├─ Expired (TTL):             45     (3.6%)                  │
│ └─ Expired (terminal):       733     (59.4%)                 │
│                                                              │
│ Performance                                                  │
│ ├─ Validation latency (p50):  25ms   ▬▬▬▬▬░░░░░░           │
│ ├─ Validation latency (p99): 120ms   ▬▬▬▬▬▬▬▬░░░           │
│ └─ Storage backend uptime:  99.98%   ✓                      │
│                                                              │
│ Conflicts                                                    │
│ ├─ Conflict count:            12                             │
│ ├─ Conflict rate:           0.97%    ✓ (target: <5%)        │
│ └─ Avg resolution time:      2.3s                            │
│                                                              │
│ Cross-Actor Handoffs                                         │
│ ├─ Total handoffs:           156     (12.6% of submissions)  │
│ ├─ Agent→Human:              142                             │
│ ├─ Human→Agent:               14                             │
│ └─ Avg handoff time:        1h 23m                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**12.5.2 Security Dashboard**

```
┌─────────────────────────────────────────────────────────────┐
│ Resume Tokens - Security Dashboard                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Threat Detection (last 24h)                                 │
│ ├─ Suspected theft:            0     ✓                      │
│ ├─ Replay attacks:             2     ⚠ (investigate)        │
│ ├─ Geographic anomalies:       1     ⚠                      │
│ └─ Rate limit violations:      8                            │
│                                                              │
│ Token Enumeration Attempts                                  │
│ ├─ IPs with >50 404s:          3     ⚠                      │
│ └─ Blocked IPs:                1                            │
│                                                              │
│ Recent Incidents                                             │
│ ├─ [10:23 UTC] Replay attack from 203.0.113.42             │
│ └─ [09:15 UTC] Geographic anomaly (US→RU) - sub_xyz789     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**12.5.3 Business Metrics Dashboard**

```
┌─────────────────────────────────────────────────────────────┐
│ Resume Tokens - Business Metrics                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│ Submission Patterns                                          │
│ ├─ Avg operations/submission:  4.2                          │
│ ├─ Avg time to submit:       2h 15m                         │
│ └─ Completion rate:          72.1%   (890/1234)             │
│                                                              │
│ Actor Breakdown                                              │
│ ├─ Single-actor (agent only): 67%   (823)                   │
│ ├─ Single-actor (human only):  9%   (111)                   │
│ └─ Multi-actor (handoff):     13%   (156)                   │
│                                                              │
│ Abandonment Analysis                                         │
│ ├─ Abandoned submissions:     299    (24.2%)                │
│ ├─ Avg abandonment time:    4d 2h                           │
│ └─ Top abandonment stage:    "address field"                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 12.6 SLIs and SLOs

**12.6.1 Service Level Indicators (SLIs)**

```javascript
// SLI: Token validation success rate
const tokenValidationSuccessRate =
  successful_validations / total_validation_attempts;

// SLI: Token validation latency (p99)
const tokenValidationLatencyP99 =
  histogram_quantile(0.99, token_validation_duration);

// SLI: Storage backend availability
const storageAvailability =
  uptime_seconds / total_seconds;

// SLI: Token operation success rate
const tokenOperationSuccessRate =
  (successful_gets + successful_patches) / total_operations;
```

**12.6.2 Service Level Objectives (SLOs)**

| SLI | Target | Measurement Window |
|-----|--------|-------------------|
| Token validation success rate | ≥ 99.9% | 7 days |
| Token validation latency (p99) | ≤ 500ms | 7 days |
| Storage backend availability | ≥ 99.95% | 30 days |
| Token operation success rate | ≥ 99.5% | 7 days |
| Conflict rate | ≤ 5% | 7 days |

**12.6.3 Error Budget**

```javascript
// Error budget calculation
const errorBudget = {
  slo: 0.999, // 99.9% success rate
  window: 7 * 24 * 60 * 60, // 7 days in seconds
  totalRequests: 1000000, // 1M requests in 7 days
  allowedFailures: 1000000 * (1 - 0.999), // 1,000 failures
  actualFailures: 450,
  remainingBudget: 1000 - 450, // 550 failures remaining
  budgetConsumed: (450 / 1000) * 100, // 45%
};

// Alert when 80% of error budget consumed
if (errorBudget.budgetConsumed > 80) {
  alert('Error budget nearly exhausted - implement freeze');
}
```

**12.6.4 SLO Monitoring Query (Prometheus)**

```prometheus
# Token validation success rate (7-day window)
sum(rate(formbridge_token_accessed_count{outcome="success"}[7d]))
/
sum(rate(formbridge_token_accessed_count[7d]))

# Alert when SLO at risk (< 99.9%)
- alert: TokenValidationSLOAtRisk
  expr: |
    sum(rate(formbridge_token_accessed_count{outcome="success"}[1h]))
    /
    sum(rate(formbridge_token_accessed_count[1h]))
    < 0.999
  for: 30m
  labels:
    severity: high
  annotations:
    summary: "Token validation SLO at risk"
    description: "Success rate dropped below 99.9% threshold"
```

---
