/**
 * Round-Trip Tests
 *
 * Validates that schemas can be parsed to IntakeSchema IR and serialized back
 * to JSON Schema without information loss. Tests all three input formats:
 * - JSON Schema → IR → JSON Schema → IR
 * - Zod → IR → JSON Schema → IR
 * - OpenAPI → IR → JSON Schema → IR
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { JSONSchemaParser, JSONSchema } from '../src/parsers/json-schema-parser';
import { ZodParser } from '../src/parsers/zod-parser';
import { OpenAPIParser, OpenAPIDocument } from '../src/parsers/openapi-parser';
import { JSONSchemaSerializer } from '../src/serializers/json-schema-serializer';
import type { IntakeSchema } from '../src/types/intake-schema';

/**
 * Helper function to perform round-trip test:
 * 1. Parse input to IR
 * 2. Serialize IR to JSON Schema
 * 3. Parse JSON Schema back to IR
 * 4. Verify both IRs are equivalent (ignoring metadata.source)
 */
function testRoundTrip(
  ir1: IntakeSchema,
  ir2: IntakeSchema,
  testName: string
): void {
  // Create normalized versions for comparison (strip source metadata)
  const normalized1 = normalizeIR(ir1);
  const normalized2 = normalizeIR(ir2);

  // Deep equality check
  expect(normalized2).toEqual(normalized1);
}

/**
 * Normalize IR for comparison by removing source-specific metadata
 */
function normalizeIR(ir: IntakeSchema): IntakeSchema {
  const normalized = { ...ir };

  if (normalized.metadata) {
    const { source, $schema, openapi, operationId, path, method, tags, ...rest } = normalized.metadata;
    normalized.metadata = Object.keys(rest).length > 0 ? rest : undefined;
  }

  return normalized;
}

describe('Round-Trip Tests - JSON Schema', () => {
  const jsonSchemaParser = new JSONSchemaParser();
  const serializer = new JSONSchemaSerializer();

  describe('Primitive Types', () => {
    it('should round-trip a string field with constraints', () => {
      const schema: JSONSchema = {
        type: 'string',
        minLength: 3,
        maxLength: 100,
        pattern: '^[a-z]+$',
        description: 'A lowercase string',
        default: 'hello',
        examples: ['world', 'test'],
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'string with constraints');
    });

    it('should round-trip a string field with format', () => {
      const schema: JSONSchema = {
        type: 'string',
        format: 'email',
        description: 'Email address',
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'string with format');
    });

    it('should round-trip a number field with constraints', () => {
      const schema: JSONSchema = {
        type: 'number',
        minimum: 0,
        maximum: 100,
        multipleOf: 0.5,
        description: 'A percentage value',
        default: 50,
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'number with constraints');
    });

    it('should round-trip a number field with exclusive bounds', () => {
      const schema: JSONSchema = {
        type: 'number',
        exclusiveMinimum: 0,
        exclusiveMaximum: 100,
        description: 'Open interval (0, 100)',
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'number with exclusive bounds');
    });

    it('should round-trip an integer field', () => {
      const schema: JSONSchema = {
        type: 'integer',
        minimum: 1,
        maximum: 10,
        description: 'A rating from 1 to 10',
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'integer field');
    });

    it('should round-trip a boolean field', () => {
      const schema: JSONSchema = {
        type: 'boolean',
        description: 'Accept terms',
        default: false,
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'boolean field');
    });

    it('should round-trip a null field', () => {
      const schema: JSONSchema = {
        type: 'null',
        description: 'Null value',
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'null field');
    });
  });

  describe('Complex Types', () => {
    it('should round-trip an object with properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            description: 'User name',
          },
          age: {
            type: 'integer',
            minimum: 0,
            description: 'User age',
          },
          email: {
            type: 'string',
            format: 'email',
          },
        },
        required: ['name', 'email'],
        description: 'User object',
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'object with properties');
    });

    it('should round-trip an object with additionalProperties', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'object with additionalProperties');
    });

    it('should round-trip nested objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              profile: {
                type: 'object',
                properties: {
                  bio: { type: 'string' },
                  avatar: { type: 'string', format: 'url' },
                },
                required: ['bio'],
              },
            },
            required: ['profile'],
          },
        },
        required: ['user'],
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'nested objects');
    });

    it('should round-trip an array with constraints', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'string',
          minLength: 1,
        },
        minItems: 1,
        maxItems: 10,
        uniqueItems: true,
        description: 'List of tags',
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'array with constraints');
    });

    it('should round-trip an array of objects', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
          },
          required: ['id', 'name'],
        },
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'array of objects');
    });

    it('should round-trip an enum field', () => {
      const schema: JSONSchema = {
        enum: ['small', 'medium', 'large'],
        description: 'Size options',
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'enum field');
    });

    it('should round-trip an enum with number values', () => {
      const schema: JSONSchema = {
        enum: [1, 2, 3, 4, 5],
        description: 'Rating values',
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'enum with numbers');
    });

    it('should round-trip an enum with mixed types', () => {
      const schema: JSONSchema = {
        enum: ['active', 1, true, null],
        description: 'Status values',
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'enum with mixed types');
    });
  });

  describe('Metadata Preservation', () => {
    it('should preserve title and description at root level', () => {
      const schema: JSONSchema = {
        title: 'User Schema',
        description: 'Schema for user data',
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'title and description');
      expect(ir2.title).toBe('User Schema');
      expect(ir2.description).toBe('Schema for user data');
    });

    it('should preserve default values', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', default: 'Anonymous' },
          age: { type: 'integer', default: 0 },
          active: { type: 'boolean', default: true },
        },
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'default values');
    });

    it('should preserve examples', () => {
      const schema: JSONSchema = {
        type: 'string',
        examples: ['example1', 'example2', 'example3'],
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'examples');
    });
  });

  describe('Complex Schemas', () => {
    it('should round-trip a complete user registration schema', () => {
      const schema: JSONSchema = {
        title: 'User Registration',
        description: 'Schema for user registration form',
        type: 'object',
        properties: {
          username: {
            type: 'string',
            minLength: 3,
            maxLength: 20,
            pattern: '^[a-zA-Z0-9_]+$',
            description: 'Username (alphanumeric and underscore)',
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'Email address',
          },
          password: {
            type: 'string',
            minLength: 8,
            description: 'Password (minimum 8 characters)',
          },
          age: {
            type: 'integer',
            minimum: 18,
            maximum: 120,
            description: 'Age (must be 18+)',
          },
          interests: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 5,
            description: 'List of interests (1-5)',
          },
          role: {
            enum: ['user', 'admin', 'moderator'],
            description: 'User role',
            default: 'user',
          },
          profile: {
            type: 'object',
            properties: {
              bio: { type: 'string', maxLength: 500 },
              website: { type: 'string', format: 'url' },
              social: {
                type: 'object',
                properties: {
                  twitter: { type: 'string' },
                  github: { type: 'string' },
                },
              },
            },
          },
        },
        required: ['username', 'email', 'password'],
      };

      const ir1 = jsonSchemaParser.parse(schema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'user registration schema');
    });
  });
});

describe('Round-Trip Tests - Zod', () => {
  const zodParser = new ZodParser();
  const jsonSchemaParser = new JSONSchemaParser();
  const serializer = new JSONSchemaSerializer();

  describe('Primitive Types', () => {
    it('should round-trip a Zod string schema', () => {
      const zodSchema = z.string().min(3).max(50).describe('A username');

      const ir1 = zodParser.parse(zodSchema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'Zod string');
    });

    it('should round-trip a Zod string with email format', () => {
      const zodSchema = z.string().email().describe('Email address');

      const ir1 = zodParser.parse(zodSchema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'Zod email');
    });

    it('should round-trip a Zod number schema', () => {
      const zodSchema = z.number().min(0).max(100).multipleOf(5);

      const ir1 = zodParser.parse(zodSchema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'Zod number');
    });

    it('should round-trip a Zod integer schema', () => {
      const zodSchema = z.number().int().min(1).max(10);

      const ir1 = zodParser.parse(zodSchema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'Zod integer');
    });

    it('should round-trip a Zod boolean schema', () => {
      const zodSchema = z.boolean().describe('Accept terms');

      const ir1 = zodParser.parse(zodSchema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'Zod boolean');
    });
  });

  describe('Optional and Default Values', () => {
    it('should round-trip optional Zod fields', () => {
      const zodSchema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });

      const ir1 = zodParser.parse(zodSchema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'Zod optional fields');
    });

    it('should round-trip Zod fields with defaults', () => {
      const zodSchema = z.object({
        name: z.string().default('Anonymous'),
        count: z.number().default(0),
        active: z.boolean().default(true),
      });

      const ir1 = zodParser.parse(zodSchema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'Zod default values');
    });
  });

  describe('Complex Types', () => {
    it('should round-trip a Zod object schema', () => {
      const zodSchema = z.object({
        name: z.string().min(1),
        age: z.number().int().min(0),
        email: z.string().email(),
      });

      const ir1 = zodParser.parse(zodSchema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'Zod object');
    });

    it('should round-trip nested Zod objects', () => {
      const zodSchema = z.object({
        user: z.object({
          profile: z.object({
            bio: z.string(),
            avatar: z.string().url(),
          }),
        }),
      });

      const ir1 = zodParser.parse(zodSchema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'Zod nested objects');
    });

    it('should round-trip a Zod array schema', () => {
      const zodSchema = z.array(z.string().min(1)).min(1).max(10);

      const ir1 = zodParser.parse(zodSchema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'Zod array');
    });

    it('should round-trip an array of Zod objects', () => {
      const zodSchema = z.array(
        z.object({
          id: z.number().int(),
          name: z.string(),
        })
      );

      const ir1 = zodParser.parse(zodSchema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'Zod array of objects');
    });

    it('should round-trip a Zod enum schema', () => {
      const zodSchema = z.enum(['small', 'medium', 'large']).describe('Size options');

      const ir1 = zodParser.parse(zodSchema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'Zod enum');
    });

    it('should round-trip a Zod native enum schema', () => {
      enum Status {
        Active = 'active',
        Inactive = 'inactive',
        Pending = 'pending',
      }

      const zodSchema = z.nativeEnum(Status);

      const ir1 = zodParser.parse(zodSchema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'Zod native enum');
    });
  });

  describe('Complete Schemas', () => {
    it('should round-trip a complete Zod form schema', () => {
      const zodSchema = z
        .object({
          username: z
            .string()
            .min(3)
            .max(20)
            .regex(/^[a-zA-Z0-9_]+$/)
            .describe('Username'),
          email: z.string().email().describe('Email address'),
          password: z.string().min(8).describe('Password'),
          age: z.number().int().min(18).max(120).describe('Age'),
          interests: z
            .array(z.string())
            .min(1)
            .max(5)
            .describe('Interests'),
          role: z.enum(['user', 'admin', 'moderator']).default('user'),
          profile: z.object({
            bio: z.string().max(500).optional(),
            website: z.string().url().optional(),
          }).optional(),
        })
        .describe('User registration form');

      const ir1 = zodParser.parse(zodSchema);
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'Zod complete form schema');
    });
  });
});

describe('Round-Trip Tests - OpenAPI', () => {
  const openapiParser = new OpenAPIParser();
  const jsonSchemaParser = new JSONSchemaParser();
  const serializer = new JSONSchemaSerializer();

  describe('Basic OpenAPI Schemas', () => {
    it('should round-trip a simple OpenAPI request body', () => {
      const openapi: OpenAPIDocument = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', minLength: 1 },
                        email: { type: 'string', format: 'email' },
                      },
                      required: ['name', 'email'],
                    },
                  },
                },
              },
            },
          },
        },
      };

      const ir1 = openapiParser.parse(openapi, { operationId: 'createUser' });
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'OpenAPI simple request body');
    });

    it('should round-trip an OpenAPI schema with nested objects', () => {
      const openapi: OpenAPIDocument = {
        openapi: '3.1.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/products': {
            post: {
              operationId: 'createProduct',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        price: { type: 'number', minimum: 0 },
                        details: {
                          type: 'object',
                          properties: {
                            description: { type: 'string' },
                            specifications: {
                              type: 'object',
                              properties: {
                                weight: { type: 'number' },
                                dimensions: { type: 'string' },
                              },
                            },
                          },
                        },
                      },
                      required: ['name', 'price'],
                    },
                  },
                },
              },
            },
          },
        },
      };

      const ir1 = openapiParser.parse(openapi, { operationId: 'createProduct' });
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'OpenAPI nested objects');
    });

    it('should round-trip an OpenAPI schema with arrays', () => {
      const openapi: OpenAPIDocument = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/items': {
            post: {
              operationId: 'createItems',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        items: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'integer' },
                              name: { type: 'string' },
                            },
                            required: ['id', 'name'],
                          },
                          minItems: 1,
                          maxItems: 100,
                        },
                      },
                      required: ['items'],
                    },
                  },
                },
              },
            },
          },
        },
      };

      const ir1 = openapiParser.parse(openapi, { operationId: 'createItems' });
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'OpenAPI arrays');
    });

    it('should round-trip an OpenAPI schema with enums', () => {
      const openapi: OpenAPIDocument = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        paths: {
          '/orders': {
            post: {
              operationId: 'createOrder',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        status: {
                          enum: ['pending', 'processing', 'completed', 'cancelled'],
                          description: 'Order status',
                        },
                        priority: {
                          enum: [1, 2, 3],
                          description: 'Priority level',
                        },
                      },
                      required: ['status'],
                    },
                  },
                },
              },
            },
          },
        },
      };

      const ir1 = openapiParser.parse(openapi, { operationId: 'createOrder' });
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'OpenAPI enums');
    });
  });

  describe('Complex OpenAPI Schemas', () => {
    it('should round-trip a complete OpenAPI request body schema', () => {
      const openapi: OpenAPIDocument = {
        openapi: '3.0.0',
        info: { title: 'User API', version: '1.0.0' },
        paths: {
          '/users/register': {
            post: {
              operationId: 'registerUser',
              summary: 'Register a new user',
              description: 'Creates a new user account',
              tags: ['users', 'authentication'],
              requestBody: {
                required: true,
                description: 'User registration data',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        username: {
                          type: 'string',
                          minLength: 3,
                          maxLength: 20,
                          pattern: '^[a-zA-Z0-9_]+$',
                          description: 'Username',
                        },
                        email: {
                          type: 'string',
                          format: 'email',
                          description: 'Email address',
                        },
                        password: {
                          type: 'string',
                          minLength: 8,
                          description: 'Password',
                        },
                        age: {
                          type: 'integer',
                          minimum: 18,
                          maximum: 120,
                          description: 'Age',
                        },
                        interests: {
                          type: 'array',
                          items: { type: 'string' },
                          minItems: 1,
                          maxItems: 5,
                          description: 'Interests',
                        },
                        role: {
                          enum: ['user', 'admin', 'moderator'],
                          description: 'User role',
                          default: 'user',
                        },
                        profile: {
                          type: 'object',
                          properties: {
                            bio: {
                              type: 'string',
                              maxLength: 500,
                            },
                            website: {
                              type: 'string',
                              format: 'url',
                            },
                          },
                        },
                      },
                      required: ['username', 'email', 'password'],
                    },
                  },
                },
              },
            },
          },
        },
      };

      const ir1 = openapiParser.parse(openapi, { operationId: 'registerUser' });
      const serialized = serializer.serialize(ir1);
      const ir2 = jsonSchemaParser.parse(serialized);

      testRoundTrip(ir1, ir2, 'OpenAPI complete registration schema');
    });
  });
});

describe('Round-Trip Edge Cases', () => {
  const jsonSchemaParser = new JSONSchemaParser();
  const serializer = new JSONSchemaSerializer();

  it('should handle empty objects', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {},
    };

    const ir1 = jsonSchemaParser.parse(schema);
    const serialized = serializer.serialize(ir1);
    const ir2 = jsonSchemaParser.parse(serialized);

    testRoundTrip(ir1, ir2, 'empty object');
  });

  it('should handle empty arrays', () => {
    const schema: JSONSchema = {
      type: 'array',
      items: { type: 'string' },
    };

    const ir1 = jsonSchemaParser.parse(schema);
    const serialized = serializer.serialize(ir1);
    const ir2 = jsonSchemaParser.parse(serialized);

    testRoundTrip(ir1, ir2, 'array with no constraints');
  });

  it('should handle deeply nested structures', () => {
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
                        value: { type: 'string' },
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

    const ir1 = jsonSchemaParser.parse(schema);
    const serialized = serializer.serialize(ir1);
    const ir2 = jsonSchemaParser.parse(serialized);

    testRoundTrip(ir1, ir2, 'deeply nested objects');
  });

  it('should handle all optional fields', () => {
    const zodSchema = z.object({
      field1: z.string().optional(),
      field2: z.number().optional(),
      field3: z.boolean().optional(),
    });

    const zodParser = new ZodParser();
    const ir1 = zodParser.parse(zodSchema);
    const serialized = serializer.serialize(ir1);
    const ir2 = jsonSchemaParser.parse(serialized);

    testRoundTrip(ir1, ir2, 'all optional fields');
  });

  it('should handle schemas with all constraint types', () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        str: {
          type: 'string',
          minLength: 1,
          maxLength: 100,
          pattern: '^[a-z]+$',
          format: 'email',
        },
        num: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          exclusiveMinimum: -1,
          exclusiveMaximum: 101,
          multipleOf: 0.5,
        },
        arr: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 10,
          uniqueItems: true,
        },
      },
    };

    const ir1 = jsonSchemaParser.parse(schema);
    const serialized = serializer.serialize(ir1);
    const ir2 = jsonSchemaParser.parse(serialized);

    testRoundTrip(ir1, ir2, 'all constraint types');
  });

  it('should handle schemas with various metadata', () => {
    const schema: JSONSchema = {
      title: 'Test Schema',
      description: 'A test schema',
      type: 'object',
      properties: {
        field: {
          type: 'string',
          description: 'A field',
          default: 'default value',
          examples: ['example1', 'example2'],
        },
      },
    };

    const ir1 = jsonSchemaParser.parse(schema);
    const serialized = serializer.serialize(ir1);
    const ir2 = jsonSchemaParser.parse(serialized);

    testRoundTrip(ir1, ir2, 'various metadata');
    expect(ir2.title).toBe('Test Schema');
    expect(ir2.description).toBe('A test schema');
  });
});
