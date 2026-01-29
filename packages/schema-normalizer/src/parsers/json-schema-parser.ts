/**
 * JSON Schema Parser
 *
 * Converts JSON Schema (draft-07 and draft-2020-12) documents into IntakeSchema IR.
 * This parser supports the full JSON Schema specification except for advanced features
 * like $ref, allOf, anyOf, oneOf which are explicitly not supported in v1.
 */

import type {
  IntakeSchema,
  IntakeSchemaField,
  StringField,
  NumberField,
  IntegerField,
  BooleanField,
  NullField,
  ObjectField,
  ArrayField,
  EnumField,
  StringConstraints,
  NumberConstraints,
  ArrayConstraints,
  EnumValue,
  StringFormat,
} from '../types/intake-schema';
import { Parser, ParserOptions, ParserError } from '../types/parser';
import { createUnsupportedFeatureError } from '../types/errors';

/**
 * JSON Schema type definitions
 * Supports both draft-07 and draft-2020-12 schemas
 */
export interface JSONSchema {
  // Core properties
  type?: JSONSchemaType | JSONSchemaType[];

  // Metadata
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];

  // String constraints
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;

  // Number constraints
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  multipleOf?: number;

  // Object properties (to be supported in subtask-2-2)
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema;

  // Array properties (to be supported in subtask-2-3)
  items?: JSONSchema | JSONSchema[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // Enum (to be supported in subtask-2-3)
  enum?: (string | number | boolean | null)[];

  // Unsupported features (will throw errors in subtask-2-4)
  $ref?: string;
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;

  // Schema version
  $schema?: string;

  // Additional properties
  [key: string]: unknown;
}

/**
 * JSON Schema type keywords
 */
export type JSONSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'null'
  | 'object'
  | 'array';

/**
 * JSON Schema Parser implementation
 *
 * Parses JSON Schema documents into IntakeSchema IR, supporting:
 * - Primitive types: string, number, integer, boolean, null
 * - Basic constraints: minLength, maxLength, minimum, maximum, pattern, format
 * - Metadata: title, description, default, examples
 */
export class JSONSchemaParser implements Parser<JSONSchema> {
  private options: Required<ParserOptions>;

  constructor(options: ParserOptions = {}) {
    this.options = {
      strict: options.strict ?? true,
      includeMetadata: options.includeMetadata ?? true,
      customMetadata: options.customMetadata ?? {},
    };
  }

  /**
   * Parse a JSON Schema document into IntakeSchema IR
   */
  parse(input: JSONSchema, options?: ParserOptions): IntakeSchema {
    const mergedOptions = { ...this.options, ...options };
    this.options = mergedOptions as Required<ParserOptions>;

    // Validate input
    if (!input || typeof input !== 'object') {
      throw new ParserError('Invalid JSON Schema: expected an object', input);
    }

    // Parse the root schema field
    const schema = this.parseField(input, true);

    // Build IntakeSchema document
    const intakeSchema: IntakeSchema = {
      version: '1.0',
      schema,
    };

    // Add title and description if present
    if (input.title) {
      intakeSchema.title = input.title;
    }
    if (input.description) {
      intakeSchema.description = input.description;
    }

    // Add metadata
    if (this.options.includeMetadata) {
      intakeSchema.metadata = {
        source: 'json-schema',
        $schema: input.$schema,
        ...this.options.customMetadata,
      };
    }

    return intakeSchema;
  }

  /**
   * Check if a value can be parsed as a JSON Schema
   */
  canParse(input: unknown): input is JSONSchema {
    if (!input || typeof input !== 'object') {
      return false;
    }

    const schema = input as JSONSchema;

    // Must have at least a type or properties/items (for objects/arrays)
    if (!schema.type && !schema.properties && !schema.items && !schema.enum) {
      return false;
    }

    return true;
  }

  /**
   * Parse a JSON Schema field into an IntakeSchemaField
   */
  private parseField(
    schema: JSONSchema,
    isRequired: boolean = false
  ): IntakeSchemaField {
    // Validate that no unsupported features are present
    this.validateNoUnsupportedFeatures(schema);

    // Handle enum first (can be present alongside type)
    if (schema.enum !== undefined) {
      return this.parseEnumField(schema, isRequired);
    }

    // Handle missing type
    if (!schema.type) {
      throw new ParserError(
        'JSON Schema field must have a "type" property',
        undefined,
        { schema }
      );
    }

    // Handle array of types (union types)
    if (Array.isArray(schema.type)) {
      throw new ParserError(
        'Union types (array of types) are not supported in v1',
        undefined,
        { types: schema.type }
      );
    }

    const type = schema.type;

    // Parse based on type
    switch (type) {
      case 'string':
        return this.parseStringField(schema, isRequired);
      case 'number':
        return this.parseNumberField(schema, isRequired);
      case 'integer':
        return this.parseIntegerField(schema, isRequired);
      case 'boolean':
        return this.parseBooleanField(schema, isRequired);
      case 'null':
        return this.parseNullField(schema, isRequired);
      case 'object':
        return this.parseObjectField(schema, isRequired);
      case 'array':
        return this.parseArrayField(schema, isRequired);
      default:
        throw new ParserError(
          `Unsupported JSON Schema type: ${type}`,
          undefined,
          { type }
        );
    }
  }

  /**
   * Parse a string field
   */
  private parseStringField(
    schema: JSONSchema,
    isRequired: boolean
  ): StringField {
    const constraints: StringConstraints = {};

    // Min/max length
    if (schema.minLength !== undefined) {
      constraints.minLength = schema.minLength;
    }
    if (schema.maxLength !== undefined) {
      constraints.maxLength = schema.maxLength;
    }

    // Pattern
    if (schema.pattern !== undefined) {
      constraints.pattern = schema.pattern;
    }

    // Format
    if (schema.format !== undefined) {
      constraints.format = this.parseStringFormat(schema.format);
    }

    const field: StringField = {
      type: 'string',
      required: isRequired,
      constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
    };

    // Add metadata
    this.addFieldMetadata(field, schema);

    return field;
  }

  /**
   * Parse a number field
   */
  private parseNumberField(
    schema: JSONSchema,
    isRequired: boolean
  ): NumberField {
    const constraints: NumberConstraints = {};

    // Minimum
    if (schema.minimum !== undefined) {
      constraints.minimum = schema.minimum;
    }

    // Maximum
    if (schema.maximum !== undefined) {
      constraints.maximum = schema.maximum;
    }

    // Exclusive minimum (handle both draft-07 boolean and draft-2020-12 number)
    if (schema.exclusiveMinimum !== undefined) {
      if (typeof schema.exclusiveMinimum === 'number') {
        constraints.exclusiveMinimum = schema.exclusiveMinimum;
      } else if (schema.exclusiveMinimum === true && schema.minimum !== undefined) {
        // draft-07 style: exclusiveMinimum: true means minimum is exclusive
        constraints.exclusiveMinimum = schema.minimum;
        delete constraints.minimum;
      }
    }

    // Exclusive maximum (handle both draft-07 boolean and draft-2020-12 number)
    if (schema.exclusiveMaximum !== undefined) {
      if (typeof schema.exclusiveMaximum === 'number') {
        constraints.exclusiveMaximum = schema.exclusiveMaximum;
      } else if (schema.exclusiveMaximum === true && schema.maximum !== undefined) {
        // draft-07 style: exclusiveMaximum: true means maximum is exclusive
        constraints.exclusiveMaximum = schema.maximum;
        delete constraints.maximum;
      }
    }

    // Multiple of
    if (schema.multipleOf !== undefined) {
      constraints.multipleOf = schema.multipleOf;
    }

    const field: NumberField = {
      type: 'number',
      required: isRequired,
      constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
    };

    // Add metadata
    this.addFieldMetadata(field, schema);

    return field;
  }

  /**
   * Parse an integer field
   */
  private parseIntegerField(
    schema: JSONSchema,
    isRequired: boolean
  ): IntegerField {
    const constraints: NumberConstraints = {};

    // Minimum
    if (schema.minimum !== undefined) {
      constraints.minimum = schema.minimum;
    }

    // Maximum
    if (schema.maximum !== undefined) {
      constraints.maximum = schema.maximum;
    }

    // Exclusive minimum
    if (schema.exclusiveMinimum !== undefined) {
      if (typeof schema.exclusiveMinimum === 'number') {
        constraints.exclusiveMinimum = schema.exclusiveMinimum;
      } else if (schema.exclusiveMinimum === true && schema.minimum !== undefined) {
        constraints.exclusiveMinimum = schema.minimum;
        delete constraints.minimum;
      }
    }

    // Exclusive maximum
    if (schema.exclusiveMaximum !== undefined) {
      if (typeof schema.exclusiveMaximum === 'number') {
        constraints.exclusiveMaximum = schema.exclusiveMaximum;
      } else if (schema.exclusiveMaximum === true && schema.maximum !== undefined) {
        constraints.exclusiveMaximum = schema.maximum;
        delete constraints.maximum;
      }
    }

    // Multiple of
    if (schema.multipleOf !== undefined) {
      constraints.multipleOf = schema.multipleOf;
    }

    const field: IntegerField = {
      type: 'integer',
      required: isRequired,
      constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
    };

    // Add metadata
    this.addFieldMetadata(field, schema);

    return field;
  }

  /**
   * Parse a boolean field
   */
  private parseBooleanField(
    schema: JSONSchema,
    isRequired: boolean
  ): BooleanField {
    const field: BooleanField = {
      type: 'boolean',
      required: isRequired,
    };

    // Add metadata
    this.addFieldMetadata(field, schema);

    return field;
  }

  /**
   * Parse a null field
   */
  private parseNullField(
    schema: JSONSchema,
    isRequired: boolean
  ): NullField {
    const field: NullField = {
      type: 'null',
      required: isRequired,
    };

    // Add metadata (limited for null fields)
    if (schema.description) {
      field.description = schema.description;
    }

    return field;
  }

  /**
   * Parse an object field with nested properties
   */
  private parseObjectField(
    schema: JSONSchema,
    isRequired: boolean
  ): ObjectField {
    // Parse properties (default to empty object if not specified)
    const properties: Record<string, IntakeSchemaField> = {};
    const requiredFields = schema.required || [];

    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        // Determine if this property is required
        const isPropRequired = requiredFields.includes(propName);

        // Recursively parse nested field
        properties[propName] = this.parseField(propSchema, isPropRequired);
      }
    }

    const field: ObjectField = {
      type: 'object',
      required: isRequired,
      properties,
    };

    // Handle additionalProperties
    if (schema.additionalProperties !== undefined) {
      // Only boolean additionalProperties is supported
      // JSONSchema with object additionalProperties will be ignored for now
      if (typeof schema.additionalProperties === 'boolean') {
        field.additionalProperties = schema.additionalProperties;
      }
    }

    // Add metadata
    this.addFieldMetadata(field, schema);

    return field;
  }

  /**
   * Parse an array field with typed items
   */
  private parseArrayField(
    schema: JSONSchema,
    isRequired: boolean
  ): ArrayField {
    // Validate that items is present and is a single schema (not tuple validation)
    if (!schema.items) {
      throw new ParserError(
        'Array type must have an "items" property',
        undefined,
        { schema }
      );
    }

    // Tuple validation (array of schemas) is not supported
    if (Array.isArray(schema.items)) {
      throw new ParserError(
        'Tuple validation (items as array) is not supported in v1',
        undefined,
        { items: schema.items }
      );
    }

    // Recursively parse item schema
    const items = this.parseField(schema.items, false);

    // Parse array constraints
    const constraints: ArrayConstraints = {};

    if (schema.minItems !== undefined) {
      constraints.minItems = schema.minItems;
    }

    if (schema.maxItems !== undefined) {
      constraints.maxItems = schema.maxItems;
    }

    if (schema.uniqueItems !== undefined) {
      constraints.uniqueItems = schema.uniqueItems;
    }

    const field: ArrayField = {
      type: 'array',
      required: isRequired,
      items,
      constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
    };

    // Add metadata
    this.addFieldMetadata(field, schema);

    return field;
  }

  /**
   * Parse an enum field with allowed values
   */
  private parseEnumField(
    schema: JSONSchema,
    isRequired: boolean
  ): EnumField {
    if (!schema.enum || !Array.isArray(schema.enum) || schema.enum.length === 0) {
      throw new ParserError(
        'Enum field must have a non-empty "enum" array',
        undefined,
        { schema }
      );
    }

    // Convert enum values to EnumValue objects
    const values: EnumValue[] = schema.enum.map((value) => {
      // Validate enum value type
      if (
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean' &&
        value !== null
      ) {
        throw new ParserError(
          'Enum values must be string, number, boolean, or null',
          undefined,
          { value }
        );
      }

      // For null values, convert to string representation
      const enumValue: string | number | boolean =
        value === null ? 'null' : (value as string | number | boolean);

      // Convert boolean to string for consistency
      const finalValue: string | number =
        typeof enumValue === 'boolean' ? String(enumValue) : (enumValue as string | number);

      return {
        value: finalValue,
        // Labels could be extracted from description or x-enumNames in future
        // For now, we don't have a standard way to provide labels in JSON Schema
      };
    });

    const field: EnumField = {
      type: 'enum',
      required: isRequired,
      values,
    };

    // Add metadata
    this.addFieldMetadata(field, schema);

    return field;
  }

  /**
   * Validate that a schema does not contain unsupported features
   *
   * Throws descriptive errors for features that are not supported in FormBridge v1:
   * - $ref: Schema references
   * - allOf: Schema composition with AND logic
   * - anyOf: Schema composition with OR logic (union types)
   * - oneOf: Schema composition with XOR logic (discriminated unions)
   * - not: Schema negation
   */
  private validateNoUnsupportedFeatures(schema: JSONSchema): void {
    // Check for $ref
    if (schema.$ref !== undefined) {
      throw createUnsupportedFeatureError('$ref', { $ref: schema.$ref });
    }

    // Check for allOf
    if (schema.allOf !== undefined) {
      throw createUnsupportedFeatureError('allOf', {
        schemasCount: Array.isArray(schema.allOf) ? schema.allOf.length : 0,
      });
    }

    // Check for anyOf
    if (schema.anyOf !== undefined) {
      throw createUnsupportedFeatureError('anyOf', {
        schemasCount: Array.isArray(schema.anyOf) ? schema.anyOf.length : 0,
      });
    }

    // Check for oneOf
    if (schema.oneOf !== undefined) {
      throw createUnsupportedFeatureError('oneOf', {
        schemasCount: Array.isArray(schema.oneOf) ? schema.oneOf.length : 0,
      });
    }

    // Check for not
    if (schema.not !== undefined) {
      throw createUnsupportedFeatureError('not', { not: schema.not });
    }
  }

  /**
   * Add common field metadata (description, default, examples)
   */
  private addFieldMetadata(
    field: Exclude<IntakeSchemaField, NullField>,
    schema: JSONSchema
  ): void {
    if (schema.description !== undefined) {
      field.description = schema.description;
    }

    if (schema.default !== undefined) {
      // Type assertion needed because field types have specific default types
      // but JSON Schema default can be any value
      (field as any).default = schema.default;
    }

    if (schema.examples !== undefined && Array.isArray(schema.examples)) {
      // Type assertion needed because field types have specific example types
      (field as any).examples = schema.examples;
    }
  }

  /**
   * Parse string format from JSON Schema to IntakeSchema StringFormat
   */
  private parseStringFormat(format: string): StringFormat | undefined {
    // Map JSON Schema formats to IntakeSchema formats
    const formatMap: Record<string, StringFormat> = {
      email: 'email',
      uri: 'uri',
      url: 'url',
      uuid: 'uuid',
      date: 'date',
      'date-time': 'date-time',
      time: 'time',
      ipv4: 'ipv4',
      ipv6: 'ipv6',
      hostname: 'hostname',
      regex: 'regex',
    };

    const mappedFormat = formatMap[format];
    if (!mappedFormat && this.options.strict) {
      throw new ParserError(
        `Unsupported string format: ${format}`,
        undefined,
        { format }
      );
    }

    return mappedFormat;
  }
}

/**
 * Convenience function to parse a JSON Schema document
 */
export function parseJSONSchema(
  schema: JSONSchema,
  options?: ParserOptions
): IntakeSchema {
  const parser = new JSONSchemaParser(options);
  return parser.parse(schema, options);
}
