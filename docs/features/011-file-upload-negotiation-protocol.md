# Feature 011 — File Upload Negotiation Protocol

> **Status:** IMPLEMENTED | **Phase:** 3 | **Priority:** should | **Complexity:** high | **Impact:** medium
> **[Back to Feature Index](../FEATURES.md)**

## Implementation Summary

> The file upload negotiation protocol implements a three-step flow: negotiate (request signed URL), upload (client uploads directly to storage), and confirm (verify upload and link to submission). A `StorageBackend` interface provides pluggable storage abstraction with two implementations: `LocalStorageBackend` for development (HMAC-SHA256 signed URLs, local filesystem) and `S3StorageBackend` for production (native S3 presigned URLs). Upload routes are implemented as a Hono router with endpoints for requesting upload URLs and confirming uploads. The React form renderer includes a `FileField` component with drag-and-drop support and client-side constraint validation. MCP tools support upload negotiation via `requestUpload` and `confirmUpload` tool bindings. The schema normalizer supports file field types with constraints (`maxSize`, `allowedTypes`, `maxCount`) via the `format: "binary"` convention in JSON Schema.

**Key files:**
- `src/storage/storage-backend.ts` -- `StorageBackend` interface, `UploadConstraints`, `SignedUploadUrl`, `UploadedFile`, `UploadStatusResult` types
- `src/storage/local-storage.ts` -- `LocalStorageBackend` with HMAC-SHA256 signed URLs and local filesystem storage
- `src/storage/s3-storage.ts` -- `S3StorageBackend` with native S3 presigned URLs
- `src/routes/uploads.ts` -- Hono router with `POST /:id/submissions/:sid/uploads` and `POST /:id/submissions/:sid/uploads/:uploadId/confirm`
- `src/core/submission-manager.ts` -- `requestUpload()` and `confirmUpload()` methods, upload tracking via `__uploads` field, `RequestUploadInput/Output`, `ConfirmUploadInput/Output`
- `src/core/validator.ts` -- `UploadStatus` interface for tracking upload state
- `src/types.ts` -- `JSONSchema` extended with `maxSize`, `allowedTypes`, `maxCount` for file constraints
- `packages/schema-normalizer/src/types/intake-schema.ts` -- IntakeSchema IR with file field support
- `packages/form-renderer/src/components/fields/FileField.tsx` -- drag-and-drop file input with constraint validation
- `packages/form-renderer/src/components/FormBridgeForm.tsx` -- file field rendering integration
- `src/mcp/tool-generator.ts` -- `requestUpload` and `confirmUpload` MCP tool bindings
- `tests/upload-negotiation.test.ts` -- upload protocol tests
- `tests/integration/mcp-file-upload.test.ts` -- MCP file upload integration tests

**Known issues:** None specific to this feature.

## Summary

The file upload negotiation protocol enables file attachments on form submissions through a three-step flow: clients declare upload intent and receive a signed URL with constraints, upload the file directly to the storage backend, and then confirm the upload to link it to the submission. This approach avoids proxying file data through the FormBridge server, reducing latency and server load. The protocol supports pluggable storage backends (local filesystem for development, S3-compatible for production) and integrates with the schema system to define file field constraints (maximum size, allowed MIME types, maximum file count).

## Dependencies

**Upstream:** Feature 003 (Intake Contract Runtime), Feature 004 (HTTP/JSON API Server)
**Downstream:** None (end-user feature, used by intake templates that define file fields)

## Architecture & Design

### Three-Step Upload Flow

```
Client                FormBridge Server           Storage Backend
  |                         |                          |
  |-- POST /uploads ------->|                          |
  |   (negotiate)           |-- generateUploadUrl() -->|
  |                         |<-- SignedUploadUrl -------|
  |<-- uploadId, url -------|                          |
  |                         |                          |
  |-- PUT signed-url --------------------------------->|
  |   (direct upload)       |                          |
  |<-- 200 OK --------------|--------------------------|
  |                         |                          |
  |-- POST /uploads/:id/    |                          |
  |   confirm ------------->|-- verifyUpload() ------->|
  |   (confirm)             |<-- UploadStatusResult ---|
  |<-- ok, field, state ----|                          |
```

### StorageBackend Interface
Defined in `storage-backend.ts` with six methods:
- `generateUploadUrl(params)` -- creates a signed URL with embedded constraints and expiration
- `verifyUpload(uploadId)` -- checks upload completion and validates constraints
- `getUploadMetadata(uploadId)` -- retrieves file metadata for completed uploads
- `generateDownloadUrl(uploadId, expiresInSeconds?)` -- creates a signed download URL
- `deleteUpload(uploadId)` -- removes an uploaded file
- `cleanupExpired()` -- garbage collects expired upload URLs and orphaned files

### Upload Constraints
```typescript
interface UploadConstraints {
  maxSize: number;        // bytes
  allowedTypes: string[]; // MIME types (supports wildcards like "image/*")
  maxCount: number;       // max files per field (>= 1)
}
```

### Signed Upload URL
```typescript
interface SignedUploadUrl {
  url: string;
  method: 'PUT' | 'POST';
  headers?: Record<string, string>;
  expiresAt: string;      // ISO 8601
  uploadId: string;
  constraints: UploadConstraints;
}
```

### Upload Tracking
Uploads are tracked within the submission's fields object under a special `__uploads` key. Each upload is keyed by `uploadId` and stores status (`pending`, `completed`, `failed`, `expired`), field path, filename, MIME type, and size.

### Schema Support
The `JSONSchema` type in `src/types.ts` is extended with file-specific properties:
- `maxSize: number` -- maximum file size in bytes
- `allowedTypes: string[]` -- allowed MIME types
- `maxCount: number` -- maximum number of files

These are applied to fields with `format: "binary"` in the JSON Schema.

## Implementation Tasks

### Task 1: StorageBackend Interface Design
- [x] Define `StorageBackend` interface with all six methods
- [x] Define `UploadConstraints` type with maxSize, allowedTypes, maxCount
- [x] Define `SignedUploadUrl` type with url, method, headers, expiration, constraints
- [x] Define `UploadedFile` type with metadata fields
- [x] Define `UploadStatusResult` with status enum and optional file/error
- [x] Document interface contract with JSDoc
**Validation:** `storage-backend.ts` contains all interfaces with comprehensive JSDoc. StorageBackend has 6 methods, each with parameter documentation.

### Task 2: Local Storage Implementation
- [x] Implement `LocalStorageBackend` class
- [x] Use HMAC-SHA256 for signed URL authentication
- [x] Store files in configurable local directory
- [x] Track upload metadata in memory
- [x] Implement upload verification (file exists, size check, MIME check)
- [x] Implement signed download URL generation
- [x] Implement file deletion
- [x] Implement expired upload cleanup
- [x] Prevent path traversal attacks
**Validation:** `local-storage.ts` implements `StorageBackend` with `LocalStorageConfig` (storageDir, baseUrl, signatureSecret, defaultExpirationSeconds). Uses `crypto.createHmac` for URL signing.

### Task 3: S3 Storage Implementation
- [x] Implement `S3StorageBackend` class
- [x] Use native S3 presigned URLs for uploads and downloads
- [x] Support configurable bucket, region, endpoint (for MinIO/DigitalOcean Spaces)
- [x] Support path-style URLs for S3-compatible services
- [x] Support optional server-side encryption
- [x] Track upload metadata (in-memory with DynamoDB fallback documented)
- [x] Implement upload verification via S3 HeadObject
- [x] Implement cleanup of expired uploads
**Validation:** `s3-storage.ts` implements `StorageBackend` with `S3StorageConfig` (bucketName, region, accessKeyId, secretAccessKey, endpoint, forcePathStyle, keyPrefix, serverSideEncryption).

### Task 4: Upload HTTP Routes
- [x] Create Hono router with `createUploadRouter()` factory
- [x] Implement `POST /:id/submissions/:sid/uploads` for upload negotiation
- [x] Implement `POST /:id/submissions/:sid/uploads/:uploadId/confirm` for upload confirmation
- [x] Validate request body (resumeToken, actor, field, filename, mimeType, sizeBytes)
- [x] Handle error cases (intake not found, submission not found, invalid resume token, storage errors)
- [x] Return appropriate HTTP status codes (201, 200, 400, 404, 409, 500)
**Validation:** `uploads.ts` contains full Hono router with both endpoints, typed request/response interfaces, and comprehensive error handling.

### Task 5: Schema File Field Type
- [x] Extend `JSONSchema` type with `maxSize`, `allowedTypes`, `maxCount` properties
- [x] Support `format: "binary"` convention for file fields in JSON Schema
- [x] Update IntakeSchema IR with file field support in schema-normalizer
**Validation:** `src/types.ts` `JSONSchema` interface includes `maxSize?: number`, `allowedTypes?: string[]`, `maxCount?: number`.

### Task 6: SubmissionManager Upload Tracking
- [x] Implement `requestUpload()` method on SubmissionManager
- [x] Implement `confirmUpload()` method on SubmissionManager
- [x] Track uploads in submission fields under `__uploads` key
- [x] Update submission state to `awaiting_upload` on upload request
- [x] Rotate resume token on upload operations
- [x] Emit `upload.requested` event on negotiation
- [x] Emit `upload.completed` or `upload.failed` event on confirmation
**Validation:** `requestUpload()` (line ~310) validates storage backend, gets submission, verifies token, generates signed URL, tracks upload status, updates state, rotates token, emits event. `confirmUpload()` follows similar pattern.

### Task 7: FileField React Component
- [x] Create `FileField` component with drag-and-drop support
- [x] Client-side file size validation
- [x] Client-side MIME type validation (with wildcard support like `image/*`)
- [x] File size display formatting
- [x] Visual feedback for drag-over state
- [x] Integration with `FieldWrapper` for consistent styling
**Validation:** `FileField.tsx` includes `formatFileSize()` utility, `validateFile()` function with size and MIME type checks (including wildcard support), drag-and-drop event handlers.

### Task 8: MCP Tool Binding
- [x] Register `requestUpload` MCP tool in tool-generator
- [x] Register `confirmUpload` MCP tool in tool-generator
- [x] Tools accept field, filename, mimeType, sizeBytes parameters
- [x] Tools return upload URL and constraints
**Validation:** `tool-generator.ts` registers both upload tools with Zod schema validation.

### Task 9: Validation Integration
- [x] Define `UploadStatus` interface for tracking upload state
- [x] Required file field validation (check pending uploads are confirmed)
- [x] Integration with existing validation pipeline
**Validation:** `UploadStatus` defined in `src/core/validator.ts`. Upload status checked during submission validation.

## Test Plan

| Type | Description | Count |
|------|-------------|-------|
| Unit | StorageBackend interface contract tests | 3 |
| Unit | LocalStorageBackend signed URL generation | 1 |
| Unit | LocalStorageBackend upload verification | 1 |
| Unit | FileField drag-and-drop rendering | 1 |
| Unit | FileField client-side validation (size, MIME) | 2 |
| Unit | Upload route request validation (missing fields) | 3 |
| Unit | Upload route error handling (not found, invalid token) | 3 |
| Integration | Full negotiate-upload-confirm flow | 1 |
| Integration | MCP upload negotiation end-to-end | 1 |
| Integration | Upload with expired resume token | 1 |

## Documentation Tasks

- [x] StorageBackend interface documented with JSDoc
- [x] Upload route endpoints documented with examples in source
- [x] FileField component documented with usage patterns
- [x] MCP tool descriptions for requestUpload and confirmUpload
- [x] Upload flow architecture documented in route comments

## Code Review Checklist

- [x] Type safety verified -- all interfaces (`UploadConstraints`, `SignedUploadUrl`, `UploadedFile`, etc.) fully typed
- [x] Patterns consistent -- upload routes follow same Hono router pattern as submission routes
- [x] No regressions -- existing submission flows unaffected by upload additions
- [x] Performance acceptable -- direct-to-storage upload avoids proxying file data through server

## Deployment & Release

- Local storage backend requires writable filesystem directory (configured via `LocalStorageConfig.storageDir`)
- S3 backend requires AWS credentials (IAM role, env vars, or explicit config) and a pre-created S3 bucket
- Upload routes mounted via `createUploadRouter()` in the main server setup
- Storage backend injected into `SubmissionManager` constructor as optional dependency

## Observability & Monitoring

- `upload.requested` event emitted on negotiation (includes uploadId, field, filename, sizeBytes)
- `upload.completed` event emitted on successful confirmation
- `upload.failed` event emitted on failed upload verification
- Upload status tracked per-submission under `__uploads` field
- Storage backend `cleanupExpired()` should be called periodically (cron or similar)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Signed URL leaked to unauthorized party | Low | Medium | Short expiration (15 min default), single-use URLs |
| Storage backend failure during upload | Low | High | Upload status tracking enables retry; client receives clear error |
| Large file uploads consume excessive storage | Medium | Medium | Constraints enforced at both URL generation and verification time |
| S3 presigned URL expiration race condition | Low | Low | Generous expiration window; client can re-negotiate |
| Local storage path traversal | Low | High | Path sanitization in LocalStorageBackend |

## Definition of Done

- [x] All acceptance criteria met (10/10)
- [x] File field types with constraints in schema
- [x] POST /uploads initiates negotiation
- [x] Signed URLs returned with constraints
- [x] Direct upload to storage (not proxied)
- [x] Upload completion tracking
- [x] Required file field validation
- [x] React drag-and-drop FileField component
- [x] MCP upload negotiation tools
- [x] Local filesystem backend
- [x] S3-compatible backend
- [x] Tests passing
- [x] Code reviewed
- [x] Documentation updated
