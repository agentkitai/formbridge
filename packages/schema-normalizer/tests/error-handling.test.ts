/**
 * Error Handling Tests
 *
 * Validates that parsers produce clear, descriptive error messages for:
 * - Unsupported schema features
 * - Invalid schema structures
 * - Missing required properties
 * - Type mismatches
 * - Edge cases that should fail gracefully
 *
 * This ensures users receive actionable error messages when their schemas
 * contain unsupported constructs or invalid data.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { JSONSchemaParser, JSONSchema } from '../src/parsers/json-schema-parser';
import { ZodParser } from '../src/parsers/zod-parser';
import { OpenAPIParser, OpenAPIDocument } from '../src/parsers/openapi-parser';
import { ParserError } from '../src/types/parser';
import { UnsupportedFeatureError, SchemaValidationError } from '../src/types/errors';

describe('Error Handling - JSON Schema Unsupported Features', () => {
  const parser = new JSONSchemaParser();

  it('should throw clear error for $ref (schema references)', () => {
    const schema: JSONSchema = {
      $ref: '#/definitions/User',
    };

    expect(() => parser.parse(schema)).toThrow(UnsupportedFeatureError);
    expect(() => parser.parse(schema)).toThrow(/\$ref/);
    expect(() => parser.parse(schema)).toThrow(/not supported in FormBridge v1/);
    expect(() => parser.parse(schema)).toThrow(/inline the referenced schema/);
  });

  it('should throw clear error for allOf (schema composition)', () => {
    const schema: JSONSchema = {
      allOf: [
        { type: 'object', properties: { name: { type: 'string' } } },
        { type: 'object', properties: { age: { type: 'number' } } },
      ],
    };

    expect(() => parser.parse(schema)).toThrow(UnsupportedFeatureError);
    expect(() => parser.parse(schema)).toThrow(/allOf/);
    expect(() => parser.parse(schema)).toThrow(/not supported in FormBridge v1/);
    expect(() => parser.parse(schema)).toThrow(/merge the schemas manually/);
  });

  it('should throw clear error for anyOf (union types)', () => {
    const schema: JSONSchema = {
      anyOf: [
        { type: 'string' },
        { type: 'number' },
      ],
    };

    expect(() => parser.parse(schema)).toThrow(UnsupportedFeatureError);
    expect(() => parser.parse(schema)).toThrow(/anyOf/);
    expect(() => parser.parse(schema)).toThrow(/not supported in FormBridge v1/);
    expect(() => parser.parse(schema)).toThrow(/Union types/);
  });

  it('should throw clear error for oneOf (discriminated unions)', () => {
    const schema: JSONSchema = {
      oneOf: [
        { type: 'object', properties: { type: { enum: ['a'] } } },
        { type: 'object', properties: { type: { enum: ['b'] } } },
      ],
    };

    expect(() => parser.parse(schema)).toThrow(UnsupportedFeatureError);
    expect(() => parser.parse(schema)).toThrow(/oneOf/);
    expect(() => parser.parse(schema)).toThrow(/not supported in FormBridge v1/);
    expect(() => parser.parse(schema)).toThrow(/Discriminated unions/);
  });

  it('should throw clear error for not (schema negation)', () => {
    const schema: JSONSchema = {
      type: 'string',
      not: { enum: ['forbidden'] },
    };

    expect(() => parser.parse(schema)).toThrow(UnsupportedFeatureError);
    expect(() => parser.parse(schema)).toThrow(/not/);
    expect(() => parser.parse(schema)).toThrow(/not supported in FormBridge v1/);
    expect(() => parser.parse(schema)).toThrow(/positive constraints/);
  });

  it('should throw clear error for nested unsupported features', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        field: {
          $ref: '#/definitions/Something',
        },
      },
    };

    expect(() => parser.parse(schema)).toThrow(UnsupportedFeatureError);
    expect(() => parser.parse(schema)).toThrow(/\$ref/);
  });

  it('should throw clear error for unsupported features in array items', () => {
    const schema: JSONSchema = {
      type: 'array',
      items: {
        anyOf: [
          { type: 'string' },
          { type: 'number' },
        ],
      },
    };

    expect(() => parser.parse(schema)).toThrow(UnsupportedFeatureError);
    expect(() => parser.parse(schema)).toThrow(/anyOf/);
  });
});

describe('Error Handling - JSON Schema Invalid Structures', () => {
  const parser = new JSONSchemaParser();

  it('should throw error for missing type property', () => {
    const schema: JSONSchema = {
      description: 'A field without type',
    };

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/must have a "type" property/);
  });

  it('should throw error for union types (array of types)', () => {
    const schema: JSONSchema = {
      type: ['string', 'number'],
    };

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Union types/);
    expect(() => parser.parse(schema)).toThrow(/not supported in v1/);
  });

  it('should throw error for unsupported type', () => {
    const schema: JSONSchema = {
      type: 'unknown-type' as any,
    };

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported JSON Schema type/);
  });

  it('should throw error for array without items', () => {
    const schema: JSONSchema = {
      type: 'array',
    };

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Array type must have an "items" property/);
  });

  it('should throw error for tuple validation (items as array)', () => {
    const schema: JSONSchema = {
      type: 'array',
      items: [
        { type: 'string' },
        { type: 'number' },
      ],
    };

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Tuple validation/);
    expect(() => parser.parse(schema)).toThrow(/not supported in v1/);
  });

  it('should throw error for empty enum array', () => {
    const schema: JSONSchema = {
      enum: [],
    };

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/non-empty "enum" array/);
  });

  it('should throw error for invalid enum value types', () => {
    const schema: JSONSchema = {
      enum: [{ invalid: 'object' }] as any,
    };

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Enum values must be string, number, boolean, or null/);
  });

  it('should throw error for invalid input (not an object)', () => {
    expect(() => parser.parse(null as any)).toThrow(ParserError);
    expect(() => parser.parse(null as any)).toThrow(/expected an object/);

    expect(() => parser.parse('string' as any)).toThrow(ParserError);
    expect(() => parser.parse(123 as any)).toThrow(ParserError);
  });

  it('should throw error for unsupported string format in strict mode', () => {
    const strictParser = new JSONSchemaParser({ strict: true });
    const schema: JSONSchema = {
      type: 'string',
      format: 'custom-unknown-format',
    };

    expect(() => strictParser.parse(schema)).toThrow(ParserError);
    expect(() => strictParser.parse(schema)).toThrow(/Unsupported string format/);
  });

  it('should not throw error for unsupported string format in non-strict mode', () => {
    const nonStrictParser = new JSONSchemaParser({ strict: false });
    const schema: JSONSchema = {
      type: 'string',
      format: 'custom-unknown-format',
    };

    // Should not throw - unknown formats are ignored in non-strict mode
    expect(() => nonStrictParser.parse(schema)).not.toThrow();
  });
});

describe('Error Handling - Zod Unsupported Types', () => {
  const parser = new ZodParser();

  it('should throw clear error for unsupported Zod types (ZodLiteral)', () => {
    const schema = z.literal('exact-value');

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported Zod type/);
    expect(() => parser.parse(schema)).toThrow(/ZodLiteral/);
  });

  it('should throw clear error for ZodUnion', () => {
    const schema = z.union([z.string(), z.number()]);

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported Zod type/);
    expect(() => parser.parse(schema)).toThrow(/ZodUnion/);
  });

  it('should throw clear error for ZodIntersection', () => {
    const schema = z.intersection(
      z.object({ name: z.string() }),
      z.object({ age: z.number() })
    );

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported Zod type/);
    expect(() => parser.parse(schema)).toThrow(/ZodIntersection/);
  });

  it('should throw clear error for ZodDiscriminatedUnion', () => {
    const schema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('a'), value: z.string() }),
      z.object({ type: z.literal('b'), value: z.number() }),
    ]);

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported Zod type/);
    expect(() => parser.parse(schema)).toThrow(/ZodDiscriminatedUnion/);
  });

  it('should throw clear error for ZodTuple', () => {
    const schema = z.tuple([z.string(), z.number(), z.boolean()]);

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported Zod type/);
    expect(() => parser.parse(schema)).toThrow(/ZodTuple/);
  });

  it('should throw clear error for ZodRecord', () => {
    const schema = z.record(z.string(), z.number());

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported Zod type/);
    expect(() => parser.parse(schema)).toThrow(/ZodRecord/);
  });

  it('should throw clear error for ZodMap', () => {
    const schema = z.map(z.string(), z.number());

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported Zod type/);
    expect(() => parser.parse(schema)).toThrow(/ZodMap/);
  });

  it('should throw clear error for ZodSet', () => {
    const schema = z.set(z.string());

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported Zod type/);
    expect(() => parser.parse(schema)).toThrow(/ZodSet/);
  });

  it('should throw clear error for ZodFunction', () => {
    const schema = z.function();

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported Zod type/);
    expect(() => parser.parse(schema)).toThrow(/ZodFunction/);
  });

  it('should throw clear error for ZodLazy', () => {
    const schema: z.ZodTypeAny = z.lazy(() => z.string());

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported Zod type/);
    expect(() => parser.parse(schema)).toThrow(/ZodLazy/);
  });

  it('should throw clear error for ZodPromise', () => {
    const schema = z.promise(z.string());

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported Zod type/);
    expect(() => parser.parse(schema)).toThrow(/ZodPromise/);
  });

  it('should throw clear error for ZodAny', () => {
    const schema = z.any();

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported Zod type/);
    expect(() => parser.parse(schema)).toThrow(/ZodAny/);
  });

  it('should throw clear error for ZodUnknown', () => {
    const schema = z.unknown();

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported Zod type/);
    expect(() => parser.parse(schema)).toThrow(/ZodUnknown/);
  });

  it('should throw clear error for ZodVoid', () => {
    const schema = z.void();

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported Zod type/);
    expect(() => parser.parse(schema)).toThrow(/ZodVoid/);
  });

  it('should throw clear error for ZodUndefined', () => {
    const schema = z.undefined();

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported Zod type/);
    expect(() => parser.parse(schema)).toThrow(/ZodUndefined/);
  });

  it('should throw clear error for ZodNever', () => {
    const schema = z.never();

    expect(() => parser.parse(schema)).toThrow(ParserError);
    expect(() => parser.parse(schema)).toThrow(/Unsupported Zod type/);
    expect(() => parser.parse(schema)).toThrow(/ZodNever/);
  });

  it('should throw error for invalid Zod input', () => {
    expect(() => parser.parse(null as any)).toThrow(ParserError);
    expect(() => parser.parse(null as any)).toThrow(/expected a ZodType instance/);

    expect(() => parser.parse({ not: 'a zod schema' } as any)).toThrow(ParserError);
  });

  it('should throw error for ZodObject with invalid shape', () => {
    // This is an edge case - manually creating a broken ZodObject
    const brokenSchema = {
      _def: {
        typeName: 'ZodObject',
        shape: 'not-a-function',
      },
    } as any;

    expect(() => parser.parse(brokenSchema)).toThrow(ParserError);
    expect(() => parser.parse(brokenSchema)).toThrow(/shape is not a function/);
  });

  it('should throw error for ZodArray with missing type', () => {
    const brokenSchema = {
      _def: {
        typeName: 'ZodArray',
        // Missing 'type' property
      },
    } as any;

    expect(() => parser.parse(brokenSchema)).toThrow(ParserError);
    expect(() => parser.parse(brokenSchema)).toThrow(/type is missing/);
  });

  it('should throw error for ZodEnum with missing values', () => {
    const brokenSchema = {
      _def: {
        typeName: 'ZodEnum',
        // Missing 'values' property
      },
    } as any;

    expect(() => parser.parse(brokenSchema)).toThrow(ParserError);
    expect(() => parser.parse(brokenSchema)).toThrow(/values are missing/);
  });

  it('should throw error for ZodEnum with invalid value types', () => {
    const brokenSchema = {
      _def: {
        typeName: 'ZodEnum',
        values: [{ invalid: 'object' }],
      },
    } as any;

    expect(() => parser.parse(brokenSchema)).toThrow(ParserError);
    expect(() => parser.parse(brokenSchema)).toThrow(/must be string or number/);
  });

  it('should throw error for ZodEnum with empty values array', () => {
    const brokenSchema = {
      _def: {
        typeName: 'ZodEnum',
        values: [],
      },
    } as any;

    expect(() => parser.parse(brokenSchema)).toThrow(ParserError);
    expect(() => parser.parse(brokenSchema)).toThrow(/must have at least one value/);
  });

  it('should throw error for ZodEnum with invalid values object', () => {
    const brokenSchema = {
      _def: {
        typeName: 'ZodEnum',
        values: 'not-an-array-or-object',
      },
    } as any;

    expect(() => parser.parse(brokenSchema)).toThrow(ParserError);
    expect(() => parser.parse(brokenSchema)).toThrow(/must be an array or object/);
  });
});

describe('Error Handling - OpenAPI Invalid Documents', () => {
  const parser = new OpenAPIParser();

  it('should throw clear error for missing openapi version field', () => {
    const doc = {
      info: { title: 'Test API', version: '1.0.0' },
      paths: {},
    } as any;

    expect(() => parser.parse(doc)).toThrow(SchemaValidationError);
    expect(() => parser.parse(doc)).toThrow(/missing "openapi" version field/);
  });

  it('should throw clear error for unsupported OpenAPI version', () => {
    const doc: OpenAPIDocument = {
      openapi: '2.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {},
    };

    expect(() => parser.parse(doc)).toThrow(SchemaValidationError);
    expect(() => parser.parse(doc)).toThrow(/Unsupported OpenAPI version/);
    expect(() => parser.parse(doc)).toThrow(/Only OpenAPI 3.0 and 3.1 are supported/);
  });

  it('should throw clear error for missing paths object', () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
    } as any;

    expect(() => parser.parse(doc)).toThrow(SchemaValidationError);
    expect(() => parser.parse(doc)).toThrow(/missing or invalid "paths" object/);
  });

  it('should throw error when no request body found', () => {
    const doc: OpenAPIDocument = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          get: {
            operationId: 'getUsers',
            responses: {},
          },
        },
      },
    };

    expect(() => parser.parse(doc)).toThrow(ParserError);
    expect(() => parser.parse(doc)).toThrow(/No operation with request body found/);
  });

  it('should throw error when operation not found by operationId', () => {
    const doc: OpenAPIDocument = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          post: {
            operationId: 'createUser',
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { name: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
    };

    expect(() => parser.parse(doc, { operationId: 'nonexistent' })).toThrow(ParserError);
    expect(() => parser.parse(doc, { operationId: 'nonexistent' })).toThrow(/Operation with ID "nonexistent" not found/);
  });

  it('should throw error when path not found', () => {
    const doc: OpenAPIDocument = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
    };

    expect(() => parser.parse(doc, { path: '/nonexistent' })).toThrow(ParserError);
    expect(() => parser.parse(doc, { path: '/nonexistent' })).toThrow(/Path "\/nonexistent" not found/);
  });

  it('should throw error when method not found for path', () => {
    const doc: OpenAPIDocument = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
    };

    expect(() => parser.parse(doc, { path: '/users', method: 'delete' })).toThrow(ParserError);
    expect(() => parser.parse(doc, { path: '/users', method: 'delete' })).toThrow(/Method "delete" not found/);
  });

  it('should throw error when no mutation method found for path', () => {
    const doc: OpenAPIDocument = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          get: {
            responses: {},
          },
        },
      },
    };

    expect(() => parser.parse(doc, { path: '/users' })).toThrow(ParserError);
    expect(() => parser.parse(doc, { path: '/users' })).toThrow(/No mutation operation \(POST\/PUT\/PATCH\) found/);
  });

  it('should throw error when operation has no request body', () => {
    const doc: OpenAPIDocument = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          post: {
            operationId: 'createUser',
            responses: {},
          },
        },
      },
    };

    expect(() => parser.parse(doc, { path: '/users', method: 'post' })).toThrow(ParserError);
    expect(() => parser.parse(doc, { path: '/users', method: 'post' })).toThrow(/No request body defined/);
  });

  it('should throw error when media type not found in request body', () => {
    const doc: OpenAPIDocument = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/xml': {
                  schema: { type: 'object' },
                },
              },
            },
          },
        },
      },
    };

    expect(() => parser.parse(doc, { path: '/users', method: 'post', mediaType: 'application/json' })).toThrow(ParserError);
    expect(() => parser.parse(doc, { path: '/users', method: 'post', mediaType: 'application/json' })).toThrow(/Media type "application\/json" not found/);
    expect(() => parser.parse(doc, { path: '/users', method: 'post', mediaType: 'application/json' })).toThrow(/Available types:/);
  });

  it('should throw error when schema not defined in request body content', () => {
    const doc: OpenAPIDocument = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  examples: {},
                },
              },
            },
          },
        },
      },
    };

    expect(() => parser.parse(doc, { path: '/users', method: 'post' })).toThrow(ParserError);
    expect(() => parser.parse(doc, { path: '/users', method: 'post' })).toThrow(/No schema defined for application\/json/);
  });

  it('should throw error for invalid OpenAPI document (not an object)', () => {
    expect(() => parser.parse(null as any)).toThrow();
    expect(() => parser.parse('string' as any)).toThrow();
    expect(() => parser.parse(123 as any)).toThrow();
  });
});

describe('Error Handling - Nested Unsupported Features', () => {
  const jsonParser = new JSONSchemaParser();

  it('should throw error for $ref in deeply nested object', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            profile: {
              type: 'object',
              properties: {
                address: {
                  $ref: '#/definitions/Address',
                },
              },
            },
          },
        },
      },
    };

    expect(() => jsonParser.parse(schema)).toThrow(UnsupportedFeatureError);
    expect(() => jsonParser.parse(schema)).toThrow(/\$ref/);
  });

  it('should throw error for anyOf in array items', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: {
            anyOf: [
              { type: 'string' },
              { type: 'number' },
            ],
          },
        },
      },
    };

    expect(() => jsonParser.parse(schema)).toThrow(UnsupportedFeatureError);
    expect(() => jsonParser.parse(schema)).toThrow(/anyOf/);
  });

  it('should throw error for oneOf in nested array of objects', () => {
    const schema: JSONSchema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          value: {
            oneOf: [
              { type: 'string' },
              { type: 'number' },
            ],
          },
        },
      },
    };

    expect(() => jsonParser.parse(schema)).toThrow(UnsupportedFeatureError);
    expect(() => jsonParser.parse(schema)).toThrow(/oneOf/);
  });
});

describe('Error Handling - OpenAPI with Unsupported JSON Schema Features', () => {
  const parser = new OpenAPIParser();

  it('should throw error for $ref in OpenAPI request body schema', () => {
    const doc: OpenAPIDocument = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/User',
                  },
                },
              },
            },
          },
        },
      },
    };

    expect(() => parser.parse(doc)).toThrow(UnsupportedFeatureError);
    expect(() => parser.parse(doc)).toThrow(/\$ref/);
  });

  it('should throw error for allOf in OpenAPI request body schema', () => {
    const doc: OpenAPIDocument = {
      openapi: '3.1.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          post: {
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { type: 'object', properties: { name: { type: 'string' } } },
                      { type: 'object', properties: { age: { type: 'number' } } },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    };

    expect(() => parser.parse(doc)).toThrow(UnsupportedFeatureError);
    expect(() => parser.parse(doc)).toThrow(/allOf/);
  });
});

describe('Error Handling - Context Information', () => {
  const jsonParser = new JSONSchemaParser();

  it('should include context information in error for $ref', () => {
    const schema: JSONSchema = {
      $ref: '#/definitions/User',
    };

    try {
      jsonParser.parse(schema);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedFeatureError);
      const unsupportedError = error as UnsupportedFeatureError;
      expect(unsupportedError.feature).toBe('$ref');
      expect(unsupportedError.context).toBeDefined();
      expect(unsupportedError.context?.$ref).toBe('#/definitions/User');
    }
  });

  it('should include context information in error for allOf', () => {
    const schema: JSONSchema = {
      allOf: [
        { type: 'string' },
        { type: 'string', minLength: 5 },
      ],
    };

    try {
      jsonParser.parse(schema);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedFeatureError);
      const unsupportedError = error as UnsupportedFeatureError;
      expect(unsupportedError.feature).toBe('allOf');
      expect(unsupportedError.context).toBeDefined();
      expect(unsupportedError.context?.schemasCount).toBe(2);
    }
  });

  it('should include helpful error message for unsupported Zod type', () => {
    const zodParser = new ZodParser();
    const schema = z.union([z.string(), z.number()]);

    try {
      zodParser.parse(schema);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(ParserError);
      const parserError = error as ParserError;
      expect(parserError.message).toContain('Unsupported Zod type');
      expect(parserError.message).toContain('ZodUnion');
      expect(parserError.context).toBeDefined();
      expect(parserError.context?.typeName).toBe('ZodUnion');
    }
  });
});

describe('Error Handling - Error Message Quality', () => {
  it('should provide actionable error message for $ref', () => {
    const parser = new JSONSchemaParser();
    const schema: JSONSchema = { $ref: '#/definitions/User' };

    try {
      parser.parse(schema);
      expect.fail('Should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      // Should mention the feature
      expect(message).toMatch(/\$ref/i);
      // Should say it's not supported
      expect(message).toMatch(/not supported/i);
      // Should provide guidance
      expect(message).toMatch(/inline/i);
    }
  });

  it('should provide actionable error message for anyOf', () => {
    const parser = new JSONSchemaParser();
    const schema: JSONSchema = {
      anyOf: [{ type: 'string' }, { type: 'number' }],
    };

    try {
      parser.parse(schema);
      expect.fail('Should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/anyOf/i);
      expect(message).toMatch(/not supported/i);
      expect(message).toMatch(/union types/i);
      expect(message).toMatch(/separate schemas/i);
    }
  });

  it('should provide clear error for missing operationId in OpenAPI', () => {
    const parser = new OpenAPIParser();
    const doc: OpenAPIDocument = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0.0' },
      paths: { '/test': { post: { requestBody: { content: { 'application/json': { schema: { type: 'object' } } } } } } },
    };

    try {
      parser.parse(doc, { operationId: 'missing' });
      expect.fail('Should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/operation with id/i);
      expect(message).toMatch(/missing/);
      expect(message).toMatch(/not found/i);
    }
  });
});
