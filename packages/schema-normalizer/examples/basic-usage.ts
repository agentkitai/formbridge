/**
 * Basic Usage Examples for @formbridge/schema-normalizer
 *
 * This file demonstrates how to use the schema normalizer to convert
 * Zod schemas, JSON Schema documents, and OpenAPI specs into the unified
 * IntakeSchema IR.
 */

// =============================================================================
// Example 1: JSON Schema Parser
// =============================================================================

import {
  JSONSchemaParser,
  ZodParser,
  OpenAPIParser,
  JSONSchemaSerializer,
  serializeToJSONSchema,
  type IntakeSchema,
  type JSONSchema,
  type OpenAPIDocument,
} from '../src/index';

/**
 * Example 1: Parsing JSON Schema
 */
function example1_JSONSchema() {
  console.log('=== Example 1: JSON Schema Parser ===\n');

  // Create parser instance
  const parser = new JSONSchemaParser();

  // Define a JSON Schema
  const jsonSchema: JSONSchema = {
    type: 'object',
    title: 'User Registration',
    description: 'Schema for user registration form',
    properties: {
      username: {
        type: 'string',
        description: 'Unique username',
        minLength: 3,
        maxLength: 20,
        pattern: '^[a-zA-Z0-9_]+$',
      },
      email: {
        type: 'string',
        description: 'Email address',
        format: 'email',
      },
      age: {
        type: 'integer',
        description: 'User age',
        minimum: 18,
        maximum: 120,
      },
      role: {
        description: 'User role',
        enum: ['admin', 'user', 'guest'],
      },
      preferences: {
        type: 'object',
        properties: {
          notifications: {
            type: 'boolean',
            description: 'Enable notifications',
            default: true,
          },
          theme: {
            enum: ['light', 'dark'],
            default: 'light',
          },
        },
        required: ['notifications'],
      },
    },
    required: ['username', 'email', 'age'],
  };

  // Parse to IntakeSchema IR
  const intakeSchema = parser.parse(jsonSchema);

  console.log('Parsed IntakeSchema IR:');
  console.log(JSON.stringify(intakeSchema, null, 2));
  console.log('\n');

  return intakeSchema;
}

/**
 * Example 2: Parsing Zod Schema
 */
function example2_ZodSchema() {
  console.log('=== Example 2: Zod Parser ===\n');

  // Note: This example requires 'zod' to be installed
  // npm install zod
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { z } = require('zod');

    // Create parser instance
    const parser = new ZodParser();

    // Define a Zod schema
    const zodSchema = z.object({
      username: z
        .string()
        .min(3)
        .max(20)
        .regex(/^[a-zA-Z0-9_]+$/)
        .describe('Unique username'),
      email: z.string().email().describe('Email address'),
      age: z
        .number()
        .int()
        .min(18)
        .max(120)
        .describe('User age'),
      role: z.enum(['admin', 'user', 'guest']).describe('User role'),
      preferences: z.object({
        notifications: z
          .boolean()
          .default(true)
          .describe('Enable notifications'),
        theme: z.enum(['light', 'dark']).default('light'),
      }),
    });

    // Parse to IntakeSchema IR
    const intakeSchema = parser.parse(zodSchema);

    console.log('Parsed IntakeSchema IR:');
    console.log(JSON.stringify(intakeSchema, null, 2));
    console.log('\n');

    return intakeSchema;
  } catch (error) {
    console.error('Zod is not installed. Install with: npm install zod');
    console.log('\n');
    return null;
  }
}

/**
 * Example 3: Parsing OpenAPI Document
 */
function example3_OpenAPI() {
  console.log('=== Example 3: OpenAPI Parser ===\n');

  // Create parser instance
  const parser = new OpenAPIParser();

  // Define an OpenAPI document
  const openApiDoc: OpenAPIDocument = {
    openapi: '3.0.0',
    info: {
      title: 'User API',
      version: '1.0.0',
    },
    paths: {
      '/users': {
        post: {
          operationId: 'createUser',
          summary: 'Create a new user',
          description: 'Register a new user account',
          tags: ['users'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    username: {
                      type: 'string',
                      description: 'Unique username',
                      minLength: 3,
                      maxLength: 20,
                    },
                    email: {
                      type: 'string',
                      description: 'Email address',
                      format: 'email',
                    },
                    password: {
                      type: 'string',
                      description: 'User password',
                      minLength: 8,
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

  // Parse by operationId
  const intakeSchema = parser.parse(openApiDoc, {
    operationId: 'createUser',
  });

  console.log('Parsed IntakeSchema IR:');
  console.log(JSON.stringify(intakeSchema, null, 2));
  console.log('\n');

  // Alternative: Parse by path and method
  const intakeSchema2 = parser.parse(openApiDoc, {
    path: '/users',
    method: 'post',
  });

  console.log('Same schema parsed by path/method:');
  console.log(JSON.stringify(intakeSchema2, null, 2));
  console.log('\n');

  return intakeSchema;
}

/**
 * Example 4: Serializing IntakeSchema back to JSON Schema
 */
function example4_Serialization() {
  console.log('=== Example 4: Serialization (Round-trip) ===\n');

  // Start with a JSON Schema
  const parser = new JSONSchemaParser();
  const originalJsonSchema: JSONSchema = {
    type: 'object',
    title: 'Product',
    description: 'Product information',
    properties: {
      name: {
        type: 'string',
        description: 'Product name',
        minLength: 1,
      },
      price: {
        type: 'number',
        description: 'Product price in USD',
        minimum: 0,
        exclusiveMinimum: true,
      },
      tags: {
        type: 'array',
        description: 'Product tags',
        items: {
          type: 'string',
        },
        minItems: 1,
        uniqueItems: true,
      },
      category: {
        description: 'Product category',
        enum: ['electronics', 'clothing', 'food', 'other'],
      },
    },
    required: ['name', 'price', 'category'],
  };

  // Parse to IR
  const intakeSchema = parser.parse(originalJsonSchema);
  console.log('Original JSON Schema parsed to IR');

  // Serialize back to JSON Schema
  const serializer = new JSONSchemaSerializer();
  const outputJsonSchema = serializer.serialize(intakeSchema);

  console.log('Serialized back to JSON Schema:');
  console.log(JSON.stringify(outputJsonSchema, null, 2));
  console.log('\n');

  // You can also use the convenience function
  const outputJsonSchema2 = serializeToJSONSchema(intakeSchema, {
    schemaVersion: 'draft-2020-12',
    includeSchemaVersion: true,
  });

  console.log('Using convenience function:');
  console.log(JSON.stringify(outputJsonSchema2, null, 2));
  console.log('\n');

  return intakeSchema;
}

/**
 * Example 5: Working with the IntakeSchema IR
 */
function example5_WorkingWithIR() {
  console.log('=== Example 5: Working with IntakeSchema IR ===\n');

  const parser = new JSONSchemaParser();

  const jsonSchema: JSONSchema = {
    type: 'object',
    properties: {
      firstName: { type: 'string', minLength: 1 },
      lastName: { type: 'string', minLength: 1 },
      age: { type: 'integer', minimum: 0 },
      email: { type: 'string', format: 'email' },
    },
    required: ['firstName', 'lastName'],
  };

  const ir = parser.parse(jsonSchema);

  // Access the schema structure
  console.log(`Schema version: ${ir.version}`);
  console.log(`Root field type: ${ir.schema.type}`);

  if (ir.schema.type === 'object') {
    console.log('\nObject properties:');
    for (const [name, field] of Object.entries(ir.schema.properties)) {
      const requiredStr = field.required ? ' (required)' : ' (optional)';
      console.log(`  - ${name}: ${field.type}${requiredStr}`);

      // Access constraints
      if (field.type === 'string' && field.constraints) {
        console.log(`    Constraints:`, field.constraints);
      }
    }
  }

  console.log('\n');
  return ir;
}

/**
 * Example 6: Error Handling
 */
function example6_ErrorHandling() {
  console.log('=== Example 6: Error Handling ===\n');

  const parser = new JSONSchemaParser();

  // Example 1: Unsupported feature ($ref)
  try {
    parser.parse({
      $ref: '#/definitions/User',
    } as JSONSchema);
  } catch (error) {
    console.log('Caught error for $ref:');
    console.log(`  ${error}`);
    console.log('');
  }

  // Example 2: Unsupported feature (anyOf)
  try {
    parser.parse({
      anyOf: [{ type: 'string' }, { type: 'number' }],
    } as JSONSchema);
  } catch (error) {
    console.log('Caught error for anyOf:');
    console.log(`  ${error}`);
    console.log('');
  }

  // Example 3: Invalid schema
  try {
    parser.parse({
      type: 'unknown-type',
    } as JSONSchema);
  } catch (error) {
    console.log('Caught error for invalid type:');
    console.log(`  ${error}`);
    console.log('');
  }

  console.log('\n');
}

/**
 * Example 7: Parser Options
 */
function example7_ParserOptions() {
  console.log('=== Example 7: Parser Options ===\n');

  const jsonSchema: JSONSchema = {
    type: 'string',
    description: 'A simple string field',
    minLength: 3,
  };

  // Strict mode (default: true)
  const strictParser = new JSONSchemaParser({ strict: true });
  const ir1 = strictParser.parse(jsonSchema);
  console.log('Strict mode enabled (default)');

  // Include metadata (default: true)
  const noMetadataParser = new JSONSchemaParser({ includeMetadata: false });
  const ir2 = noMetadataParser.parse(jsonSchema);
  console.log('Metadata inclusion disabled');

  // Custom metadata
  const customParser = new JSONSchemaParser({
    customMetadata: {
      source: 'example-schema',
      version: '1.0',
    },
  });
  const ir3 = customParser.parse(jsonSchema);
  console.log('Custom metadata added:');
  console.log(JSON.stringify(ir3.metadata, null, 2));

  console.log('\n');
}

/**
 * Main function - run all examples
 */
function main() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  @formbridge/schema-normalizer - Basic Usage Examples');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n');

  try {
    example1_JSONSchema();
    example2_ZodSchema();
    example3_OpenAPI();
    example4_Serialization();
    example5_WorkingWithIR();
    example6_ErrorHandling();
    example7_ParserOptions();

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  All examples completed successfully!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n');
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  main();
}

export {
  example1_JSONSchema,
  example2_ZodSchema,
  example3_OpenAPI,
  example4_Serialization,
  example5_WorkingWithIR,
  example6_ErrorHandling,
  example7_ParserOptions,
};
