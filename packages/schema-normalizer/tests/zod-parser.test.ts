/**
 * Comprehensive tests for Zod Parser
 *
 * Tests cover:
 * - All primitive types with constraints
 * - Objects with nested properties
 * - Arrays with items and constraints
 * - Enums (ZodEnum and ZodNativeEnum)
 * - Metadata preservation (description, default, examples)
 * - Optional/nullable fields
 * - Error handling for unsupported features
 * - Complex nested schemas
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ZodParser } from '../src/parsers/zod-parser';
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

describe('ZodParser', () => {
  describe('Basic Instantiation', () => {
    it('should create parser with default options', () => {
      const parser = new ZodParser();
      expect(parser).toBeInstanceOf(ZodParser);
    });

    it('should create parser with custom options', () => {
      const parser = new ZodParser({
        strict: false,
        includeMetadata: false,
      });
      expect(parser).toBeInstanceOf(ZodParser);
    });
  });

  describe('canParse', () => {
    const parser = new ZodParser();

    it('should return true for valid Zod schemas', () => {
      expect(parser.canParse(z.string())).toBe(true);
      expect(parser.canParse(z.number())).toBe(true);
      expect(parser.canParse(z.boolean())).toBe(true);
      expect(parser.canParse(z.object({}))).toBe(true);
      expect(parser.canParse(z.array(z.string()))).toBe(true);
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

    it('should return false for plain objects', () => {
      expect(parser.canParse({})).toBe(false);
      expect(parser.canParse({ type: 'string' })).toBe(false);
    });
  });

  describe('String Fields', () => {
    const parser = new ZodParser();

    it('should parse basic string field', () => {
      const schema = z.string();
      const result = parser.parse(schema);

      expect(result.version).toBe('1.0');
      expect(result.schema.type).toBe('string');
      expect((result.schema as StringField).required).toBe(true);
      expect((result.schema as StringField).constraints).toBeUndefined();
    });

    it('should parse optional string field', () => {
      const schema = z.string().optional();
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.type).toBe('string');
      expect(field.required).toBe(false);
    });

    it('should parse string with minLength constraint', () => {
      const schema = z.string().min(5);
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.minLength).toBe(5);
    });

    it('should parse string with maxLength constraint', () => {
      const schema = z.string().max(100);
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.maxLength).toBe(100);
    });

    it('should parse string with exact length constraint', () => {
      const schema = z.string().length(10);
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.minLength).toBe(10);
      expect(field.constraints?.maxLength).toBe(10);
    });

    it('should parse string with email format', () => {
      const schema = z.string().email();
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.format).toBe('email');
    });

    it('should parse string with url format', () => {
      const schema = z.string().url();
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.format).toBe('url');
    });

    it('should parse string with uuid format', () => {
      const schema = z.string().uuid();
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.format).toBe('uuid');
    });

    it('should parse string with datetime format', () => {
      const schema = z.string().datetime();
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.format).toBe('date-time');
    });

    it('should parse string with regex pattern', () => {
      const schema = z.string().regex(/^[a-z]+$/);
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.pattern).toBe('^[a-z]+$');
    });

    it('should parse string with ip v4 format', () => {
      const schema = z.string().ip({ version: 'v4' });
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.format).toBe('ipv4');
    });

    it('should parse string with ip v6 format', () => {
      const schema = z.string().ip({ version: 'v6' });
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.format).toBe('ipv6');
    });

    it('should parse string with all constraints combined', () => {
      const schema = z.string().min(5).max(50).regex(/^[a-z]+$/);
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.minLength).toBe(5);
      expect(field.constraints?.maxLength).toBe(50);
      expect(field.constraints?.pattern).toBe('^[a-z]+$');
    });

    it('should parse string with description', () => {
      const schema = z.string().describe('User email address');
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.description).toBe('User email address');
    });

    it('should parse string with default value', () => {
      const schema = z.string().default('default-value');
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.default).toBe('default-value');
      expect(field.required).toBe(false);
    });
  });

  describe('Number Fields', () => {
    const parser = new ZodParser();

    it('should parse basic number field', () => {
      const schema = z.number();
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.type).toBe('number');
      expect(field.required).toBe(true);
      expect(field.constraints).toBeUndefined();
    });

    it('should parse optional number field', () => {
      const schema = z.number().optional();
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.type).toBe('number');
      expect(field.required).toBe(false);
    });

    it('should parse number with minimum constraint', () => {
      const schema = z.number().min(0);
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.constraints?.minimum).toBe(0);
    });

    it('should parse number with maximum constraint', () => {
      const schema = z.number().max(100);
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.constraints?.maximum).toBe(100);
    });

    it('should parse number with exclusive minimum', () => {
      const schema = z.number().gt(0);
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.constraints?.exclusiveMinimum).toBe(0);
      expect(field.constraints?.minimum).toBeUndefined();
    });

    it('should parse number with exclusive maximum', () => {
      const schema = z.number().lt(100);
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.constraints?.exclusiveMaximum).toBe(100);
      expect(field.constraints?.maximum).toBeUndefined();
    });

    it('should parse number with multipleOf constraint', () => {
      const schema = z.number().multipleOf(0.01);
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.constraints?.multipleOf).toBe(0.01);
    });

    it('should parse number with all constraints combined', () => {
      const schema = z.number().min(0).max(100).multipleOf(0.5);
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.constraints?.minimum).toBe(0);
      expect(field.constraints?.maximum).toBe(100);
      expect(field.constraints?.multipleOf).toBe(0.5);
    });

    it('should parse number with description and default', () => {
      const schema = z.number().describe('User age').default(25);
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.description).toBe('User age');
      expect(field.default).toBe(25);
      expect(field.required).toBe(false);
    });

    it('should handle default value of 0', () => {
      const schema = z.number().default(0);
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.default).toBe(0);
    });
  });

  describe('Integer Fields', () => {
    const parser = new ZodParser();

    it('should parse basic integer field', () => {
      const schema = z.number().int();
      const result = parser.parse(schema);
      const field = result.schema as IntegerField;

      expect(field.type).toBe('integer');
      expect(field.required).toBe(true);
      expect(field.constraints).toBeUndefined();
    });

    it('should parse integer with all constraints', () => {
      const schema = z.number().int().min(1).max(10).multipleOf(2);
      const result = parser.parse(schema);
      const field = result.schema as IntegerField;

      expect(field.type).toBe('integer');
      expect(field.constraints?.minimum).toBe(1);
      expect(field.constraints?.maximum).toBe(10);
      expect(field.constraints?.multipleOf).toBe(2);
    });

    it('should parse integer with exclusive constraints', () => {
      const schema = z.number().int().gt(0).lt(100);
      const result = parser.parse(schema);
      const field = result.schema as IntegerField;

      expect(field.type).toBe('integer');
      expect(field.constraints?.exclusiveMinimum).toBe(0);
      expect(field.constraints?.exclusiveMaximum).toBe(100);
    });
  });

  describe('Boolean Fields', () => {
    const parser = new ZodParser();

    it('should parse basic boolean field', () => {
      const schema = z.boolean();
      const result = parser.parse(schema);
      const field = result.schema as BooleanField;

      expect(field.type).toBe('boolean');
      expect(field.required).toBe(true);
    });

    it('should parse optional boolean field', () => {
      const schema = z.boolean().optional();
      const result = parser.parse(schema);
      const field = result.schema as BooleanField;

      expect(field.type).toBe('boolean');
      expect(field.required).toBe(false);
    });

    it('should parse boolean with description and default', () => {
      const schema = z.boolean().describe('Accept terms').default(false);
      const result = parser.parse(schema);
      const field = result.schema as BooleanField;

      expect(field.description).toBe('Accept terms');
      expect(field.default).toBe(false);
      expect(field.required).toBe(false);
    });

    it('should handle default value of false', () => {
      const schema = z.boolean().default(false);
      const result = parser.parse(schema);
      const field = result.schema as BooleanField;

      expect(field.default).toBe(false);
    });
  });

  describe('Null Fields', () => {
    const parser = new ZodParser();

    it('should parse basic null field', () => {
      const schema = z.null();
      const result = parser.parse(schema);
      const field = result.schema as NullField;

      expect(field.type).toBe('null');
      expect(field.required).toBe(true);
    });

    it('should parse optional null field', () => {
      const schema = z.null().optional();
      const result = parser.parse(schema);
      const field = result.schema as NullField;

      expect(field.type).toBe('null');
      expect(field.required).toBe(false);
    });

    it('should parse null with description', () => {
      const schema = z.null().describe('Null value placeholder');
      const result = parser.parse(schema);
      const field = result.schema as NullField;

      expect(field.description).toBe('Null value placeholder');
    });
  });

  describe('Nullable Fields', () => {
    const parser = new ZodParser();

    it('should parse nullable string field', () => {
      const schema = z.string().nullable();
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.type).toBe('string');
      expect(field.required).toBe(true);
      expect(field.nullable).toBe(true);
    });

    it('should parse nullable and optional string field', () => {
      const schema = z.string().nullable().optional();
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.type).toBe('string');
      expect(field.required).toBe(false);
      expect(field.nullable).toBe(true);
    });

    it('should parse nullable number field', () => {
      const schema = z.number().nullable();
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.type).toBe('number');
      expect(field.nullable).toBe(true);
    });
  });

  describe('Object Fields', () => {
    const parser = new ZodParser();

    it('should parse empty object', () => {
      const schema = z.object({});
      const result = parser.parse(schema);
      const field = result.schema as ObjectField;

      expect(field.type).toBe('object');
      expect(field.required).toBe(true);
      expect(field.properties).toEqual({});
    });

    it('should parse object with simple properties', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
        active: z.boolean(),
      });
      const result = parser.parse(schema);
      const field = result.schema as ObjectField;

      expect(field.type).toBe('object');
      expect(Object.keys(field.properties)).toEqual(['name', 'age', 'active']);
      expect(field.properties.name.type).toBe('string');
      expect(field.properties.age.type).toBe('number');
      expect(field.properties.active.type).toBe('boolean');
    });

    it('should parse object with required and optional fields', () => {
      const schema = z.object({
        name: z.string(),
        email: z.string(),
        phone: z.string().optional(),
      });
      const result = parser.parse(schema);
      const field = result.schema as ObjectField;

      expect(field.properties.name.required).toBe(true);
      expect(field.properties.email.required).toBe(true);
      expect(field.properties.phone.required).toBe(false);
    });

    it('should parse nested objects', () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          address: z.object({
            street: z.string().optional(),
            city: z.string(),
          }),
        }),
      });
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

    it('should parse optional object', () => {
      const schema = z.object({ name: z.string() }).optional();
      const result = parser.parse(schema);
      const field = result.schema as ObjectField;

      expect(field.type).toBe('object');
      expect(field.required).toBe(false);
    });

    it('should parse object with description', () => {
      const schema = z.object({
        name: z.string(),
      }).describe('User profile');
      const result = parser.parse(schema);
      const field = result.schema as ObjectField;

      expect(field.description).toBe('User profile');
    });
  });

  describe('Array Fields', () => {
    const parser = new ZodParser();

    it('should parse array of strings', () => {
      const schema = z.array(z.string());
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.type).toBe('array');
      expect(field.required).toBe(true);
      expect(field.items.type).toBe('string');
    });

    it('should parse array of objects', () => {
      const schema = z.array(z.object({
        id: z.number().int(),
        name: z.string(),
      }));
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.type).toBe('array');
      expect(field.items.type).toBe('object');

      const itemField = field.items as ObjectField;
      expect(itemField.properties.id.type).toBe('integer');
      expect(itemField.properties.id.required).toBe(true);
      expect(itemField.properties.name.required).toBe(true);
    });

    it('should parse array with minItems constraint', () => {
      const schema = z.array(z.string()).min(1);
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.constraints?.minItems).toBe(1);
    });

    it('should parse array with maxItems constraint', () => {
      const schema = z.array(z.string()).max(10);
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.constraints?.maxItems).toBe(10);
    });

    it('should parse array with exact length constraint', () => {
      const schema = z.array(z.string()).length(5);
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.constraints?.minItems).toBe(5);
      expect(field.constraints?.maxItems).toBe(5);
    });

    it('should parse array with all constraints', () => {
      const schema = z.array(z.number()).min(2).max(10);
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.constraints?.minItems).toBe(2);
      expect(field.constraints?.maxItems).toBe(10);
    });

    it('should parse nested arrays', () => {
      const schema = z.array(z.array(z.string()));
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.type).toBe('array');
      expect(field.items.type).toBe('array');

      const innerArray = field.items as ArrayField;
      expect(innerArray.items.type).toBe('string');
    });

    it('should parse optional array', () => {
      const schema = z.array(z.string()).optional();
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.type).toBe('array');
      expect(field.required).toBe(false);
    });

    it('should parse array with description', () => {
      const schema = z.array(z.string()).describe('List of tags');
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.description).toBe('List of tags');
    });
  });

  describe('Enum Fields', () => {
    const parser = new ZodParser();

    it('should parse enum with string values', () => {
      const schema = z.enum(['small', 'medium', 'large']);
      const result = parser.parse(schema);
      const field = result.schema as EnumField;

      expect(field.type).toBe('enum');
      expect(field.required).toBe(true);
      expect(field.values).toHaveLength(3);
      expect(field.values[0].value).toBe('small');
      expect(field.values[1].value).toBe('medium');
      expect(field.values[2].value).toBe('large');
    });

    it('should parse native enum with string values', () => {
      enum StringEnum {
        Small = 'small',
        Medium = 'medium',
        Large = 'large',
      }
      const schema = z.nativeEnum(StringEnum);
      const result = parser.parse(schema);
      const field = result.schema as EnumField;

      expect(field.type).toBe('enum');
      expect(field.values).toHaveLength(3);
      expect(field.values.some(v => v.value === 'small' && v.label === 'Small')).toBe(true);
      expect(field.values.some(v => v.value === 'medium' && v.label === 'Medium')).toBe(true);
      expect(field.values.some(v => v.value === 'large' && v.label === 'Large')).toBe(true);
    });

    it('should parse native enum with number values', () => {
      enum NumberEnum {
        One = 1,
        Two = 2,
        Three = 3,
      }
      const schema = z.nativeEnum(NumberEnum);
      const result = parser.parse(schema);
      const field = result.schema as EnumField;

      expect(field.type).toBe('enum');
      expect(field.values).toHaveLength(3);
      expect(field.values.some(v => v.value === 1 && v.label === 'One')).toBe(true);
      expect(field.values.some(v => v.value === 2 && v.label === 'Two')).toBe(true);
      expect(field.values.some(v => v.value === 3 && v.label === 'Three')).toBe(true);
    });

    it('should parse optional enum', () => {
      const schema = z.enum(['red', 'green', 'blue']).optional();
      const result = parser.parse(schema);
      const field = result.schema as EnumField;

      expect(field.type).toBe('enum');
      expect(field.required).toBe(false);
      expect(field.values).toHaveLength(3);
    });

    it('should parse enum with description and default', () => {
      const schema = z.enum(['S', 'M', 'L']).describe('T-shirt size').default('M');
      const result = parser.parse(schema);
      const field = result.schema as EnumField;

      expect(field.description).toBe('T-shirt size');
      expect(field.default).toBe('M');
      expect(field.required).toBe(false);
    });
  });

  describe('Root Schema Metadata', () => {
    const parser = new ZodParser();

    it('should include description at root level', () => {
      const schema = z.object({
        name: z.string(),
      }).describe('User registration schema');
      const result = parser.parse(schema);

      expect(result.description).toBe('User registration schema');
    });

    it('should include source metadata by default', () => {
      const schema = z.string();
      const result = parser.parse(schema);

      expect(result.metadata?.source).toBe('zod');
    });

    it('should include custom metadata', () => {
      const parser = new ZodParser({
        customMetadata: { customField: 'customValue' },
      });
      const schema = z.string();
      const result = parser.parse(schema);

      expect(result.metadata?.customField).toBe('customValue');
    });

    it('should exclude metadata when includeMetadata is false', () => {
      const parser = new ZodParser({ includeMetadata: false });
      const schema = z.string();
      const result = parser.parse(schema);

      expect(result.metadata).toBeUndefined();
    });
  });

  describe('Error Handling - Invalid Schemas', () => {
    const parser = new ZodParser();

    it('should throw error for non-Zod schema input', () => {
      expect(() => parser.parse('string' as any)).toThrow(ParserError);
      expect(() => parser.parse('string' as any)).toThrow('Invalid Zod schema');
      expect(() => parser.parse(123 as any)).toThrow(ParserError);
      expect(() => parser.parse(null as any)).toThrow(ParserError);
    });

    it('should throw error for plain object', () => {
      expect(() => parser.parse({} as any)).toThrow(ParserError);
      expect(() => parser.parse({ type: 'string' } as any)).toThrow(ParserError);
    });

    it('should throw error for unsupported Zod type', () => {
      const schema = z.literal('hello');

      expect(() => parser.parse(schema as any)).toThrow(ParserError);
      expect(() => parser.parse(schema as any)).toThrow('Unsupported Zod type');
    });
  });

  describe('Complex Schemas', () => {
    const parser = new ZodParser();

    it('should parse complex nested schema', () => {
      const schema = z.object({
        title: z.string().min(1).max(200).describe('Post title'),
        content: z.string().min(1).describe('Post content'),
        author: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
        tags: z.array(z.string()).min(1),
        status: z.enum(['draft', 'published', 'archived']).describe('Post status').optional(),
      }).describe('Blog post schema');

      const result = parser.parse(schema);

      expect(result.description).toBe('Blog post schema');
      expect(result.schema.type).toBe('object');

      const rootField = result.schema as ObjectField;
      expect(rootField.properties.title.required).toBe(true);
      expect(rootField.properties.content.required).toBe(true);
      expect(rootField.properties.author.required).toBe(true);
      expect(rootField.properties.tags.required).toBe(true);
      expect(rootField.properties.status.required).toBe(false);

      const titleField = rootField.properties.title as StringField;
      expect(titleField.constraints?.minLength).toBe(1);
      expect(titleField.constraints?.maxLength).toBe(200);
      expect(titleField.description).toBe('Post title');

      const authorField = rootField.properties.author as ObjectField;
      expect(authorField.properties.name.required).toBe(true);
      expect(authorField.properties.email.required).toBe(true);

      const emailField = authorField.properties.email as StringField;
      expect(emailField.constraints?.format).toBe('email');

      const tagsField = rootField.properties.tags as ArrayField;
      expect(tagsField.items.type).toBe('string');
      expect(tagsField.constraints?.minItems).toBe(1);

      const statusField = rootField.properties.status as EnumField;
      expect(statusField.values).toHaveLength(3);
      expect(statusField.description).toBe('Post status');
    });

    it('should parse schema with array of nested objects', () => {
      const schema = z.object({
        users: z.array(z.object({
          id: z.number().int().min(1),
          name: z.string().min(1),
          roles: z.array(z.enum(['admin', 'user', 'guest'])).optional(),
        })),
      });

      const result = parser.parse(schema);
      const rootField = result.schema as ObjectField;
      const usersField = rootField.properties.users as ArrayField;
      const userItemField = usersField.items as ObjectField;

      expect(userItemField.type).toBe('object');
      expect(userItemField.properties.id.type).toBe('integer');
      expect(userItemField.properties.id.required).toBe(true);
      expect(userItemField.properties.name.required).toBe(true);
      expect(userItemField.properties.roles.required).toBe(false);

      const rolesField = userItemField.properties.roles as ArrayField;
      expect(rolesField.items.type).toBe('enum');

      const roleEnumField = rolesField.items as EnumField;
      expect(roleEnumField.values).toHaveLength(3);
    });

    it('should parse deeply nested objects (5 levels)', () => {
      const schema = z.object({
        level1: z.object({
          level2: z.object({
            level3: z.object({
              level4: z.object({
                level5: z.string(),
              }),
            }),
          }),
        }),
      });

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

  describe('Edge Cases', () => {
    const parser = new ZodParser();

    it('should handle schema with only description (no properties)', () => {
      const schema = z.object({}).describe('Empty object schema');
      const result = parser.parse(schema);
      const field = result.schema as ObjectField;

      expect(field.type).toBe('object');
      expect(field.properties).toEqual({});
      expect(result.description).toBe('Empty object schema');
    });

    it('should handle zero values in constraints', () => {
      const schema = z.string().min(0).max(0);
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.constraints?.minLength).toBe(0);
      expect(field.constraints?.maxLength).toBe(0);
    });

    it('should handle negative numbers in constraints', () => {
      const schema = z.number().min(-100).max(-10);
      const result = parser.parse(schema);
      const field = result.schema as NumberField;

      expect(field.constraints?.minimum).toBe(-100);
      expect(field.constraints?.maximum).toBe(-10);
    });

    it('should handle default with wrapped optional', () => {
      const schema = z.string().optional().default('fallback');
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.default).toBe('fallback');
      expect(field.required).toBe(false);
    });

    it('should handle multiple wrappings (optional, nullable, default)', () => {
      const schema = z.string().nullable().optional().default('test');
      const result = parser.parse(schema);
      const field = result.schema as StringField;

      expect(field.type).toBe('string');
      expect(field.required).toBe(false);
      expect(field.nullable).toBe(true);
      expect(field.default).toBe('test');
    });

    it('should handle array of optional items', () => {
      const schema = z.array(z.string().optional());
      const result = parser.parse(schema);
      const field = result.schema as ArrayField;

      expect(field.type).toBe('array');
      expect(field.items.type).toBe('string');
      expect(field.items.required).toBe(false);
    });
  });
});
