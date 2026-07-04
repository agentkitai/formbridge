/**
 * MCP Lifecycle Handlers — get, handoff, finalize.
 *
 * These fold the previously-orphaned handoff bridge and the finalize lifecycle
 * onto the shared managers so the MCP transport exposes the audited lifecycle,
 * not a data-only subset.
 *
 * NOTE: approve/reject are deliberately NOT exposed over MCP. Approval is a
 * separation-of-duties control — a reviewer, not the submitting agent, must
 * approve. The unauthenticated stdio MCP transport cannot establish reviewer
 * identity: the ApprovalManager only checks token + state, and the submitting
 * agent still holds a valid resume token, so an MCP `_approve`/`_reject` would
 * let an agent self-approve its own gated submission. Approval is therefore a
 * human action over the authenticated HTTP/dashboard path (which enforces
 * `requirePermission('approval:approve')`). See src/mcp/server.ts.
 */

import { z } from 'zod';
import type { IntakeDefinition, IntakeError } from '../../types/intake-contract.js';
import { lookupSubmission, isError, resolveActor, type MCPHandlerServices } from '../response-builder.js';

const ResumeTokenArgs = z.object({
  resumeToken: z.string(),
  actor: z.unknown().optional(),
});

/** _get — current state, fields, field attribution, and missing fields. */
export async function handleGet(
  intake: IntakeDefinition,
  args: Record<string, unknown>,
  services: MCPHandlerServices
): Promise<Record<string, unknown> | IntakeError> {
  const { resumeToken } = ResumeTokenArgs.parse(args);

  const submission = await lookupSubmission(services.manager, resumeToken, intake);
  if (isError(submission)) return submission;

  const validation = await services.manager.validate(submission.id);

  return {
    ok: true,
    submissionId: submission.id,
    intakeId: submission.intakeId,
    state: submission.state,
    resumeToken: submission.resumeToken,
    fields: submission.fields,
    fieldAttribution: submission.fieldAttribution,
    missingFields: validation.missingFields,
  };
}

/** _handoff — generate a shareable resume URL for agent-to-human handoff. */
export async function handleHandoff(
  intake: IntakeDefinition,
  args: Record<string, unknown>,
  services: MCPHandlerServices
): Promise<Record<string, unknown> | IntakeError> {
  const { resumeToken } = ResumeTokenArgs.parse(args);
  const actor = resolveActor(args);

  const submission = await lookupSubmission(services.manager, resumeToken, intake);
  if (isError(submission)) return submission;

  const resumeUrl = await services.manager.generateHandoffUrl(submission.id, actor);

  return {
    ok: true,
    submissionId: submission.id,
    resumeUrl,
    resumeToken: submission.resumeToken,
    message:
      'Handoff URL generated successfully. Share this URL with a human to complete the submission.',
  };
}

/** _finalize — transition submitted|approved → finalized and issue a receipt. */
export async function handleFinalize(
  intake: IntakeDefinition,
  args: Record<string, unknown>,
  services: MCPHandlerServices
): Promise<Record<string, unknown> | IntakeError> {
  const { resumeToken } = ResumeTokenArgs.parse(args);
  const actor = resolveActor(args);

  const submission = await lookupSubmission(services.manager, resumeToken, intake);
  if (isError(submission)) return submission;

  const { submission: finalized, receipt } = await services.manager.finalize(submission.id, actor);

  return {
    ok: true,
    submissionId: finalized.id,
    state: finalized.state,
    resumeToken: finalized.resumeToken,
    receipt,
  };
}
