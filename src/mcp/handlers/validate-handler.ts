/**
 * MCP Validate Handler — validates a submission without submitting.
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

const ValidateArgsSchema = z.object({
  resumeToken: z.string(),
});

export async function handleValidate(
  intake: IntakeDefinition,
  args: Record<string, unknown>,
  store: SubmissionStore
): Promise<SubmissionResponse> {
  const { resumeToken } = ValidateArgsSchema.parse(args);

  const result = lookupEntry(store, resumeToken, intake);
  if (isError(result)) return result;
  const entry = result;

  // Validate complete submission
  const validationResult = validateSubmission(intake.schema, entry.data);
  if (!validationResult.success) {
    const error = mapToIntakeError(validationResult.error, { resumeToken, includeTimestamp: true });
    store.update(resumeToken, { state: SubmissionState.INVALID });
    return error;
  }

  // Update state to valid
  store.update(resumeToken, { state: SubmissionState.VALID });

  return {
    state: SubmissionState.VALID,
    submissionId: SubmissionId(entry.submissionId),
    message: 'Submission is valid and ready to submit',
    resumeToken,
  };
}
