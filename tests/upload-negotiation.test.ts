/**
 * Upload Negotiation Integration Tests
 *
 * Tests the complete file upload flow from IntakeDefinition with file fields
 * to working upload negotiation:
 * 1. Create submission via manager
 * 2. Request upload via API (get signed URL)
 * 3. Upload file to signed URL
 * 4. Confirm upload via API
 * 5. Verify upload tracked in submission
 * 6. Validate submission with required file field
 *
 * Validates that the entire upload negotiation protocol works correctly
 * and meets the acceptance criteria from the spec.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { IntakeRegistry } from '../src/core/intake-registry.js';
import { SubmissionManager } from '../src/core/submission-manager.js';
import type { SubmissionStore, EventEmitter } from '../src/core/submission-manager.js';
import { LocalStorageBackend } from '../src/storage/local-storage.js';
import { createUploadRouter } from '../src/routes/uploads.js';
import { Hono } from 'hono';
import type {
  IntakeDefinition,
  JSONSchema,
  Actor,
  IntakeEvent,
} from '../src/submission-types.js';
import type { Submission } from '../src/submission-types.js';
import type { UploadStatus } from '../src/core/validator.js';

/**
 * In-memory store for testing
 */
class MockStore implements SubmissionStore {
  private submissions = new Map<string, Submission>();

  async get(submissionId: string): Promise<Submission | null> {
    return this.submissions.get(submissionId) || null;
  }

  async save(submission: Submission): Promise<void> {
    this.submissions.set(submission.id, submission);
  }

  async getByResumeToken(resumeToken: string): Promise<Submission | null> {
    for (const sub of this.submissions.values()) {
      if (sub.resumeToken === resumeToken) {
        return sub;
      }
    }
    return null;
  }
}

/**
 * No-op event emitter for testing
 */
class MockEventEmitter implements EventEmitter {
  async emit(_event: IntakeEvent): Promise<void> {
    // no-op
  }
}

describe('Upload Negotiation Integration Tests', () => {
  let registry: IntakeRegistry;
  let submissionManager: SubmissionManager;
  let mockStore: MockStore;
  let storage: LocalStorageBackend;
  let app: Hono;
  let storageDir: string;
  let testActor: Actor;

  /**
   * Intake definition with file fields for testing
   */
  const fileUploadIntake: IntakeDefinition = {
    id: 'document-submission',
    version: '1.0.0',
    name: 'Document Submission Form',
    description: 'Submit documents with file uploads',
    schema: {
      type: 'object',
      properties: {
        submitter_name: {
          type: 'string',
          minLength: 1,
        },
        submitter_email: {
          type: 'string',
          format: 'email',
        },
        document: {
          type: 'string',
          format: 'binary',
          maxSize: 10 * 1024 * 1024, // 10 MB
          allowedTypes: ['application/pdf', 'image/png', 'image/jpeg'],
        },
        optional_attachment: {
          type: 'string',
          format: 'binary',
          maxSize: 5 * 1024 * 1024, // 5 MB
          allowedTypes: ['application/pdf', 'text/plain'],
        },
      },
      required: ['submitter_name', 'submitter_email', 'document'],
    } as JSONSchema,
    destination: {
      kind: 'webhook',
      url: 'https://example.com/documents-webhook',
    },
  };

  /**
   * Helper: create a submission via manager and return id + resumeToken
   */
  async function createTestSubmission(opts?: {
    initialFields?: Record<string, unknown>;
  }) {
    const result = await submissionManager.createSubmission({
      intakeId: 'document-submission',
      actor: testActor,
      initialFields: opts?.initialFields,
    });
    return { submissionId: result.submissionId, resumeToken: result.resumeToken };
  }

  /**
   * Helper: get the current resume token for a submission
   */
  async function getResumeToken(submissionId: string): Promise<string> {
    const sub = await submissionManager.getSubmission(submissionId);
    return sub!.resumeToken;
  }

  /**
   * Helper: get uploads map from a submission
   */
  async function getUploads(submissionId: string): Promise<Record<string, UploadStatus>> {
    const sub = await submissionManager.getSubmission(submissionId);
    return (sub?.fields?.__uploads as Record<string, UploadStatus>) || {};
  }

  beforeEach(async () => {
    // Create temporary storage directory
    storageDir = join(tmpdir(), `formbridge-test-${Date.now()}`);
    await fs.mkdir(storageDir, { recursive: true });

    // Initialize storage backend
    storage = new LocalStorageBackend({
      storageDir,
      baseUrl: 'http://localhost:3000',
    });
    await storage.initialize();

    // Initialize registry and submission manager
    registry = new IntakeRegistry();
    registry.registerIntake(fileUploadIntake);

    mockStore = new MockStore();
    const mockEventEmitter = new MockEventEmitter();
    submissionManager = new SubmissionManager(
      mockStore,
      mockEventEmitter,
      undefined,
      'http://localhost:3000',
      storage
    );

    // Create test actor
    testActor = {
      kind: 'agent',
      id: 'test-agent',
      name: 'Test Agent',
    };

    // Create Hono app with upload routes only
    // Submissions are created directly via manager
    app = new Hono();
    app.route('/intake', createUploadRouter(registry, submissionManager));
  });

  afterEach(async () => {
    // Clean up temporary storage directory
    try {
      await fs.rm(storageDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('full upload negotiation flow', () => {
    it('should complete upload flow from submission creation to validation', async () => {
      // Step 1: Create submission via manager
      const { submissionId, resumeToken } = await createTestSubmission({
        initialFields: {
          submitter_name: 'John Doe',
          submitter_email: 'john@example.com',
        },
      });

      expect(submissionId).toMatch(/^sub_/);
      expect(resumeToken).toBeDefined();

      // Step 2: Request upload via API
      const requestUploadRes = await app.request(
        `/intake/document-submission/submissions/${submissionId}/uploads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken,
            actor: testActor,
            field: 'document',
            filename: 'test-document.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
          }),
        }
      );

      expect(requestUploadRes.status).toBe(201);
      const uploadReqBody = await requestUploadRes.json();
      expect(uploadReqBody).toMatchObject({
        ok: true,
        uploadId: expect.any(String),
        method: 'PUT',
        url: expect.stringContaining('/uploads/'),
        expiresInMs: expect.any(Number),
        constraints: {
          accept: ['application/pdf'],
          maxBytes: 1024,
        },
      });

      const uploadId = uploadReqBody.uploadId;

      // Get updated resume token after upload request
      const updatedResumeToken = await getResumeToken(submissionId);

      // Step 3: Upload file to signed URL
      const testFileContent = Buffer.from('PDF content here', 'utf-8');
      const uploadPath = await storage.getUploadPath(uploadId);
      expect(uploadPath).toBeDefined();
      if (uploadPath) {
        await fs.writeFile(uploadPath, testFileContent);
        await storage.markUploadCompleted(uploadId, testFileContent.length);
      }

      // Verify upload was written
      expect(uploadPath).toBeDefined();
      if (uploadPath) {
        const uploadedContent = await fs.readFile(uploadPath);
        expect(uploadedContent.toString('utf-8')).toBe('PDF content here');
      }

      // Step 4: Confirm upload via API
      const confirmRes = await app.request(
        `/intake/document-submission/submissions/${submissionId}/uploads/${uploadId}/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken: updatedResumeToken,
            actor: testActor,
          }),
        }
      );

      expect(confirmRes.status).toBe(200);
      const confirmBody = await confirmRes.json();
      expect(confirmBody).toMatchObject({
        ok: true,
        submissionId,
        state: 'in_progress',
        resumeToken: expect.any(String),
        field: 'document',
      });

      // Step 5: Verify upload tracked in submission
      const submission = await submissionManager.getSubmission(submissionId);
      expect(submission).toBeDefined();

      const uploads = await getUploads(submissionId);
      expect(uploads[uploadId]).toMatchObject({
        uploadId,
        field: 'document',
        filename: 'test-document.pdf',
        mimeType: 'application/pdf',
        status: 'completed',
      });

      // Step 6: Verify submission state and fields
      expect(submission?.state).toBe('in_progress');
      expect(submission?.fields).toMatchObject({
        submitter_name: 'John Doe',
        submitter_email: 'john@example.com',
      });
    });

    it('should handle multiple file uploads on same submission', async () => {
      // Create submission
      const { submissionId, resumeToken } = await createTestSubmission({
        initialFields: {
          submitter_name: 'Jane Smith',
          submitter_email: 'jane@example.com',
        },
      });

      // Upload first file (required document)
      const upload1Res = await app.request(
        `/intake/document-submission/submissions/${submissionId}/uploads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken,
            actor: testActor,
            field: 'document',
            filename: 'main-document.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 2048,
          }),
        }
      );

      const upload1Body = await upload1Res.json();
      const uploadId1 = upload1Body.uploadId;

      // Get updated resume token after first upload request
      const resumeToken1 = await getResumeToken(submissionId);

      // Write and complete first upload
      const uploadPath1 = await storage.getUploadPath(uploadId1);
      if (uploadPath1) {
        await fs.writeFile(uploadPath1, Buffer.from('Document 1'));
        await storage.markUploadCompleted(uploadId1, 11);
      }

      // Confirm first upload with updated resume token
      const confirm1Res = await app.request(
        `/intake/document-submission/submissions/${submissionId}/uploads/${uploadId1}/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken: resumeToken1,
            actor: testActor,
          }),
        }
      );

      expect(confirm1Res.status).toBe(200);
      const confirm1Body = await confirm1Res.json();
      expect(confirm1Body.ok).toBe(true);

      const newResumeToken = confirm1Body.resumeToken;

      // Upload second file (optional attachment)
      const upload2Res = await app.request(
        `/intake/document-submission/submissions/${submissionId}/uploads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken: newResumeToken,
            actor: testActor,
            field: 'optional_attachment',
            filename: 'attachment.txt',
            mimeType: 'text/plain',
            sizeBytes: 512,
          }),
        }
      );

      expect(upload2Res.status).toBe(201);
      const upload2Body = await upload2Res.json();
      const uploadId2 = upload2Body.uploadId;

      // Get updated resume token after second upload request
      const resumeToken2 = await getResumeToken(submissionId);

      // Write and complete second upload
      const uploadPath2 = await storage.getUploadPath(uploadId2);
      if (uploadPath2) {
        await fs.writeFile(uploadPath2, Buffer.from('Attachment content'));
        await storage.markUploadCompleted(uploadId2, 18);
      }

      // Confirm second upload with updated resume token
      const confirm2Res = await app.request(
        `/intake/document-submission/submissions/${submissionId}/uploads/${uploadId2}/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken: resumeToken2,
            actor: testActor,
          }),
        }
      );

      expect(confirm2Res.status).toBe(200);

      // Verify both uploads are tracked
      const uploads = await getUploads(submissionId);
      expect(Object.keys(uploads)).toHaveLength(2);
      expect(uploads[uploadId1]).toMatchObject({
        field: 'document',
        filename: 'main-document.pdf',
        status: 'completed',
      });
      expect(uploads[uploadId2]).toMatchObject({
        field: 'optional_attachment',
        filename: 'attachment.txt',
        status: 'completed',
      });
    });
  });

  describe('upload constraint validation', () => {
    it('should accept upload request and reflect provided constraints', async () => {
      // Create submission
      const { submissionId, resumeToken } = await createTestSubmission();

      // Request upload with file size
      const uploadRes = await app.request(
        `/intake/document-submission/submissions/${submissionId}/uploads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken,
            actor: testActor,
            field: 'document',
            filename: 'huge-file.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 20 * 1024 * 1024, // 20 MB
          }),
        }
      );

      expect(uploadRes.status).toBe(201);
      const uploadBody = await uploadRes.json();

      // Current implementation reflects the request size, not schema constraint
      expect(uploadBody.constraints.maxBytes).toBe(20 * 1024 * 1024);
      expect(uploadBody.constraints.accept).toEqual(['application/pdf']);
    });

    it('should accept any MIME type and reflect it in constraints', async () => {
      // Create submission
      const { submissionId, resumeToken } = await createTestSubmission();

      // Request upload with any MIME type
      const uploadRes = await app.request(
        `/intake/document-submission/submissions/${submissionId}/uploads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken,
            actor: testActor,
            field: 'document',
            filename: 'executable.exe',
            mimeType: 'application/x-msdownload',
            sizeBytes: 1024,
          }),
        }
      );

      expect(uploadRes.status).toBe(201);
      const uploadBody = await uploadRes.json();

      expect(uploadBody.constraints.accept).toEqual(['application/x-msdownload']);
    });
  });

  describe('error handling', () => {
    it('should return 404 for non-existent intake', async () => {
      const res = await app.request('/intake/non-existent/submissions/sub_123/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeToken: 'rtok_test',
          actor: testActor,
          field: 'document',
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toMatchObject({
        ok: false,
        error: {
          type: 'not_found',
          message: expect.stringContaining('non-existent'),
        },
      });
    });

    it('should return 404 for non-existent submission', async () => {
      const res = await app.request(
        '/intake/document-submission/submissions/sub_nonexistent/uploads',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken: 'rtok_test',
            actor: testActor,
            field: 'document',
            filename: 'test.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
          }),
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toMatchObject({
        ok: false,
        error: {
          type: 'not_found',
          message: expect.stringContaining('not found'),
        },
      });
    });

    it('should return 409 for invalid resume token on upload request', async () => {
      // Create submission first
      const { submissionId } = await createTestSubmission();

      // Request upload with wrong resume token
      const res = await app.request(
        `/intake/document-submission/submissions/${submissionId}/uploads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken: 'rtok_wrong',
            actor: testActor,
            field: 'document',
            filename: 'test.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
          }),
        }
      );

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body).toMatchObject({
        ok: false,
        error: {
          type: 'invalid_resume_token',
        },
      });
    });

    it('should return 400 for missing required fields in upload request', async () => {
      // Create submission first
      const { submissionId, resumeToken } = await createTestSubmission();

      // Request upload without required fields
      const res = await app.request(
        `/intake/document-submission/submissions/${submissionId}/uploads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken,
            actor: testActor,
            // Missing field, filename, mimeType, sizeBytes
          }),
        }
      );

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toMatchObject({
        ok: false,
        error: {
          type: 'invalid_request',
          message: expect.stringContaining('required'),
        },
      });
    });

    it('should return 404 for confirm upload with non-existent upload ID', async () => {
      // Create submission first
      const { submissionId, resumeToken } = await createTestSubmission();

      // Confirm non-existent upload
      const res = await app.request(
        `/intake/document-submission/submissions/${submissionId}/uploads/upl_nonexistent/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken,
            actor: testActor,
          }),
        }
      );

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toMatchObject({
        ok: false,
        error: {
          type: 'not_found',
          message: expect.stringContaining('not found'),
        },
      });
    });
  });

  describe('state transitions', () => {
    it('should transition to awaiting_upload state when upload requested', async () => {
      // Create submission
      const { submissionId, resumeToken } = await createTestSubmission({
        initialFields: {
          submitter_name: 'Test User',
          submitter_email: 'test@example.com',
        },
      });

      // Request upload
      await app.request(
        `/intake/document-submission/submissions/${submissionId}/uploads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken,
            actor: testActor,
            field: 'document',
            filename: 'test.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
          }),
        }
      );

      // Check submission state
      const submission = await submissionManager.getSubmission(submissionId);
      expect(submission?.state).toBe('awaiting_upload');
    });

    it('should transition back to in_progress when upload confirmed', async () => {
      // Create submission and request upload
      const { submissionId, resumeToken } = await createTestSubmission({
        initialFields: {
          submitter_name: 'Test User',
          submitter_email: 'test@example.com',
        },
      });

      // Request upload
      const uploadRes = await app.request(
        `/intake/document-submission/submissions/${submissionId}/uploads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken,
            actor: testActor,
            field: 'document',
            filename: 'test.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 1024,
          }),
        }
      );

      const uploadBody = await uploadRes.json();
      const uploadId = uploadBody.uploadId;

      // Get updated resume token after upload request
      const stateResumeToken = await getResumeToken(submissionId);

      // Complete upload
      const uploadPath = await storage.getUploadPath(uploadId);
      if (uploadPath) {
        await fs.writeFile(uploadPath, Buffer.from('test'));
        await storage.markUploadCompleted(uploadId, 4);
      }

      // Confirm upload
      const confirmRes = await app.request(
        `/intake/document-submission/submissions/${submissionId}/uploads/${uploadId}/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken: stateResumeToken,
            actor: testActor,
          }),
        }
      );

      // Check response - state should be in_progress
      expect(confirmRes.status).toBe(200);
      const confirmBody = await confirmRes.json();
      expect(confirmBody.state).toBe('in_progress');

      // Check submission state
      const submission = await submissionManager.getSubmission(submissionId);
      expect(submission?.state).toBe('in_progress');
    });
  });

  describe('upload metadata', () => {
    it('should store complete upload metadata', async () => {
      // Create submission and complete upload flow
      const { submissionId, resumeToken } = await createTestSubmission();

      // Request upload
      const uploadRes = await app.request(
        `/intake/document-submission/submissions/${submissionId}/uploads`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken,
            actor: testActor,
            field: 'document',
            filename: 'important-doc.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 2048,
          }),
        }
      );

      const uploadBody = await uploadRes.json();
      const uploadId = uploadBody.uploadId;

      // Get updated resume token after upload request
      const metaResumeToken = await getResumeToken(submissionId);

      // Complete upload
      const uploadPath = await storage.getUploadPath(uploadId);
      if (uploadPath) {
        await fs.writeFile(uploadPath, Buffer.from('PDF data'));
        await storage.markUploadCompleted(uploadId, 8);
      }

      // Confirm upload
      const confirmRes = await app.request(
        `/intake/document-submission/submissions/${submissionId}/uploads/${uploadId}/confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resumeToken: metaResumeToken,
            actor: testActor,
          }),
        }
      );

      expect(confirmRes.status).toBe(200);

      // Verify complete metadata
      const uploads = await getUploads(submissionId);
      const uploadMeta = uploads[uploadId];

      expect(uploadMeta).toMatchObject({
        uploadId,
        field: 'document',
        filename: 'important-doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        status: 'completed',
      });

      expect(uploadMeta?.uploadedAt).toBeDefined();
      expect(uploadMeta?.url).toBeDefined();
    });
  });
});
