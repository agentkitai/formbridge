/**
 * JSON Schema Serializer
 *
 * Converts IntakeSchema IR back into JSON Schema (draft-2020-12) documents.
 * This serializer enables round-trip conversion: JSON Schema → IR → JSON Schema
 * while preserving all metadata, constraints, and structure.
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
  FileField,
} from '../types/intake-schema';

/**
 * JSON Schema type definitions (matching parser)
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
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // Object properties
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema;

  // Array properties
  items?: JSONSchema | JSONSchema[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // Enum
  enum?: (string | number | boolean | null)[];

  // File constraints (custom extension)
  maxSize?: number;
  allowedTypes?: string[];
  maxCount?: number;

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
 * Serializer configuration options
 */
export interface SerializerOptions {
  /**
   * Include $schema property in output
   * @default true
   */
  includeSchemaVersion?: boolean;

  /**
   * JSON Schema draft version to use
   * @default 'draft-2020-12'
   */
  schemaVersion?: 'draft-07' | 'draft-2020-12';

  /**
   * Include title and description from IntakeSchema root
   * @default true
   */
  includeMetadata?: boolean;
}

/**
 * Serializer error thrown when an IntakeSchema cannot be serialized
 */
export class SerializerError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SerializerError';

    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SerializerError);
    }
  }
}

/**
 * JSON Schema Serializer implementation
 *
 * Serializes IntakeSchema IR into JSON Schema documents (draft-2020-12 by default):
 * - All primitive types: string, number, integer, boolean, null
 * - Complex types: object, array, enum, file
 * - All constraints: string, number, array, file
 * - Metadata: title, description, default, examples
 * - Nested structures: recursive serialization
 */
export class JSONSchemaSerializer {
  private options: Required<SerializerOptions>;

  constructor(options: SerializerOptions = {}) {
    this.options = {
      includeSchemaVersion: options.includeSchemaVersion ?? true,
      schemaVersion: options.schemaVersion ?? 'draft-2020-12',
      includeMetadata: options.includeMetadata ?? true,
    };
  }

  /**
   * Serialize an IntakeSchema IR into a JSON Schema document
   */
  serialize(input: IntakeSchema, options?: SerializerOptions): JSONSchema {
    const mergedOptions = { ...this.options, ...options };
    this.options = mergedOptions as Required<SerializerOptions>;

    // Validate input
    if (!input || typeof input !== 'object') {
      throw new SerializerError('Invalid IntakeSchema: expected an object', input);
    }

    if (!input.schema) {
      throw new SerializerError(
        'Invalid IntakeSchema: missing schema field',
        undefined,
        { input }
      );
    }

    // Serialize the root schema field
    const schema = this.serializeField(input.schema);

    // Add $schema version
    if (this.options.includeSchemaVersion) {
      const schemaUrl =
        this.options.schemaVersion === 'draft-07'
          ? 'http://json-schema.org/draft-07/schema#'
          : 'https://json-schema.org/draft/2020-12/schema';
      schema.$schema = schemaUrl;
    }

    // Add title and description from root IntakeSchema
    if (this.options.includeMetadata) {
      if (input.title) {
        schema.title = input.title;
      }
      if (input.description) {
        schema.description = input.description;
      }
    }

    return schema;
  }

  /**
   * Serialize an IntakeSchemaField into a JSON Schema object
   */
  private serializeField(field: IntakeSchemaField): JSONSchema {
    // Handle each field type
    switch (field.type) {
      case 'string':
        return this.serializeStringField(field);
      case 'number':
        return this.serializeNumberField(field);
      case 'integer':
        return this.serializeIntegerField(field);
      case 'boolean':
        return this.serializeBooleanField(field);
      case 'null':
        return this.serializeNullField(field);
      case 'object':
        return this.serializeObjectField(field);
      case 'array':
        return this.serializeArrayField(field);
      case 'enum':
        return this.serializeEnumField(field);
      case 'file':
        return this.serializeFileField(field);
      default:
        throw new SerializerError(
          `Unsupported field type: ${(field as IntakeSchemaField).type}`,
          undefined,
          { field }
        );
    }
  }

  /**
   * Serialize a string field
   */
  private serializeStringField(field: StringField): JSONSchema {
    const schema: JSONSchema = {
      type: 'string',
    };

    // Add constraints
    if (field.constraints) {
      if (field.constraints.minLength !== undefined) {
        schema.minLength = field.constraints.minLength;
      }
      if (field.constraints.maxLength !== undefined) {
        schema.maxLength = field.constraints.maxLength;
      }
      if (field.constraints.pattern !== undefined) {
        schema.pattern = field.constraints.pattern;
      }
      if (field.constraints.format !== undefined) {
        schema.format = field.constraints.format;
      }
    }

    // Add metadata
    this.addFieldMetadata(schema, field);

    return schema;
  }

  /**
   * Serialize a number field
   */
  private serializeNumberField(field: NumberField): JSONSchema {
    const schema: JSONSchema = {
      type: 'number',
    };

    // Add constraints
    if (field.constraints) {
      if (field.constraints.minimum !== undefined) {
        schema.minimum = field.constraints.minimum;
      }
      if (field.constraints.maximum !== undefined) {
        schema.maximum = field.constraints.maximum;
      }
      if (field.constraints.exclusiveMinimum !== undefined) {
        schema.exclusiveMinimum = field.constraints.exclusiveMinimum;
      }
      if (field.constraints.exclusiveMaximum !== undefined) {
        schema.exclusiveMaximum = field.constraints.exclusiveMaximum;
      }
      if (field.constraints.multipleOf !== undefined) {
        schema.multipleOf = field.constraints.multipleOf;
      }
    }

    // Add metadata
    this.addFieldMetadata(schema, field);

    return schema;
  }

  /**
   * Serialize an integer field
   */
  private serializeIntegerField(field: IntegerField): JSONSchema {
    const schema: JSONSchema = {
      type: 'integer',
    };

    // Add constraints (same as number)
    if (field.constraints) {
      if (field.constraints.minimum !== undefined) {
        schema.minimum = field.constraints.minimum;
      }
      if (field.constraints.maximum !== undefined) {
        schema.maximum = field.constraints.maximum;
      }
      if (field.constraints.exclusiveMinimum !== undefined) {
        schema.exclusiveMinimum = field.constraints.exclusiveMinimum;
      }
      if (field.constraints.exclusiveMaximum !== undefined) {
        schema.exclusiveMaximum = field.constraints.exclusiveMaximum;
      }
      if (field.constraints.multipleOf !== undefined) {
        schema.multipleOf = field.constraints.multipleOf;
      }
    }

    // Add metadata
    this.addFieldMetadata(schema, field);

    return schema;
  }

  /**
   * Serialize a boolean field
   */
  private serializeBooleanField(field: BooleanField): JSONSchema {
    const schema: JSONSchema = {
      type: 'boolean',
    };

    // Add metadata
    this.addFieldMetadata(schema, field);

    return schema;
  }

  /**
   * Serialize a null field
   */
  private serializeNullField(field: NullField): JSONSchema {
    const schema: JSONSchema = {
      type: 'null',
    };

    // Null fields have limited metadata
    if (field.description) {
      schema.description = field.description;
    }

    return schema;
  }

  /**
   * Serialize an object field with nested properties
   */
  private serializeObjectField(field: ObjectField): JSONSchema {
    const schema: JSONSchema = {
      type: 'object',
      properties: {},
      required: [],
    };

    // Serialize properties
    if (field.properties) {
      for (const [propName, propField] of Object.entries(field.properties)) {
        // Recursively serialize nested field
        schema.properties![propName] = this.serializeField(propField);

        // Track required fields
        if (propField.required) {
          schema.required!.push(propName);
        }
      }
    }

    // Remove required array if empty
    if (schema.required!.length === 0) {
      delete schema.required;
    }

    // Handle additionalProperties
    if (field.additionalProperties !== undefined) {
      schema.additionalProperties = field.additionalProperties;
    }

    // Add metadata
    this.addFieldMetadata(schema, field);

    return schema;
  }

  /**
   * Serialize an array field with typed items
   */
  private serializeArrayField(field: ArrayField): JSONSchema {
    const schema: JSONSchema = {
      type: 'array',
    };

    // Recursively serialize item schema
    schema.items = this.serializeField(field.items);

    // Add constraints
    if (field.constraints) {
      if (field.constraints.minItems !== undefined) {
        schema.minItems = field.constraints.minItems;
      }
      if (field.constraints.maxItems !== undefined) {
        schema.maxItems = field.constraints.maxItems;
      }
      if (field.constraints.uniqueItems !== undefined) {
        schema.uniqueItems = field.constraints.uniqueItems;
      }
    }

    // Add metadata
    this.addFieldMetadata(schema, field);

    return schema;
  }

  /**
   * Serialize an enum field with allowed values
   */
  private serializeEnumField(field: EnumField): JSONSchema {
    const schema: JSONSchema = {};

    // Convert EnumValue objects to primitive values
    const enumValues: (string | number | boolean | null)[] = field.values.map((enumValue) => {
      const { value } = enumValue;

      // Handle special string representations
      if (value === 'null') {
        return null;
      }
      if (value === 'true') {
        return true;
      }
      if (value === 'false') {
        return false;
      }

      return value;
    });

    schema.enum = enumValues;

    // Add metadata
    this.addFieldMetadata(schema, field);

    return schema;
  }

  /**
   * Serialize a file field with upload constraints
   */
  private serializeFileField(field: FileField): JSONSchema {
    const schema: JSONSchema = {
      type: 'string',
      format: 'binary',
    };

    // Add constraints
    if (field.constraints) {
      if (field.constraints.maxSize !== undefined) {
        schema.maxSize = field.constraints.maxSize;
      }
      if (field.constraints.allowedTypes !== undefined) {
        schema.allowedTypes = field.constraints.allowedTypes;
      }
      if (field.constraints.maxCount !== undefined) {
        schema.maxCount = field.constraints.maxCount;
      }
    }

    // Add metadata
    this.addFieldMetadata(schema, field);

    return schema;
  }

  /**
   * Add common field metadata (description, default, examples)
   */
  private addFieldMetadata(
    schema: JSONSchema,
    field: Exclude<IntakeSchemaField, NullField>
  ): void {
    if (field.description !== undefined) {
      schema.description = field.description;
    }

    if (field.default !== undefined) {
      schema.default = field.default;
    }

    if (field.examples !== undefined && Array.isArray(field.examples)) {
      schema.examples = field.examples;
    }
  }
}

/**
 * Convenience function to serialize an IntakeSchema to JSON Schema
 */
export function serializeToJSONSchema(
  intakeSchema: IntakeSchema,
  options?: SerializerOptions
): JSONSchema {
  const serializer = new JSONSchemaSerializer(options);
  return serializer.serialize(intakeSchema, options);
}
