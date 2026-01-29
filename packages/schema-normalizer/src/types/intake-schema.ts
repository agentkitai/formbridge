/**
 * IntakeSchema IR (Intermediate Representation)
 *
 * Unified type system for representing schemas from Zod, JSON Schema, and OpenAPI.
 * This IR preserves all metadata necessary for validation, form rendering, and MCP tool generation.
 */

/**
 * Base field type discriminator
 */
export type IntakeSchemaFieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'null'
  | 'object'
  | 'array'
  | 'enum';

/**
 * String format hints for specialized validation
 */
export type StringFormat =
  | 'email'
  | 'uri'
  | 'url'
  | 'uuid'
  | 'date'
  | 'date-time'
  | 'time'
  | 'ipv4'
  | 'ipv6'
  | 'hostname'
  | 'regex';

/**
 * String-specific constraints
 */
export interface StringConstraints {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: StringFormat;
}

/**
 * Number-specific constraints
 */
export interface NumberConstraints {
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
}

/**
 * Array-specific constraints
 */
export interface ArrayConstraints {
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
}

/**
 * Enum value with optional label for display
 */
export interface EnumValue {
  value: string | number;
  label?: string;
}

/**
 * Base field metadata common to all field types
 */
export interface BaseField {
  type: IntakeSchemaFieldType;
  description?: string;
  default?: unknown;
  examples?: unknown[];
  required: boolean;
  nullable?: boolean;
}

/**
 * String field
 */
export interface StringField extends BaseField {
  type: 'string';
  constraints?: StringConstraints;
  default?: string;
  examples?: string[];
}

/**
 * Number field (floating point)
 */
export interface NumberField extends BaseField {
  type: 'number';
  constraints?: NumberConstraints;
  default?: number;
  examples?: number[];
}

/**
 * Integer field
 */
export interface IntegerField extends BaseField {
  type: 'integer';
  constraints?: NumberConstraints;
  default?: number;
  examples?: number[];
}

/**
 * Boolean field
 */
export interface BooleanField extends BaseField {
  type: 'boolean';
  default?: boolean;
  examples?: boolean[];
}

/**
 * Null field
 */
export interface NullField extends BaseField {
  type: 'null';
  default?: null;
}

/**
 * Object field with nested properties
 */
export interface ObjectField extends BaseField {
  type: 'object';
  properties: Record<string, IntakeSchemaField>;
  additionalProperties?: boolean;
  default?: Record<string, unknown>;
}

/**
 * Array field with typed items
 */
export interface ArrayField extends BaseField {
  type: 'array';
  items: IntakeSchemaField;
  constraints?: ArrayConstraints;
  default?: unknown[];
  examples?: unknown[][];
}

/**
 * Enum field with allowed values
 */
export interface EnumField extends BaseField {
  type: 'enum';
  values: EnumValue[];
  default?: string | number;
  examples?: (string | number)[];
}

/**
 * Union of all field types
 */
export type IntakeSchemaField =
  | StringField
  | NumberField
  | IntegerField
  | BooleanField
  | NullField
  | ObjectField
  | ArrayField
  | EnumField;

/**
 * Root IntakeSchema document
 *
 * Represents a complete schema definition with metadata.
 */
export interface IntakeSchema {
  /**
   * Schema format version for future compatibility
   */
  version: '1.0';

  /**
   * Schema title/name
   */
  title?: string;

  /**
   * Schema description
   */
  description?: string;

  /**
   * Root field definition (typically an object)
   */
  schema: IntakeSchemaField;

  /**
   * Additional metadata from source format
   */
  metadata?: {
    /**
     * Source format: zod, json-schema, or openapi
     */
    source?: 'zod' | 'json-schema' | 'openapi';

    /**
     * Source-specific metadata
     */
    [key: string]: unknown;
  };
}

/**
 * Type guard: check if a field is a string field
 */
export function isStringField(field: IntakeSchemaField): field is StringField {
  return field.type === 'string';
}

/**
 * Type guard: check if a field is a number field
 */
export function isNumberField(field: IntakeSchemaField): field is NumberField {
  return field.type === 'number';
}

/**
 * Type guard: check if a field is an integer field
 */
export function isIntegerField(field: IntakeSchemaField): field is IntegerField {
  return field.type === 'integer';
}

/**
 * Type guard: check if a field is a boolean field
 */
export function isBooleanField(field: IntakeSchemaField): field is BooleanField {
  return field.type === 'boolean';
}

/**
 * Type guard: check if a field is a null field
 */
export function isNullField(field: IntakeSchemaField): field is NullField {
  return field.type === 'null';
}

/**
 * Type guard: check if a field is an object field
 */
export function isObjectField(field: IntakeSchemaField): field is ObjectField {
  return field.type === 'object';
}

/**
 * Type guard: check if a field is an array field
 */
export function isArrayField(field: IntakeSchemaField): field is ArrayField {
  return field.type === 'array';
}

/**
 * Type guard: check if a field is an enum field
 */
export function isEnumField(field: IntakeSchemaField): field is EnumField {
  return field.type === 'enum';
}
