# Feature 004 — HTTP/JSON Submission API Server

> **Status:** IMPLEMENTED | **Phase:** 1 | **Priority:** must | **Complexity:** medium | **Impact:** high
> **[Back to Feature Index](../FEATURES.md)**

## Implementation Summary

> Implemented as the Hono-based HTTP server in `src/`. Provides REST endpoints for intake schema retrieval, submission CRUD operations, file upload negotiation, handoff management, and health checks. Uses centralized error handling middleware and configurable CORS. In-memory Map storage for submissions. Routes follow the Intake Contract spec section 12.1 HTTP/JSON transport binding.

**Key files:**
- `src/index.ts` -- Main entry point, exports `FormBridgeMCPServer`, route factories, transport utilities, validation utilities, schema converters
- `src/routes/intake.ts` -- `createIntakeRouter()`: `GET /intake/:id/schema` endpoint
- `src/routes/submissions.ts` -- `createSubmissionRouter()`: handoff endpoints (`POST /submissions/:id/handoff`, `GET /submissions/resume/:resumeToken`, `POST /submissions/resume/:resumeToken/resumed`)
- `src/routes/uploads.ts` -- Upload route handlers (referenced in index.ts exports)
- `src/routes/health.ts` -- `createHealthRouter()`: `GET /health` endpoint
- `src/middleware/error-handler.ts` -- `createErrorHandler()`: centralized error handling, IntakeError formatting, HTTP status code mapping
- `src/middleware/cors.ts` -- `createCorsMiddleware()`: CORS configuration with dev/production/subdomain presets
- `src/core/submission-manager.ts` -- Business logic for all submission operations
- `src/core/validator.ts` -- JSON Schema validation (Ajv-based)
- `src/core/intake-registry.ts` -- In-memory intake definition storage
- `tests/api.test.ts` -- API integration tests

**Known issues:**
- **IMPORTANT: Missing submit endpoint.** The spec defines `POST /submissions/:id/submit` (section 4.6) as the lock-and-finalize operation. The HTTP routes do not expose this as a direct REST endpoint, although the `SubmissionManager.submit()` method exists internally.
- **IMPORTANT: `createFormBridgeAppWithIntakes` creates double components.** The factory function calls `createFormBridgeApp()` (which creates its own registry/validator/submissionManager internally), then creates a second set of those components to register the intakes on. The first set is orphaned.
- **API URL mismatch:** The form-renderer client uses `POST /intakes/{intakeId}/submissions` (plural "intakes"), but the server routes use `POST /intake/:id/submissions` (singular "intake"). These do not connect without alignment.

## Summary

Feature 004 delivers the HTTP/JSON API server that provides the transport layer for FormBridge's Intake Contract. Built on Hono (a lightweight, edge/serverless-compatible framework), the server exposes REST endpoints for retrieving intake schemas, creating and managing submissions, handling file uploads, and supporting agent-to-human handoff via resume URLs. The server includes centralized error handling that formats all errors into the IntakeError envelope from the spec, configurable CORS middleware with presets for development and production, and a health check endpoint for monitoring. Submissions are stored in an in-memory Map via the `SubmissionManager`, with resume token rotation on every state change for concurrency safety.

## Dependencies

**Upstream:** Feature 001 (scaffolding), Feature 002 (schema normalization), Feature 003 (runtime/validation)
**Downstream:** Features 005, 008, 009, 015, 023

## Architecture & Design

### HTTP Framework
- **Hono:** Lightweight framework chosen for edge/serverless compatibility. Routes created via `new Hono()` with middleware support.
- **Route factories:** Each route group has a factory function (`createIntakeRouter()`, `createSubmissionRouter()`, `createHealthRouter()`, `createUploadRouter()`) that accepts dependencies via injection.
- **Express interop:** Submission routes (`src/routes/submissions.ts`) also support Express-style `(req, res, next)` handler signatures for flexibility.

### Endpoints

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| `GET` | `/health` | Health check with timestamp | Implemented |
| `GET` | `/intake/:id/schema` | Retrieve JSON Schema for an intake | Implemented |
| `POST` | `/:id/submissions` | Create a new submission | Implemented |
| `GET` | `/:id/submissions/:submissionId` | Get submission by ID | Implemented |
| `PATCH` | `/:id/submissions/:submissionId` | Update submission fields | Implemented |
| `POST` | `/submissions/:id/handoff` | Generate handoff URL | Implemented |
| `GET` | `/submissions/resume/:resumeToken` | Get submission by resume token | Implemented |
| `POST` | `/submissions/resume/:resumeToken/resumed` | Emit handoff.resumed event | Implemented |
| `POST` | `/submissions/:id/submit` | Lock and finalize | **Missing** (method exists internally) |

### Error Handling
- **Centralized middleware:** `createErrorHandler()` catches all errors and formats them as JSON responses.
- **Status code mapping:** `SubmissionError` -> IntakeError envelope with type-based codes (400 for `missing`/`invalid`, 409 for `conflict`, 202 for `needs_approval`/`upload_pending`, 410 for `expired`/`cancelled`, 502 for `delivery_failed`). `IntakeNotFoundError` -> 404. `IntakeDuplicateError` -> 409. `IntakeValidationError` -> 400. `HTTPException` -> declared status. Default -> 500.
- **Development mode:** Stack traces included when `NODE_ENV !== 'production'`. Console logging configurable.
- **Helper functions:** `throwValidationError()`, `throwNotFoundError()`, `createSubmissionError()`.

### CORS Middleware
- **Factory pattern:** `createCorsMiddleware()` wraps Hono's built-in CORS with FormBridge defaults.
- **Default allowed methods:** GET, POST, PATCH, DELETE, OPTIONS.
- **Default allowed headers:** Content-Type, Authorization, X-Idempotency-Key.
- **Presets:** `createDevCorsMiddleware()` (allow all origins), `createProductionCorsMiddleware()` (explicit origin list with credentials), `createSubdomainCorsMiddleware()` (regex-based subdomain matching).
- **Preflight caching:** maxAge defaults to 86400 seconds (24 hours).

### Storage
- **In-memory Map:** Submissions stored via `SubmissionStore` interface. Production implementations can use Redis, databases, etc.
- **Resume token index:** `getByResumeToken()` enables token-based lookup for handoff flows.

## Implementation Tasks

### Task 1: Hono Application Setup
- [x] Create Hono application instance
- [x] Configure middleware pipeline (CORS, error handler)
- [x] Wire route factories with dependency injection
- [x] Export `createFormBridgeApp()` and `createFormBridgeAppWithIntakes()` factory functions
- [x] Configure ESM module output
**Validation:** Application starts without errors; middleware executes in order.

### Task 2: Intake Routes
- [x] Implement `GET /intake/:id/schema` endpoint
- [x] Return `{ ok: true, intakeId, schema }` on success
- [x] Return 404 with `IntakeErrorResponse` when intake not found
- [x] Return 500 with `IntakeErrorResponse` for unexpected errors
- [x] Create standalone handler `createGetSchemaHandler()` for direct mounting
**Validation:** Schema retrieval works for registered intakes; 404 for unknown IDs.

### Task 3: Submission Routes
- [x] Implement submission CRUD via SubmissionManager integration
- [x] Implement `POST /submissions/:id/handoff` for handoff URL generation
- [x] Implement `GET /submissions/resume/:resumeToken` for resume-token-based retrieval
- [x] Implement `POST /submissions/resume/:resumeToken/resumed` for handoff.resumed event
- [x] Actor validation via Zod schema (`kind`, `id`, `name`)
- [x] Expiration checking with appropriate error responses (403 for expired)
**Validation:** Full handoff flow works: generate URL, retrieve by token, emit resumed event.

### Task 4: Error Handler Middleware
- [x] Implement `createErrorHandler()` factory with configurable logging and stack traces
- [x] Map all error types to appropriate HTTP status codes
- [x] Format `SubmissionError` as IntakeError envelope
- [x] Format registry errors as generic error responses
- [x] Format `HTTPException` from Hono
- [x] Handle unknown error types gracefully (500)
- [x] Implement helper functions: `throwValidationError()`, `throwNotFoundError()`, `createSubmissionError()`
**Validation:** All error types produce correct HTTP status codes and JSON response shapes.

### Task 5: CORS Middleware
- [x] Implement `createCorsMiddleware()` with full CorsOptions configuration
- [x] Implement `createDevCorsMiddleware()` preset (allow all)
- [x] Implement `createProductionCorsMiddleware()` preset (explicit origins, credentials)
- [x] Implement `createSubdomainCorsMiddleware()` preset (regex-based domain matching)
- [x] Configure default allowed headers including `X-Idempotency-Key`
- [x] Configure preflight caching (maxAge: 86400)
**Validation:** CORS headers present in responses; preflight OPTIONS handled; origin validation works for each preset.

### Task 6: Health Check
- [x] Implement `GET /health` endpoint returning `{ ok: true, timestamp: ISO8601 }`
- [x] Create `createHealthRouter()` factory
- [x] Create standalone `healthCheckHandler` for direct use
**Validation:** Health endpoint returns 200 with current timestamp.

### Task 7: API Integration Tests
- [x] Test health check endpoint
- [x] Test intake schema retrieval (success and 404)
- [x] Test submission creation with initial fields
- [x] Test submission retrieval by ID
- [x] Test field updates with resume token validation
- [x] Test state transitions through submission lifecycle
- [x] Test error responses (400, 404, 409, 500)
- [x] Test resume token rotation and stale token rejection (409)
- [x] Test idempotency key handling
**Validation:** All API tests pass in `tests/api.test.ts`.

## Test Plan

| Type | Description | Count |
|------|------------|-------|
| Integration | API endpoint tests (`tests/api.test.ts`) -- health, schema, submission CRUD, errors | ~25+ |
| Unit | Error handler tests -- status code mapping, error formatting | ~10+ |
| Unit | CORS middleware tests -- origin validation, presets | ~5+ |

## Documentation Tasks
- [x] JSDoc on all route handlers with endpoint documentation (method, path, params, response)
- [x] JSDoc on error handler with usage examples
- [x] JSDoc on CORS middleware with preset examples
- [x] Module-level comments referencing Intake Contract Spec sections
- [x] Response type interfaces documented (`GetSchemaResponse`, `IntakeErrorResponse`, `HealthCheckResponse`)

## Code Review Checklist
- [x] Type safety verified (typed route handlers, error envelopes, request parsing)
- [x] Patterns consistent (factory functions for all route groups and middleware)
- [ ] No regressions -- **NOTE:** Submit endpoint missing; factory double-creation issue exists
- [x] Performance acceptable (in-memory storage, Ajv schema caching, Hono lightweight runtime)

## Deployment & Release
- **Backward compatibility:** N/A (new server)
- **Migration:** None required
- **Runtime requirements:** Node >= 18.0.0
- **Serverless ready:** Hono supports Cloudflare Workers, Deno Deploy, Bun, AWS Lambda via adapters
- **Environment variables:** `NODE_ENV` controls error verbosity (stack traces in non-production)

## Observability & Monitoring
- **Logging:** Error handler logs to console in non-production mode with optional stack traces
- **Health check:** `GET /health` provides liveness probe for load balancers and monitoring
- **Error reporting:** All errors formatted as structured JSON with `type` field for categorization

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Missing submit endpoint blocks end-to-end flow | Confirmed | High | `SubmissionManager.submit()` exists; needs HTTP route exposure at `POST /submissions/:id/submit` |
| Factory double-creation wastes memory | Confirmed | Low | Orphaned components are small (one extra registry/validator/submissionManager); fix by restructuring factory |
| API URL mismatch breaks form-renderer integration | Confirmed | Medium | Align client and server on path convention (recommend plural `/intakes/` to match REST conventions) |
| In-memory storage lost on restart | Expected | Medium | Acceptable for development; production should use persistent `SubmissionStore` implementation |

## Definition of Done
- [x] All acceptance criteria met
- [x] Tests passing (API integration tests cover all implemented endpoints)
- [x] Code reviewed (known issues documented)
- [x] Documentation updated (JSDoc, response types, module comments)
- [x] CRUD endpoints for submissions implemented
- [x] Error responses follow IntakeError envelope format
- [x] CORS middleware configurable with dev/production presets
- [x] Health check endpoint returns service status
- [x] Resume token rotation works (stale tokens rejected with 409)
- [x] Centralized error handler maps all error types to correct HTTP status codes
