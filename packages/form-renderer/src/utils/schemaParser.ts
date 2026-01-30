/**
 * Schema parser utility for extracting field metadata from IntakeSchema
 */

import {
  IntakeSchema,
  JSONSchemaProperty,
  JSONSchemaType,
  FieldMetadata,
  FieldPath,
  UIHints,
  FieldHint,
} from '../types';

/**
 * Parse an IntakeSchema and extract all field metadata
 * @param schema - The IntakeSchema to parse
 * @param uiHints - Optional UI hints for field customization
 * @returns Array of field metadata for all fields in the schema
 */
export function parseSchema(
  schema: IntakeSchema,
  uiHints?: UIHints
): FieldMetadata[] {
  const fields: FieldMetadata[] = [];
  const requiredFields = new Set(schema.required || []);

  if (!schema.properties) {
    return fields;
  }

  // Parse top-level properties
  for (const [key, property] of Object.entries(schema.properties)) {
    const fieldMetadata = parseField(
      key,
      property,
      requiredFields.has(key),
      uiHints?.fieldHints?.[key]
    );
    fields.push(fieldMetadata);
  }

  return fields;
}

/**
 * Parse a single field and return its metadata
 * @param path - The field path (dot notation)
 * @param property - The JSON Schema property definition
 * @param required - Whether the field is required
 * @param hint - Optional UI hint for the field
 * @returns Field metadata
 */
export function parseField(
  path: FieldPath,
  property: JSONSchemaProperty,
  required: boolean = false,
  hint?: FieldHint
): FieldMetadata {
  const type = getFieldType(property);
  const label = property.title || formatLabel(path);

  return {
    path,
    type,
    label,
    description: property.description,
    required,
    schema: property,
    hint,
  };
}

/**
 * Parse nested object fields
 * @param parentPath - The parent field path
 * @param property - The object property definition
 * @param uiHints - Optional UI hints
 * @returns Array of field metadata for nested fields
 */
export function parseObjectFields(
  parentPath: FieldPath,
  property: JSONSchemaProperty,
  uiHints?: UIHints
): FieldMetadata[] {
  const fields: FieldMetadata[] = [];

  if (!property.properties) {
    return fields;
  }

  const requiredFields = new Set(property.required || []);

  for (const [key, childProperty] of Object.entries(property.properties)) {
    const childPath = `${parentPath}.${key}`;
    const fieldMetadata = parseField(
      childPath,
      childProperty,
      requiredFields.has(key),
      uiHints?.fieldHints?.[childPath]
    );
    fields.push(fieldMetadata);
  }

  return fields;
}

/**
 * Get the primary type from a JSON Schema property
 * Handles type arrays by returning the first non-null type
 * @param property - The JSON Schema property
 * @returns The field type
 */
export function getFieldType(
  property: JSONSchemaProperty
): JSONSchemaType | JSONSchemaType[] {
  if (!property.type) {
    // If no type is specified, infer from other properties
    if (property.properties) return 'object';
    if (property.items) return 'array';
    if (property.enum) return 'string'; // Default for enums
    return 'string'; // Default fallback
  }

  if (Array.isArray(property.type)) {
    return property.type;
  }

  return property.type;
}

/**
 * Get the primary non-null type from a type array
 * @param type - The JSON Schema type (can be array or single type)
 * @returns The primary non-null type
 */
export function getPrimaryType(
  type: JSONSchemaType | JSONSchemaType[]
): JSONSchemaType {
  if (Array.isArray(type)) {
    // Find first non-null type
    const nonNullType = type.find((t) => t !== 'null');
    return nonNullType || 'string';
  }
  return type;
}

/**
 * Check if a field type allows null values
 * @param type - The JSON Schema type
 * @returns True if null is allowed
 */
export function isNullable(type: JSONSchemaType | JSONSchemaType[]): boolean {
  if (Array.isArray(type)) {
    return type.includes('null');
  }
  return false;
}

/**
 * Format a field path into a human-readable label
 * Converts camelCase/snake_case to Title Case
 * @param path - The field path
 * @returns Formatted label
 */
export function formatLabel(path: FieldPath): string {
  // Get the last segment of the path (e.g., "city" from "address.city")
  const segments = path.split('.');
  const lastSegment = segments[segments.length - 1];

  // Remove array indices (e.g., "[0]")
  const cleaned = lastSegment.replace(/\[\d+\]/g, '');

  // Convert camelCase to spaces
  const withSpaces = cleaned.replace(/([A-Z])/g, ' $1');

  // Convert snake_case to spaces
  const normalized = withSpaces.replace(/_/g, ' ');

  // Capitalize first letter of each word
  return normalized
    .trim()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Get default value for a field based on its type
 * @param property - The JSON Schema property
 * @returns Default value
 */
export function getDefaultValue(property: JSONSchemaProperty): unknown {
  // Use explicit default if provided
  if (property.default !== undefined) {
    return property.default;
  }

  // Use const if provided
  if (property.const !== undefined) {
    return property.const;
  }

  const type = getPrimaryType(getFieldType(property));

  // Return appropriate default based on type
  switch (type) {
    case 'string':
      return '';
    case 'number':
    case 'integer':
      return null;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    case 'null':
      return null;
    default:
      return null;
  }
}

/**
 * Build initial form data from a schema
 * @param schema - The IntakeSchema
 * @returns Initial form data with default values
 */
export function buildInitialData(schema: IntakeSchema): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (!schema.properties) {
    return data;
  }

  for (const [key, property] of Object.entries(schema.properties)) {
    data[key] = getDefaultValue(property);
  }

  return data;
}

/**
 * Get field value from form data using dot notation path
 * @param data - The form data
 * @param path - The field path (dot notation)
 * @returns The field value
 */
export function getFieldValue(
  data: Record<string, unknown>,
  path: FieldPath
): unknown {
  const segments = path.split('.');
  let current: any = data;

  for (const segment of segments) {
    // Handle array indices
    const arrayMatch = segment.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = current?.[key]?.[parseInt(index, 10)];
    } else {
      current = current?.[segment];
    }

    if (current === undefined) {
      return undefined;
    }
  }

  return current;
}

/**
 * Set field value in form data using dot notation path
 * @param data - The form data
 * @param path - The field path (dot notation)
 * @param value - The value to set
 * @returns New form data with updated value
 */
export function setFieldValue(
  data: Record<string, unknown>,
  path: FieldPath,
  value: unknown
): Record<string, unknown> {
  const segments = path.split('.');
  const result = { ...data };
  let current: any = result;

  // Navigate to the parent of the target field
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];

    // Handle array indices
    const arrayMatch = segment.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      if (!current[key]) {
        current[key] = [];
      }
      if (!current[key][parseInt(index, 10)]) {
        current[key][parseInt(index, 10)] = {};
      }
      current = current[key][parseInt(index, 10)];
    } else {
      if (!current[segment]) {
        current[segment] = {};
      } else {
        // Clone the nested object to maintain immutability
        current[segment] = { ...current[segment] };
      }
      current = current[segment];
    }
  }

  // Set the final value
  const lastSegment = segments[segments.length - 1];
  const arrayMatch = lastSegment.match(/^(.+)\[(\d+)\]$/);
  if (arrayMatch) {
    const [, key, index] = arrayMatch;
    if (!current[key]) {
      current[key] = [];
    }
    current[key][parseInt(index, 10)] = value;
  } else {
    current[lastSegment] = value;
  }

  return result;
}

/**
 * Check if a field is an enum field
 * @param property - The JSON Schema property
 * @returns True if the field has enum values
 */
export function isEnumField(property: JSONSchemaProperty): boolean {
  return Array.isArray(property.enum) && property.enum.length > 0;
}

/**
 * Check if a field is an array field
 * @param property - The JSON Schema property
 * @returns True if the field is an array type
 */
export function isArrayField(property: JSONSchemaProperty): boolean {
  const type = getPrimaryType(getFieldType(property));
  return type === 'array';
}

/**
 * Check if a field is an object field
 * @param property - The JSON Schema property
 * @returns True if the field is an object type
 */
export function isObjectField(property: JSONSchemaProperty): boolean {
  const type = getPrimaryType(getFieldType(property));
  return type === 'object';
}

/**
 * Extract enum options from a property
 * @param property - The JSON Schema property
 * @returns Array of enum options
 */
export function getEnumOptions(property: JSONSchemaProperty): unknown[] {
  return property.enum || [];
}
