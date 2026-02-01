/**
 * MCP Create Handler — creates a new submission session.
 */

import { z } from 'zod';
import type { IntakeDefinition } from '../../schemas/intake-schema.js';
import type { SubmissionResponse } from '../../types/intake-contract.js';
import { validatePartialSubmission } from '../../validation/validator.js';
import { mapToIntakeError } from '../../validation/error-mapper.js';
import type { SubmissionStore } from '../submission-store.js';
import { SubmissionId } from '../../types/branded.js';

const CreateArgsSchema = z.object({
  data: z.record(z.unknown()).optional().default({}),
  idempotencyKey: z.string().optional(),
});

export async function handleCreate(
  intake: IntakeDefinition,
  args: Record<string, unknown>,
  store: SubmissionStore
): Promise<SubmissionResponse> {
  const { data, idempotencyKey } = CreateArgsSchema.parse(args);

  // Check for existing submission with same idempotency key
  if (idempotencyKey) {
    const existing = store.getByIdempotencyKey(idempotencyKey);
    if (existing) {
      return {
        state: existing.state,
        submissionId: SubmissionId(existing.submissionId),
        message: 'Submission already exists (idempotent)',
        resumeToken: existing.resumeToken,
      };
    }
  }

  // Validate initial data if provided (partial validation)
  if (Object.keys(data).length > 0) {
    const validationResult = validatePartialSubmission(intake.schema, data);
    if (!validationResult.success) {
      return mapToIntakeError(validationResult.error, { includeTimestamp: true });
    }
  }

  // Create new submission entry
  const entry = store.create(intake.id, data, idempotencyKey);

  return {
    state: entry.state,
    submissionId: SubmissionId(entry.submissionId),
    message: 'Submission created successfully',
    resumeToken: entry.resumeToken,
  };
}
