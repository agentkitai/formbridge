/**
 * FormBridge MCP Tool Generator
 *
 * This module provides two tool registration approaches:
 * 1. MCP SDK tools (registerTools): Registers handoffToHuman, requestUpload,
 *    and confirmUpload tools using the MCP SDK server pattern.
 * 2. Intake-based tools (generateToolsFromIntake): Generates MCP tool definitions
 *    from IntakeDefinition schemas for create, set, validate, submit,
 *    requestUpload, and confirmUpload operations.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SubmissionManager } from "../core/submission-manager.js";
import type { Actor, IntakeDefinition } from "../types/intake-contract.js";
import type { MCPToolDefinition } from "../types/mcp-tool-definitions.js";
import type { JsonSchema } from "../schemas/json-schema-converter.js";
import { convertZodToJsonSchema } from "../schemas/json-schema-converter.js";
import { IntakeId } from "../types/branded.js";

// =============================================================================
// § MCP SDK Tool Registration
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
 * Register all MCP tools for FormBridge
 */
export function registerTools(
  server: McpServer,
  submissionManager: SubmissionManager
): void {
  /**
   * handoffToHuman - Generate a resume URL for agent-to-human collaboration
   *
   * Allows an agent to hand off a partially completed submission to a human
   * by generating a shareable resume URL with the resumeToken embedded.
   */
  server.tool(
    "handoffToHuman",
    "Generate a shareable resume URL for agent-to-human handoff. Returns a URL that a human can open to complete the submission.",
    {
      submissionId: z.string().describe("The submission ID to generate a handoff URL for"),
      actor: z.object({
        kind: z.enum(["agent", "human", "system"]).describe("Type of actor requesting the handoff"),
        id: z.string().describe("Unique identifier for the actor"),
        name: z.string().optional().describe("Display name of the actor"),
        metadata: z.record(z.unknown()).optional().describe("Additional actor metadata"),
      }).optional().describe("Actor requesting the handoff (defaults to system actor)"),
    },
    async ({ submissionId, actor }) => {
      try {
        // Default to system actor if not provided
        const handoffActor: Actor = actor || {
          kind: "system",
          id: "mcp-server",
          name: "MCP Server",
        };

        // Generate the handoff URL
        const resumeUrl = await submissionManager.generateHandoffUrl(
          submissionId,
          handoffActor
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: true,
                submissionId,
                resumeUrl,
                message: "Handoff URL generated successfully. Share this URL with a human to complete the submission.",
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                submissionId,
                error: errorMessage,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * requestUpload - Request a signed URL for file upload
   *
   * Initiates a file upload by requesting a signed URL from the storage backend.
   * The agent provides file metadata and receives a URL to upload the file to.
   */
  server.tool(
    "requestUpload",
    "Request a signed URL to upload a file for a submission. Provide file metadata (field name, filename, MIME type, size) and receive a signed URL with upload constraints.",
    {
      submissionId: z.string().describe("The submission ID to upload a file for"),
      resumeToken: z.string().describe("Resume token from previous create or set call"),
      field: z.string().describe("Dot-path to the file field (e.g., 'documents.w9_form')"),
      filename: z.string().describe("Name of the file to upload"),
      mimeType: z.string().describe("MIME type of the file (e.g., 'application/pdf', 'image/jpeg')"),
      sizeBytes: z.number().describe("Size of the file in bytes"),
      intakeId: z.string().describe("The intake definition ID for schema validation"),
      actor: z.object({
        kind: z.enum(["agent", "human", "system"]).describe("Type of actor"),
        id: z.string().describe("Unique identifier for the actor"),
        name: z.string().optional().describe("Display name of the actor"),
        metadata: z.record(z.unknown()).optional().describe("Additional actor metadata"),
      }).optional().describe("Actor requesting the upload (defaults to system actor)"),
    },
    async ({ submissionId, resumeToken, field, filename, mimeType, sizeBytes, intakeId, actor }) => {
      try {
        const uploadActor: Actor = actor || {
          kind: "system",
          id: "mcp-server",
          name: "MCP Server",
        };

        // Construct a minimal IntakeDefinition for validation
        const intakeDefinition: IntakeDefinition = {
          id: IntakeId(intakeId),
          version: "1.0.0",
          name: intakeId,
          schema: {},
          destination: { kind: "webhook" },
        };

        const result = await submissionManager.requestUpload(
          {
            submissionId,
            resumeToken,
            field,
            filename,
            mimeType,
            sizeBytes,
            actor: uploadActor,
          },
          intakeDefinition
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                submissionId,
                error: errorMessage,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  /**
   * confirmUpload - Confirm completion of a file upload
   *
   * After uploading a file to the signed URL, call this to verify the upload
   * and update the submission state.
   */
  server.tool(
    "confirmUpload",
    "Confirm completion of a file upload. Call this after successfully uploading a file to the signed URL received from requestUpload. The system will verify the upload and update the submission status.",
    {
      submissionId: z.string().describe("The submission ID"),
      resumeToken: z.string().describe("Resume token from previous requestUpload call"),
      uploadId: z.string().describe("Upload ID returned from requestUpload"),
      actor: z.object({
        kind: z.enum(["agent", "human", "system"]).describe("Type of actor"),
        id: z.string().describe("Unique identifier for the actor"),
        name: z.string().optional().describe("Display name of the actor"),
        metadata: z.record(z.unknown()).optional().describe("Additional actor metadata"),
      }).optional().describe("Actor confirming the upload (defaults to system actor)"),
    },
    async ({ submissionId, resumeToken, uploadId, actor }) => {
      try {
        const confirmActor: Actor = actor || {
          kind: "system",
          id: "mcp-server",
          name: "MCP Server",
        };

        const result = await submissionManager.confirmUpload({
          submissionId,
          resumeToken,
          uploadId,
          actor: confirmActor,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                submissionId,
                error: errorMessage,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/**
 * Create and configure an MCP server with FormBridge tools
 */
export function createMcpServer(
  submissionManager: SubmissionManager,
  options?: {
    name?: string;
    version?: string;
  }
): McpServer {
  const server = new McpServer({
    name: options?.name || "@formbridge/mcp-server",
    version: options?.version || "0.1.0",
  });

  registerTools(server, submissionManager);

  return server;
}

// =============================================================================
// § Intake-Based Tool Generation (legacy pattern)
// =============================================================================

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

  return { create, set, validate, submit, requestUpload, confirmUpload };
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
      }
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
      }
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
      }
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
      }
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
      }
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
      }
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
export type ToolOperation = 'create' | 'set' | 'validate' | 'submit' | 'requestUpload' | 'confirmUpload';

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
export function parseToolName(toolName: string): { intakeId: string; operation: ToolOperation } | null {
  const lastUnderscoreIndex = toolName.lastIndexOf('_');

  if (lastUnderscoreIndex === -1) {
    return null;
  }

  const intakeId = toolName.substring(0, lastUnderscoreIndex);
  const operation = toolName.substring(lastUnderscoreIndex + 1) as ToolOperation;

  // Validate operation
  const validOperations: ToolOperation[] = ['create', 'set', 'validate', 'submit', 'requestUpload', 'confirmUpload'];
  if (!validOperations.includes(operation)) {
    return null;
  }

  return { intakeId, operation };
}
