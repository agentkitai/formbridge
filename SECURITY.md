# Security Practices

FormBridge implements security best practices throughout its codebase. This document outlines the security measures in place.

## Authentication & Authorization

### API Key Authentication
- **Storage:** API keys are SHA-256 hashed at rest — raw keys are never stored
- **Scoping:** Keys can be scoped per intake and operation (read/write/approve/admin)
- **Expiration:** Optional expiration dates for time-limited access
- **Format:** `fb_key_<uuid>` prefix for easy identification

### Role-Based Access Control (RBAC)
- **Roles:** `admin`, `reviewer`, `viewer`
- **Permissions:** Granular permission matrix (intake:read, submission:write, approval:approve, etc.)
- **Enforcement:** Permission checks on every protected route via middleware

### OAuth Support
- JWT token validation with configurable provider
- Tenant isolation via claims

## Input Validation & Sanitization

### Request Validation
- All API inputs validated with strict type checking
- Body size limits (1MB default) via middleware
- Reserved field names blocked (`__proto__`, `constructor`, `prototype`) to prevent prototype pollution

### Resume Tokens
- UUIDv4-based (cryptographically random via `crypto.randomUUID()`)
- Rotated on every state change
- Required for all submission modifications

## SSRF Protection

Webhook destinations are validated to prevent Server-Side Request Forgery:

### Blocked Destinations
- **Private IPs:** RFC 1918 ranges (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
- **Loopback:** 127.0.0.0/8, localhost
- **Link-local:** 169.254.x.x (includes AWS IMDS at 169.254.169.254)
- **IPv6:** ::1, fe80::/10, fc00::/7, IPv4-mapped addresses
- **Schemes:** Only `http:` and `https:` allowed

### DNS Rebinding Mitigation
- URL validation occurs at both enqueue time AND delivery time
- Prevents attacks where DNS resolves to internal IP after initial validation

### Header Injection Prevention
- Destination headers are sanitized
- Blocked headers: Host, Content-Type, Content-Length, X-FormBridge-Signature

## Webhook Security

- **Signing:** HMAC-SHA256 signatures on all webhook payloads
- **Verification:** Constant-time comparison via `timingSafeEqual` (prevents timing attacks)
- **Headers:** `X-FormBridge-Signature` and `X-FormBridge-Timestamp` included
- **Retries:** Exponential backoff with configurable retry policy

## SQL Injection Prevention

- **Parameterized Queries:** All database operations use prepared statements
- **No String Concatenation:** User input is never interpolated into SQL
- **Type Guards:** Runtime validation of all data retrieved from storage

## Cross-Origin Resource Sharing (CORS)

- **Configurable:** Not wide-open by default
- **Production Preset:** Requires explicit allowed origins
- **Dev Preset:** Permissive but clearly marked as development-only
- **Credentials:** Proper handling with origin validation

## Security Headers

Applied via Hono's `secureHeaders()` middleware:

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (HSTS)
- `Referrer-Policy`

## Error Handling

- **Production Mode:** Error messages sanitized, no stack traces leaked
- **Development Mode:** Detailed errors for debugging (opt-in)
- **Consistent Format:** All errors follow IntakeError schema

## File Upload Security

- **Presigned URLs:** Files upload directly to S3 — server never handles raw bytes
- **Constraints:** Size limits, MIME type validation, file count limits
- **Expiration:** Upload URLs are time-limited
- **Isolation:** Uploaded content served from separate domain/bucket

## Rate Limiting

- **Per-Tenant:** Rate limits applied per tenant/API key
- **Configurable:** Adjustable limits and windows
- **Headers:** Standard rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset)

## Testing

- Dedicated security tests in `tests/security/`
- URL validation tests covering SSRF bypass techniques
- Header sanitization tests

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email security concerns to the maintainers
3. Allow reasonable time for a fix before public disclosure

---

*Last audited: 2026-02-03 (VibeSec)*
