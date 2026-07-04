/**
 * MCP Validate Handler — read-only validation via the shared SubmissionManager.
 * Does NOT mutate state, rotate the resume token, or record an event.
 */

import { z } from 'zod';
import type { IntakeDefinition, IntakeError } from '../../types/intake-contract.js';
import { lookupSubmission, isError, type MCPHandlerServices } from '../response-builder.js';

const ValidateArgsSchema = z.object({
  resumeToken: z.string(),
  actor: z.unknown().optional(),
});

export async function handleValidate(
  intake: IntakeDefinition,
  args: Record<string, unknown>,
  services: MCPHandlerServices
): Promise<Record<string, unknown> | IntakeError> {
  const { resumeToken } = ValidateArgsSchema.parse(args);

  const submission = await lookupSubmission(services.manager, resumeToken, intake);
  if (isError(submission)) return submission;

  const result = await services.manager.validate(submission.id);

  return {
    ok: result.ok,
    submissionId: submission.id,
    // Read-only: report the CURRENT state and the SAME resume token unchanged.
    state: submission.state,
    resumeToken,
    missingFields: result.missingFields,
    errors: result.errors,
    message: result.ok
      ? 'Submission is valid and ready to submit'
      : 'Submission is not yet valid',
  };
}
