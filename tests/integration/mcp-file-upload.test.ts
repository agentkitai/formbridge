/**
 * MCP File Upload Integration Tests
 *
 * Drives the file-upload flow through MCP tool invocations, now backed by the
 * shared SubmissionManager. Note the unified behavior:
 *  - create reports the CORE `draft` state (not the old MCP `created`)
 *  - the resume token ROTATES on every mutation (create → requestUpload →
 *    confirmUpload), so each step must use the token returned by the previous one
 *  - confirmUpload returns the manager shape `{ ok, submissionId, state,
 *    resumeToken, field }` (+ echoed uploadId)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { z } from 'zod';
import { FormBridgeMCPServer } from '../../src/mcp/server.js';
import { LocalStorageBackend } from '../../src/storage/local-storage.js';
import type { IntakeDefinition } from '../../src/schemas/intake-schema.js';
import type { MCPServerConfig } from '../../src/types/mcp-tool-definitions.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolResult = { content: Array<{ type: string; text: string }>; isError?: boolean };

describe('MCP File Upload Integration Tests', () => {
  let server: FormBridgeMCPServer;
  let storage: LocalStorageBackend;
  let storageDir: string;
  let intake: IntakeDefinition;

  const call = (srv: FormBridgeMCPServer, name: string, args: Record<string, unknown>): Promise<ToolResult> =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (srv as any).handleToolCall(name, args);

  beforeEach(async () => {
    storageDir = join(tmpdir(), `formbridge-mcp-test-${Date.now()}`);
    await fs.mkdir(storageDir, { recursive: true });

    storage = new LocalStorageBackend({ storageDir, baseUrl: 'http://localhost:3000' });
    await storage.initialize();

    intake = {
      id: 'vendor_onboarding',
      version: '1.0.0',
      name: 'Vendor Onboarding',
      description: 'Onboard new vendors with document uploads',
      schema: z.object({
        company_name: z.string().min(1).describe('Company name'),
        tax_id: z.string().min(9).describe('Tax ID number'),
        certificate: z.string().describe('Business certificate (file upload)'),
      }),
      destination: {
        type: 'webhook',
        name: 'Vendor API',
        config: { url: 'https://api.example.com/vendors' },
      },
    };

    const config: MCPServerConfig = {
      name: 'mcp-upload-test-server',
      version: '1.0.0',
      transport: { type: 'stdio' },
      storageBackend: storage,
    };

    server = new FormBridgeMCPServer(config);
    server.registerIntake(intake);
  });

  afterEach(async () => {
    try {
      await fs.rm(storageDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('file upload via MCP tools', () => {
    it('should complete full upload flow from agent perspective', async () => {
      // Step 1: create — reports the core `draft` state.
      const createResponse = await call(server, 'vendor_onboarding_create', {
        data: { company_name: 'Acme Corp', tax_id: '123456789' },
      });

      expect(createResponse.isError).toBeUndefined();
      const createResult = JSON.parse(createResponse.content[0]!.text);
      expect(createResult).toMatchObject({
        state: 'draft',
        submissionId: expect.any(String),
        resumeToken: expect.any(String),
      });

      // Step 2: requestUpload — rotates the resume token (returned in response).
      const uploadRequest = await call(server, 'vendor_onboarding_requestUpload', {
        resumeToken: createResult.resumeToken,
        field: 'certificate',
        filename: 'business-certificate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 102400,
      });

      expect(uploadRequest.isError).toBeUndefined();
      const uploadResult = JSON.parse(uploadRequest.content[0]!.text);
      expect(uploadResult).toMatchObject({
        ok: true,
        uploadId: expect.any(String),
        method: 'PUT',
        url: expect.stringContaining('/uploads/'),
        expiresInMs: expect.any(Number),
        constraints: { maxBytes: 102400, accept: ['application/pdf'] },
        resumeToken: expect.any(String),
      });
      expect(uploadResult.resumeToken).not.toBe(createResult.resumeToken); // rotated

      const uploadId = uploadResult.uploadId;

      // Step 3: simulate the direct-to-storage upload.
      const testFileContent = Buffer.from('PDF certificate content', 'utf-8');
      const uploadPath = await storage.getUploadPath(uploadId);
      expect(uploadPath).toBeDefined();
      if (uploadPath) {
        await fs.writeFile(uploadPath, testFileContent);
        await storage.markUploadCompleted(uploadId, testFileContent.length);
      }

      // Step 4: confirmUpload — uses the ROTATED token from requestUpload.
      const confirmResponse = await call(server, 'vendor_onboarding_confirmUpload', {
        resumeToken: uploadResult.resumeToken,
        uploadId,
      });

      expect(confirmResponse.isError).toBeUndefined();
      const confirmResult = JSON.parse(confirmResponse.content[0]!.text);
      expect(confirmResult).toMatchObject({
        ok: true,
        submissionId: createResult.submissionId,
        uploadId,
        field: 'certificate',
        state: 'in_progress',
        resumeToken: expect.any(String),
      });

      // Step 5: validate against the shared schema (certificate is tracked as an
      // upload, not a data field, so it still reads as missing — read-only).
      const validateResponse = await call(server, 'vendor_onboarding_validate', {
        resumeToken: confirmResult.resumeToken,
      });
      const validateResult = JSON.parse(validateResponse.content[0]!.text);
      expect(validateResult).toBeDefined();
      expect(validateResult.missingFields).toContain('certificate');
    });

    it('should handle multiple file uploads in one submission', async () => {
      const multiFileIntake: IntakeDefinition = {
        id: 'document_submission',
        version: '1.0.0',
        name: 'Document Submission',
        schema: z.object({
          name: z.string(),
          id_document: z.string().describe('ID document'),
          proof_of_address: z.string().describe('Proof of address'),
        }),
        destination: { type: 'webhook', name: 'Document API', config: { url: 'https://api.example.com/docs' } },
      };

      server.registerIntake(multiFileIntake);

      const createResult = JSON.parse(
        (await call(server, 'document_submission_create', { data: { name: 'John Doe' } })).content[0]!.text
      );
      const token0 = createResult.resumeToken;

      // First upload (rotates token0 → token1).
      const upload1Result = JSON.parse(
        (await call(server, 'document_submission_requestUpload', {
          resumeToken: token0,
          field: 'id_document',
          filename: 'passport.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 204800,
        })).content[0]!.text
      );
      const uploadId1 = upload1Result.uploadId;

      // Second upload (uses token1 → token2).
      const upload2Result = JSON.parse(
        (await call(server, 'document_submission_requestUpload', {
          resumeToken: upload1Result.resumeToken,
          field: 'proof_of_address',
          filename: 'utility-bill.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 153600,
        })).content[0]!.text
      );
      const uploadId2 = upload2Result.uploadId;

      expect(uploadId1).not.toBe(uploadId2);

      const uploadPath1 = await storage.getUploadPath(uploadId1);
      const uploadPath2 = await storage.getUploadPath(uploadId2);
      if (uploadPath1) {
        await fs.writeFile(uploadPath1, Buffer.from('Passport image'));
        await storage.markUploadCompleted(uploadId1, 14);
      }
      if (uploadPath2) {
        await fs.writeFile(uploadPath2, Buffer.from('Utility bill PDF'));
        await storage.markUploadCompleted(uploadId2, 16);
      }

      // Confirm first upload with the latest token (token2 → token3).
      const confirm1Result = JSON.parse(
        (await call(server, 'document_submission_confirmUpload', {
          resumeToken: upload2Result.resumeToken,
          uploadId: uploadId1,
        })).content[0]!.text
      );
      expect(confirm1Result.ok).toBe(true);
      expect(confirm1Result.field).toBe('id_document');

      // Confirm second upload with the token from the previous confirm (token3 → token4).
      const confirm2Result = JSON.parse(
        (await call(server, 'document_submission_confirmUpload', {
          resumeToken: confirm1Result.resumeToken,
          uploadId: uploadId2,
        })).content[0]!.text
      );
      expect(confirm2Result.ok).toBe(true);
      expect(confirm2Result.field).toBe('proof_of_address');
    });

    it('should return error when storage backend not configured', async () => {
      const serverWithoutStorage = new FormBridgeMCPServer({
        name: 'no-storage-server',
        version: '1.0.0',
        transport: { type: 'stdio' },
        // No storageBackend
      });
      serverWithoutStorage.registerIntake(intake);

      const createResult = JSON.parse(
        (await call(serverWithoutStorage, 'vendor_onboarding_create', { data: { company_name: 'Test', tax_id: '123456789' } })).content[0]!.text
      );

      const uploadResponse = await call(serverWithoutStorage, 'vendor_onboarding_requestUpload', {
        resumeToken: createResult.resumeToken,
        field: 'certificate',
        filename: 'cert.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      });

      const uploadResult = JSON.parse(uploadResponse.content[0]!.text);
      expect(uploadResult).toMatchObject({
        type: 'invalid',
        message: expect.stringContaining('not supported'),
        fields: expect.arrayContaining([
          expect.objectContaining({
            field: 'certificate',
            message: expect.stringContaining('not configured'),
          }),
        ]),
      });
    });

    it('should return error for invalid resume token', async () => {
      const uploadResponse = await call(server, 'vendor_onboarding_requestUpload', {
        resumeToken: 'tok_invalid',
        field: 'certificate',
        filename: 'cert.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      });

      const uploadResult = JSON.parse(uploadResponse.content[0]!.text);
      expect(uploadResult).toMatchObject({
        type: 'invalid',
        message: expect.stringContaining('Invalid resume token'),
      });
    });

    it('should return error for non-existent upload ID', async () => {
      const createResult = JSON.parse(
        (await call(server, 'vendor_onboarding_create', { data: { company_name: 'Test', tax_id: '123456789' } })).content[0]!.text
      );

      const confirmResponse = await call(server, 'vendor_onboarding_confirmUpload', {
        resumeToken: createResult.resumeToken,
        uploadId: 'upl_nonexistent',
      });

      const confirmResult = JSON.parse(confirmResponse.content[0]!.text);
      expect(confirmResult).toMatchObject({
        type: 'invalid',
        message: expect.stringContaining('not found'),
      });
    });
  });

  describe('upload tools generation', () => {
    it('should generate requestUpload and confirmUpload tools', async () => {
      const createResult = JSON.parse((await call(server, 'vendor_onboarding_create', {})).content[0]!.text);

      const uploadResponse = await call(server, 'vendor_onboarding_requestUpload', {
        resumeToken: createResult.resumeToken,
        field: 'certificate',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      });
      expect(uploadResponse).toBeDefined();
      expect(uploadResponse.content).toBeDefined();

      // confirmUpload is callable (stale token here yields an invalid-token
      // response — we only assert the tool exists and returns content).
      const confirmResponse = await call(server, 'vendor_onboarding_confirmUpload', {
        resumeToken: createResult.resumeToken,
        uploadId: 'test_id',
      });
      expect(confirmResponse).toBeDefined();
      expect(confirmResponse.content).toBeDefined();
    });
  });
});
