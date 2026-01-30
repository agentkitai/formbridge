/**
 * Comprehensive tests for JSON Schema Parser
 *
 * Tests cover:
 * - All primitive types with constraints
 * - Objects with nested properties
 * - Arrays with items and constraints
 * - Enums with various value types
 * - Metadata preservation (description, default, examples)
 * - Required vs optional fields
 * - Error handling for unsupported features
 * - Both draft-07 and draft-2020-12 formats
 */

import { describe, it, expect } from 'vitest';
import { JSONSchemaParser, parseJSONSchema } from '../src/parsers/json-schema-parser';
import type { JSONSchema } from '../src/parsers/json-schema-parser';
import type {
  IntakeSchema,
  StringField,
  NumberField,
  IntegerField,
  BooleanField,
  NullField,
  ObjectField,
  ArrayField,
  EnumField,
} from '../src/types/intake-schema';
import { ParserError } from '../src/types/parser';
import { UnsupportedFeatureError } from '../src/types/errors';

describe('JSONSchemaParser', () => {
  describe('Basic Instantiation', () => {
    it('should create parser with default options', () => {
      const parser = new JSONSchemaParser();
      expect(parser).toBeInstanceOf(JSONSchemaParser);
    });

    it('should create parser with custom options', () => {
      const parser = new JSONSchemaParser({
        strict: false,
        includeMetadata: false,
      });
      expect(parser).toBeInstanceOf(JSONSchemaParser);
    });
  });

  describe('canParse', () => {
    const parser = new JSONSchemaParser();

    it('should return true for valid JSON Schema with type', () => {
      expect(parser.canParse({ type: 'string' })).toBe(true);
      expect(parser.canParse({ type: 'object', properties: {} })).toBe(true);
    });

    it('should return true for valid JSON Schema with properties', () => {
      expect(parser.canParse({ properties: { foo: { type: 'string' } } })).toBe(true);
    });

    it('should return true for valid JSON Schema with items', () => {
      expect(parser.canParse({ items: { type: 'string' } })).toBe(true);
    });

    it('should return true for valid JSON Schema with enum', () => {
      expect(parser.canParse({ enum: ['a', 'b', 'c'] })).toBe(true);
    });

    it('should return false for null or undefined', () => {
      expect(parser.canParse(null)).toBe(false);
      expect(parser.canParse(undefined)).toBe(false);
    });

    it('should return false for non-object values', () => {
      expect(parser.canParse('string')).toBe(false);
      expect(parser.canParse(123)).toBe(false);
      expect(parser.canParse(true)).toBe(false);
    });

    it('should return false for empty object', () => {
      expect(parser.canParse({})).toBe(false);
    });
  });

  describe('String Fields', () => {
    const parser = new JSONSchemaParser();

    it('should parse basic string field', () => {
      const schema: JSONSchema = { type: 'string' };
      const result = parser.parse(schema);

      expect(result.version).toBe('1.0');
      expect(result.schema.type).toBe('string');
      expect((result.schema as StringField).required).toBe(true);
      expect((result.schema as StringField).constraints).toBeUndefined();
    });

    it('should parse string with minLength constraint', () => {
      const schema: JSONSchema = { type: 'string', minLength: 5 };
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.minLength).toBe(5);
    });

    it('should parse string with maxLength constraint', () => {
      const schema: JSONSchema = { type: 'string', maxLength: 100 };
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.maxLength).toBe(100);
    });

    it('should parse string with pattern constraint', () => {
      const schema: JSONSchema = { type: 'string', pattern: '^[a-z]+$' };
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.pattern).toBe('^[a-z]+$');
    });

    it('should parse string with email format', () => {
      const schema: JSONSchema = { type: 'string', format: 'email' };
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.format).toBe('email');
    });

    it('should parse string with all supported formats', () => {
      const formats = ['email', 'uri', 'url', 'uuid', 'date', 'date-time', 'time', 'ipv4', 'ipv6', 'hostname', 'regex'];

      formats.forEach((format) => {
        const schema: JSONSchema = { type: 'string', format };
        const result = parser.parse(schema);
        const field = result.schema as StringField;

        expect(field.constraints?.format).toBe(format);
      });
    });

    it('should throw error for unsupported format in strict mode', () => {
      const schema: JSONSchema = { type: 'string', format: 'unsupported-format' };

      expect(() => parser.parse(schema)).toThrow(ParserError);
      expect(() => parser.parse(schema)).toThrow('Unsupported string format');
    });

    it('should ignore unsupported format in non-strict mode', () => {
      const parser = new JSONSchemaParser({ strict: false });
      const schema: JSONSchema = { type: 'string', format: 'unsupported-format' };
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.format).toBeUndefined();
    });

    it('should parse string with all constraints combined', () => {
      const schema: JSONSchema = {
        type: 'string',
        minLength: 5,
        maxLength: 50,
        pattern: '^[a-z]+$',
        format: 'email',
      };
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.minLength).toBe(5);
      expect(field.constraints?.maxLength).toBe(50);
      expect(field.constraints?.pattern).toBe('^[a-z]+$');
      expect(field.constraints?.format).toBe('email');
    });

    it('should parse string with metadata', () => {
      const schema: JSONSchema = {
        type: 'string',
        description: 'User email address',
        default: 'user@example.com',
        examples: ['alice@example.com', 'bob@example.com'],
      };
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.description).toBe('User email address');
      expect(field.default).toBe('user@example.com');
      expect(field.examples).toEqual(['alice@example.com', 'bob@example.com']);
    });
  });

  describe('Number Fields', () => {
    const parser = new JSONSchemaParser();

    it('should parse basic number field', () => {
      const schema: JSONSchema = { type: 'number' };
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.type).toBe('number');
      expect(field.required).toBe(true);
      expect(field.constraints).toBeUndefined();
    });

    it('should parse number with minimum constraint', () => {
      const schema: JSONSchema = { type: 'number', minimum: 0 };
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.constraints?.minimum).toBe(0);
    });

    it('should parse number with maximum constraint', () => {
      const schema: JSONSchema = { type: 'number', maximum: 100 };
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.constraints?.maximum).toBe(100);
    });

    it('should parse number with exclusiveMinimum (draft-2020-12 style)', () => {
      const schema: JSONSchema = { type: 'number', exclusiveMinimum: 0 };
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.constraints?.exclusiveMinimum).toBe(0);
      expect(field.constraints?.minimum).toBeUndefined();
    });

    it('should parse number with exclusiveMaximum (draft-2020-12 style)', () => {
      const schema: JSONSchema = { type: 'number', exclusiveMaximum: 100 };
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.constraints?.exclusiveMaximum).toBe(100);
      expect(field.constraints?.maximum).toBeUndefined();
    });

    it('should parse number with exclusiveMinimum (draft-07 style)', () => {
      const schema: JSONSchema = { type: 'number', minimum: 0, exclusiveMinimum: true };
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.constraints?.exclusiveMinimum).toBe(0);
      expect(field.constraints?.minimum).toBeUndefined();
    });

    it('should parse number with exclusiveMaximum (draft-07 style)', () => {
      const schema: JSONSchema = { type: 'number', maximum: 100, exclusiveMaximum: true };
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.constraints?.exclusiveMaximum).toBe(100);
      expect(field.constraints?.maximum).toBeUndefined();
    });

    it('should parse number with multipleOf constraint', () => {
      const schema: JSONSchema = { type: 'number', multipleOf: 0.01 };
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.constraints?.multipleOf).toBe(0.01);
    });

    it('should parse number with all constraints combined', () => {
      const schema: JSONSchema = {
        type: 'number',
        minimum: 0,
        maximum: 100,
        multipleOf: 0.5,
      };
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.constraints?.minimum).toBe(0);
      expect(field.constraints?.maximum).toBe(100);
      expect(field.constraints?.multipleOf).toBe(0.5);
    });

    it('should parse number with metadata', () => {
      const schema: JSONSchema = {
        type: 'number',
        description: 'User age',
        default: 25,
        examples: [18, 25, 30, 40],
      };
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.description).toBe('User age');
      expect(field.default).toBe(25);
      expect(field.examples).toEqual([18, 25, 30, 40]);
    });
  });

  describe('Integer Fields', () => {
    const parser = new JSONSchemaParser();

    it('should parse basic integer field', () => {
      const schema: JSONSchema = { type: 'integer' };
      const result = parser.parse(schema);
      const field = result.schema as IntegerField;

      expect(field.type).toBe('integer');
      expect(field.required).toBe(true);
      expect(field.constraints).toBeUndefined();
    });

    it('should parse integer with all constraints', () => {
      const schema: JSONSchema = {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        multipleOf: 2,
      };
      const result = parser.parse(schema);
      const field = result.schema as IntegerField;

      expect(field.constraints?.minimum).toBe(1);
      expect(field.constraints?.maximum).toBe(10);
      expect(field.constraints?.multipleOf).toBe(2);
    });

    it('should parse integer with exclusive constraints (draft-07)', () => {
      const schema: JSONSchema = {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        exclusiveMinimum: true,
        exclusiveMaximum: true,
      };
      const result = parser.parse(schema);
      const field = result.schema as IntegerField;

      expect(field.constraints?.exclusiveMinimum).toBe(0);
      expect(field.constraints?.exclusiveMaximum).toBe(100);
      expect(field.constraints?.minimum).toBeUndefined();
      expect(field.constraints?.maximum).toBeUndefined();
    });
  });

  describe('Boolean Fields', () => {
    const parser = new JSONSchemaParser();

    it('should parse basic boolean field', () => {
      const schema: JSONSchema = { type: 'boolean' };
      const result = parser.parse(schema);
      const field = result.schema as BooleanField;

      expect(field.type).toBe('boolean');
      expect(field.required).toBe(true);
    });

    it('should parse boolean with metadata', () => {
      const schema: JSONSchema = {
        type: 'boolean',
        description: 'Accept terms',
        default: false,
        examples: [true, false],
      };
      const result = parser.parse(schema);
      const field = result.schema as BooleanField;

      expect(field.description).toBe('Accept terms');
      expect(field.default).toBe(false);
      expect(field.examples).toEqual([true, false]);
    });
  });

  describe('Null Fields', () => {
    const parser = new JSONSchemaParser();

    it('should parse basic null field', () => {
      const schema: JSONSchema = { type: 'null' };
      const result = parser.parse(schema);
      const field = result.schema as NullField;

      expect(field.type).toBe('null');
      expect(field.required).toBe(true);
    });

    it('should parse null with description', () => {
      const schema: JSONSchema = {
        type: 'null',
        description: 'Null value placeholder',
      };
      const result = parser.parse(schema);
      const field = result.schema as NullField;

      expect(field.description).toBe('Null value placeholder');
    });
  });

  describe('Object Fields', () => {
    const parser = new JSONSchemaParser();

    it('should parse empty object', () => {
      const schema: JSONSchema = { type: 'object' };
      const result = parser.parse(schema);
      const field = result.schema as ObjectField;

      expect(field.type).toBe('object');
      expect(field.required).toBe(true);
      expect(field.properties).toEqual({});
    });

    it('should parse object with simple properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          active: { type: 'boolean' },
        },
      };
      const result = parser.parse(schema);
      const field = result.schema as ObjectField;

      expect(field.type).toBe('object');
      expect(Object.keys(field.properties)).toEqual(['name', 'age', 'active']);
      expect(field.properties.name.type).toBe('string');
      expect(field.properties.age.type).toBe('number');
      expect(field.properties.active.type).toBe('boolean');
    });

    it('should parse object with required fields', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
        },
        required: ['name', 'email'],
      };
      const result = parser.parse(schema);
      const field = result.schema as ObjectField;

      expect(field.properties.name.required).toBe(true);
      expect(field.properties.email.required).toBe(true);
      expect(field.properties.phone.required).toBe(false);
    });

    it('should parse object with additionalProperties (boolean)', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      };
      const result = parser.parse(schema);
      const field = result.schema as ObjectField;

      expect(field.additionalProperties).toBe(false);
    });

    it('should parse nested objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              address: {
                type: 'object',
                properties: {
                  street: { type: 'string' },
                  city: { type: 'string' },
                },
                required: ['city'],
              },
            },
            required: ['name'],
          },
        },
      };
      const result = parser.parse(schema);
      const field = result.schema as ObjectField;

      expect(field.type).toBe('object');
      expect(field.properties.user.type).toBe('object');

      const userField = field.properties.user as ObjectField;
      expect(userField.properties.name.required).toBe(true);
      expect(userField.properties.address.type).toBe('object');

      const addressField = userField.properties.address as ObjectField;
      expect(addressField.properties.street.required).toBe(false);
      expect(addressField.properties.city.required).toBe(true);
    });

    it('should parse object with metadata', () => {
      const schema: JSONSchema = {
        type: 'object',
        description: 'User profile',
        properties: {
          name: { type: 'string' },
        },
      };
      const result = parser.parse(schema);
      const field = result.schema as ObjectField;

      expect(field.description).toBe('User profile');
    });
  });

  describe('Array Fields', () => {
    const parser = new JSONSchemaParser();

    it('should throw error for array without items', () => {
      const schema: JSONSchema = { type: 'array' };

      expect(() => parser.parse(schema)).toThrow(ParserError);
      expect(() => parser.parse(schema)).toThrow('Array type must have an "items" property');
    });

    it('should parse array of strings', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string' },
      };
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.type).toBe('array');
      expect(field.required).toBe(true);
      expect(field.items.type).toBe('string');
    });

    it('should parse array of objects', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
          },
          required: ['id'],
        },
      };
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.type).toBe('array');
      expect(field.items.type).toBe('object');

      const itemField = field.items as ObjectField;
      expect(itemField.properties.id.required).toBe(true);
      expect(itemField.properties.name.required).toBe(false);
    });

    it('should parse array with minItems constraint', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
      };
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.constraints?.minItems).toBe(1);
    });

    it('should parse array with maxItems constraint', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string' },
        maxItems: 10,
      };
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.constraints?.maxItems).toBe(10);
    });

    it('should parse array with uniqueItems constraint', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string' },
        uniqueItems: true,
      };
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.constraints?.uniqueItems).toBe(true);
    });

    it('should parse array with all constraints', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'number' },
        minItems: 2,
        maxItems: 10,
        uniqueItems: true,
      };
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.constraints?.minItems).toBe(2);
      expect(field.constraints?.maxItems).toBe(10);
      expect(field.constraints?.uniqueItems).toBe(true);
    });

    it('should throw error for tuple validation (items as array)', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: [{ type: 'string' }, { type: 'number' }],
      };

      expect(() => parser.parse(schema)).toThrow(ParserError);
      expect(() => parser.parse(schema)).toThrow('Tuple validation');
    });

    it('should parse nested arrays', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'array',
          items: { type: 'string' },
        },
      };
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.type).toBe('array');
      expect(field.items.type).toBe('array');

      const innerArray = field.items as ArrayField;
      expect(innerArray.items.type).toBe('string');
    });

    it('should parse array with metadata', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string' },
        description: 'List of tags',
        examples: [['tag1', 'tag2'], ['tag3']],
      };
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.description).toBe('List of tags');
      expect(field.examples).toEqual([['tag1', 'tag2'], ['tag3']]);
    });
  });

  describe('Enum Fields', () => {
    const parser = new JSONSchemaParser();

    it('should parse enum with string values', () => {
      const schema: JSONSchema = {
        enum: ['small', 'medium', 'large'],
      };
      const result = parser.parse(schema);
      const field = result.schema as EnumField;

      expect(field.type).toBe('enum');
      expect(field.required).toBe(true);
      expect(field.values).toHaveLength(3);
      expect(field.values[0].value).toBe('small');
      expect(field.values[1].value).toBe('medium');
      expect(field.values[2].value).toBe('large');
    });

    it('should parse enum with number values', () => {
      const schema: JSONSchema = {
        enum: [1, 2, 3],
      };
      const result = parser.parse(schema);
      const field = result.schema as EnumField;

      expect(field.type).toBe('enum');
      expect(field.values).toHaveLength(3);
      expect(field.values[0].value).toBe(1);
      expect(field.values[1].value).toBe(2);
      expect(field.values[2].value).toBe(3);
    });

    it('should parse enum with boolean values', () => {
      const schema: JSONSchema = {
        enum: [true, false],
      };
      const result = parser.parse(schema);
      const field = result.schema as EnumField;

      expect(field.type).toBe('enum');
      expect(field.values).toHaveLength(2);
      expect(field.values[0].value).toBe('true');
      expect(field.values[1].value).toBe('false');
    });

    it('should parse enum with null value', () => {
      const schema: JSONSchema = {
        enum: ['none', null],
      };
      const result = parser.parse(schema);
      const field = result.schema as EnumField;

      expect(field.type).toBe('enum');
      expect(field.values).toHaveLength(2);
      expect(field.values[0].value).toBe('none');
      expect(field.values[1].value).toBe('null');
    });

    it('should parse enum with mixed value types', () => {
      const schema: JSONSchema = {
        enum: ['text', 42, true, null],
      };
      const result = parser.parse(schema);
      const field = result.schema as EnumField;

      expect(field.type).toBe('enum');
      expect(field.values).toHaveLength(4);
      expect(field.values[0].value).toBe('text');
      expect(field.values[1].value).toBe(42);
      expect(field.values[2].value).toBe('true');
      expect(field.values[3].value).toBe('null');
    });

    it('should throw error for empty enum', () => {
      const schema: JSONSchema = {
        enum: [],
      };

      expect(() => parser.parse(schema)).toThrow(ParserError);
      expect(() => parser.parse(schema)).toThrow('non-empty "enum" array');
    });

    it('should parse enum with type specified', () => {
      const schema: JSONSchema = {
        type: 'string',
        enum: ['red', 'green', 'blue'],
      };
      const result = parser.parse(schema);
      const field = result.schema as EnumField;

      expect(field.type).toBe('enum');
      expect(field.values).toHaveLength(3);
    });

    it('should parse enum with metadata', () => {
      const schema: JSONSchema = {
        enum: ['S', 'M', 'L'],
        description: 'T-shirt size',
        default: 'M',
        examples: ['S', 'L'],
      };
      const result = parser.parse(schema);
      const field = result.schema as EnumField;

      expect(field.description).toBe('T-shirt size');
      expect(field.default).toBe('M');
      expect(field.examples).toEqual(['S', 'L']);
    });
  });

  describe('Root Schema Metadata', () => {
    const parser = new JSONSchemaParser();

    it('should include title and description at root level', () => {
      const schema: JSONSchema = {
        title: 'User Schema',
        description: 'Schema for user registration',
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };
      const result = parser.parse(schema);

      expect(result.title).toBe('User Schema');
      expect(result.description).toBe('Schema for user registration');
    });

    it('should include source metadata by default', () => {
      const schema: JSONSchema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'string',
      };
      const result = parser.parse(schema);

      expect(result.metadata?.source).toBe('json-schema');
      expect(result.metadata?.$schema).toBe('http://json-schema.org/draft-07/schema#');
    });

    it('should include custom metadata', () => {
      const parser = new JSONSchemaParser({
        customMetadata: { customField: 'customValue' },
      });
      const schema: JSONSchema = { type: 'string' };
      const result = parser.parse(schema);

      expect(result.metadata?.customField).toBe('customValue');
    });

    it('should exclude metadata when includeMetadata is false', () => {
      const parser = new JSONSchemaParser({ includeMetadata: false });
      const schema: JSONSchema = { type: 'string' };
      const result = parser.parse(schema);

      expect(result.metadata).toBeUndefined();
    });
  });

  describe('Error Handling - Invalid Schemas', () => {
    const parser = new JSONSchemaParser();

    it('should throw error for non-object input', () => {
      expect(() => parser.parse('string' as any)).toThrow(ParserError);
      expect(() => parser.parse(123 as any)).toThrow(ParserError);
      expect(() => parser.parse(null as any)).toThrow(ParserError);
    });

    it('should throw error for schema without type', () => {
      const schema: JSONSchema = { description: 'No type specified' };

      expect(() => parser.parse(schema)).toThrow(ParserError);
      expect(() => parser.parse(schema)).toThrow('must have a "type" property');
    });

    it('should throw error for unsupported type', () => {
      const schema = { type: 'unsupported' } as any;

      expect(() => parser.parse(schema)).toThrow(ParserError);
      expect(() => parser.parse(schema)).toThrow('Unsupported JSON Schema type');
    });

    it('should throw error for union types (array of types)', () => {
      const schema: JSONSchema = { type: ['string', 'number'] };

      expect(() => parser.parse(schema)).toThrow(ParserError);
      expect(() => parser.parse(schema)).toThrow('Union types');
    });
  });

  describe('Error Handling - Unsupported Features', () => {
    const parser = new JSONSchemaParser();

    it('should throw UnsupportedFeatureError for $ref', () => {
      const schema: JSONSchema = {
        $ref: '#/definitions/User',
      };

      expect(() => parser.parse(schema)).toThrow(UnsupportedFeatureError);
      expect(() => parser.parse(schema)).toThrow('$ref');
      expect(() => parser.parse(schema)).toThrow('not supported in FormBridge v1');
    });

    it('should throw UnsupportedFeatureError for allOf', () => {
      const schema: JSONSchema = {
        allOf: [{ type: 'string' }, { minLength: 5 }],
      };

      expect(() => parser.parse(schema)).toThrow(UnsupportedFeatureError);
      expect(() => parser.parse(schema)).toThrow('allOf');
    });

    it('should throw UnsupportedFeatureError for anyOf', () => {
      const schema: JSONSchema = {
        anyOf: [{ type: 'string' }, { type: 'number' }],
      };

      expect(() => parser.parse(schema)).toThrow(UnsupportedFeatureError);
      expect(() => parser.parse(schema)).toThrow('anyOf');
    });

    it('should throw UnsupportedFeatureError for oneOf', () => {
      const schema: JSONSchema = {
        oneOf: [{ type: 'string' }, { type: 'number' }],
      };

      expect(() => parser.parse(schema)).toThrow(UnsupportedFeatureError);
      expect(() => parser.parse(schema)).toThrow('oneOf');
    });

    it('should throw UnsupportedFeatureError for not', () => {
      const schema: JSONSchema = {
        not: { type: 'null' },
      };

      expect(() => parser.parse(schema)).toThrow(UnsupportedFeatureError);
      expect(() => parser.parse(schema)).toThrow('not');
    });

    it('should validate unsupported features in nested objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            $ref: '#/definitions/User',
          },
        },
      };

      expect(() => parser.parse(schema)).toThrow(UnsupportedFeatureError);
      expect(() => parser.parse(schema)).toThrow('$ref');
    });
  });

  describe('Complex Schemas', () => {
    const parser = new JSONSchemaParser();

    it('should parse complex nested schema', () => {
      const schema: JSONSchema = {
        title: 'Blog Post',
        description: 'A blog post with author and comments',
        type: 'object',
        properties: {
          title: {
            type: 'string',
            minLength: 1,
            maxLength: 200,
            description: 'Post title',
          },
          content: {
            type: 'string',
            minLength: 1,
            description: 'Post content',
          },
          author: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
            },
            required: ['name', 'email'],
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            uniqueItems: true,
          },
          status: {
            enum: ['draft', 'published', 'archived'],
            description: 'Post status',
          },
        },
        required: ['title', 'content', 'author'],
      };

      const result = parser.parse(schema);

      expect(result.title).toBe('Blog Post');
      expect(result.schema.type).toBe('object');

      const rootField = result.schema as ObjectField;
      expect(rootField.properties.title.required).toBe(true);
      expect(rootField.properties.content.required).toBe(true);
      expect(rootField.properties.author.required).toBe(true);
      expect(rootField.properties.tags.required).toBe(false);
      expect(rootField.properties.status.required).toBe(false);

      const titleField = rootField.properties.title as StringField;
      expect(titleField.constraints?.minLength).toBe(1);
      expect(titleField.constraints?.maxLength).toBe(200);

      const authorField = rootField.properties.author as ObjectField;
      expect(authorField.properties.name.required).toBe(true);
      expect(authorField.properties.email.required).toBe(true);

      const tagsField = rootField.properties.tags as ArrayField;
      expect(tagsField.items.type).toBe('string');
      expect(tagsField.constraints?.minItems).toBe(1);
      expect(tagsField.constraints?.uniqueItems).toBe(true);

      const statusField = rootField.properties.status as EnumField;
      expect(statusField.values).toHaveLength(3);
    });

    it('should parse schema with array of nested objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          users: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer', minimum: 1 },
                name: { type: 'string', minLength: 1 },
                roles: {
                  type: 'array',
                  items: { enum: ['admin', 'user', 'guest'] },
                },
              },
              required: ['id', 'name'],
            },
          },
        },
      };

      const result = parser.parse(schema);
      const rootField = result.schema as ObjectField;
      const usersField = rootField.properties.users as ArrayField;
      const userItemField = usersField.items as ObjectField;

      expect(userItemField.type).toBe('object');
      expect(userItemField.properties.id.required).toBe(true);
      expect(userItemField.properties.name.required).toBe(true);
      expect(userItemField.properties.roles.required).toBe(false);

      const rolesField = userItemField.properties.roles as ArrayField;
      expect(rolesField.items.type).toBe('enum');

      const roleEnumField = rolesField.items as EnumField;
      expect(roleEnumField.values).toHaveLength(3);
    });
  });

  describe('Convenience Function', () => {
    it('should parse schema using parseJSONSchema function', () => {
      const schema: JSONSchema = {
        type: 'string',
        minLength: 5,
        description: 'Test string',
      };
      const result = parseJSONSchema(schema);

      expect(result.version).toBe('1.0');
      expect(result.schema.type).toBe('string');

      const field = result.schema as StringField;
      expect(field.constraints?.minLength).toBe(5);
      expect(field.description).toBe('Test string');
    });

    it('should accept options in parseJSONSchema function', () => {
      const schema: JSONSchema = { type: 'string' };
      const result = parseJSONSchema(schema, { includeMetadata: false });

      expect(result.metadata).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    const parser = new JSONSchemaParser();

    it('should handle schema with only description (no properties)', () => {
      const schema: JSONSchema = {
        type: 'object',
        description: 'Empty object schema',
      };
      const result = parser.parse(schema);
      const field = result.schema as ObjectField;

      expect(field.type).toBe('object');
      expect(field.properties).toEqual({});
      expect(field.description).toBe('Empty object schema');
    });

    it('should handle zero values in constraints', () => {
      const schema: JSONSchema = {
        type: 'string',
        minLength: 0,
        maxLength: 0,
      };
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.minLength).toBe(0);
      expect(field.constraints?.maxLength).toBe(0);
    });

    it('should handle negative numbers in constraints', () => {
      const schema: JSONSchema = {
        type: 'number',
        minimum: -100,
        maximum: -10,
      };
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.constraints?.minimum).toBe(-100);
      expect(field.constraints?.maximum).toBe(-10);
    });

    it('should handle default value of 0 or false', () => {
      const stringSchema: JSONSchema = {
        type: 'number',
        default: 0,
      };
      const result1 = parser.parse(stringSchema);
      expect((result1.schema as NumberField).default).toBe(0);

      const boolSchema: JSONSchema = {
        type: 'boolean',
        default: false,
      };
      const result2 = parser.parse(boolSchema);
      expect((result2.schema as BooleanField).default).toBe(false);
    });

    it('should handle deeply nested objects (5 levels)', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          level1: {
            type: 'object',
            properties: {
              level2: {
                type: 'object',
                properties: {
                  level3: {
                    type: 'object',
                    properties: {
                      level4: {
                        type: 'object',
                        properties: {
                          level5: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = parser.parse(schema);
      let current: any = result.schema;

      for (let i = 1; i <= 5; i++) {
        expect(current.type).toBe('object');
        if (i < 5) {
          current = current.properties[`level${i}`];
        } else {
          expect(current.properties.level5.type).toBe('string');
        }
      }
    });
  });
});
