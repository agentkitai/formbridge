/**
 * Tests for JSON Schema Converter
 *
 * Tests the conversion of Zod schemas to JSON Schema format, including:
 * - Basic types (string, number, boolean)
 * - Complex types (objects, arrays, enums)
 * - Nested objects and arrays
 * - Field descriptions and constraints
 * - Required/optional fields
 * - Large schemas with 10+ fields
 */

import { z } from 'zod';
import {
  convertZodToJsonSchema,
  isJsonSchema,
  extractRequiredFields,
  extractPropertyNames,
  getFieldDescription,
  extractFieldDescriptions,
  isFieldRequired,
  type JsonSchema,
} from '../../src/schemas/json-schema-converter';

describe('convertZodToJsonSchema', () => {
  it('should convert a simple string schema', () => {
    const schema = z.string();
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(jsonSchema.type).toBe('string');
    expect(jsonSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
  });

  it('should convert a simple number schema', () => {
    const schema = z.number();
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(jsonSchema.type).toBe('number');
  });

  it('should convert a simple boolean schema', () => {
    const schema = z.boolean();
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(jsonSchema.type).toBe('boolean');
  });

  it('should convert an object schema with multiple fields', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      active: z.boolean(),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties).toBeDefined();
    expect(jsonSchema.properties?.name).toBeDefined();
    expect(jsonSchema.properties?.age).toBeDefined();
    expect(jsonSchema.properties?.active).toBeDefined();
    expect(jsonSchema.required).toEqual(['name', 'age', 'active']);
  });

  it('should preserve field descriptions', () => {
    const schema = z.object({
      name: z.string().describe('User name'),
      age: z.number().describe('User age in years'),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(jsonSchema.properties?.name?.description).toBe('User name');
    expect(jsonSchema.properties?.age?.description).toBe('User age in years');
  });

  it('should preserve constraints like min/max', () => {
    const schema = z.object({
      age: z.number().min(0).max(120),
      username: z.string().min(3).max(20),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(jsonSchema.properties?.age?.minimum).toBe(0);
    expect(jsonSchema.properties?.age?.maximum).toBe(120);
    expect(jsonSchema.properties?.username?.minLength).toBe(3);
    expect(jsonSchema.properties?.username?.maxLength).toBe(20);
  });

  it('should handle optional fields', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(jsonSchema.required).toContain('required');
    expect(jsonSchema.required).not.toContain('optional');
  });

  it('should handle nested objects', () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        contact: z.object({
          email: z.string(),
          phone: z.string().optional(),
        }),
      }),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties?.user?.type).toBe('object');
    expect(jsonSchema.properties?.user?.properties?.contact?.type).toBe('object');
    expect(jsonSchema.properties?.user?.properties?.contact?.properties?.email?.type).toBe('string');
  });

  it('should handle arrays', () => {
    const schema = z.object({
      tags: z.array(z.string()),
      numbers: z.array(z.number()),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(jsonSchema.properties?.tags?.type).toBe('array');
    expect(jsonSchema.properties?.tags?.items?.type).toBe('string');
    expect(jsonSchema.properties?.numbers?.type).toBe('array');
    expect(jsonSchema.properties?.numbers?.items?.type).toBe('number');
  });

  it('should handle array constraints', () => {
    const schema = z.object({
      items: z.array(z.string()).min(1).max(10),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(jsonSchema.properties?.items?.minItems).toBe(1);
    expect(jsonSchema.properties?.items?.maxItems).toBe(10);
  });

  it('should handle enums', () => {
    const schema = z.object({
      status: z.enum(['pending', 'approved', 'rejected']),
      priority: z.enum(['low', 'medium', 'high']),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(jsonSchema.properties?.status?.enum).toEqual(['pending', 'approved', 'rejected']);
    expect(jsonSchema.properties?.priority?.enum).toEqual(['low', 'medium', 'high']);
  });

  it('should handle union types', () => {
    const schema = z.object({
      value: z.union([z.string(), z.number()]),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    // zod-to-json-schema represents unions as array of types
    expect(jsonSchema.properties?.value?.type).toBeDefined();
    expect(Array.isArray(jsonSchema.properties?.value?.type)).toBe(true);
  });

  it('should add custom name and description', () => {
    const schema = z.object({
      field: z.string(),
    });
    const jsonSchema = convertZodToJsonSchema(schema, {
      name: 'CustomSchema',
      description: 'This is a custom schema description',
    });

    expect(jsonSchema.title).toBe('CustomSchema');
    expect(jsonSchema.description).toBe('This is a custom schema description');
  });

  it('should support markAllPropertiesAsOptional option', () => {
    const schema = z.object({
      required1: z.string(),
      required2: z.number(),
    });
    const jsonSchema = convertZodToJsonSchema(schema, {
      markAllPropertiesAsOptional: true,
    });

    expect(jsonSchema.required).toBeUndefined();
  });

  it('should support removeAdditionalProperties option', () => {
    const schema = z.object({
      field: z.string(),
    }).strict();
    const jsonSchema = convertZodToJsonSchema(schema, {
      removeAdditionalProperties: true,
    });

    expect(jsonSchema.additionalProperties).toBe(true);
  });

  it('should not include $schema property when includeSchemaProperty is false', () => {
    const schema = z.string();
    const jsonSchema = convertZodToJsonSchema(schema, {
      includeSchemaProperty: false,
    });

    expect(jsonSchema.$schema).toBeUndefined();
  });

  it('should handle complex schemas with 10+ fields', () => {
    const schema = z.object({
      field1: z.string().describe('Field 1'),
      field2: z.number().describe('Field 2'),
      field3: z.boolean().describe('Field 3'),
      field4: z.string().optional().describe('Field 4'),
      field5: z.number().min(0).max(100).describe('Field 5'),
      field6: z.array(z.string()).describe('Field 6'),
      field7: z.enum(['a', 'b', 'c']).describe('Field 7'),
      field8: z.string().email().describe('Field 8'),
      field9: z.string().url().describe('Field 9'),
      field10: z.object({
        nested1: z.string(),
        nested2: z.number(),
      }).describe('Field 10'),
      field11: z.string().uuid().describe('Field 11'),
      field12: z.date().describe('Field 12'),
    });

    const startTime = performance.now();
    const jsonSchema = convertZodToJsonSchema(schema);
    const endTime = performance.now();

    // Verify the schema is correct
    expect(jsonSchema.type).toBe('object');
    expect(Object.keys(jsonSchema.properties || {}).length).toBe(12);
    expect(jsonSchema.properties?.field1?.description).toBe('Field 1');
    expect(jsonSchema.properties?.field10?.type).toBe('object');

    // Verify performance (should be well under 100ms)
    const duration = endTime - startTime;
    expect(duration).toBeLessThan(100);
  });

  it('should handle file upload fields (represented as strings with format)', () => {
    const schema = z.object({
      document: z.string().describe('Upload a document'),
      photo: z.string().describe('Upload a photo'),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(jsonSchema.properties?.document?.type).toBe('string');
    expect(jsonSchema.properties?.document?.description).toBe('Upload a document');
  });

  it('should handle nullable fields', () => {
    const schema = z.object({
      optional: z.string().nullable(),
      required: z.string(),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(jsonSchema.properties?.optional).toBeDefined();
    expect(jsonSchema.properties?.required?.type).toBe('string');
  });

  it('should handle default values', () => {
    const schema = z.object({
      status: z.string().default('pending'),
      count: z.number().default(0),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(jsonSchema.properties?.status?.default).toBe('pending');
    expect(jsonSchema.properties?.count?.default).toBe(0);
  });

  it('should handle regex patterns', () => {
    const schema = z.object({
      code: z.string().regex(/^[A-Z]{3}-\d{3}$/),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(jsonSchema.properties?.code?.pattern).toBeDefined();
  });
});

describe('isJsonSchema', () => {
  it('should return true for valid JSON Schema with type', () => {
    const schema: JsonSchema = { type: 'string' };
    expect(isJsonSchema(schema)).toBe(true);
  });

  it('should return true for valid JSON Schema with properties', () => {
    const schema: JsonSchema = {
      properties: {
        name: { type: 'string' },
      },
    };
    expect(isJsonSchema(schema)).toBe(true);
  });

  it('should return true for valid JSON Schema with anyOf', () => {
    const schema: JsonSchema = {
      anyOf: [{ type: 'string' }, { type: 'number' }],
    };
    expect(isJsonSchema(schema)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isJsonSchema(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isJsonSchema(undefined)).toBe(false);
  });

  it('should return false for non-object types', () => {
    expect(isJsonSchema('string')).toBe(false);
    expect(isJsonSchema(123)).toBe(false);
    expect(isJsonSchema(true)).toBe(false);
  });

  it('should return false for empty object', () => {
    expect(isJsonSchema({})).toBe(false);
  });
});

describe('extractRequiredFields', () => {
  it('should extract required field names', () => {
    const schema = z.object({
      required1: z.string(),
      required2: z.number(),
      optional: z.string().optional(),
    });
    const jsonSchema = convertZodToJsonSchema(schema);
    const required = extractRequiredFields(jsonSchema);

    expect(required).toContain('required1');
    expect(required).toContain('required2');
    expect(required).not.toContain('optional');
  });

  it('should return empty array when no required fields', () => {
    const jsonSchema: JsonSchema = {
      type: 'object',
      properties: {
        optional1: { type: 'string' },
        optional2: { type: 'number' },
      },
    };
    const required = extractRequiredFields(jsonSchema);

    expect(required).toEqual([]);
  });
});

describe('extractPropertyNames', () => {
  it('should extract all property names', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      email: z.string(),
    });
    const jsonSchema = convertZodToJsonSchema(schema);
    const propertyNames = extractPropertyNames(jsonSchema);

    expect(propertyNames).toContain('name');
    expect(propertyNames).toContain('age');
    expect(propertyNames).toContain('email');
    expect(propertyNames.length).toBe(3);
  });

  it('should return empty array when no properties', () => {
    const jsonSchema: JsonSchema = {
      type: 'string',
    };
    const propertyNames = extractPropertyNames(jsonSchema);

    expect(propertyNames).toEqual([]);
  });
});

describe('getFieldDescription', () => {
  it('should get field description', () => {
    const schema = z.object({
      name: z.string().describe('User name'),
      age: z.number().describe('User age'),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(getFieldDescription(jsonSchema, 'name')).toBe('User name');
    expect(getFieldDescription(jsonSchema, 'age')).toBe('User age');
  });

  it('should return undefined for non-existent field', () => {
    const schema = z.object({
      name: z.string(),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(getFieldDescription(jsonSchema, 'nonexistent')).toBeUndefined();
  });

  it('should return undefined for field without description', () => {
    const schema = z.object({
      name: z.string(),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(getFieldDescription(jsonSchema, 'name')).toBeUndefined();
  });
});

describe('extractFieldDescriptions', () => {
  it('should extract all field descriptions', () => {
    const schema = z.object({
      name: z.string().describe('User name'),
      age: z.number().describe('User age'),
      email: z.string().describe('User email'),
    });
    const jsonSchema = convertZodToJsonSchema(schema);
    const descriptions = extractFieldDescriptions(jsonSchema);

    expect(descriptions).toEqual({
      name: 'User name',
      age: 'User age',
      email: 'User email',
    });
  });

  it('should only include fields with descriptions', () => {
    const schema = z.object({
      withDesc: z.string().describe('Has description'),
      withoutDesc: z.string(),
    });
    const jsonSchema = convertZodToJsonSchema(schema);
    const descriptions = extractFieldDescriptions(jsonSchema);

    expect(descriptions).toEqual({
      withDesc: 'Has description',
    });
    expect(descriptions.withoutDesc).toBeUndefined();
  });

  it('should return empty object when no properties', () => {
    const jsonSchema: JsonSchema = {
      type: 'string',
    };
    const descriptions = extractFieldDescriptions(jsonSchema);

    expect(descriptions).toEqual({});
  });

  it('should return empty object when no descriptions', () => {
    const schema = z.object({
      field1: z.string(),
      field2: z.number(),
    });
    const jsonSchema = convertZodToJsonSchema(schema);
    const descriptions = extractFieldDescriptions(jsonSchema);

    expect(descriptions).toEqual({});
  });
});

describe('isFieldRequired', () => {
  it('should return true for required fields', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(isFieldRequired(jsonSchema, 'required')).toBe(true);
  });

  it('should return false for optional fields', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(isFieldRequired(jsonSchema, 'optional')).toBe(false);
  });

  it('should return false for non-existent fields', () => {
    const schema = z.object({
      field: z.string(),
    });
    const jsonSchema = convertZodToJsonSchema(schema);

    expect(isFieldRequired(jsonSchema, 'nonexistent')).toBe(false);
  });
});

describe('vendor onboarding example schema', () => {
  it('should convert a realistic vendor onboarding schema', () => {
    const vendorOnboardingSchema = z.object({
      legal_name: z.string().describe('Legal business name'),
      country: z.string().length(2).describe('Two-letter country code (ISO 3166-1 alpha-2)'),
      tax_id: z.string().describe('Tax identification number'),
      bank_account: z.object({
        account_number: z.string().describe('Bank account number'),
        routing_number: z.string().describe('Bank routing number'),
        account_holder_name: z.string().describe('Account holder name'),
      }).describe('Bank account information'),
      documents: z.object({
        w9_or_w8: z.string().describe('W-9 or W-8 form upload'),
        certificate_of_insurance: z.string().optional().describe('Certificate of insurance'),
      }).describe('Required documentation'),
      contact: z.object({
        email: z.string().email().describe('Primary contact email'),
        phone: z.string().describe('Primary contact phone'),
      }).describe('Contact information'),
      business_type: z.enum(['sole_proprietor', 'llc', 'corporation', 'partnership'])
        .describe('Type of business entity'),
      employees: z.number().min(1).describe('Number of employees'),
      annual_revenue: z.number().min(0).describe('Annual revenue in USD'),
      established_date: z.string().describe('Date business was established (ISO 8601)'),
    });

    const jsonSchema = convertZodToJsonSchema(vendorOnboardingSchema, {
      name: 'VendorOnboarding',
      description: 'Vendor onboarding intake form',
    });

    // Verify structure
    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.title).toBe('VendorOnboarding');
    expect(jsonSchema.description).toBe('Vendor onboarding intake form');

    // Verify all required fields are present
    expect(jsonSchema.required).toContain('legal_name');
    expect(jsonSchema.required).toContain('country');
    expect(jsonSchema.required).toContain('tax_id');
    expect(jsonSchema.required).toContain('bank_account');
    expect(jsonSchema.required).toContain('documents');

    // Verify nested objects
    expect(jsonSchema.properties?.bank_account?.type).toBe('object');
    expect(jsonSchema.properties?.bank_account?.properties?.account_number).toBeDefined();

    // Verify descriptions
    expect(jsonSchema.properties?.legal_name?.description).toBe('Legal business name');
    expect(jsonSchema.properties?.bank_account?.description).toBe('Bank account information');

    // Verify constraints
    expect(jsonSchema.properties?.country?.minLength).toBe(2);
    expect(jsonSchema.properties?.country?.maxLength).toBe(2);
    expect(jsonSchema.properties?.employees?.minimum).toBe(1);

    // Verify enum
    expect(jsonSchema.properties?.business_type?.enum).toEqual([
      'sole_proprietor',
      'llc',
      'corporation',
      'partnership',
    ]);
  });
});
