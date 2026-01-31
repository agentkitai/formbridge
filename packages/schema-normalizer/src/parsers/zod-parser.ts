/**
 * Zod Parser
 *
 * Converts Zod schemas into IntakeSchema IR.
 * This parser supports Zod primitive types and their refinements/validations.
 *
 * Zod is an optional peer dependency - this parser will only work if Zod is installed.
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
  EnumValue,
  StringConstraints,
  NumberConstraints,
  ArrayConstraints,
} from '../types/intake-schema';
import { type Parser, type ParserOptions, ParserError } from '../types/parser';

/**
 * Zod type imports - these are optional since Zod is a peer dependency
 */
let z: typeof import('zod');
try {
   
  z = require('zod');
} catch {
  // Zod is not installed - parser will throw error on use
}

/**
 * Type alias for Zod schema (any type)
 */
type ZodSchema = typeof z extends undefined ? never : import('zod').ZodTypeAny;

/**
 * Zod Parser implementation
 *
 * Parses Zod schemas into IntakeSchema IR, supporting:
 * - Primitive types: string, number, boolean, null
 * - Complex types: object, array, enum
 * - String constraints: min, max, email, url, uuid, datetime, regex, etc.
 * - Number constraints: min, max, int, positive, negative, multipleOf
 * - Array constraints: min, max, length
 * - Metadata: description (from .describe())
 * - Optional/nullable: .optional(), .nullable()
 */
export class ZodParser implements Parser<ZodSchema> {
  private options: Required<ParserOptions>;

  constructor(options: ParserOptions = {}) {
    this.options = {
      strict: options.strict ?? true,
      includeMetadata: options.includeMetadata ?? true,
      customMetadata: options.customMetadata ?? {},
    };
  }

  /**
   * Parse a Zod schema into IntakeSchema IR
   */
  parse(input: ZodSchema, options?: ParserOptions): IntakeSchema {
    // Check if Zod is available
    if (!z) {
      throw new ParserError(
        'Zod is not installed. Please install zod as a peer dependency: npm install zod',
        undefined
      );
    }

    const mergedOptions = { ...this.options, ...options };
    this.options = mergedOptions as Required<ParserOptions>;

    // Validate input
    if (!input || typeof input !== 'object' || !('_def' in input)) {
      throw new ParserError(
        'Invalid Zod schema: expected a ZodType instance',
        input
      );
    }

    // Parse the root schema field
    const schema = this.parseField(input);

    // Build IntakeSchema document
    const intakeSchema: IntakeSchema = {
      version: '1.0',
      schema,
    };

    // Extract description from root schema if present
    const description = this.extractDescription(input);
    if (description) {
      intakeSchema.description = description;
    }

    // Add metadata
    if (this.options.includeMetadata) {
      intakeSchema.metadata = {
        source: 'zod',
        ...this.options.customMetadata,
      };
    }

    return intakeSchema;
  }

  /**
   * Check if a value can be parsed as a Zod schema
   */
  canParse(input: unknown): input is ZodSchema {
    if (!z) {
      return false;
    }

    if (!input || typeof input !== 'object') {
      return false;
    }

    // Check if it's a Zod schema by looking for _def property
    return '_def' in input && typeof (input as ZodSchema)._def === 'object';
  }

  /**
   * Parse a Zod schema into an IntakeSchemaField
   */
  private parseField(
    schema: ZodSchema
  ): IntakeSchemaField {
    // Unwrap optional/nullable/default wrappers
    const unwrapped = this.unwrapSchema(schema);
    const isOptional = unwrapped.isOptional;
    const isNullable = unwrapped.isNullable;
    const defaultValue = unwrapped.defaultValue;
    const innerSchema = unwrapped.schema;

    // Get the Zod type name
    const typeName = (innerSchema._def as { typeName?: string }).typeName;

    // Parse based on type
    let field: IntakeSchemaField;

    switch (typeName) {
      case 'ZodString':
        field = this.parseStringField(innerSchema, !isOptional);
        break;
      case 'ZodNumber':
        field = this.parseNumberField(innerSchema, !isOptional);
        break;
      case 'ZodBoolean':
        field = this.parseBooleanField(innerSchema, !isOptional);
        break;
      case 'ZodNull':
        field = this.parseNullField(innerSchema, !isOptional);
        break;
      case 'ZodObject':
        field = this.parseObjectField(innerSchema, !isOptional);
        break;
      case 'ZodArray':
        field = this.parseArrayField(innerSchema, !isOptional);
        break;
      case 'ZodEnum':
      case 'ZodNativeEnum':
        field = this.parseEnumField(innerSchema, !isOptional);
        break;
      default:
        throw new ParserError(
          `Unsupported Zod type: ${typeName}`,
          undefined,
          { typeName }
        );
    }

    // Add metadata (description, default, examples)
    this.addFieldMetadata(field, innerSchema, defaultValue);

    // Set nullable flag
    if (isNullable) {
      field.nullable = true;
    }

    return field;
  }

  /**
   * Unwrap optional/nullable/default wrappers to get the inner schema
   */
  private unwrapSchema(schema: ZodSchema): {
    schema: ZodSchema;
    isOptional: boolean;
    isNullable: boolean;
    defaultValue?: unknown;
  } {
    let current = schema;
    let isOptional = false;
    let isNullable = false;
    let defaultValue: unknown = undefined;

    // Unwrap ZodDefault (must be done first as it's the outermost wrapper)
    if ((current._def as { typeName?: string }).typeName === 'ZodDefault') {
      const defaultValueFn = (current._def as { defaultValue?: () => unknown }).defaultValue;
      if (typeof defaultValueFn === 'function') {
        defaultValue = defaultValueFn();
      }
      current = (current._def as { innerType: ZodSchema }).innerType;
    }

    // Unwrap ZodOptional
    if ((current._def as { typeName?: string }).typeName === 'ZodOptional') {
      isOptional = true;
      current = (current._def as { innerType: ZodSchema }).innerType;
    }

    // Unwrap ZodNullable
    if ((current._def as { typeName?: string }).typeName === 'ZodNullable') {
      isNullable = true;
      current = (current._def as { innerType: ZodSchema }).innerType;
    }

    return { schema: current, isOptional, isNullable, defaultValue };
  }

  /**
   * Extract description from a Zod schema
   */
  private extractDescription(schema: ZodSchema): string | undefined {
    return (schema._def as { description?: string }).description;
  }

  /**
   * Add common field metadata (description, default, examples) to a field
   *
   * This method extracts metadata from Zod schemas and adds it to IntakeSchema fields,
   * similar to how the JSON Schema parser handles metadata extraction.
   */
  private addFieldMetadata(
    field: IntakeSchemaField,
    schema: ZodSchema,
    defaultValue?: unknown
  ): void {
    // Extract description from .describe()
    const description = this.extractDescription(schema);
    if (description !== undefined) {
      field.description = description;
    }

    // Add default value if present (from .default())
    if (defaultValue !== undefined) {
      // Type assertion needed because field types have specific default types
      // but Zod default can be any value
      (field as any).default = defaultValue;
    }

    // Extract examples if present (rare in Zod, but some libraries may add this)
    const examples = (schema._def as { examples?: unknown[] }).examples;
    if (examples !== undefined && Array.isArray(examples)) {
      // Type assertion needed because field types have specific example types
      (field as any).examples = examples;
    }
  }

  /**
   * Parse a ZodString into a StringField
   */
  private parseStringField(
    schema: ZodSchema,
    isRequired: boolean
  ): StringField {
    const constraints: StringConstraints = {};

    // Extract checks from Zod schema
    const checks = (schema._def as { checks?: Array<{ kind: string; value?: unknown }> }).checks || [];

    for (const check of checks) {
      switch (check.kind) {
        case 'min':
          constraints.minLength = check.value as number;
          break;
        case 'max':
          constraints.maxLength = check.value as number;
          break;
        case 'email':
          constraints.format = 'email';
          break;
        case 'url':
          constraints.format = 'url';
          break;
        case 'uuid':
          constraints.format = 'uuid';
          break;
        case 'datetime':
          constraints.format = 'date-time';
          break;
        case 'regex':
          // Extract the regex pattern
          const regex = (check as { regex?: RegExp }).regex;
          if (regex) {
            constraints.pattern = regex.source;
          }
          break;
        // Other Zod string checks we can map:
        case 'cuid':
        case 'cuid2':
        case 'ulid':
          // These don't have direct JSON Schema equivalents, but we could use regex
          // For now, skip them
          break;
        case 'ip':
          // Could be ipv4 or ipv6, but Zod doesn't specify which
          // We'll need the version from the check
          const version = (check as { version?: string }).version;
          if (version === 'v4') {
            constraints.format = 'ipv4';
          } else if (version === 'v6') {
            constraints.format = 'ipv6';
          }
          break;
        case 'length':
          // Exact length - set both min and max
          const length = check.value as number;
          constraints.minLength = length;
          constraints.maxLength = length;
          break;
        case 'includes':
        case 'startsWith':
        case 'endsWith':
        case 'emoji':
        case 'trim':
        case 'toLowerCase':
        case 'toUpperCase':
          // These are Zod-specific validations that don't map cleanly to IntakeSchema
          // In strict mode, we could warn about them
          if (this.options.strict) {
            // For now, just skip them - we could add warnings later
          }
          break;
      }
    }

    const field: StringField = {
      type: 'string',
      required: isRequired,
    };

    if (Object.keys(constraints).length > 0) {
      field.constraints = constraints;
    }

    return field;
  }

  /**
   * Parse a ZodNumber into a NumberField or IntegerField
   */
  private parseNumberField(
    schema: ZodSchema,
    isRequired: boolean
  ): NumberField | IntegerField {
    const constraints: NumberConstraints = {};
    let isInteger = false;

    // Extract checks from Zod schema
    const checks = (schema._def as { checks?: Array<{ kind: string; value?: unknown; inclusive?: boolean }> }).checks || [];

    for (const check of checks) {
      switch (check.kind) {
        case 'min':
          if (check.inclusive === false) {
            constraints.exclusiveMinimum = check.value as number;
          } else {
            constraints.minimum = check.value as number;
          }
          break;
        case 'max':
          if (check.inclusive === false) {
            constraints.exclusiveMaximum = check.value as number;
          } else {
            constraints.maximum = check.value as number;
          }
          break;
        case 'int':
          isInteger = true;
          break;
        case 'multipleOf':
          constraints.multipleOf = check.value as number;
          break;
        case 'finite':
          // This is a Zod-specific check that doesn't map to IntakeSchema
          // Skip it for now
          break;
      }
    }

    const field: NumberField | IntegerField = {
      type: isInteger ? 'integer' : 'number',
      required: isRequired,
    };

    if (Object.keys(constraints).length > 0) {
      field.constraints = constraints;
    }

    return field;
  }

  /**
   * Parse a ZodBoolean into a BooleanField
   */
  private parseBooleanField(
    _schema: ZodSchema,
    isRequired: boolean
  ): BooleanField {
    return {
      type: 'boolean',
      required: isRequired,
    };
  }

  /**
   * Parse a ZodNull into a NullField
   */
  private parseNullField(_schema: ZodSchema, isRequired: boolean): NullField {
    return {
      type: 'null',
      required: isRequired,
    };
  }

  /**
   * Parse a ZodObject into an ObjectField
   */
  private parseObjectField(
    schema: ZodSchema,
    isRequired: boolean
  ): ObjectField {
    // Extract the shape from the Zod object
    const shape = (schema._def as { shape?: () => Record<string, ZodSchema> }).shape;

    if (!shape || typeof shape !== 'function') {
      throw new ParserError(
        'Invalid ZodObject: shape is not a function',
        undefined,
        { schema }
      );
    }

    // Get the shape object
    const shapeObj = shape();

    // Parse each property in the shape
    const properties: Record<string, IntakeSchemaField> = {};

    for (const [propName, propSchema] of Object.entries(shapeObj)) {
      // Recursively parse the property
      // parseField will handle optional/nullable unwrapping
      properties[propName] = this.parseField(propSchema);
    }

    const field: ObjectField = {
      type: 'object',
      required: isRequired,
      properties,
    };

    return field;
  }

  /**
   * Parse a ZodArray into an ArrayField
   */
  private parseArrayField(
    schema: ZodSchema,
    isRequired: boolean
  ): ArrayField {
    // Extract the element type from the Zod array
    const type = (schema._def as { type?: ZodSchema }).type;

    if (!type) {
      throw new ParserError(
        'Invalid ZodArray: type is missing',
        undefined,
        { schema }
      );
    }

    // Recursively parse the array item type
    const items = this.parseField(type);

    // Extract constraints from checks
    const constraints: ArrayConstraints = {};
    const checks = (schema._def as { checks?: Array<{ kind: string; value?: unknown }> }).checks || [];

    for (const check of checks) {
      switch (check.kind) {
        case 'min':
          constraints.minItems = check.value as number;
          break;
        case 'max':
          constraints.maxItems = check.value as number;
          break;
        case 'length':
          // Exact length - set both min and max
          const length = check.value as number;
          constraints.minItems = length;
          constraints.maxItems = length;
          break;
      }
    }

    const field: ArrayField = {
      type: 'array',
      required: isRequired,
      items,
    };

    if (Object.keys(constraints).length > 0) {
      field.constraints = constraints;
    }

    return field;
  }

  /**
   * Parse a ZodEnum or ZodNativeEnum into an EnumField
   */
  private parseEnumField(
    schema: ZodSchema,
    isRequired: boolean
  ): EnumField {
    // Extract enum values from the Zod schema
    const def = schema._def as { values?: unknown };

    if (!def.values) {
      throw new ParserError(
        'Invalid ZodEnum: values are missing',
        undefined,
        { schema }
      );
    }

    // Handle both ZodEnum (array) and ZodNativeEnum (object)
    const enumValues: EnumValue[] = [];

    if (Array.isArray(def.values)) {
      // ZodEnum - values is an array
      for (const value of def.values) {
        if (typeof value === 'string' || typeof value === 'number') {
          enumValues.push({ value });
        } else {
          throw new ParserError(
            'Invalid enum value: must be string or number',
            undefined,
            { value }
          );
        }
      }
    } else if (typeof def.values === 'object') {
      // ZodNativeEnum - values is an object (enum object)
      for (const [key, value] of Object.entries(def.values)) {
        if (typeof value === 'string' || typeof value === 'number') {
          // For native enums, use the key as the label
          enumValues.push({
            value,
            label: key
          });
        }
      }
    } else {
      throw new ParserError(
        'Invalid ZodEnum: values must be an array or object',
        undefined,
        { values: def.values }
      );
    }

    if (enumValues.length === 0) {
      throw new ParserError(
        'Invalid ZodEnum: must have at least one value',
        undefined,
        { schema }
      );
    }

    const field: EnumField = {
      type: 'enum',
      required: isRequired,
      values: enumValues,
    };

    return field;
  }
}
