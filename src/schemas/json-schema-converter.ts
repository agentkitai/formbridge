/**
 * FormBridge JSON Schema Converter
 *
 * This module provides utilities for converting Zod schemas to JSON Schema
 * format compatible with MCP tool input schemas. The converter ensures
 * JSON Schema Draft 2020-12 compliance and preserves field descriptions
 * and constraints from the source Zod schema.
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';

/**
 * JSON Schema Draft 2020-12 compatible schema
 * Used as the input schema for MCP tools
 */
export interface JsonSchema {
  /** Schema version identifier */
  $schema?: string;
  /** Schema type (e.g., "object", "string", "number") */
  type?: string;
  /** Schema title/name */
  title?: string;
  /** Schema description */
  description?: string;
  /** Object properties */
  properties?: Record<string, JsonSchema>;
  /** Required property names */
  required?: string[];
  /** Additional properties allowed */
  additionalProperties?: boolean | JsonSchema;
  /** Array item schema */
  items?: JsonSchema | JsonSchema[];
  /** Enum values */
  enum?: unknown[];
  /** Const value */
  const?: unknown;
  /** Any of schemas */
  anyOf?: JsonSchema[];
  /** All of schemas */
  allOf?: JsonSchema[];
  /** One of schemas */
  oneOf?: JsonSchema[];
  /** Not schema */
  not?: JsonSchema;
  /** Additional JSON Schema properties */
  [key: string]: unknown;
}

/**
 * Type guard for objects that are structurally compatible with JsonSchema.
 * Used to narrow unknown values (e.g., from zodToJsonSchema) without unsafe `as` casts.
 */
function isJsonSchemaLike(value: unknown): value is JsonSchema {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Options for JSON Schema conversion
 */
export interface ConversionOptions {
  /** Schema name/title */
  name?: string;
  /** Schema description */
  description?: string;
  /** Target JSON Schema draft version */
  target?: 'jsonSchema7' | 'jsonSchema2019-09' | 'openApi3';
  /** Whether to include $schema property */
  includeSchemaProperty?: boolean;
  /** Whether to mark all properties as not required by default */
  markAllPropertiesAsOptional?: boolean;
  /** Whether to remove additional properties constraint */
  removeAdditionalProperties?: boolean;
  /** Custom error messages mapping */
  errorMessages?: Record<string, string>;
}

/**
 * Converts a Zod schema to JSON Schema format
 *
 * Uses the zod-to-json-schema library to generate a JSON Schema
 * representation that can be used as the input schema for MCP tools.
 * The generated schema is compliant with JSON Schema Draft 2020-12.
 *
 * @param zodSchema - The Zod schema to convert
 * @param options - Optional conversion options
 * @returns JSON Schema representation of the Zod schema
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { convertZodToJsonSchema } from './json-schema-converter';
 *
 * const schema = z.object({
 *   name: z.string().describe('User name'),
 *   age: z.number().min(0).describe('User age')
 * });
 *
 * const jsonSchema = convertZodToJsonSchema(schema, {
 *   name: 'UserInput',
 *   description: 'User information schema'
 * });
 * ```
 */
export function convertZodToJsonSchema(
  zodSchema: z.ZodType<unknown>,
  options: ConversionOptions = {}
): JsonSchema {
  const {
    name,
    description,
    target = 'jsonSchema2019-09',
    includeSchemaProperty = true,
    markAllPropertiesAsOptional = false,
    removeAdditionalProperties = false
  } = options;

  // Convert Zod schema to JSON Schema using zod-to-json-schema
  const rawSchema = zodToJsonSchema(zodSchema, {
    name,
    target,
    // Preserve descriptions from Zod schema
    $refStrategy: 'none',
    // Use inline schemas instead of references
    errorMessages: false
  });

  if (!isJsonSchemaLike(rawSchema)) {
    throw new Error('zodToJsonSchema produced a non-object result');
  }
  let jsonSchema: JsonSchema = rawSchema;

  // If a name was provided, zod-to-json-schema creates a $ref pattern
  // We need to resolve it to get the actual schema
  if (name && '$ref' in jsonSchema && 'definitions' in jsonSchema) {
    const ref = jsonSchema.$ref;
    const defs = jsonSchema.definitions;
    if (typeof ref === 'string' && isJsonSchemaLike(defs)) {
      const refName = ref.replace('#/definitions/', '');
      const refDef: unknown = defs[refName];
      if (isJsonSchemaLike(refDef)) {
        // Use the definition as the main schema
        jsonSchema = refDef;
        // Preserve the title from the name
        jsonSchema.title = name;
      }
    }
  }

  // Add custom title if name is provided and not already set
  if (name && !jsonSchema.title) {
    jsonSchema.title = name;
  }

  // Add top-level description if provided
  if (description) {
    jsonSchema.description = description;
  }

  // Handle $schema property for JSON Schema Draft 2020-12 compliance
  if (includeSchemaProperty) {
    jsonSchema.$schema = 'https://json-schema.org/draft/2020-12/schema';
  } else {
    delete jsonSchema.$schema;
  }

  // Mark all properties as optional if requested
  if (markAllPropertiesAsOptional && jsonSchema.required) {
    delete jsonSchema.required;
  }

  // Remove additional properties constraint if requested
  if (removeAdditionalProperties && 'additionalProperties' in jsonSchema) {
    jsonSchema.additionalProperties = true;
  }

  return jsonSchema;
}

/**
 * Type guard to check if an object is a valid JSON Schema
 */
export function isJsonSchema(obj: unknown): obj is JsonSchema {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  // Basic JSON Schema validation - must have at least a type or properties
  return (
    ('type' in obj && typeof obj.type === 'string') ||
    ('properties' in obj && typeof obj.properties === 'object') ||
    ('anyOf' in obj && Array.isArray(obj.anyOf)) ||
    ('allOf' in obj && Array.isArray(obj.allOf)) ||
    ('oneOf' in obj && Array.isArray(obj.oneOf))
  );
}

/**
 * Extracts the list of required field names from a JSON Schema
 *
 * @param schema - The JSON Schema to extract required fields from
 * @returns Array of required field names
 */
export function extractRequiredFields(schema: JsonSchema): string[] {
  return schema.required || [];
}

/**
 * Extracts property names from a JSON Schema
 *
 * @param schema - The JSON Schema to extract property names from
 * @returns Array of property names
 */
export function extractPropertyNames(schema: JsonSchema): string[] {
  if (!schema.properties) {
    return [];
  }
  return Object.keys(schema.properties);
}

/**
 * Gets the description for a specific field in a JSON Schema
 *
 * @param schema - The JSON Schema containing the field
 * @param fieldName - The name of the field to get the description for
 * @returns The field description or undefined if not found
 */
export function getFieldDescription(
  schema: JsonSchema,
  fieldName: string
): string | undefined {
  if (!schema.properties || !schema.properties[fieldName]) {
    return undefined;
  }
  return schema.properties[fieldName].description;
}

/**
 * Extracts descriptions for all fields in a JSON Schema
 *
 * @param schema - The JSON Schema to extract field descriptions from
 * @returns Record mapping field names to their descriptions
 */
export function extractFieldDescriptions(
  schema: JsonSchema
): Record<string, string> {
  if (!schema.properties) {
    return {};
  }

  const descriptions: Record<string, string> = {};
  for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
    if (fieldSchema.description) {
      descriptions[fieldName] = fieldSchema.description;
    }
  }

  return descriptions;
}

/**
 * Checks if a field is required in a JSON Schema
 *
 * @param schema - The JSON Schema to check
 * @param fieldName - The name of the field to check
 * @returns True if the field is required, false otherwise
 */
export function isFieldRequired(schema: JsonSchema, fieldName: string): boolean {
  return extractRequiredFields(schema).includes(fieldName);
}
