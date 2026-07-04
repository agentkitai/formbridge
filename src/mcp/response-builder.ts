/**
 * MCP Response Builder — factory functions and shared context for the MCP
 * handlers. Resolution is done against the shared SubmissionManager (token →
 * submission, intake-id match) rather than a parallel MCP-only store.
 */

import type { Actor, IntakeError, IntakeErrorFlat } from '../types/intake-contract.js';
import type { IntakeDefinition as ContractIntakeDefinition } from '../types/intake-contract.js';
import type { Submission, JSONSchema } from '../submission-types.js';
import type { SubmissionManager } from '../core/submission-manager.js';
import type { Validator } from '../core/validator.js';
import type { StorageBackend } from '../storage/storage-backend.js';

/**
 * MCP tool response shape
 */
export interface MCPToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Shared services the MCP handlers delegate to. These are the SAME instances the
 * HTTP transport uses when injected, so both transports drive one audited
 * lifecycle.
 */
export interface MCPHandlerServices {
  manager: SubmissionManager;
  /**
   * Shared JSON-schema validator (same config as the HTTP route) used by the
   * create/set handlers to validate provided fields before persisting. The
   * shared SubmissionManager does NOT validate fields against the intake schema
   * (the HTTP transport validates in the route), so the MCP handlers must.
   */
  validator: Validator;
  /** Optional file-upload storage backend (signed URLs). */
  storageBackend?: StorageBackend;
}

/** The default actor used when a tool call omits `actor`. */
export const DEFAULT_MCP_ACTOR: Actor = {
  kind: 'system',
  id: 'mcp-server',
  name: 'MCP Server',
};

/** The actor kinds the lifecycle attributes writes to. */
const VALID_ACTOR_KINDS = new Set<Actor['kind']>(['agent', 'human', 'system']);

/**
 * Resolve the acting actor from tool arguments, defaulting to the MCP system
 * actor when none is provided (or when the provided value is malformed). A
 * `kind` outside agent|human|system is treated as malformed — we fall back to
 * the default rather than attribute a write to an unknown actor kind.
 */
export function resolveActor(args: Record<string, unknown>): Actor {
  const candidate = args['actor'];
  if (
    candidate &&
    typeof candidate === 'object' &&
    'kind' in candidate &&
    'id' in candidate &&
    typeof (candidate as { kind: unknown }).kind === 'string' &&
    typeof (candidate as { id: unknown }).id === 'string' &&
    VALID_ACTOR_KINDS.has((candidate as { kind: Actor['kind'] }).kind)
  ) {
    return candidate as Actor;
  }
  return DEFAULT_MCP_ACTOR;
}

/**
 * Converts an IntakeError to a plain Record for use as a response object.
 */
export function toRecord(error: IntakeError): Record<string, unknown> {
  return JSON.parse(JSON.stringify(error));
}

/**
 * Build a success MCP response
 */
export function successResponse(data: unknown): MCPToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Build an error MCP response
 */
export function errorResponse(message: string, extra?: Record<string, unknown>): MCPToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...extra }) }],
    isError: true,
  };
}

/**
 * Build an IntakeError for invalid resume token
 */
export function invalidTokenError(): IntakeErrorFlat {
  return {
    type: 'invalid',
    message: 'Invalid resume token',
    fields: [{
      field: 'resumeToken',
      message: 'Resume token not found or has expired',
      type: 'invalid',
    }],
    nextActions: [{ type: 'create', description: 'Create a new submission' }],
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build an IntakeError for intake ID mismatch
 */
export function intakeMismatchError(actualIntakeId: string, requestedIntakeId: string): IntakeErrorFlat {
  return {
    type: 'conflict',
    message: 'Resume token belongs to a different intake form',
    fields: [{
      field: 'resumeToken',
      message: `Token is for intake '${actualIntakeId}', not '${requestedIntakeId}'`,
      type: 'conflict',
    }],
    nextActions: [{ type: 'create', description: 'Create a new submission for this intake form' }],
    timestamp: new Date().toISOString(),
  };
}

/**
 * Resolve a submission by resume token via the shared manager, enforcing that
 * the token belongs to the requested intake. Returns the Submission or a flat
 * IntakeError describing the lookup failure.
 */
export async function lookupSubmission(
  manager: SubmissionManager,
  resumeToken: string,
  intake: ContractIntakeDefinition
): Promise<Submission | IntakeErrorFlat> {
  const submission = await manager.getSubmissionByResumeToken(resumeToken);
  if (!submission) {
    return invalidTokenError();
  }
  if (submission.intakeId !== intake.id) {
    return intakeMismatchError(submission.intakeId, intake.id);
  }
  return submission;
}

/**
 * Type guard to distinguish a lookup failure (flat IntakeError) from a
 * resolved Submission. A Submission never carries a top-level `type` field.
 */
export function isError(result: Submission | IntakeErrorFlat): result is IntakeErrorFlat {
  // A Submission never carries a top-level `type`; a flat IntakeError always does.
  return 'type' in result && 'fields' in result;
}

/** Type guard: a JSON schema object that carries a `properties` map. */
function isSchemaWithProperties(schema: unknown): schema is JSONSchema {
  return (
    schema != null &&
    typeof schema === 'object' &&
    'properties' in schema &&
    (schema as { properties?: unknown }).properties != null &&
    typeof (schema as { properties?: unknown }).properties === 'object'
  );
}

/**
 * Partial schema validation mirroring the HTTP route (app.ts POST/PATCH): build
 * a schema from ONLY the provided fields' property definitions and validate
 * against it — no required-completeness check, so a partial `set` is fine but a
 * badly-typed / malformed value is rejected. Returns a flat IntakeError on
 * failure, or null when the fields are valid.
 *
 * This restores the field-level validation the pre-refactor MCP set/create
 * handlers performed. The shared SubmissionManager.setFields/createSubmission do
 * NOT validate against the intake schema (HTTP validates in the route before
 * calling them), so without this the MCP transport would silently accept data
 * the HTTP transport rejects.
 */
export function validatePartialFields(
  validator: Validator,
  intakeSchema: unknown,
  fields: Record<string, unknown>
): IntakeErrorFlat | null {
  if (!isSchemaWithProperties(intakeSchema)) return null;
  const partialSchema: JSONSchema = { type: 'object', properties: {} };
  for (const fieldName of Object.keys(fields)) {
    const prop = intakeSchema.properties?.[fieldName];
    if (prop) partialSchema.properties![fieldName] = prop;
  }
  const result = validator.validate(fields, partialSchema);
  if (result.valid) return null;
  return {
    type: 'invalid',
    message: 'Field validation failed',
    fields: result.errors,
    nextActions: result.nextActions,
    timestamp: new Date().toISOString(),
  };
}
