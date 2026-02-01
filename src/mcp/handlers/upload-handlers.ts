/**
 * MCP Upload Handlers — requestUpload and confirmUpload operations.
 */

import type { IntakeDefinition } from '../../schemas/intake-schema.js';
import type { IntakeError } from '../../types/intake-contract.js';
import type { MCPServerConfig } from '../../types/mcp-tool-definitions.js';
import { convertZodToJsonSchema } from '../../schemas/json-schema-converter.js';
import type { SubmissionStore } from '../submission-store.js';
import { lookupEntry, isError, toRecord } from '../response-builder.js';

export async function handleRequestUpload(
  intake: IntakeDefinition,
  args: Record<string, unknown>,
  store: SubmissionStore,
  storageBackend?: MCPServerConfig['storageBackend']
): Promise<Record<string, unknown>> {
  const { resumeToken, field, filename, mimeType, sizeBytes } = args as {
    resumeToken: string;
    field: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  };

  const result = lookupEntry(store, resumeToken, intake);
  if (isError(result)) return toRecord(result);
  const entry = result;

  // Validate field exists in intake schema
  const jsonSchema = convertZodToJsonSchema(intake.schema, {
    name: intake.name,
    includeSchemaProperty: false,
  });
  if (!jsonSchema.properties || !(field in jsonSchema.properties)) {
    const error: IntakeError = {
      type: 'invalid',
      message: `Field '${field}' not found in intake schema`,
      fields: [{ field, message: `Field '${field}' does not exist in the intake definition`, type: 'invalid' }],
      nextActions: [{ type: 'validate', description: 'Use a valid field name from the intake schema' }],
      timestamp: new Date().toISOString(),
    };
    return toRecord(error);
  }

  if (!storageBackend) {
    const error: IntakeError = {
      type: 'invalid',
      message: 'File upload not supported - storage backend not configured',
      fields: [{ field, message: 'Storage backend not configured for MCP server', type: 'invalid' }],
      nextActions: [{ type: 'validate', description: 'Configure storage backend in MCPServerConfig' }],
      timestamp: new Date().toISOString(),
    };
    return toRecord(error);
  }

  try {
    const signedUrl = await storageBackend.generateUploadUrl({
      intakeId: intake.id,
      submissionId: entry.submissionId,
      fieldPath: field,
      filename,
      mimeType,
      constraints: { maxSize: sizeBytes, allowedTypes: [mimeType], maxCount: 1 },
    });

    if (!entry.uploads) entry.uploads = {};
    entry.uploads[signedUrl.uploadId] = {
      uploadId: signedUrl.uploadId,
      field,
      filename,
      mimeType,
      sizeBytes,
      status: 'pending',
      url: signedUrl.url,
    };
    store.update(resumeToken, { uploads: entry.uploads });

    const expiresInMs = new Date(signedUrl.expiresAt).getTime() - Date.now();
    return {
      ok: true,
      uploadId: signedUrl.uploadId,
      method: signedUrl.method,
      url: signedUrl.url,
      expiresInMs: Math.max(0, expiresInMs),
      constraints: { maxBytes: sizeBytes, accept: [mimeType] },
    };
  } catch (error) {
    const err: IntakeError = {
      type: 'invalid',
      message: 'Failed to generate upload URL',
      fields: [{ field, message: error instanceof Error ? error.message : 'Unknown error', type: 'invalid' }],
      nextActions: [{ type: 'validate', description: 'Try again or contact support' }],
      timestamp: new Date().toISOString(),
    };
    return toRecord(err);
  }
}

export async function handleConfirmUpload(
  intake: IntakeDefinition,
  args: Record<string, unknown>,
  store: SubmissionStore,
  storageBackend?: MCPServerConfig['storageBackend']
): Promise<Record<string, unknown>> {
  const { resumeToken, uploadId } = args as { resumeToken: string; uploadId: string };

  const result = lookupEntry(store, resumeToken, intake);
  if (isError(result)) return toRecord(result);
  const entry = result;

  if (!storageBackend) {
    const error: IntakeError = {
      type: 'invalid',
      message: 'File upload not supported - storage backend not configured',
      fields: [{ field: 'uploadId', message: 'Storage backend not configured for MCP server', type: 'invalid' }],
      nextActions: [{ type: 'validate', description: 'Configure storage backend in MCPServerConfig' }],
      timestamp: new Date().toISOString(),
    };
    return toRecord(error);
  }

  if (!entry.uploads || !entry.uploads[uploadId]) {
    const error: IntakeError = {
      type: 'invalid',
      message: 'Upload not found',
      fields: [{ field: 'uploadId', message: `Upload ${uploadId} not found for this submission`, type: 'invalid' }],
      nextActions: [{ type: 'validate', description: 'Request a new upload' }],
      timestamp: new Date().toISOString(),
    };
    return toRecord(error);
  }

  try {
    const uploadStatus = await storageBackend.verifyUpload(uploadId);
    const upload = entry.uploads[uploadId];

    if (uploadStatus.status === 'completed' && uploadStatus.file) {
      upload.status = 'completed';
      upload.uploadedAt = new Date();
      const downloadUrl = await storageBackend.generateDownloadUrl(uploadId);
      if (downloadUrl) upload.downloadUrl = downloadUrl;
    } else if (uploadStatus.status === 'failed') {
      upload.status = 'failed';
      upload.error = uploadStatus.error;
    }

    store.update(resumeToken, { uploads: entry.uploads });

    return {
      ok: true,
      submissionId: entry.submissionId,
      uploadId,
      field: upload.field,
      status: upload.status,
      uploadedAt: upload.uploadedAt?.toISOString(),
      downloadUrl: upload.downloadUrl,
    };
  } catch (error) {
    const err: IntakeError = {
      type: 'invalid',
      message: 'Failed to verify upload',
      fields: [{ field: 'uploadId', message: error instanceof Error ? error.message : 'Unknown error', type: 'invalid' }],
      nextActions: [{ type: 'validate', description: 'Try again or request a new upload' }],
      timestamp: new Date().toISOString(),
    };
    return toRecord(err);
  }
}
