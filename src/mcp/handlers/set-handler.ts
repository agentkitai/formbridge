/**
 * MCP Set Handler — updates field values in a submission.
 */

import { z } from 'zod';
import type { IntakeDefinition } from '../../schemas/intake-schema.js';
import type { SubmissionResponse } from '../../types/intake-contract.js';
import { SubmissionState } from '../../types/intake-contract.js';
import { validatePartialSubmission } from '../../validation/validator.js';
import { mapToIntakeError } from '../../validation/error-mapper.js';
import type { SubmissionStore } from '../submission-store.js';
import { lookupEntry, isError } from '../response-builder.js';
import { SubmissionId } from '../../types/branded.js';

const SetArgsSchema = z.object({
  resumeToken: z.string(),
  data: z.record(z.unknown()),
});

export async function handleSet(
  intake: IntakeDefinition,
  args: Record<string, unknown>,
  store: SubmissionStore
): Promise<SubmissionResponse> {
  const { resumeToken, data } = SetArgsSchema.parse(args);

  const result = lookupEntry(store, resumeToken, intake);
  if (isError(result)) return result;
  const entry = result;

  // Merge new data with existing data
  const mergedData = { ...entry.data, ...data };

  // Validate merged data (partial validation)
  const validationResult = validatePartialSubmission(intake.schema, mergedData);
  if (!validationResult.success) {
    return mapToIntakeError(validationResult.error, { resumeToken, includeTimestamp: true });
  }

  // Update submission
  const updated = store.update(resumeToken, {
    data: mergedData,
    state: SubmissionState.VALIDATING,
  });

  if (!updated) {
    throw new Error('Failed to update submission');
  }

  return {
    state: updated.state,
    submissionId: SubmissionId(updated.submissionId),
    message: 'Submission updated successfully',
    resumeToken,
  };
}
