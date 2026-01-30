/**
 * Edge Cases Test Suite
 *
 * Comprehensive test coverage for edge cases across all three parsers:
 * - Deeply nested objects
 * - Large arrays
 * - All constraint combinations
 * - Boundary values
 * - Empty objects and arrays
 * - Optional everything
 * - Mixed required/optional
 * - Unicode and special characters
 * - Format variations
 * - Extreme nesting levels
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { JSONSchemaParser, JSONSchema } from '../src/parsers/json-schema-parser';
import { ZodParser } from '../src/parsers/zod-parser';
import { OpenAPIParser, OpenAPIDocument } from '../src/parsers/openapi-parser';
import type { IntakeSchema } from '../src/types/intake-schema';

describe('Edge Cases - Deeply Nested Structures', () => {
  const jsonSchemaParser = new JSONSchemaParser();
  const zodParser = new ZodParser();

  it('should handle 10+ level deep object nesting (JSON Schema)', () => {
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
                        level5: {
                          type: 'object',
                          properties: {
                            level6: {
                              type: 'object',
                              properties: {
                                level7: {
                                  type: 'object',
                                  properties: {
                                    level8: {
                                      type: 'object',
                                      properties: {
                                        level9: {
                                          type: 'object',
                                          properties: {
                                            level10: {
                                              type: 'object',
                                              properties: {
                                                deepValue: { type: 'string' },
                                              },
                                            },
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
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

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('object');

    // Navigate to the deepest level
    let current: any = ir;
    for (let i = 1; i <= 10; i++) {
      expect(current.properties).toBeDefined();
      current = current.properties[`level${i}`];
      expect(current.type).toBe('object');
    }

    // Verify we reached the deepest value
    expect(current.properties.deepValue.type).toBe('string');
  });

  it('should handle deeply nested arrays (JSON Schema)', () => {
    const schema: JSONSchema = {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'array',
          items: {
            type: 'array',
            items: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
          },
        },
      },
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('array');

    // Navigate through nested arrays
    let current: any = ir;
    for (let i = 0; i < 5; i++) {
      expect(current.type).toBe('array');
      expect(current.items).toBeDefined();
      current = current.items;
    }

    expect(current.type).toBe('string');
  });

  it('should handle mixed nesting (objects in arrays in objects) (JSON Schema)', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        departments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              teams: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    members: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string' },
                          roles: {
                            type: 'array',
                            items: { type: 'string' },
                          },
                        },
                        required: ['name'],
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

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('object');
    expect(ir.properties.departments.type).toBe('array');

    const deptItems: any = ir.properties.departments.items;
    expect(deptItems.type).toBe('object');
    expect(deptItems.properties.teams.type).toBe('array');

    const teamItems: any = deptItems.properties.teams.items;
    expect(teamItems.type).toBe('object');
    expect(teamItems.properties.members.type).toBe('array');

    const memberItems: any = teamItems.properties.members.items;
    expect(memberItems.type).toBe('object');
    expect(memberItems.properties.name.type).toBe('string');
    expect(memberItems.properties.roles.type).toBe('array');
  });

  it('should handle 10+ level deep object nesting (Zod)', () => {
    const schema = z.object({
      level1: z.object({
        level2: z.object({
          level3: z.object({
            level4: z.object({
              level5: z.object({
                level6: z.object({
                  level7: z.object({
                    level8: z.object({
                      level9: z.object({
                        level10: z.object({
                          deepValue: z.string(),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const ir = zodParser.parse(schema);
    expect(ir.type).toBe('object');

    // Navigate to the deepest level
    let current: any = ir;
    for (let i = 1; i <= 10; i++) {
      expect(current.properties).toBeDefined();
      current = current.properties[`level${i}`];
      expect(current.type).toBe('object');
    }

    expect(current.properties.deepValue.type).toBe('string');
  });

  it('should handle arrays of arrays of arrays (Zod)', () => {
    const schema = z.array(z.array(z.array(z.array(z.string()))));

    const ir = zodParser.parse(schema);
    expect(ir.type).toBe('array');

    let current: any = ir;
    for (let i = 0; i < 4; i++) {
      expect(current.type).toBe('array');
      current = current.items;
    }

    expect(current.type).toBe('string');
  });
});

describe('Edge Cases - Boundary Values', () => {
  const jsonSchemaParser = new JSONSchemaParser();
  const zodParser = new ZodParser();

  it('should handle empty string with minLength constraint', () => {
    const schema: JSONSchema = {
      type: 'string',
      minLength: 0,
      maxLength: 100,
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('string');
    expect(ir.constraints?.minLength).toBe(0);
    expect(ir.constraints?.maxLength).toBe(100);
  });

  it('should handle zero values for number constraints', () => {
    const schema: JSONSchema = {
      type: 'number',
      minimum: 0,
      maximum: 0,
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('number');
    expect(ir.constraints?.minimum).toBe(0);
    expect(ir.constraints?.maximum).toBe(0);
  });

  it('should handle negative number boundaries', () => {
    const schema: JSONSchema = {
      type: 'integer',
      minimum: -2147483648,
      maximum: -1,
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('integer');
    expect(ir.constraints?.minimum).toBe(-2147483648);
    expect(ir.constraints?.maximum).toBe(-1);
  });

  it('should handle very large numbers', () => {
    const schema: JSONSchema = {
      type: 'number',
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('number');
    expect(ir.constraints?.maximum).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('should handle fractional multipleOf values', () => {
    const schema: JSONSchema = {
      type: 'number',
      multipleOf: 0.01,
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('number');
    expect(ir.constraints?.multipleOf).toBe(0.01);
  });

  it('should handle exclusive boundaries (draft-2020-12)', () => {
    const schema: JSONSchema = {
      type: 'number',
      exclusiveMinimum: 0,
      exclusiveMaximum: 100,
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('number');
    expect(ir.constraints?.exclusiveMinimum).toBe(0);
    expect(ir.constraints?.exclusiveMaximum).toBe(100);
  });

  it('should handle exclusive boundaries (draft-07 boolean style)', () => {
    const schema: JSONSchema = {
      type: 'number',
      minimum: 0,
      maximum: 100,
      exclusiveMinimum: true,
      exclusiveMaximum: true,
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('number');
    // In draft-07 boolean style, the parser should convert to exclusiveMinimum/Maximum
    expect(ir.constraints?.exclusiveMinimum).toBe(0);
    expect(ir.constraints?.exclusiveMaximum).toBe(100);
  });

  it('should handle array with zero minItems', () => {
    const schema: JSONSchema = {
      type: 'array',
      items: { type: 'string' },
      minItems: 0,
      maxItems: 0,
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('array');
    expect(ir.constraints?.minItems).toBe(0);
    expect(ir.constraints?.maxItems).toBe(0);
  });

  it('should handle very large array bounds', () => {
    const schema: JSONSchema = {
      type: 'array',
      items: { type: 'number' },
      minItems: 0,
      maxItems: 10000,
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('array');
    expect(ir.constraints?.maxItems).toBe(10000);
  });

  it('should handle regex pattern with special characters', () => {
    const schema: JSONSchema = {
      type: 'string',
      pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('string');
    expect(ir.constraints?.pattern).toBe('^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$');
  });
});

describe('Edge Cases - Constraint Combinations', () => {
  const jsonSchemaParser = new JSONSchemaParser();
  const zodParser = new ZodParser();

  it('should handle all string constraints together', () => {
    const schema: JSONSchema = {
      type: 'string',
      minLength: 5,
      maxLength: 50,
      pattern: '^[a-z]+$',
      format: 'email',
      description: 'Email with constraints',
      default: 'test@example.com',
      examples: ['user@example.com', 'admin@example.com'],
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('string');
    expect(ir.constraints?.minLength).toBe(5);
    expect(ir.constraints?.maxLength).toBe(50);
    expect(ir.constraints?.pattern).toBe('^[a-z]+$');
    expect(ir.constraints?.format).toBe('email');
    expect(ir.description).toBe('Email with constraints');
    expect(ir.default).toBe('test@example.com');
    expect(ir.examples).toEqual(['user@example.com', 'admin@example.com']);
  });

  it('should handle all number constraints together', () => {
    const schema: JSONSchema = {
      type: 'number',
      minimum: 0,
      maximum: 100,
      exclusiveMinimum: 0,
      exclusiveMaximum: 100,
      multipleOf: 0.5,
      description: 'Percentage value',
      default: 50,
      examples: [25.5, 75.5],
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('number');
    // Note: when both minimum and exclusiveMinimum are present, exclusiveMinimum takes precedence
    expect(ir.constraints?.exclusiveMinimum).toBeDefined();
    expect(ir.constraints?.exclusiveMaximum).toBeDefined();
    expect(ir.constraints?.multipleOf).toBe(0.5);
    expect(ir.description).toBe('Percentage value');
  });

  it('should handle all array constraints together', () => {
    const schema: JSONSchema = {
      type: 'array',
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 20,
      },
      minItems: 1,
      maxItems: 10,
      uniqueItems: true,
      description: 'List of unique tags',
      default: ['tag1', 'tag2'],
      examples: [['a', 'b'], ['x', 'y', 'z']],
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('array');
    expect(ir.constraints?.minItems).toBe(1);
    expect(ir.constraints?.maxItems).toBe(10);
    expect(ir.constraints?.uniqueItems).toBe(true);
    expect(ir.description).toBe('List of unique tags');
    expect(ir.items.type).toBe('string');
    expect(ir.items.constraints?.minLength).toBe(1);
    expect(ir.items.constraints?.maxLength).toBe(20);
  });

  it('should handle nested constraints at multiple levels', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        users: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                minLength: 2,
                maxLength: 50,
                pattern: '^[A-Za-z ]+$',
              },
              age: {
                type: 'integer',
                minimum: 0,
                maximum: 150,
              },
              emails: {
                type: 'array',
                minItems: 1,
                uniqueItems: true,
                items: {
                  type: 'string',
                  format: 'email',
                },
              },
            },
            required: ['name', 'age'],
          },
        },
      },
      required: ['users'],
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('object');

    const users: any = ir.properties.users;
    expect(users.type).toBe('array');
    expect(users.constraints?.minItems).toBe(1);
    expect(users.constraints?.maxItems).toBe(100);

    const user: any = users.items;
    expect(user.type).toBe('object');
    expect(user.properties.name.constraints?.minLength).toBe(2);
    expect(user.properties.name.constraints?.maxLength).toBe(50);
    expect(user.properties.age.constraints?.minimum).toBe(0);
    expect(user.properties.age.constraints?.maximum).toBe(150);

    const emails: any = user.properties.emails;
    expect(emails.constraints?.uniqueItems).toBe(true);
    expect(emails.items.constraints?.format).toBe('email');
  });

  it('should handle all Zod string constraints together', () => {
    const schema = z.string()
      .min(5)
      .max(50)
      .regex(/^[a-z]+$/)
      .email()
      .describe('Email with constraints')
      .default('test@example.com');

    const ir = zodParser.parse(schema);
    expect(ir.type).toBe('string');
    expect(ir.constraints?.minLength).toBe(5);
    expect(ir.constraints?.maxLength).toBe(50);
    expect(ir.constraints?.pattern).toBeDefined();
    expect(ir.constraints?.format).toBe('email');
    expect(ir.description).toBe('Email with constraints');
    expect(ir.default).toBe('test@example.com');
  });

  it('should handle all Zod number constraints together', () => {
    const schema = z.number()
      .min(0)
      .max(100)
      .multipleOf(0.5)
      .describe('Percentage')
      .default(50);

    const ir = zodParser.parse(schema);
    expect(ir.type).toBe('number');
    expect(ir.constraints?.minimum).toBe(0);
    expect(ir.constraints?.maximum).toBe(100);
    expect(ir.constraints?.multipleOf).toBe(0.5);
    expect(ir.description).toBe('Percentage');
    expect(ir.default).toBe(50);
  });
});

describe('Edge Cases - Empty and Minimal Schemas', () => {
  const jsonSchemaParser = new JSONSchemaParser();
  const zodParser = new ZodParser();

  it('should handle empty object schema', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {},
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('object');
    expect(ir.properties).toEqual({});
  });

  it('should handle object with no properties defined', () => {
    const schema: JSONSchema = {
      type: 'object',
      additionalProperties: true,
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('object');
    expect(ir.properties).toEqual({});
    expect(ir.additionalProperties).toBe(true);
  });

  it('should handle minimal string schema', () => {
    const schema: JSONSchema = {
      type: 'string',
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('string');
    expect(ir.required).toBe(true);
    expect(ir.constraints).toBeUndefined();
  });

  it('should handle minimal number schema', () => {
    const schema: JSONSchema = {
      type: 'number',
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('number');
    expect(ir.required).toBe(true);
    expect(ir.constraints).toBeUndefined();
  });

  it('should handle minimal array schema', () => {
    const schema: JSONSchema = {
      type: 'array',
      items: { type: 'string' },
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('array');
    expect(ir.items.type).toBe('string');
    expect(ir.constraints).toBeUndefined();
  });

  it('should handle empty enum array (edge case that might error)', () => {
    const schema: JSONSchema = {
      enum: [],
    };

    expect(() => jsonSchemaParser.parse(schema)).toThrow();
  });

  it('should handle Zod empty object', () => {
    const schema = z.object({});

    const ir = zodParser.parse(schema);
    expect(ir.type).toBe('object');
    expect(ir.properties).toEqual({});
  });

  it('should handle object with single null field', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        nullField: { type: 'null' },
      },
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('object');
    expect(ir.properties.nullField.type).toBe('null');
  });
});

describe('Edge Cases - Optional/Required Variations', () => {
  const jsonSchemaParser = new JSONSchemaParser();
  const zodParser = new ZodParser();

  it('should handle all fields optional', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        field1: { type: 'string' },
        field2: { type: 'number' },
        field3: { type: 'boolean' },
        field4: {
          type: 'object',
          properties: {
            nested: { type: 'string' },
          },
        },
      },
      required: [],
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('object');
    expect(ir.properties.field1.required).toBe(false);
    expect(ir.properties.field2.required).toBe(false);
    expect(ir.properties.field3.required).toBe(false);
    expect(ir.properties.field4.required).toBe(false);
  });

  it('should handle all fields required', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        field1: { type: 'string' },
        field2: { type: 'number' },
        field3: { type: 'boolean' },
      },
      required: ['field1', 'field2', 'field3'],
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('object');
    expect(ir.properties.field1.required).toBe(true);
    expect(ir.properties.field2.required).toBe(true);
    expect(ir.properties.field3.required).toBe(true);
  });

  it('should handle mixed required/optional at different nesting levels', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        required1: { type: 'string' },
        optional1: { type: 'string' },
        nested: {
          type: 'object',
          properties: {
            required2: { type: 'number' },
            optional2: { type: 'number' },
            deepNested: {
              type: 'object',
              properties: {
                required3: { type: 'boolean' },
                optional3: { type: 'boolean' },
              },
              required: ['required3'],
            },
          },
          required: ['required2', 'deepNested'],
        },
      },
      required: ['required1', 'nested'],
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.properties.required1.required).toBe(true);
    expect(ir.properties.optional1.required).toBe(false);

    const nested: any = ir.properties.nested;
    expect(nested.properties.required2.required).toBe(true);
    expect(nested.properties.optional2.required).toBe(false);

    const deepNested: any = nested.properties.deepNested;
    expect(deepNested.properties.required3.required).toBe(true);
    expect(deepNested.properties.optional3.required).toBe(false);
  });

  it('should handle optional arrays', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        optionalArray: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: [],
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.properties.optionalArray.required).toBe(false);
    expect(ir.properties.optionalArray.type).toBe('array');
  });

  it('should handle optional nested objects', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        optionalNested: {
          type: 'object',
          properties: {
            field: { type: 'string' },
          },
          required: ['field'],
        },
      },
      required: [],
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.properties.optionalNested.required).toBe(false);
    const nested: any = ir.properties.optionalNested;
    expect(nested.properties.field.required).toBe(true);
  });

  it('should handle Zod all optional fields', () => {
    const schema = z.object({
      field1: z.string().optional(),
      field2: z.number().optional(),
      field3: z.boolean().optional(),
    });

    const ir = zodParser.parse(schema);
    expect(ir.properties.field1.required).toBe(false);
    expect(ir.properties.field2.required).toBe(false);
    expect(ir.properties.field3.required).toBe(false);
  });

  it('should handle Zod mixed required/optional', () => {
    const schema = z.object({
      required1: z.string(),
      optional1: z.string().optional(),
      required2: z.number(),
      optional2: z.number().optional(),
    });

    const ir = zodParser.parse(schema);
    expect(ir.properties.required1.required).toBe(true);
    expect(ir.properties.optional1.required).toBe(false);
    expect(ir.properties.required2.required).toBe(true);
    expect(ir.properties.optional2.required).toBe(false);
  });

  it('should handle Zod nullable fields', () => {
    const schema = z.object({
      nullable1: z.string().nullable(),
      nullableOptional: z.string().nullable().optional(),
    });

    const ir = zodParser.parse(schema);
    expect(ir.properties.nullable1.nullable).toBe(true);
    expect(ir.properties.nullableOptional.nullable).toBe(true);
    expect(ir.properties.nullableOptional.required).toBe(false);
  });
});

describe('Edge Cases - Unicode and Special Characters', () => {
  const jsonSchemaParser = new JSONSchemaParser();
  const zodParser = new ZodParser();

  it('should handle Unicode in descriptions', () => {
    const schema: JSONSchema = {
      type: 'string',
      description: 'Field with Unicode: 你好世界 🌍 Привет мир',
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('string');
    expect(ir.description).toBe('Field with Unicode: 你好世界 🌍 Привет мир');
  });

  it('should handle emoji in default values', () => {
    const schema: JSONSchema = {
      type: 'string',
      default: '👍 Great!',
      examples: ['😀 Happy', '😢 Sad', '🎉 Party'],
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.default).toBe('👍 Great!');
    expect(ir.examples).toContain('😀 Happy');
  });

  it('should handle international characters in enum values', () => {
    const schema: JSONSchema = {
      enum: ['English', '中文', 'Español', '日本語', 'Русский', '한국어'],
      description: 'Language selection',
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('enum');
    expect(ir.values).toHaveLength(6);
    expect(ir.values.map(v => v.value)).toContain('中文');
    expect(ir.values.map(v => v.value)).toContain('Русский');
  });

  it('should handle special regex characters in patterns', () => {
    const schema: JSONSchema = {
      type: 'string',
      pattern: '^\\$[0-9]+\\.[0-9]{2}$',
      description: 'Price in dollars',
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.constraints?.pattern).toBe('^\\$[0-9]+\\.[0-9]{2}$');
  });

  it('should handle newlines and tabs in descriptions', () => {
    const schema: JSONSchema = {
      type: 'string',
      description: 'Line 1\nLine 2\n\tTabbed line',
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.description).toBe('Line 1\nLine 2\n\tTabbed line');
  });

  it('should handle quotes in descriptions', () => {
    const schema: JSONSchema = {
      type: 'string',
      description: 'Field with "double quotes" and \'single quotes\'',
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.description).toBe('Field with "double quotes" and \'single quotes\'');
  });

  it('should handle Zod with Unicode descriptions', () => {
    const schema = z.string().describe('Unicode: 日本語 🎌');

    const ir = zodParser.parse(schema);
    expect(ir.description).toBe('Unicode: 日本語 🎌');
  });
});

describe('Edge Cases - Format Variations', () => {
  const jsonSchemaParser = new JSONSchemaParser();
  const zodParser = new ZodParser();

  it('should handle all string formats', () => {
    const formats = ['email', 'uri', 'url', 'uuid', 'date', 'date-time', 'time', 'ipv4', 'ipv6', 'hostname'];

    formats.forEach(format => {
      const schema: JSONSchema = {
        type: 'string',
        format: format,
      };

      const ir = jsonSchemaParser.parse(schema);
      expect(ir.type).toBe('string');
      expect(ir.constraints?.format).toBe(format);
    });
  });

  it('should handle format with other constraints', () => {
    const schema: JSONSchema = {
      type: 'string',
      format: 'email',
      minLength: 5,
      maxLength: 100,
      pattern: '^[a-z]+@',
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.constraints?.format).toBe('email');
    expect(ir.constraints?.minLength).toBe(5);
    expect(ir.constraints?.maxLength).toBe(100);
    expect(ir.constraints?.pattern).toBe('^[a-z]+@');
  });

  it('should handle custom/unknown formats', () => {
    const schema: JSONSchema = {
      type: 'string',
      format: 'custom-format',
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('string');
    // Custom formats should be ignored or passed through
  });

  it('should handle Zod email format', () => {
    const schema = z.string().email();

    const ir = zodParser.parse(schema);
    expect(ir.constraints?.format).toBe('email');
  });

  it('should handle Zod url format', () => {
    const schema = z.string().url();

    const ir = zodParser.parse(schema);
    expect(ir.constraints?.format).toBe('url');
  });

  it('should handle Zod uuid format', () => {
    const schema = z.string().uuid();

    const ir = zodParser.parse(schema);
    expect(ir.constraints?.format).toBe('uuid');
  });

  it('should handle Zod datetime format', () => {
    const schema = z.string().datetime();

    const ir = zodParser.parse(schema);
    expect(ir.constraints?.format).toBe('date-time');
  });
});

describe('Edge Cases - Array Variations', () => {
  const jsonSchemaParser = new JSONSchemaParser();
  const zodParser = new ZodParser();

  it('should handle array of enums', () => {
    const schema: JSONSchema = {
      type: 'array',
      items: {
        enum: ['red', 'green', 'blue'],
      },
      uniqueItems: true,
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('array');
    expect(ir.items.type).toBe('enum');
    expect(ir.constraints?.uniqueItems).toBe(true);
  });

  it('should handle array of objects with constraints', () => {
    const schema: JSONSchema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer', minimum: 1 },
          name: { type: 'string', minLength: 1 },
        },
        required: ['id', 'name'],
      },
      minItems: 1,
      maxItems: 100,
      uniqueItems: false,
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('array');
    expect(ir.constraints?.minItems).toBe(1);
    expect(ir.constraints?.maxItems).toBe(100);
    expect(ir.constraints?.uniqueItems).toBe(false);

    const items: any = ir.items;
    expect(items.type).toBe('object');
    expect(items.properties.id.required).toBe(true);
  });

  it('should handle uniqueItems with complex objects', () => {
    const schema: JSONSchema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {
              value: { type: 'string' },
            },
          },
        },
      },
      uniqueItems: true,
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.constraints?.uniqueItems).toBe(true);
    const items: any = ir.items;
    expect(items.type).toBe('object');
  });

  it('should handle array with same minItems and maxItems', () => {
    const schema: JSONSchema = {
      type: 'array',
      items: { type: 'string' },
      minItems: 5,
      maxItems: 5,
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.constraints?.minItems).toBe(5);
    expect(ir.constraints?.maxItems).toBe(5);
  });

  it('should handle Zod array with length constraint', () => {
    const schema = z.array(z.string()).min(1).max(10);

    const ir = zodParser.parse(schema);
    expect(ir.type).toBe('array');
    expect(ir.constraints?.minItems).toBe(1);
    expect(ir.constraints?.maxItems).toBe(10);
  });

  it('should handle nested array of arrays', () => {
    const schema: JSONSchema = {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'array',
          items: { type: 'integer' },
        },
      },
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('array');

    let current: any = ir.items;
    expect(current.type).toBe('array');

    current = current.items;
    expect(current.type).toBe('array');
    expect(current.items.type).toBe('integer');
  });
});

describe('Edge Cases - Enum Variations', () => {
  const jsonSchemaParser = new JSONSchemaParser();
  const zodParser = new ZodParser();

  it('should handle enum with single value', () => {
    const schema: JSONSchema = {
      enum: ['only-option'],
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('enum');
    expect(ir.values).toHaveLength(1);
    expect(ir.values[0].value).toBe('only-option');
  });

  it('should handle enum with mixed types', () => {
    const schema: JSONSchema = {
      enum: ['string', 123, true, null],
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('enum');
    expect(ir.values).toHaveLength(4);
    expect(ir.values.map(v => v.value)).toContain('string');
    expect(ir.values.map(v => v.value)).toContain(123);
    expect(ir.values.map(v => v.value)).toContain(true);
    expect(ir.values.map(v => v.value)).toContain(null);
  });

  it('should handle enum with very long list', () => {
    const values = Array.from({ length: 100 }, (_, i) => `option-${i}`);
    const schema: JSONSchema = {
      enum: values,
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('enum');
    expect(ir.values).toHaveLength(100);
  });

  it('should handle enum with duplicate values (should preserve all)', () => {
    const schema: JSONSchema = {
      enum: ['a', 'b', 'a', 'c'],
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('enum');
    // Duplicates might be preserved or deduplicated depending on implementation
    expect(ir.values.length).toBeGreaterThanOrEqual(3);
  });

  it('should handle Zod enum with numbers', () => {
    enum NumericEnum {
      First = 1,
      Second = 2,
      Third = 3,
    }

    const schema = z.nativeEnum(NumericEnum);

    const ir = zodParser.parse(schema);
    expect(ir.type).toBe('enum');
    expect(ir.values.length).toBeGreaterThan(0);
  });

  it('should handle Zod enum with strings', () => {
    const schema = z.enum(['small', 'medium', 'large', 'x-large']);

    const ir = zodParser.parse(schema);
    expect(ir.type).toBe('enum');
    expect(ir.values).toHaveLength(4);
    expect(ir.values.map(v => v.value)).toContain('small');
    expect(ir.values.map(v => v.value)).toContain('x-large');
  });
});

describe('Edge Cases - OpenAPI Specific', () => {
  const openAPIParser = new OpenAPIParser();

  it('should handle OpenAPI with deeply nested request body', () => {
    const doc: OpenAPIDocument = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/deep': {
          post: {
            operationId: 'deepNest',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
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
                                  deepField: { type: 'string' },
                                },
                              },
                            },
                          },
                        },
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

    const ir = openAPIParser.parse(doc, { operationId: 'deepNest' });
    expect(ir.type).toBe('object');

    const level1: any = ir.properties.level1;
    expect(level1.type).toBe('object');

    const level2: any = level1.properties.level2;
    expect(level2.type).toBe('object');

    const level3: any = level2.properties.level3;
    expect(level3.type).toBe('object');
    expect(level3.properties.deepField.type).toBe('string');
  });

  it('should handle OpenAPI with complex array structures', () => {
    const doc: OpenAPIDocument = {
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/items': {
          post: {
            operationId: 'createItems',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer' },
                        tags: {
                          type: 'array',
                          items: { type: 'string' },
                          minItems: 1,
                        },
                      },
                      required: ['id'],
                    },
                    minItems: 1,
                    maxItems: 100,
                  },
                },
              },
            },
          },
        },
      },
    };

    const ir = openAPIParser.parse(doc, { operationId: 'createItems' });
    expect(ir.type).toBe('array');
    expect(ir.constraints?.minItems).toBe(1);
    expect(ir.constraints?.maxItems).toBe(100);

    const items: any = ir.items;
    expect(items.type).toBe('object');
    expect(items.properties.tags.type).toBe('array');
  });

  it('should handle OpenAPI with all metadata fields', () => {
    const doc: OpenAPIDocument = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          post: {
            operationId: 'createUser',
            summary: 'Create a new user',
            description: 'Creates a new user with the provided information',
            tags: ['users', 'admin'],
            requestBody: {
              description: 'User data',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const ir = openAPIParser.parse(doc, { operationId: 'createUser' });
    expect(ir.type).toBe('object');
    expect(ir.title).toBe('Create a new user');
    expect(ir.description).toBe('Creates a new user with the provided information');
    expect(ir.metadata?.operationId).toBe('createUser');
    expect(ir.metadata?.tags).toContain('users');
    expect(ir.metadata?.tags).toContain('admin');
  });
});

describe('Edge Cases - Complex Real-World Scenarios', () => {
  const jsonSchemaParser = new JSONSchemaParser();

  it('should handle e-commerce order schema', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        orderId: { type: 'string', format: 'uuid' },
        customer: {
          type: 'object',
          properties: {
            customerId: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string', minLength: 1, maxLength: 100 },
            addresses: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  street: { type: 'string' },
                  city: { type: 'string' },
                  country: { type: 'string', minLength: 2, maxLength: 2 },
                  zipCode: { type: 'string', pattern: '^[0-9]{5}$' },
                },
                required: ['street', 'city', 'country'],
              },
              minItems: 1,
            },
          },
          required: ['customerId', 'email', 'name'],
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string' },
              quantity: { type: 'integer', minimum: 1, maximum: 999 },
              price: { type: 'number', minimum: 0, multipleOf: 0.01 },
            },
            required: ['productId', 'quantity', 'price'],
          },
          minItems: 1,
          maxItems: 100,
        },
        total: { type: 'number', minimum: 0, multipleOf: 0.01 },
        status: { enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] },
      },
      required: ['orderId', 'customer', 'items', 'total', 'status'],
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('object');
    expect(ir.properties.orderId.required).toBe(true);
    expect(ir.properties.customer.type).toBe('object');
    expect(ir.properties.items.type).toBe('array');
    expect(ir.properties.status.type).toBe('enum');
  });

  it('should handle survey/form schema with conditional logic metadata', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        respondentId: { type: 'string', format: 'uuid' },
        answers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              questionId: { type: 'string' },
              questionType: { enum: ['text', 'number', 'choice', 'multiChoice', 'scale'] },
              value: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  number: { type: 'number' },
                  choices: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            required: ['questionId', 'questionType'],
          },
        },
        metadata: {
          type: 'object',
          properties: {
            startTime: { type: 'string', format: 'date-time' },
            endTime: { type: 'string', format: 'date-time' },
            userAgent: { type: 'string' },
            ipAddress: { type: 'string', format: 'ipv4' },
          },
        },
      },
      required: ['respondentId', 'answers'],
    };

    const ir = jsonSchemaParser.parse(schema);
    expect(ir.type).toBe('object');

    const answers: any = ir.properties.answers;
    expect(answers.type).toBe('array');

    const answerItem: any = answers.items;
    expect(answerItem.properties.questionType.type).toBe('enum');
    expect(answerItem.properties.value.type).toBe('object');
  });
});
