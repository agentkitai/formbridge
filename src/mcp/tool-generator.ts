/**
 * FormBridge MCP Tool Generator
 *
 * This module generates MCP tool definitions from IntakeDefinition schemas.
 * Each intake form is exposed as a set of 4 MCP tools that agents can use
 * to submit structured data through the Intake Contract protocol.
 *
 * Generated tools:
 * - {intakeId}_create: Create a new submission session
 * - {intakeId}_set: Set/update field values in an existing submission
 * - {intakeId}_validate: Validate current submission state without submitting
 * - {intakeId}_submit: Submit the intake form
 */

import { convertZodToJsonSchema, type JsonSchema } from '../schemas/json-schema-converter.js';
import type { IntakeDefinition } from '../schemas/intake-schema.js';
import type { MCPToolDefinition } from '../types/mcp-types.js';

/**
 * Tool generation options
 */
export interface ToolGenerationOptions {
  /** Whether to include optional fields in tool descriptions */
  includeOptionalFields?: boolean;
  /** Whether to include field constraints in tool descriptions */
  includeConstraints?: boolean;
  /** Maximum number of fields to list in description (defaults to 10) */
  maxFieldsInDescription?: number;
}

/**
 * Generated tools result
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
}

/**
 * Generates MCP tool definitions from an IntakeDefinition
 *
 * Creates four tools per intake form following the Intake Contract protocol:
 * - create: Initializes a new submission session with optional initial data
 * - set: Updates field values in an existing submission session
 * - validate: Validates the current submission state without submitting
 * - submit: Finalizes and submits the intake form
 *
 * @param intake - The intake definition to generate tools from
 * @param options - Optional tool generation options
 * @returns Object containing all four generated tool definitions
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
 * // tools.create, tools.set, tools.validate, tools.submit
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
  const jsonSchema = convertZodToJsonSchema(intake.schema, {
    name: intake.name,
    description: intake.description,
    includeSchemaProperty: false
  });

  // Extract field information for descriptions
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

  return { create, set, validate, submit };
}

/**
 * Generates the create tool definition
 *
 * The create tool initializes a new submission session. It accepts optional
 * initial data for any fields in the intake schema.
 *
 * @param toolPrefix - The intake ID used as tool name prefix
 * @param intakeName - Human-readable name of the intake form
 * @param intakeDescription - Optional description of the intake form
 * @param jsonSchema - JSON Schema representation of the intake schema
 * @param fieldDescriptions - Map of field names to their descriptions
 * @param requiredFields - Array of required field names
 * @param allFields - Array of all field names
 * @param options - Tool generation options
 * @returns MCP tool definition for the create operation
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
 *
 * @param toolPrefix - The intake ID used as tool name prefix
 * @param intakeName - Human-readable name of the intake form
 * @param intakeDescription - Optional description of the intake form
 * @param jsonSchema - JSON Schema representation of the intake schema
 * @param fieldDescriptions - Map of field names to their descriptions
 * @param allFields - Array of all field names
 * @param options - Tool generation options
 * @returns MCP tool definition for the set operation
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
 *
 * @param toolPrefix - The intake ID used as tool name prefix
 * @param intakeName - Human-readable name of the intake form
 * @param intakeDescription - Optional description of the intake form
 * @returns MCP tool definition for the validate operation
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
 *
 * @param toolPrefix - The intake ID used as tool name prefix
 * @param intakeName - Human-readable name of the intake form
 * @param intakeDescription - Optional description of the intake form
 * @param requiredFields - Array of required field names
 * @returns MCP tool definition for the submit operation
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
 * Generates a descriptive tool description including field information
 *
 * @param operation - The tool operation type (create or set)
 * @param intakeName - Human-readable name of the intake form
 * @param intakeDescription - Optional description of the intake form
 * @param fieldDescriptions - Map of field names to their descriptions
 * @param requiredFields - Array of required field names
 * @param allFields - Array of all field names
 * @param options - Tool generation options
 * @returns Formatted tool description string
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
 *
 * @param jsonSchema - The JSON Schema to extract descriptions from
 * @returns Map of field names to their description strings
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
export type ToolOperation = 'create' | 'set' | 'validate' | 'submit';

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
  const validOperations: ToolOperation[] = ['create', 'set', 'validate', 'submit'];
  if (!validOperations.includes(operation)) {
    return null;
  }

  return { intakeId, operation };
}
