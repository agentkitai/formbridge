/**
 * Intake Adapter — converts the Zod-schema `IntakeDefinition` used by the MCP
 * surface (src/schemas/intake-schema.ts) into the JSON-schema contract
 * `IntakeDefinition` (src/types/intake-contract.ts) that the shared
 * IntakeRegistry + SubmissionManager operate on.
 *
 * This lets MCP register intakes into the SAME registry the HTTP transport uses,
 * so a single Validator and single approval-gate source back both transports.
 */

import type { z } from 'zod';
import { convertZodToJsonSchema } from '../schemas/json-schema-converter.js';
import type {
  IntakeDefinition as ZodIntakeDefinition,
  ApprovalGate as ZodApprovalGate,
} from '../schemas/intake-schema.js';
import type {
  IntakeDefinition as ContractIntakeDefinition,
  ApprovalGate as ContractApprovalGate,
  Destination,
} from '../types/intake-contract.js';
import { IntakeId } from '../types/branded.js';

const DESTINATION_KINDS = new Set<Destination['kind']>(['webhook', 'callback', 'queue']);

function isDestinationKind(value: string): value is Destination['kind'] {
  return DESTINATION_KINDS.has(value as Destination['kind']);
}

/**
 * Map the MCP destination `{ type, name, config, webhookUrl? }` to the contract
 * destination `{ kind, url? }`. The URL is taken from `config.url` and falls
 * back to `webhookUrl`.
 */
function mapDestination(dest: ZodIntakeDefinition['destination']): Destination {
  const kind: Destination['kind'] = isDestinationKind(dest.type) ? dest.type : 'webhook';
  const configUrl =
    dest.config && typeof dest.config['url'] === 'string' ? (dest.config['url'] as string) : undefined;
  const url = configUrl ?? dest.webhookUrl;
  const result: Destination = { kind };
  if (url) result.url = url;
  return result;
}

/**
 * Map the MCP approval gates to the contract approval gates. Only the fields
 * the shared registry + manager consume are carried over: a non-empty
 * `approvalGates` array is what flips a submission into `needs_review` on submit.
 */
function mapApprovalGates(
  gates: ZodApprovalGate[] | undefined
): ContractApprovalGate[] | undefined {
  if (!gates || gates.length === 0) return undefined;
  return gates.map((g) => {
    const gate: ContractApprovalGate = {
      name: g.name,
      reviewers: g.reviewers ?? [],
    };
    if (typeof g.approvalLevel === 'number' && g.approvalLevel >= 1) {
      gate.requiredApprovals = g.approvalLevel;
    }
    return gate;
  });
}

/**
 * Convert a Zod-schema `IntakeDefinition` into the JSON-schema contract form.
 * The Zod schema is converted to JSON Schema (inline, no `$schema` marker) so
 * the shared Ajv Validator can consume it.
 */
export function toContractIntake(intake: ZodIntakeDefinition): ContractIntakeDefinition {
  const schema = convertZodToJsonSchema(intake.schema as z.ZodType<unknown>, {
    name: intake.name,
    description: intake.description,
    includeSchemaProperty: false,
  });

  const contract: ContractIntakeDefinition = {
    id: IntakeId(intake.id),
    version: intake.version,
    name: intake.name,
    schema,
    destination: mapDestination(intake.destination),
  };

  if (intake.description !== undefined) {
    contract.description = intake.description;
  }

  const gates = mapApprovalGates(intake.approvalGates);
  if (gates) {
    contract.approvalGates = gates;
  }

  return contract;
}
