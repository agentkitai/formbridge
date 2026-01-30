/**
 * Comprehensive tests for OpenAPI Parser
 *
 * Tests cover:
 * - Document validation (version, structure)
 * - Schema extraction by path/method
 * - Schema extraction by operationId
 * - Auto-discovery of request bodies
 * - Media type handling
 * - Metadata preservation (operationId, summary, description, tags)
 * - Delegation to JSON Schema parser
 * - Error handling for invalid documents
 * - Error handling for missing paths/operations
 * - OpenAPI 3.0 and 3.1 support
 */

import { describe, it, expect } from 'vitest';
import { OpenAPIParser } from '../src/parsers/openapi-parser';
import type { OpenAPIDocument, OpenAPIParserOptions } from '../src/parsers/openapi-parser';
import type { JSONSchema } from '../src/parsers/json-schema-parser';
import type {
  IntakeSchema,
  ObjectField,
  StringField,
  NumberField,
  ArrayField,
} from '../src/types/intake-schema';
import { ParserError } from '../src/types/parser';
import { SchemaValidationError } from '../src/types/errors';

describe('OpenAPIParser', () => {
  describe('Basic Instantiation', () => {
    it('should create parser with default options', () => {
      const parser = new OpenAPIParser();
      expect(parser).toBeInstanceOf(OpenAPIParser);
    });

    it('should create parser with custom options', () => {
      const parser = new OpenAPIParser({
        strict: false,
        includeMetadata: false,
      });
      expect(parser).toBeInstanceOf(OpenAPIParser);
    });
  });

  describe('canParse', () => {
    const parser = new OpenAPIParser();

    it('should return true for valid OpenAPI 3.0 document', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
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
      expect(parser.canParse(doc)).toBe(true);
    });

    it('should return true for valid OpenAPI 3.1 document', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.1.0',
        paths: {
          '/users': {},
        },
      };
      expect(parser.canParse(doc)).toBe(true);
    });

    it('should return true for OpenAPI 3.0.x versions', () => {
      expect(parser.canParse({ openapi: '3.0.1', paths: {} })).toBe(true);
      expect(parser.canParse({ openapi: '3.0.2', paths: {} })).toBe(true);
      expect(parser.canParse({ openapi: '3.0.3', paths: {} })).toBe(true);
    });

    it('should return true for OpenAPI 3.1.x versions', () => {
      expect(parser.canParse({ openapi: '3.1.0', paths: {} })).toBe(true);
      expect(parser.canParse({ openapi: '3.1.1', paths: {} })).toBe(true);
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

    it('should return false for missing openapi field', () => {
      expect(parser.canParse({ paths: {} })).toBe(false);
    });

    it('should return false for missing paths field', () => {
      expect(parser.canParse({ openapi: '3.0.0' })).toBe(false);
    });

    it('should return false for unsupported OpenAPI versions', () => {
      expect(parser.canParse({ openapi: '2.0', paths: {} })).toBe(false);
      expect(parser.canParse({ openapi: '4.0.0', paths: {} })).toBe(false);
    });

    it('should return false for non-string openapi field', () => {
      expect(parser.canParse({ openapi: 3.0, paths: {} })).toBe(false);
    });

    it('should return false for non-object paths field', () => {
      expect(parser.canParse({ openapi: '3.0.0', paths: [] })).toBe(false);
      expect(parser.canParse({ openapi: '3.0.0', paths: 'string' })).toBe(false);
    });
  });

  describe('Document Validation', () => {
    const parser = new OpenAPIParser();

    it('should throw error for missing openapi field', () => {
      const doc = { paths: {} } as any;

      expect(() => parser.parse(doc)).toThrow(SchemaValidationError);
      expect(() => parser.parse(doc)).toThrow('missing "openapi" version field');
    });

    it('should throw error for unsupported OpenAPI version', () => {
      const doc = {
        openapi: '2.0',
        paths: {},
      } as any;

      expect(() => parser.parse(doc)).toThrow(SchemaValidationError);
      expect(() => parser.parse(doc)).toThrow('Unsupported OpenAPI version: 2.0');
      expect(() => parser.parse(doc)).toThrow('Only OpenAPI 3.0 and 3.1 are supported');
    });

    it('should throw error for missing paths field', () => {
      const doc = { openapi: '3.0.0' } as any;

      expect(() => parser.parse(doc)).toThrow(SchemaValidationError);
      expect(() => parser.parse(doc)).toThrow('missing or invalid "paths" object');
    });

    it('should throw error for invalid paths field', () => {
      const doc = {
        openapi: '3.0.0',
        paths: 'not an object',
      } as any;

      expect(() => parser.parse(doc)).toThrow(SchemaValidationError);
      expect(() => parser.parse(doc)).toThrow('missing or invalid "paths" object');
    });
  });

  describe('Schema Extraction by Path and Method', () => {
    const parser = new OpenAPIParser();

    it('should extract schema from specific path and method', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
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

      const result = parser.parse(doc, { path: '/users', method: 'post' });

      expect(result.version).toBe('1.0');
      expect(result.schema.type).toBe('object');

      const rootField = result.schema as ObjectField;
      expect(rootField.properties.name.required).toBe(true);
      expect(rootField.properties.email.required).toBe(true);
      expect((rootField.properties.email as StringField).constraints?.format).toBe('email');
    });

    it('should handle case-insensitive method names', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      };

      const result = parser.parse(doc, { path: '/users', method: 'POST' });
      expect(result.schema.type).toBe('string');
    });

    it('should throw error when path not found', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      };

      expect(() => parser.parse(doc, { path: '/nonexistent' })).toThrow(ParserError);
      expect(() => parser.parse(doc, { path: '/nonexistent' })).toThrow('Path "/nonexistent" not found');
    });

    it('should throw error when method not found', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      };

      expect(() => parser.parse(doc, { path: '/users', method: 'get' })).toThrow(ParserError);
      expect(() => parser.parse(doc, { path: '/users', method: 'get' })).toThrow('Method "get" not found for path "/users"');
    });

    it('should throw error when request body not defined', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            get: {
              summary: 'Get users',
            },
          },
        },
      };

      expect(() => parser.parse(doc, { path: '/users', method: 'get' })).toThrow(ParserError);
      expect(() => parser.parse(doc, { path: '/users', method: 'get' })).toThrow('No request body defined for GET /users');
    });

    it('should auto-detect POST method when not specified', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            get: {
              summary: 'Get users',
            },
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      };

      const result = parser.parse(doc, { path: '/users' });
      expect(result.schema.type).toBe('string');
      expect(result.metadata?.method).toBe('post');
    });

    it('should auto-detect PUT method when POST not available', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users/{id}': {
            get: {
              summary: 'Get user',
            },
            put: {
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

      const result = parser.parse(doc, { path: '/users/{id}' });
      expect(result.schema.type).toBe('object');
      expect(result.metadata?.method).toBe('put');
    });

    it('should auto-detect PATCH method when POST and PUT not available', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users/{id}': {
            get: {
              summary: 'Get user',
            },
            patch: {
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

      const result = parser.parse(doc, { path: '/users/{id}' });
      expect(result.schema.type).toBe('object');
      expect(result.metadata?.method).toBe('patch');
    });

    it('should throw error when no mutation operation found for path', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            get: {
              summary: 'Get users',
            },
            delete: {
              summary: 'Delete user',
            },
          },
        },
      };

      expect(() => parser.parse(doc, { path: '/users' })).toThrow(ParserError);
      expect(() => parser.parse(doc, { path: '/users' })).toThrow('No mutation operation (POST/PUT/PATCH) found at path: /users');
    });
  });

  describe('Schema Extraction by Operation ID', () => {
    const parser = new OpenAPIParser();

    it('should extract schema by operationId', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
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
          '/posts': {
            post: {
              operationId: 'createPost',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = parser.parse(doc, { operationId: 'createPost' });

      expect(result.schema.type).toBe('object');
      const rootField = result.schema as ObjectField;
      expect(rootField.properties.title).toBeDefined();
      expect(rootField.properties.name).toBeUndefined();
      expect(result.metadata?.operationId).toBe('createPost');
    });

    it('should throw error when operationId not found', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
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

      expect(() => parser.parse(doc, { operationId: 'nonexistent' })).toThrow(ParserError);
      expect(() => parser.parse(doc, { operationId: 'nonexistent' })).toThrow('Operation with ID "nonexistent" not found');
    });

    it('should prefer operationId over path/method', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'string' },
                  },
                },
              },
            },
          },
          '/posts': {
            post: {
              operationId: 'createPost',
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      };

      // Even though we specify path and method, operationId should take precedence
      const result = parser.parse(doc, {
        operationId: 'createPost',
        path: '/users',
        method: 'post',
      });

      expect(result.schema.type).toBe('number');
      expect(result.metadata?.operationId).toBe('createPost');
    });
  });

  describe('Auto-Discovery of Request Bodies', () => {
    const parser = new OpenAPIParser();

    it('should find first POST operation when no options provided', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/health': {
            get: {
              summary: 'Health check',
            },
          },
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

      const result = parser.parse(doc);
      expect(result.schema.type).toBe('object');
      expect(result.metadata?.path).toBe('/users');
      expect(result.metadata?.method).toBe('post');
    });

    it('should find PUT operation when POST not available', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users/{id}': {
            get: {},
            put: {
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

      const result = parser.parse(doc);
      expect(result.metadata?.method).toBe('put');
    });

    it('should find PATCH operation when POST and PUT not available', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users/{id}': {
            patch: {
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

      const result = parser.parse(doc);
      expect(result.metadata?.method).toBe('patch');
    });

    it('should throw error when no request body found in document', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            get: {
              summary: 'Get users',
            },
          },
        },
      };

      expect(() => parser.parse(doc)).toThrow(ParserError);
      expect(() => parser.parse(doc)).toThrow('No operation with request body found');
    });
  });

  describe('Media Type Handling', () => {
    const parser = new OpenAPIParser();

    it('should use application/json by default', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'object' },
                  },
                  'application/xml': {
                    schema: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      };

      const result = parser.parse(doc, { path: '/users', method: 'post' });
      expect(result.schema.type).toBe('object');
    });

    it('should extract schema for specified media type', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: { type: 'object' },
                  },
                  'application/xml': {
                    schema: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      };

      const result = parser.parse(doc, {
        path: '/users',
        method: 'post',
        mediaType: 'application/xml',
      });
      expect(result.schema.type).toBe('string');
    });

    it('should throw error when media type not found', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
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

      expect(() =>
        parser.parse(doc, { path: '/users', method: 'post', mediaType: 'application/xml' })
      ).toThrow(ParserError);
      expect(() =>
        parser.parse(doc, { path: '/users', method: 'post', mediaType: 'application/xml' })
      ).toThrow('Media type "application/xml" not found');
      expect(() =>
        parser.parse(doc, { path: '/users', method: 'post', mediaType: 'application/xml' })
      ).toThrow('Available types: application/json');
    });

    it('should throw error when schema not defined for media type', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    // No schema defined
                    examples: {},
                  },
                },
              },
            },
          },
        },
      };

      expect(() => parser.parse(doc, { path: '/users', method: 'post' })).toThrow(ParserError);
      expect(() => parser.parse(doc, { path: '/users', method: 'post' })).toThrow(
        'No schema defined for application/json in POST /users'
      );
    });
  });

  describe('Metadata Preservation', () => {
    const parser = new OpenAPIParser();

    it('should include OpenAPI version in metadata', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.1.0',
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

      const result = parser.parse(doc);
      expect(result.metadata?.source).toBe('openapi');
      expect(result.metadata?.openapi).toBe('3.1.0');
    });

    it('should include operationId in metadata', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
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

      const result = parser.parse(doc);
      expect(result.metadata?.operationId).toBe('createUser');
    });

    it('should include path and method in metadata', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users/{id}': {
            put: {
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

      const result = parser.parse(doc);
      expect(result.metadata?.path).toBe('/users/{id}');
      expect(result.metadata?.method).toBe('put');
    });

    it('should include tags in metadata', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              tags: ['users', 'authentication'],
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

      const result = parser.parse(doc);
      expect(result.metadata?.tags).toEqual(['users', 'authentication']);
    });

    it('should use operation summary as title when no schema title', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              summary: 'Create a new user',
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

      const result = parser.parse(doc);
      expect(result.title).toBe('Create a new user');
    });

    it('should prefer schema title over operation summary', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              summary: 'Create a new user',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      title: 'User Registration Schema',
                      type: 'object',
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = parser.parse(doc);
      expect(result.title).toBe('User Registration Schema');
    });

    it('should use operation description when no schema description', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              description: 'Creates a new user account',
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

      const result = parser.parse(doc);
      expect(result.description).toBe('Creates a new user account');
    });

    it('should use requestBody description when operation description not available', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              requestBody: {
                description: 'User registration data',
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

      const result = parser.parse(doc);
      expect(result.description).toBe('User registration data');
    });

    it('should prefer schema description over operation description', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              description: 'Operation description',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      description: 'Schema description',
                      type: 'object',
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = parser.parse(doc);
      expect(result.description).toBe('Schema description');
    });

    it('should include custom metadata', () => {
      const parser = new OpenAPIParser({
        customMetadata: { customField: 'customValue' },
      });

      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
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

      const result = parser.parse(doc);
      expect(result.metadata?.customField).toBe('customValue');
    });

    it('should exclude metadata when includeMetadata is false', () => {
      const parser = new OpenAPIParser({ includeMetadata: false });

      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
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

      const result = parser.parse(doc);
      expect(result.metadata).toBeUndefined();
    });
  });

  describe('Delegation to JSON Schema Parser', () => {
    const parser = new OpenAPIParser();

    it('should parse complex nested schema correctly', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/posts': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        title: {
                          type: 'string',
                          minLength: 1,
                          maxLength: 200,
                        },
                        author: {
                          type: 'object',
                          properties: {
                            name: { type: 'string' },
                            email: { type: 'string', format: 'email' },
                          },
                          required: ['name'],
                        },
                        tags: {
                          type: 'array',
                          items: { type: 'string' },
                          minItems: 1,
                        },
                      },
                      required: ['title', 'author'],
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = parser.parse(doc);
      const rootField = result.schema as ObjectField;

      expect(rootField.type).toBe('object');
      expect(rootField.properties.title.required).toBe(true);
      expect(rootField.properties.author.required).toBe(true);
      expect(rootField.properties.tags.required).toBe(false);

      const titleField = rootField.properties.title as StringField;
      expect(titleField.constraints?.minLength).toBe(1);
      expect(titleField.constraints?.maxLength).toBe(200);

      const authorField = rootField.properties.author as ObjectField;
      expect(authorField.properties.name.required).toBe(true);
      expect(authorField.properties.email.required).toBe(false);

      const tagsField = rootField.properties.tags as ArrayField;
      expect(tagsField.items.type).toBe('string');
      expect(tagsField.constraints?.minItems).toBe(1);
    });

    it('should handle JSON Schema constraints', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        age: {
                          type: 'integer',
                          minimum: 0,
                          maximum: 120,
                        },
                        score: {
                          type: 'number',
                          multipleOf: 0.5,
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

      const result = parser.parse(doc);
      const rootField = result.schema as ObjectField;

      const ageField = rootField.properties.age as NumberField;
      expect(ageField.constraints?.minimum).toBe(0);
      expect(ageField.constraints?.maximum).toBe(120);

      const scoreField = rootField.properties.score as NumberField;
      expect(scoreField.constraints?.multipleOf).toBe(0.5);
    });
  });

  describe('Real-World OpenAPI Examples', () => {
    const parser = new OpenAPIParser();

    it('should parse complete OpenAPI document with info', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        info: {
          title: 'User Management API',
          description: 'API for managing users',
          version: '1.0.0',
        },
        paths: {
          '/users': {
            post: {
              operationId: 'createUser',
              summary: 'Create a new user',
              description: 'Creates a new user account with the provided details',
              tags: ['users'],
              requestBody: {
                description: 'User registration data',
                required: true,
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
                        },
                        email: {
                          type: 'string',
                          format: 'email',
                        },
                        password: {
                          type: 'string',
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

      const result = parser.parse(doc);

      expect(result.title).toBe('Create a new user');
      expect(result.description).toBe('Creates a new user account with the provided details');
      expect(result.metadata?.source).toBe('openapi');
      expect(result.metadata?.openapi).toBe('3.0.0');
      expect(result.metadata?.operationId).toBe('createUser');
      expect(result.metadata?.tags).toEqual(['users']);

      const rootField = result.schema as ObjectField;
      expect(rootField.properties.username.required).toBe(true);
      expect(rootField.properties.email.required).toBe(true);
      expect(rootField.properties.password.required).toBe(true);
    });

    it('should parse OpenAPI document with multiple operations', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.1.0',
        paths: {
          '/users': {
            get: {
              operationId: 'listUsers',
              summary: 'List users',
            },
            post: {
              operationId: 'createUser',
              requestBody: {
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
          '/posts': {
            post: {
              operationId: 'createPost',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      // Should find first POST operation
      const result1 = parser.parse(doc);
      expect(result1.metadata?.operationId).toBe('createUser');

      // Can specify operation by ID
      const result2 = parser.parse(doc, { operationId: 'createPost' });
      expect(result2.metadata?.operationId).toBe('createPost');
    });
  });

  describe('Edge Cases', () => {
    const parser = new OpenAPIParser();

    it('should handle empty paths object', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {},
      };

      expect(() => parser.parse(doc)).toThrow(ParserError);
      expect(() => parser.parse(doc)).toThrow('No operation with request body found');
    });

    it('should handle path with no operations', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {},
        },
      };

      expect(() => parser.parse(doc)).toThrow(ParserError);
      expect(() => parser.parse(doc)).toThrow('No operation with request body found');
    });

    it('should handle operation without operationId', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
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

      const result = parser.parse(doc);
      expect(result.metadata?.operationId).toBeUndefined();
      expect(result.metadata?.path).toBe('/users');
    });

    it('should handle operation without tags', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
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

      const result = parser.parse(doc);
      expect(result.metadata?.tags).toBeUndefined();
    });

    it('should handle operation without summary or description', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
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

      const result = parser.parse(doc);
      expect(result.title).toBeUndefined();
      expect(result.description).toBeUndefined();
    });

    it('should handle path parameters in path string', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users/{userId}/posts/{postId}': {
            put: {
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

      const result = parser.parse(doc, { path: '/users/{userId}/posts/{postId}' });
      expect(result.metadata?.path).toBe('/users/{userId}/posts/{postId}');
    });

    it('should handle multiple media types in request body', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.0.0',
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                      },
                    },
                  },
                  'application/xml': {
                    schema: { type: 'string' },
                  },
                  'multipart/form-data': {
                    schema: {
                      type: 'object',
                      properties: {
                        file: { type: 'string', format: 'binary' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      // Default to application/json
      const result1 = parser.parse(doc);
      expect(result1.schema.type).toBe('object');
      expect((result1.schema as ObjectField).properties.name).toBeDefined();

      // Can specify different media type
      const result2 = parser.parse(doc, { path: '/users', mediaType: 'application/xml' });
      expect(result2.schema.type).toBe('string');
    });

    it('should handle OpenAPI 3.1 with JSON Schema 2020-12 features', () => {
      const doc: OpenAPIDocument = {
        openapi: '3.1.0',
        paths: {
          '/users': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        age: {
                          type: 'integer',
                          exclusiveMinimum: 0,
                          exclusiveMaximum: 120,
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

      const result = parser.parse(doc);
      const rootField = result.schema as ObjectField;
      const ageField = rootField.properties.age as NumberField;

      expect(ageField.constraints?.exclusiveMinimum).toBe(0);
      expect(ageField.constraints?.exclusiveMaximum).toBe(120);
    });
  });
});
