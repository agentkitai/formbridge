/**
 * MCP Create Handler — creates a new submission via the shared SubmissionManager.
 */

import { z } from 'zod';
import type { IntakeDefinition } from '../../types/intake-contract.js';
import type { CreateSubmissionResponse, IntakeError } from '../../types/intake-contract.js';
import { resolveActor, validatePartialFields, type MCPHandlerServices } from '../response-builder.js';

const CreateArgsSchema = z.object({
  // `data` is the tool-schema name for initial fields; `initialFields` is
  // accepted as an alias for callers that use the contract vocabulary.
  data: z.record(z.unknown()).optional(),
  initialFields: z.record(z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
  actor: z.unknown().optional(),
});

export async function handleCreate(
  intake: IntakeDefinition,
  args: Record<string, unknown>,
  services: MCPHandlerServices
): Promise<CreateSubmissionResponse | IntakeError> {
  const { data, initialFields, idempotencyKey } = CreateArgsSchema.parse(args);
  const actor = resolveActor(args);
  const fields = initialFields ?? data;

  // Validate any initial fields against the intake schema before creating,
  // mirroring the HTTP POST route. createSubmission does not validate.
  if (fields && Object.keys(fields).length > 0) {
    const validationError = validatePartialFields(services.validator, intake.schema, fields);
    if (validationError) return validationError;
  }

  return services.manager.createSubmission({
    intakeId: intake.id,
    actor,
    initialFields: fields && Object.keys(fields).length > 0 ? fields : undefined,
    idempotencyKey,
  });
}
