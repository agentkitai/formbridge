/**
 * MCP Upload Handlers — requestUpload and confirmUpload via the shared
 * SubmissionManager (which owns the file-upload negotiation lifecycle).
 */

import { z } from 'zod';
import type { IntakeDefinition, IntakeErrorFlat } from '../../types/intake-contract.js';
import {
  lookupSubmission,
  isError,
  toRecord,
  resolveActor,
  type MCPHandlerServices,
} from '../response-builder.js';

const RequestUploadArgsSchema = z.object({
  resumeToken: z.string(),
  field: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  actor: z.unknown().optional(),
});

const ConfirmUploadArgsSchema = z.object({
  resumeToken: z.string(),
  uploadId: z.string(),
  actor: z.unknown().optional(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fieldNotFoundError(field: string): IntakeErrorFlat {
  return {
    type: 'invalid',
    message: `Field '${field}' not found in intake schema`,
    fields: [{ field, message: `Field '${field}' does not exist in the intake definition`, type: 'invalid' }],
    nextActions: [{ type: 'validate', description: 'Use a valid field name from the intake schema' }],
    timestamp: new Date().toISOString(),
  };
}

function storageNotConfiguredError(field: string): IntakeErrorFlat {
  return {
    type: 'invalid',
    message: 'File upload not supported - storage backend not configured',
    fields: [{ field, message: 'Storage backend not configured for MCP server', type: 'invalid' }],
    nextActions: [{ type: 'validate', description: 'Configure a storage backend for the MCP server' }],
    timestamp: new Date().toISOString(),
  };
}

function operationFailedError(field: string, fallback: string, error: unknown): IntakeErrorFlat {
  const message = error instanceof Error ? error.message : fallback;
  return {
    type: 'invalid',
    message,
    fields: [{ field, message, type: 'invalid' }],
    nextActions: [{ type: 'validate', description: 'Try again or request a new upload' }],
    timestamp: new Date().toISOString(),
  };
}

export async function handleRequestUpload(
  intake: IntakeDefinition,
  args: Record<string, unknown>,
  services: MCPHandlerServices
): Promise<Record<string, unknown>> {
  const { resumeToken, field, filename, mimeType, sizeBytes } = RequestUploadArgsSchema.parse(args);
  const actor = resolveActor(args);

  const submission = await lookupSubmission(services.manager, resumeToken, intake);
  if (isError(submission)) return toRecord(submission);

  // Validate the field exists in the intake's (JSON) schema.
  const schema = intake.schema;
  const properties = isRecord(schema) && isRecord(schema['properties']) ? schema['properties'] : undefined;
  if (!properties || !(field in properties)) {
    return toRecord(fieldNotFoundError(field));
  }

  if (!services.storageBackend) {
    return toRecord(storageNotConfiguredError(field));
  }

  try {
    const result = await services.manager.requestUpload(
      { submissionId: submission.id, resumeToken, field, filename, mimeType, sizeBytes, actor },
      intake
    );
    // requestUpload rotates the resume token — surface the new one so the caller
    // can chain confirmUpload.
    const updated = await services.manager.getSubmission(submission.id);
    return { ...result, resumeToken: updated?.resumeToken };
  } catch (error) {
    return toRecord(operationFailedError(field, 'Failed to generate upload URL', error));
  }
}

export async function handleConfirmUpload(
  intake: IntakeDefinition,
  args: Record<string, unknown>,
  services: MCPHandlerServices
): Promise<Record<string, unknown>> {
  const { resumeToken, uploadId } = ConfirmUploadArgsSchema.parse(args);
  const actor = resolveActor(args);

  const submission = await lookupSubmission(services.manager, resumeToken, intake);
  if (isError(submission)) return toRecord(submission);

  if (!services.storageBackend) {
    return toRecord(storageNotConfiguredError('uploadId'));
  }

  try {
    const result = await services.manager.confirmUpload({
      submissionId: submission.id,
      resumeToken,
      uploadId,
      actor,
    });
    return { ...result, uploadId };
  } catch (error) {
    return toRecord(operationFailedError('uploadId', 'Failed to verify upload', error));
  }
}
