/**
 * MCP Submit Handler — submits via the shared SubmissionManager.
 *
 * When the intake has an approval gate, the manager transitions the submission
 * to `needs_review` and returns a `needs_approval` IntakeError. That is surfaced
 * as an INFORMATIVE (non-error) response — the agent should wait for a reviewer,
 * not treat it as a transport failure.
 */

import { z } from 'zod';
import type { IntakeDefinition } from '../../types/intake-contract.js';
import type { CreateSubmissionResponse, IntakeError } from '../../types/intake-contract.js';
import { ResumeToken } from '../../types/branded.js';
import { lookupSubmission, isError, resolveActor, type MCPHandlerServices } from '../response-builder.js';

const SubmitArgsSchema = z.object({
  resumeToken: z.string(),
  idempotencyKey: z.string().optional(),
  actor: z.unknown().optional(),
});

export async function handleSubmit(
  intake: IntakeDefinition,
  args: Record<string, unknown>,
  services: MCPHandlerServices
): Promise<CreateSubmissionResponse | IntakeError> {
  const { resumeToken, idempotencyKey } = SubmitArgsSchema.parse(args);
  const actor = resolveActor(args);

  const submission = await lookupSubmission(services.manager, resumeToken, intake);
  if (isError(submission)) return submission;

  // The manager result is returned as-is: on success it is `submitted`; when a
  // gate applies it is the `needs_review` / `needs_approval` envelope. Both are
  // wrapped by successResponse (non-error) by the server.
  return services.manager.submit({
    submissionId: submission.id,
    resumeToken: ResumeToken(resumeToken),
    idempotencyKey: idempotencyKey ?? `mcp_submit_${submission.id}`,
    actor,
  });
}
