# Feature 023 — Authentication, Authorization & Multi-Tenancy

> **Status:** PLANNED | **Phase:** 5 | **Priority:** Could | **Complexity:** High | **Impact:** Medium
> **[Back to Feature Index](../FEATURES.md)**

## Summary

Add authentication, role-based access control, and multi-tenancy to FormBridge. This is the capstone feature that transforms FormBridge from a developer SDK into a hosted SaaS-ready platform. API key authentication secures agent and programmatic access. OAuth 2.0/OIDC enables single sign-on for the admin dashboard. RBAC with three roles (admin, reviewer, viewer) controls who can do what. Multi-tenancy with data isolation ensures each tenant's intake definitions, submissions, events, and files are fully separated. All auth is optional and can be disabled for local development. Audit events are enriched with authenticated actor identity for compliance.

## Dependencies

**Upstream:**
- Feature 4 (HTTP API) — auth middleware wraps all HTTP routes in `src/routes/*.ts`
- Feature 22 (Admin Dashboard) — OAuth/OIDC provides dashboard SSO; RBAC controls dashboard access

**Downstream:** None (this is the capstone feature)

**Internal task ordering:** API key management (Task 1) and API key middleware (Task 2) come first since they are the simplest auth mechanism. OAuth/OIDC integration (Task 3) is independent. RBAC system (Task 4) depends on having at least one auth mechanism. Tenant manager (Task 5) and data isolation (Task 6) can proceed in parallel after RBAC. Rate limiter (Task 7) depends on API key middleware. Auth configuration (Task 8) and audit enrichment (Task 9) are cross-cutting follow-ups. Middleware integration (Task 10) ties everything together.

## Architecture & Design

### Authentication Flow

```
Client Request
  │
  ├─ API Key (Authorization: Bearer fb_key_...)
  │    └─ Validate key → Extract tenant + scopes → Attach to request context
  │
  ├─ OAuth Token (Authorization: Bearer eyJ...)
  │    └─ Validate JWT → Extract claims (tenant, role, identity) → Attach to request context
  │
  └─ No Auth Header
       └─ If auth required: 401 Unauthorized
       └─ If auth disabled: Attach anonymous actor → Continue
```

### API Key Structure

```typescript
// src/auth/api-key-auth.ts

interface ApiKey {
  id: string;                     // fb_key_<uuid>
  hashedKey: string;              // SHA-256 hash (plaintext never stored)
  tenantId: string;               // Owning tenant
  name: string;                   // Human-readable label
  scopes: ApiKeyScope[];          // Allowed operations
  intakeIds?: string[];           // Optional: restrict to specific intakes
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
  createdBy: string;              // User who created the key
}

type ApiKeyScope =
  | 'submissions:create'
  | 'submissions:read'
  | 'submissions:update'
  | 'submissions:submit'
  | 'intakes:read'
  | 'approvals:read'
  | 'approvals:decide'
  | 'admin:*';
```

### OAuth 2.0 / OIDC Integration

```typescript
// src/auth/oauth-provider.ts

interface OAuthConfig {
  provider: 'generic' | 'okta' | 'auth0' | 'azure-ad' | 'google';
  issuerUrl: string;               // OIDC discovery URL
  clientId: string;
  clientSecret: string;
  audience?: string;
  scopes: string[];
  claimMapping: {
    tenantId: string;              // JWT claim path for tenant (e.g., "org_id")
    role: string;                  // JWT claim path for role (e.g., "formbridge_role")
    email: string;                 // JWT claim path for email
    name: string;                  // JWT claim path for display name
  };
}
```

The OAuth provider validates JWTs, extracts claims, and maps them to FormBridge roles and tenants. OIDC discovery (`/.well-known/openid-configuration`) is used to fetch signing keys automatically.

### RBAC Model

| Role | Intake Mgmt | Submissions | Approvals | Webhooks | Analytics | API Keys | Tenants |
|------|------------|-------------|-----------|----------|-----------|----------|---------|
| **admin** | CRUD | Read, delete | Read, decide | Read, retry | Read | CRUD | Read own |
| **reviewer** | Read | Read | Read, decide | Read | Read | - | - |
| **viewer** | Read | Read | Read | Read | Read | - | - |

```typescript
// src/auth/rbac.ts

type Role = 'admin' | 'reviewer' | 'viewer';

interface Permission {
  resource: 'intakes' | 'submissions' | 'approvals' | 'webhooks' | 'analytics' | 'api-keys' | 'tenants';
  action: 'create' | 'read' | 'update' | 'delete' | 'decide' | 'retry';
}

function hasPermission(role: Role, permission: Permission): boolean;
function requirePermission(permission: Permission): ExpressMiddleware;
```

### Multi-Tenancy

```typescript
// src/auth/tenant-manager.ts

interface Tenant {
  id: string;                      // tenant_<uuid>
  name: string;
  plan: 'free' | 'team' | 'enterprise';
  settings: {
    maxIntakes: number;
    maxSubmissionsPerMonth: number;
    maxStorageBytes: number;
    allowedAuthProviders: string[];
  };
  createdAt: string;
}
```

Data isolation is enforced at the storage layer. Every query includes a `tenantId` filter. The tenant ID is derived from:
1. API key: stored on the key record
2. OAuth token: extracted from JWT claims
3. Anonymous: a default "local" tenant when auth is disabled

### Auth Middleware Pipeline

```typescript
// src/middleware/auth.ts

function authMiddleware(config: AuthConfig): ExpressMiddleware {
  return async (req, res, next) => {
    if (!config.enabled) {
      req.auth = { actor: anonymousActor, tenant: defaultTenant };
      return next();
    }

    const token = extractBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    if (token.startsWith('fb_key_')) {
      req.auth = await validateApiKey(token);
    } else {
      req.auth = await validateOAuthToken(token, config.oauth);
    }

    next();
  };
}
```

### Request Context

```typescript
interface AuthContext {
  actor: Actor;                    // { kind, id, name }
  tenant: Tenant;
  role: Role;
  scopes: ApiKeyScope[];          // From API key or OAuth claims
  apiKeyId?: string;               // If authenticated via API key
}

// Attached to Express request
declare global {
  namespace Express {
    interface Request {
      auth: AuthContext;
    }
  }
}
```

### Configuration

```typescript
interface AuthConfig {
  enabled: boolean;                // false = no auth (dev mode)
  apiKeys: {
    enabled: boolean;
    storage: 'memory' | 'sqlite'; // Where keys are stored
  };
  oauth?: OAuthConfig;
  defaultTenant?: string;          // Tenant ID for unauthenticated requests
  rateLimiting: {
    enabled: boolean;
    windowMs: number;              // Rate limit window (e.g., 60000 = 1 min)
    maxRequestsPerWindow: number;  // Per API key
  };
}
```

## Implementation Tasks

### Task 1: API Key Management
- [ ] Create `src/auth/api-key-auth.ts` with `ApiKey` interface and key management functions
- [ ] Implement `createApiKey(tenantId, name, scopes, intakeIds?)` — generates key, stores SHA-256 hash, returns plaintext once
- [ ] Implement `validateApiKey(plaintext)` — hash and look up; check expiration and revocation
- [ ] Implement `revokeApiKey(keyId)` — soft delete (set `revokedAt`)
- [ ] Implement `listApiKeys(tenantId)` — list keys for a tenant (never returns plaintext)
- [ ] Implement `rotateApiKey(keyId)` — revoke old key, create new key with same scopes
- [ ] Store keys using the storage backend from Feature 019 (or in-memory map for initial implementation)
- [ ] Key format: `fb_key_<base64url(32 random bytes)>` (64 characters total)

**Dependencies:** None
**Effort:** M
**Validation:** Keys can be created, validated, revoked, and rotated; plaintext is never stored; expired/revoked keys are rejected

### Task 2: API Key Middleware
- [ ] Create `src/middleware/auth.ts` with Express middleware function
- [ ] Extract bearer token from `Authorization` header
- [ ] Detect API key by `fb_key_` prefix; delegate to `validateApiKey()`
- [ ] Attach `AuthContext` to `req.auth` on successful validation
- [ ] Return 401 with `{ error: "Authentication required" }` if no token and auth is enabled
- [ ] Return 403 with `{ error: "Insufficient permissions" }` if key lacks required scope
- [ ] Update `lastUsedAt` on the API key record on each successful validation
- [ ] Support API key in `X-API-Key` header as alternative to Bearer token

**Dependencies:** Task 1
**Effort:** S
**Validation:** Middleware rejects unauthenticated requests; accepts valid API keys; attaches correct auth context

### Task 3: OAuth 2.0 / OIDC Integration
- [ ] Create `src/auth/oauth-provider.ts` with OAuth/OIDC validation
- [ ] Implement OIDC discovery: fetch `/.well-known/openid-configuration` from issuer
- [ ] Implement JWT validation: verify signature with issuer's public keys (JWKS)
- [ ] Implement claim extraction: map JWT claims to FormBridge tenant, role, and identity using configurable `claimMapping`
- [ ] Cache JWKS keys with configurable TTL (default: 1 hour)
- [ ] Support multiple providers (generic, Okta, Auth0, Azure AD, Google) via `OAuthConfig.provider`
- [ ] Add provider-specific defaults for known providers (issuer URLs, claim paths)
- [ ] Return structured error on token expiration, invalid signature, or missing claims

**Dependencies:** None
**Effort:** L
**Validation:** Valid JWTs from configured provider are accepted; expired/invalid tokens rejected; claims map correctly to FormBridge roles

### Task 4: RBAC System
- [ ] Create `src/auth/rbac.ts` with role definitions and permission checking
- [ ] Define permission matrix: admin (full access), reviewer (read + approve), viewer (read only)
- [ ] Implement `hasPermission(role, permission)` function
- [ ] Implement `requirePermission(permission)` Express middleware that checks `req.auth.role`
- [ ] Support custom role definitions via configuration (extend beyond the three built-in roles)
- [ ] For API key auth: derive effective permissions from key scopes (intersection of role permissions and key scopes)
- [ ] Return 403 with descriptive error when permission check fails

**Dependencies:** Tasks 1 or 3 (at least one auth mechanism)
**Effort:** M
**Validation:** Each role can only access permitted resources; scope intersection works correctly; 403 returned for unauthorized access

### Task 5: Tenant Manager
- [ ] Create `src/auth/tenant-manager.ts` with tenant CRUD operations
- [ ] Implement `createTenant(name, plan)` — generate tenant ID, set plan limits
- [ ] Implement `getTenant(tenantId)` — retrieve tenant by ID
- [ ] Implement `updateTenant(tenantId, updates)` — update plan, settings, name
- [ ] Implement `listTenants()` — admin-only listing of all tenants
- [ ] Define plan limits: free (5 intakes, 100 submissions/month), team (50 intakes, 10K submissions), enterprise (unlimited)
- [ ] Enforce plan limits at request time (reject with 429 when limits exceeded)
- [ ] Store tenants using the storage backend

**Dependencies:** Task 1
**Effort:** M
**Validation:** Tenants can be created and managed; plan limits enforced; over-limit requests rejected with clear error

### Task 6: Data Isolation Layer
- [ ] Add `tenantId` column/field to all data models: submissions, events, intake definitions, API keys
- [ ] Modify storage backend queries to always filter by `tenantId` from `req.auth.tenant`
- [ ] Ensure no cross-tenant data leakage: submissions from tenant A are invisible to tenant B
- [ ] Add `tenantId` to all indexes for query performance
- [ ] Modify `SubmissionManager` to accept tenant context and pass it through to storage
- [ ] Modify `ApprovalManager` to filter approvals by tenant
- [ ] Add data isolation integration tests (create data in tenant A, verify invisible from tenant B)

**Dependencies:** Tasks 4, 5
**Effort:** L
**Validation:** Cross-tenant queries return empty results; all storage operations include tenant filter; integration tests verify isolation

### Task 7: Rate Limiter
- [ ] Create rate limiting middleware using sliding window algorithm
- [ ] Rate limit per API key (not per IP, since agents may share IPs)
- [ ] Configurable window size and max requests per window
- [ ] Return 429 with `Retry-After` header when limit exceeded
- [ ] Per-tenant rate limits based on plan (enterprise gets higher limits)
- [ ] Exempt health check endpoint from rate limiting
- [ ] Store rate limit counters in memory (with option for Redis in future)
- [ ] Include rate limit headers in all responses: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

**Dependencies:** Task 2
**Effort:** M
**Validation:** Requests beyond limit return 429; rate limit headers present; different plans get different limits; health check exempt

### Task 8: Auth Configuration (Enable/Disable)
- [ ] Create `FormBridgeAuthConfig` type with all configuration options
- [ ] Implement `createAuthConfig()` factory with sensible defaults
- [ ] Support environment variables: `FORMBRIDGE_AUTH_ENABLED`, `FORMBRIDGE_API_KEY_STORAGE`, `FORMBRIDGE_OAUTH_ISSUER`, etc.
- [ ] When `enabled: false`: skip all auth middleware, attach anonymous actor with admin role, use default "local" tenant
- [ ] When `enabled: true`: require authentication on all routes except health check
- [ ] Log auth configuration at startup (redacting secrets)
- [ ] Validate configuration at startup (fail fast on missing required values)

**Dependencies:** Tasks 1-7
**Effort:** S
**Validation:** Auth disabled = anonymous access with full permissions; auth enabled = all routes protected; startup validates config

### Task 9: Audit Event Enrichment
- [ ] Modify event emission to include authenticated actor identity (not just `{ kind, id }`)
- [ ] Include `tenantId` in all audit events
- [ ] Include `apiKeyId` in events from API key-authenticated requests
- [ ] Include OAuth `sub` claim in events from OAuth-authenticated requests
- [ ] Include IP address and user agent in events (for security audit)
- [ ] Add `auth.failed` event type for failed authentication attempts (rate limited to prevent log flooding)
- [ ] Add `auth.key_created`, `auth.key_revoked` event types for key lifecycle

**Dependencies:** Tasks 1-3
**Effort:** M
**Validation:** Events include full actor identity; tenant ID present in all events; auth lifecycle events emitted

### Task 10: Middleware Integration
- [ ] Wire auth middleware into the Express app in `src/index.ts`
- [ ] Apply auth middleware to all routes in `src/routes/*.ts`
- [ ] Apply `requirePermission()` middleware per route based on the operation
- [ ] Apply rate limiting middleware after auth (so rate limits are per-key)
- [ ] Apply tenant data isolation in all route handlers
- [ ] Update route handlers to read tenant context from `req.auth`
- [ ] Ensure MCP transport authenticates requests (API key header or environment variable)
- [ ] Update error handler middleware to not leak auth details in error responses

**Dependencies:** Tasks 1-9
**Effort:** M
**Validation:** All routes enforce auth when enabled; permissions checked per route; MCP transport authenticated; no auth detail leakage in errors

### Task 11: Comprehensive Testing
- [ ] Write unit tests for API key creation, validation, revocation, rotation
- [ ] Write unit tests for OAuth JWT validation (mock JWKS)
- [ ] Write unit tests for RBAC permission matrix (all role x resource x action combinations)
- [ ] Write unit tests for tenant manager (CRUD, plan limits)
- [ ] Write unit tests for rate limiter (within limit, at limit, over limit)
- [ ] Write integration tests for auth middleware (valid key, invalid key, expired key, no key)
- [ ] Write integration tests for data isolation (cross-tenant queries)
- [ ] Write integration tests for auth disabled mode (anonymous access)
- [ ] Write E2E test: create API key, use it to submit form, verify audit trail includes identity

**Dependencies:** Tasks 1-10
**Effort:** L
**Validation:** All tests pass; permission matrix fully covered; data isolation proven; auth disabled mode works

## Test Plan

| Type | Description | Target Count |
|------|-------------|--------------|
| Unit | API key management (create, validate, revoke, rotate, expire) | 15 |
| Unit | OAuth JWT validation (valid, expired, wrong issuer, missing claims) | 12 |
| Unit | RBAC permissions (3 roles x 7 resources x 6 actions) | 20 |
| Unit | Tenant management (CRUD, plan limits) | 10 |
| Unit | Rate limiter (window, limits, headers, 429) | 8 |
| Integration | Auth middleware pipeline (API key, OAuth, no auth) | 12 |
| Integration | Data isolation (cross-tenant queries) | 8 |
| Integration | Auth disabled mode | 5 |
| Integration | Route-level permission enforcement | 15 |
| E2E | Full auth flow (key creation, usage, audit trail) | 2 |
| Security | Key storage (hashing, no plaintext storage) | 3 |

## Documentation Tasks

- [ ] Write authentication setup guide (API keys, OAuth providers)
- [ ] Document API key management API (create, list, revoke, rotate)
- [ ] Document OAuth/OIDC configuration for supported providers (Okta, Auth0, Azure AD, Google)
- [ ] Write RBAC reference with permission matrix
- [ ] Document multi-tenancy setup and data isolation guarantees
- [ ] Document rate limiting behavior and headers
- [ ] Write migration guide for existing deployments enabling auth
- [ ] Document MCP transport authentication

## Code Review Checklist

- [ ] Type safety: auth context is fully typed; no `any` in middleware chain
- [ ] Patterns consistent: all routes use the same auth middleware; no bypass paths
- [ ] No regressions: auth disabled mode preserves all existing behavior exactly
- [ ] Performance acceptable: auth middleware adds < 5ms latency per request; JWT validation cached
- [ ] Security: API key plaintext never stored; secrets redacted in logs; no auth details in error responses
- [ ] Error messages: auth errors are descriptive but do not leak internal state

## Deployment & Release

- **Breaking changes:** None when auth is disabled (default). Enabling auth requires API key creation.
- **New dependencies:** `jose` (JWT validation), no native modules required
- **Configuration:** Environment variables for all auth settings; documented in `.env.example`
- **Migration:** Existing deployments start with `FORMBRIDGE_AUTH_ENABLED=false`; enable when ready
- **Multi-tenant setup:** Requires tenant creation via admin API or CLI before first use

## Observability & Monitoring

- Log authentication failures at warning level (with rate limiting to prevent log flooding)
- Log authorization failures (403) at info level with resource and action
- Track API key usage: last used timestamp, request count per key
- Monitor rate limit 429 responses as a usage signal
- Dashboard (Feature 022) shows per-tenant usage metrics
- Alert on unusual patterns: sudden spike in auth failures, key used from new IP range
- Audit trail includes full actor identity for compliance reporting

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OAuth provider misconfiguration blocks all dashboard access | Medium | High | Auth disabled mode as escape hatch; health check endpoint always accessible; startup validation |
| API key leakage | Medium | High | Keys shown only once at creation; SHA-256 hashed at rest; rotation support for compromised keys |
| Multi-tenancy data leakage | Low | Critical | Storage-layer enforcement (not app-layer); integration tests verify isolation; code review focus |
| Rate limiting too aggressive blocks legitimate agents | Medium | Medium | Configurable per-plan limits; clear 429 response with Retry-After; monitoring dashboard |
| RBAC too coarse for real-world needs | Medium | Low | Custom role definitions in config; start with three roles, iterate based on feedback |
| Performance impact of auth middleware | Low | Low | JWT validation cached; API key lookup indexed; benchmark target < 5ms |

## Definition of Done

- [ ] API key authentication for HTTP and MCP
- [ ] Scoped API keys per intake and operation
- [ ] OAuth 2.0/OIDC integration for SSO
- [ ] RBAC with admin, reviewer, and viewer roles
- [ ] Multi-tenancy with data isolation
- [ ] Tenant derived from API key or OAuth claims
- [ ] Rate limiting per API key with plan-based limits
- [ ] Auth optional (disabled for development by default)
- [ ] Audit events include authenticated actor identity
- [ ] All acceptance criteria met
- [ ] Tests passing
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] No regressions
