/**
 * IntakeSchema types based on JSON Schema
 * These types represent the schema structure used by FormBridge
 */

/**
 * JSON Schema property types
 */
export type JSONSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null';

/**
 * Base JSON Schema property definition
 */
export interface JSONSchemaProperty {
  type?: JSONSchemaType | JSONSchemaType[];
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  const?: unknown;

  // Validation
  required?: boolean;

  // String validation
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: 'email' | 'uri' | 'date' | 'date-time' | 'time' | 'tel' | string;

  // Number validation
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // Array validation
  items?: JSONSchemaProperty | JSONSchemaProperty[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // Object validation
  properties?: Record<string, JSONSchemaProperty>;
  additionalProperties?: boolean | JSONSchemaProperty;
  patternProperties?: Record<string, JSONSchemaProperty>;

  // Composition
  allOf?: JSONSchemaProperty[];
  anyOf?: JSONSchemaProperty[];
  oneOf?: JSONSchemaProperty[];
  not?: JSONSchemaProperty;

  // Conditional
  if?: JSONSchemaProperty;
  then?: JSONSchemaProperty;
  else?: JSONSchemaProperty;

  // References
  $ref?: string;
  definitions?: Record<string, JSONSchemaProperty>;
  $defs?: Record<string, JSONSchemaProperty>;
}

/**
 * Full JSON Schema definition (used as IntakeSchema)
 */
export interface JSONSchema extends JSONSchemaProperty {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | JSONSchemaProperty;
}

/**
 * IntakeSchema - The schema format used by FormBridge
 * This is essentially a JSON Schema with additional metadata
 */
export interface IntakeSchema extends JSONSchema {
  /** Unique identifier for this intake form */
  intakeId: string;
}

/**
 * UI hints for field rendering
 */
export interface FieldHint {
  widget?: 'input' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date' | 'file';
  placeholder?: string;
  helpText?: string;
  order?: number;
  hidden?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  className?: string;
  inputMode?: 'text' | 'email' | 'tel' | 'url' | 'numeric' | 'decimal' | 'search';
  autoComplete?: string;
}

/**
 * Step definition for multi-step forms
 */
export interface StepDefinition {
  id: string;
  title: string;
  description?: string;
  fields: string[];
}

/**
 * Intake definition UI hints
 */
export interface UIHints {
  steps?: StepDefinition[];
  fieldHints?: Record<string, FieldHint>;
}

/**
 * Form data - values collected from the form
 */
export type FormData = Record<string, unknown>;

/**
 * Field path - dot-notation path to a field
 * Examples: "name", "address.city", "items[0].quantity"
 */
export type FieldPath = string;

/**
 * Field metadata derived from schema
 */
export interface FieldMetadata {
  path: FieldPath;
  type: JSONSchemaType | JSONSchemaType[];
  label: string;
  description?: string;
  required: boolean;
  schema: JSONSchemaProperty;
  hint?: FieldHint;
}
