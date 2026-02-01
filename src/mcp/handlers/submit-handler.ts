/**
 * MCP Submit Handler — finalizes and submits a submission.
 */

import { z } from 'zod';
import type { IntakeDefinition } from '../../schemas/intake-schema.js';
import type { SubmissionResponse } from '../../types/intake-contract.js';
import { SubmissionState } from '../../types/intake-contract.js';
import { validateSubmission } from '../../validation/validator.js';
import { mapToIntakeError } from '../../validation/error-mapper.js';
import type { SubmissionStore } from '../submission-store.js';
import { lookupEntry, isError } from '../response-builder.js';
import { SubmissionId } from '../../types/branded.js';

const SubmitArgsSchema = z.object({
  resumeToken: z.string(),
});

export async function handleSubmit(
  intake: IntakeDefinition,
  args: Record<string, unknown>,
  store: SubmissionStore
): Promise<SubmissionResponse> {
  const { resumeToken } = SubmitArgsSchema.parse(args);

  const result = lookupEntry(store, resumeToken, intake);
  if (isError(result)) return result;
  const entry = result;

  // Validate complete submission
  const validationResult = validateSubmission<Record<string, unknown>>(intake.schema as import('zod').ZodType<Record<string, unknown>>, entry.data);
  if (!validationResult.success) {
    const error = mapToIntakeError(validationResult.error, { resumeToken, includeTimestamp: true });
    store.update(resumeToken, { state: SubmissionState.INVALID });
    return error;
  }

  // Update state to submitting, then completed
  store.update(resumeToken, { state: SubmissionState.SUBMITTING });
  store.update(resumeToken, { state: SubmissionState.COMPLETED });

  return {
    state: SubmissionState.COMPLETED,
    submissionId: SubmissionId(entry.submissionId),
    message: 'Submission completed successfully',
    data: validationResult.data,
    timestamp: new Date().toISOString(),
  };
}
