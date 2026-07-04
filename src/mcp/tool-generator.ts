/**
 * FormBridge MCP Tool Generator
 *
 * Generates MCP tool DEFINITIONS from IntakeDefinition schemas. Each intake
 * exposes a create/set/validate/submit/requestUpload/confirmUpload surface plus
 * get/handoff/finalize tools. The definitions carry an optional `actor` on
 * every mutating tool so callers can attribute writes.
 *
 * NOTE: approve/reject are intentionally NOT generated here. Approval is a
 * separation-of-duties control that the unauthenticated MCP transport cannot
 * enforce (it can't establish reviewer identity), so it lives only on the
 * authenticated HTTP/dashboard path. See src/mcp/handlers/lifecycle-handlers.ts.
 *
 * The tool HANDLERS live in ./handlers/* and delegate to the shared
 * SubmissionManager; this module only produces the JSON-schema tool specs.
 */

import type { IntakeDefinition } from "../types/intake-contract.js";
import type { MCPToolDefinition } from "../types/mcp-tool-definitions.js";
import type { JsonSchema } from "../schemas/json-schema-converter.js";
import { convertZodToJsonSchema } from "../schemas/json-schema-converter.js";

// =============================================================================
// § Intake-Based Tool Generation
// =============================================================================

/**
 * Tool generation options
 */
export interface ToolGenerationOptions {
  /** Include optional fields in tool descriptions (default: true) */
  includeOptionalFields?: boolean;
  /** Include constraint details in tool descriptions (default: true) */
  includeConstraints?: boolean;
  /** Maximum number of fields to list in tool description (default: 10) */
  maxFieldsInDescription?: number;
}

/**
 * JSON-schema fragment for the optional `actor` on every mutating tool.
 * Callers may attribute the write; when omitted the server uses the default
 * system actor.
 */
const ACTOR_SCHEMA: Record<string, unknown> = {
  type: 'object',
  description: 'Actor performing this operation (defaults to the system actor)',
  properties: {
    kind: { type: 'string', enum: ['agent', 'human', 'system'], description: 'Actor kind' },
    id: { type: 'string', description: 'Unique actor identifier' },
    name: { type: 'string', description: 'Display name of the actor' },
  },
  required: ['kind', 'id'],
  additionalProperties: true,
};

/**
 * Generated tool definitions from an IntakeDefinition
 */
export interface GeneratedTools {
  /** Create tool definition */
  create: MCPToolDefinition;
  /** Set tool definition */
  set: MCPToolDefinition;
  /** Validate tool definition */
  validate: MCPToolDefinition;
  /** Submit tool definition */
  submit: MCPToolDefinition;
  /** Request upload tool definition */
  requestUpload: MCPToolDefinition;
  /** Confirm upload tool definition */
  confirmUpload: MCPToolDefinition;
  /** Get tool definition (state / fields / attribution / missing fields) */
  get: MCPToolDefinition;
  /** Handoff tool definition (agent → human resume URL) */
  handoff: MCPToolDefinition;
  /** Finalize tool definition (issue provenance receipt) */
  finalize: MCPToolDefinition;
}

/**
 * Generates MCP tool definitions from an IntakeDefinition
 *
 * Creates six tools per intake form following the Intake Contract protocol:
 * - create: Initializes a new submission session with optional initial data
 * - set: Updates field values in an existing submission session
 * - validate: Validates the current submission state without submitting
 * - submit: Finalizes and submits the intake form
 * - requestUpload: Requests a signed URL for file upload
 * - confirmUpload: Confirms completion of a file upload
 *
 * @param intake - The intake definition to generate tools from
 * @param options - Optional tool generation options
 * @returns Object containing all six generated tool definitions
 *
 * @example
 * ```typescript
 * const vendorIntake: IntakeDefinition = {
 *   id: 'vendor_onboarding',
 *   version: '1.0.0',
 *   name: 'Vendor Onboarding',
 *   schema: z.object({
 *     legal_name: z.string(),
 *     tax_id: z.string()
 *   }),
 *   destination: { type: 'webhook', name: 'Vendor API', config: {} }
 * };
 *
 * const tools = generateToolsFromIntake(vendorIntake);
 * // tools.create, tools.set, tools.validate, tools.submit, tools.requestUpload, tools.confirmUpload
 * ```
 */
export function generateToolsFromIntake(
  intake: IntakeDefinition,
  options: ToolGenerationOptions = {}
): GeneratedTools {
  const {
    includeOptionalFields = true,
    includeConstraints = true,
    maxFieldsInDescription = 10
  } = options;

  // Convert Zod schema to JSON Schema
  const jsonSchema = convertZodToJsonSchema(intake.schema as import("zod").ZodType<unknown>, {
    name: intake.name,
    description: intake.description,
    includeSchemaProperty: false
  });

  // Extract field information
  const fieldDescriptions = extractFieldDescriptions(jsonSchema);
  const requiredFields = jsonSchema.required || [];
  const allFields = Object.keys(jsonSchema.properties || {});

  // Generate tool name prefix
  const toolPrefix = intake.id;

  // Create tool definitions
  const create = generateCreateTool(
    toolPrefix,
    intake.name,
    intake.description,
    jsonSchema,
    fieldDescriptions,
    requiredFields,
    allFields,
    { includeOptionalFields, includeConstraints, maxFieldsInDescription }
  );

  const set = generateSetTool(
    toolPrefix,
    intake.name,
    intake.description,
    jsonSchema,
    fieldDescriptions,
    allFields,
    { includeOptionalFields, includeConstraints, maxFieldsInDescription }
  );

  const validate = generateValidateTool(
    toolPrefix,
    intake.name,
    intake.description
  );

  const submit = generateSubmitTool(
    toolPrefix,
    intake.name,
    intake.description,
    requiredFields
  );

  const requestUpload = generateRequestUploadTool(
    toolPrefix,
    intake.name,
    intake.description
  );

  const confirmUpload = generateConfirmUploadTool(
    toolPrefix,
    intake.name,
    intake.description
  );

  const get = generateGetTool(toolPrefix, intake.name, intake.description);
  const handoff = generateHandoffTool(toolPrefix, intake.name, intake.description);
  const finalize = generateFinalizeTool(toolPrefix, intake.name, intake.description);

  const tools: GeneratedTools = {
    create,
    set,
    validate,
    submit,
    requestUpload,
    confirmUpload,
    get,
    handoff,
    finalize,
  };

  // NOTE: approve/reject are NOT generated for gated intakes over MCP. Approval
  // is a reviewer-only action; the unauthenticated MCP transport cannot enforce
  // that separation of duties (the submitting agent holds the resume token and
  // could self-approve), so approval is exposed only on the authenticated HTTP
  // path. The gate still applies — a gated submit returns needs_review, and a
  // human approves via HTTP/dashboard.
  return tools;
}

/**
 * Generates the create tool definition
 *
 * The create tool initializes a new submission session. It accepts optional
 * initial data for any fields in the intake schema.
 */
function generateCreateTool(
  toolPrefix: string,
  intakeName: string,
  intakeDescription: string | undefined,
  jsonSchema: JsonSchema,
  fieldDescriptions: Record<string, string>,
  requiredFields: string[],
  allFields: string[],
  options: Required<ToolGenerationOptions>
): MCPToolDefinition {
  const toolName = `${toolPrefix}_create`;
  const description = generateToolDescription(
    'create',
    intakeName,
    intakeDescription,
    fieldDescriptions,
    requiredFields,
    allFields,
    options
  );

  // Create input schema - all fields are optional for initial creation
  const inputSchema: MCPToolDefinition['inputSchema'] = {
    type: 'object',
    properties: {
      data: {
        type: 'object',
        description: 'Initial submission data (all fields optional)',
        properties: jsonSchema.properties || {},
        additionalProperties: false
      },
      idempotencyKey: {
        type: 'string',
        description: 'Optional idempotency key for safe retries'
      },
      actor: ACTOR_SCHEMA
    },
    additionalProperties: false
  };

  return {
    name: toolName,
    description,
    inputSchema
  };
}

/**
 * Generates the set tool definition
 *
 * The set tool updates field values in an existing submission session.
 * It requires a resumeToken and accepts partial data updates.
 */
function generateSetTool(
  toolPrefix: string,
  intakeName: string,
  intakeDescription: string | undefined,
  jsonSchema: JsonSchema,
  fieldDescriptions: Record<string, string>,
  allFields: string[],
  options: Required<ToolGenerationOptions>
): MCPToolDefinition {
  const toolName = `${toolPrefix}_set`;
  const description = generateToolDescription(
    'set',
    intakeName,
    intakeDescription,
    fieldDescriptions,
    [],
    allFields,
    options
  );

  // Create input schema - requires resumeToken, data is optional
  const inputSchema: MCPToolDefinition['inputSchema'] = {
    type: 'object',
    properties: {
      resumeToken: {
        type: 'string',
        description: 'Resume token from previous create or set call'
      },
      data: {
        type: 'object',
        description: 'Field values to set or update',
        properties: jsonSchema.properties || {},
        additionalProperties: false
      },
      actor: ACTOR_SCHEMA
    },
    required: ['resumeToken', 'data'],
    additionalProperties: false
  };

  return {
    name: toolName,
    description,
    inputSchema
  };
}

/**
 * Generates the validate tool definition
 *
 * The validate tool checks the current submission state without submitting.
 * It returns validation errors following the Intake Contract error taxonomy.
 */
function generateValidateTool(
  toolPrefix: string,
  intakeName: string,
  intakeDescription: string | undefined
): MCPToolDefinition {
  const toolName = `${toolPrefix}_validate`;
  const baseDescription = intakeDescription || intakeName;
  const description = `Validate the current state of ${baseDescription} without submitting. Returns validation errors if any fields are missing or invalid, or confirms the submission is ready to submit.`;

  const inputSchema: MCPToolDefinition['inputSchema'] = {
    type: 'object',
    properties: {
      resumeToken: {
        type: 'string',
        description: 'Resume token from previous create or set call'
      },
      actor: ACTOR_SCHEMA
    },
    required: ['resumeToken'],
    additionalProperties: false
  };

  return {
    name: toolName,
    description,
    inputSchema
  };
}

/**
 * Generates the submit tool definition
 *
 * The submit tool finalizes and submits the intake form. It validates
 * all required fields and delivers the submission to the configured destination.
 */
function generateSubmitTool(
  toolPrefix: string,
  intakeName: string,
  intakeDescription: string | undefined,
  requiredFields: string[]
): MCPToolDefinition {
  const toolName = `${toolPrefix}_submit`;
  const baseDescription = intakeDescription || intakeName;
  const requiredFieldsList = requiredFields.length > 0
    ? ` Required fields: ${requiredFields.join(', ')}.`
    : '';
  const description = `Submit the completed ${baseDescription}.${requiredFieldsList} Returns success confirmation or validation errors if the submission is incomplete.`;

  const inputSchema: MCPToolDefinition['inputSchema'] = {
    type: 'object',
    properties: {
      resumeToken: {
        type: 'string',
        description: 'Resume token from previous create or set call'
      },
      actor: ACTOR_SCHEMA
    },
    required: ['resumeToken'],
    additionalProperties: false
  };

  return {
    name: toolName,
    description,
    inputSchema
  };
}

/**
 * Generates the requestUpload tool definition
 *
 * The requestUpload tool initiates a file upload by requesting a signed URL.
 * It requires a resumeToken and file metadata (field, filename, mimeType, sizeBytes).
 */
function generateRequestUploadTool(
  toolPrefix: string,
  intakeName: string,
  intakeDescription: string | undefined
): MCPToolDefinition {
  const toolName = `${toolPrefix}_requestUpload`;
  const baseDescription = intakeDescription || intakeName;
  const description = `Request a signed URL to upload a file for ${baseDescription}. Provide file metadata (field name, filename, MIME type, size) and receive a signed URL with upload constraints. Use this before uploading files to the submission.`;

  const inputSchema: MCPToolDefinition['inputSchema'] = {
    type: 'object',
    properties: {
      resumeToken: {
        type: 'string',
        description: 'Resume token from previous create or set call'
      },
      field: {
        type: 'string',
        description: 'Dot-path to the file field (e.g., "documents.w9_form")'
      },
      filename: {
        type: 'string',
        description: 'Name of the file to upload'
      },
      mimeType: {
        type: 'string',
        description: 'MIME type of the file (e.g., "application/pdf", "image/jpeg")'
      },
      sizeBytes: {
        type: 'number',
        description: 'Size of the file in bytes'
      },
      actor: ACTOR_SCHEMA
    },
    required: ['resumeToken', 'field', 'filename', 'mimeType', 'sizeBytes'],
    additionalProperties: false
  };

  return {
    name: toolName,
    description,
    inputSchema
  };
}

/**
 * Generates the confirmUpload tool definition
 *
 * The confirmUpload tool confirms completion of a file upload.
 * It requires a resumeToken and the uploadId returned from requestUpload.
 */
function generateConfirmUploadTool(
  toolPrefix: string,
  intakeName: string,
  intakeDescription: string | undefined
): MCPToolDefinition {
  const toolName = `${toolPrefix}_confirmUpload`;
  const baseDescription = intakeDescription || intakeName;
  const description = `Confirm completion of a file upload for ${baseDescription}. Call this after successfully uploading a file to the signed URL received from requestUpload. The system will verify the upload and update the submission status.`;

  const inputSchema: MCPToolDefinition['inputSchema'] = {
    type: 'object',
    properties: {
      resumeToken: {
        type: 'string',
        description: 'Resume token from previous create or set call'
      },
      uploadId: {
        type: 'string',
        description: 'Upload ID returned from requestUpload'
      },
      actor: ACTOR_SCHEMA
    },
    required: ['resumeToken', 'uploadId'],
    additionalProperties: false
  };

  return {
    name: toolName,
    description,
    inputSchema
  };
}

/**
 * Shared input schema: only a resume token (+ optional actor).
 */
function resumeTokenInputSchema(): MCPToolDefinition['inputSchema'] {
  return {
    type: 'object',
    properties: {
      resumeToken: {
        type: 'string',
        description: 'Resume token from a previous create or set call'
      },
      actor: ACTOR_SCHEMA
    },
    required: ['resumeToken'],
    additionalProperties: false
  };
}

/**
 * Generates the get tool definition — reads the current submission state,
 * fields, per-field attribution, and missing required fields (read-only).
 */
function generateGetTool(
  toolPrefix: string,
  intakeName: string,
  intakeDescription: string | undefined
): MCPToolDefinition {
  const baseDescription = intakeDescription || intakeName;
  return {
    name: `${toolPrefix}_get`,
    description: `Get the current state of ${baseDescription}: submission state, filled fields, per-field attribution, and any missing required fields. Read-only — does not change state or rotate the resume token.`,
    inputSchema: resumeTokenInputSchema(),
  };
}

/**
 * Generates the handoff tool definition — issues a shareable resume URL for
 * agent-to-human collaboration.
 */
function generateHandoffTool(
  toolPrefix: string,
  intakeName: string,
  intakeDescription: string | undefined
): MCPToolDefinition {
  const baseDescription = intakeDescription || intakeName;
  return {
    name: `${toolPrefix}_handoff`,
    description: `Generate a shareable resume URL to hand off ${baseDescription} from an agent to a human. Returns a URL a human can open to complete the submission.`,
    inputSchema: resumeTokenInputSchema(),
  };
}

/**
 * Generates the finalize tool definition — transitions a submitted/approved
 * submission to finalized and issues a signed provenance receipt.
 */
function generateFinalizeTool(
  toolPrefix: string,
  intakeName: string,
  intakeDescription: string | undefined
): MCPToolDefinition {
  const baseDescription = intakeDescription || intakeName;
  return {
    name: `${toolPrefix}_finalize`,
    description: `Finalize ${baseDescription} (submitted or approved) and issue a signed provenance receipt. Terminal — the submission cannot be modified afterward.`,
    inputSchema: resumeTokenInputSchema(),
  };
}

/**
 * Generates a descriptive tool description including field information
 */
function generateToolDescription(
  operation: 'create' | 'set',
  intakeName: string,
  intakeDescription: string | undefined,
  fieldDescriptions: Record<string, string>,
  requiredFields: string[],
  allFields: string[],
  options: Required<ToolGenerationOptions>
): string {
  const baseDescription = intakeDescription || intakeName;
  const operationVerb = operation === 'create' ? 'Create' : 'Update';

  let description = `${operationVerb} a ${baseDescription} submission.`;

  // Add field information
  const fieldsToDescribe = options.includeOptionalFields
    ? allFields
    : requiredFields;

  if (fieldsToDescribe.length > 0) {
    const maxFields = Math.min(fieldsToDescribe.length, options.maxFieldsInDescription);
    const displayFields = fieldsToDescribe.slice(0, maxFields);

    description += ' Fields:';

    for (const field of displayFields) {
      const isRequired = requiredFields.includes(field);
      const fieldDesc = fieldDescriptions[field];
      const requiredLabel = isRequired ? ' (required)' : '';

      if (fieldDesc) {
        description += ` ${field}${requiredLabel} - ${fieldDesc};`;
      } else {
        description += ` ${field}${requiredLabel};`;
      }
    }

    // Add note if there are more fields
    if (fieldsToDescribe.length > maxFields) {
      const remaining = fieldsToDescribe.length - maxFields;
      description += ` and ${remaining} more field${remaining === 1 ? '' : 's'}.`;
    }
  }

  return description;
}

/**
 * Extracts field descriptions from a JSON Schema
 */
function extractFieldDescriptions(jsonSchema: JsonSchema): Record<string, string> {
  const descriptions: Record<string, string> = {};

  if (!jsonSchema.properties) {
    return descriptions;
  }

  for (const [fieldName, fieldSchema] of Object.entries(jsonSchema.properties)) {
    if (fieldSchema.description) {
      descriptions[fieldName] = fieldSchema.description;
    }
  }

  return descriptions;
}

/**
 * Tool operation types
 */
// NOTE: 'approve'/'reject' are intentionally absent — approval is not exposed
// over MCP (see generateToolsFromIntake). parseToolName therefore rejects any
// `{intakeId}_approve`/`_reject` tool name, so no dispatch path can handle them.
export type ToolOperation =
  | 'create'
  | 'set'
  | 'validate'
  | 'submit'
  | 'requestUpload'
  | 'confirmUpload'
  | 'get'
  | 'handoff'
  | 'finalize';

/**
 * Generates a tool name from intake ID and operation
 *
 * @param intakeId - The intake form identifier
 * @param operation - The tool operation type
 * @returns Formatted tool name (e.g., "vendor_onboarding_create")
 */
export function generateToolName(intakeId: string, operation: ToolOperation): string {
  return `${intakeId}_${operation}`;
}

/**
 * Parses a tool name to extract intake ID and operation
 *
 * @param toolName - The full tool name to parse
 * @returns Object containing intakeId and operation, or null if invalid
 */
const VALID_OPERATIONS = new Set<ToolOperation>([
  'create',
  'set',
  'validate',
  'submit',
  'requestUpload',
  'confirmUpload',
  'get',
  'handoff',
  'finalize',
]);

function isToolOperation(value: string): value is ToolOperation {
  return VALID_OPERATIONS.has(value as ToolOperation);
}

export function parseToolName(toolName: string): { intakeId: string; operation: ToolOperation } | null {
  const lastUnderscoreIndex = toolName.lastIndexOf('_');

  if (lastUnderscoreIndex === -1) {
    return null;
  }

  const intakeId = toolName.substring(0, lastUnderscoreIndex);
  const candidate = toolName.substring(lastUnderscoreIndex + 1);

  if (!isToolOperation(candidate)) {
    return null;
  }

  return { intakeId, operation: candidate };
}
