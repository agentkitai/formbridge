/**
 * MCP Set Handler — updates field values via the shared SubmissionManager.
 * Returns the rotated resume token from the manager result.
 */

import { z } from 'zod';
import type { IntakeDefinition } from '../../types/intake-contract.js';
import type { CreateSubmissionResponse, IntakeError } from '../../types/intake-contract.js';
import { ResumeToken } from '../../types/branded.js';
import { lookupSubmission, isError, resolveActor, validatePartialFields, type MCPHandlerServices } from '../response-builder.js';

const SetArgsSchema = z.object({
  resumeToken: z.string(),
  data: z.record(z.unknown()),
  actor: z.unknown().optional(),
});

export async function handleSet(
  intake: IntakeDefinition,
  args: Record<string, unknown>,
  services: MCPHandlerServices
): Promise<CreateSubmissionResponse | IntakeError> {
  const { resumeToken, data } = SetArgsSchema.parse(args);
  const actor = resolveActor(args);

  const submission = await lookupSubmission(services.manager, resumeToken, intake);
  if (isError(submission)) return submission;

  // Validate the incoming fields against the intake schema (partial — provided
  // fields only) BEFORE persisting, mirroring the HTTP PATCH route. setFields
  // performs no schema validation, so without this MCP would silently accept
  // malformed data the HTTP transport rejects.
  const validationError = validatePartialFields(services.validator, intake.schema, data);
  if (validationError) return validationError;

  // setFields rotates the resume token on success; the manager result carries
  // the new token which the server surfaces back to the caller.
  return services.manager.setFields({
    submissionId: submission.id,
    resumeToken: ResumeToken(resumeToken),
    actor,
    fields: data,
  });
}
