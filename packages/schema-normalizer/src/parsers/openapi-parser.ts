/**
 * OpenAPI Parser
 *
 * Extracts request body schemas from OpenAPI 3.0/3.1 specification documents
 * and converts them into IntakeSchema IR by delegating to the JSON Schema parser.
 *
 * OpenAPI schemas are JSON Schema with extensions, so we reuse the JSONSchemaParser
 * for the actual schema translation and focus on navigation and metadata extraction.
 */

import type { IntakeSchema } from '../types/intake-schema';
import { Parser, ParserOptions, ParserError } from '../types/parser';
import { SchemaValidationError } from '../types/errors';
import { JSONSchemaParser, JSONSchema } from './json-schema-parser';

/**
 * OpenAPI 3.0/3.1 document structure (subset relevant for request body extraction)
 */
export interface OpenAPIDocument {
  openapi: string; // "3.0.x" or "3.1.x"
  info?: {
    title?: string;
    description?: string;
    version?: string;
  };
  paths?: {
    [path: string]: {
      [method: string]: OpenAPIOperation;
    };
  };
  components?: {
    schemas?: Record<string, JSONSchema>;
  };
}

/**
 * OpenAPI operation (GET, POST, PUT, etc.)
 */
export interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  requestBody?: OpenAPIRequestBody;
  responses?: unknown;
  parameters?: unknown[];
}

/**
 * OpenAPI request body
 */
export interface OpenAPIRequestBody {
  description?: string;
  required?: boolean;
  content: {
    [mediaType: string]: {
      schema?: JSONSchema;
      examples?: unknown;
    };
  };
}

/**
 * Options for extracting schema from OpenAPI document
 */
export interface OpenAPIParserOptions extends ParserOptions {
  /**
   * Path to extract schema from (e.g., "/users")
   * If not provided, will attempt to find the first POST/PUT/PATCH operation
   */
  path?: string;

  /**
   * HTTP method to extract schema from (e.g., "post", "put", "patch")
   * If not provided, will attempt POST first, then PUT, then PATCH
   */
  method?: string;

  /**
   * Media type to extract (e.g., "application/json")
   * @default "application/json"
   */
  mediaType?: string;

  /**
   * Operation ID to extract schema from (alternative to path/method)
   * If provided, will search for operation by ID
   */
  operationId?: string;
}

/**
 * OpenAPI Parser implementation
 *
 * Extracts request body schemas from OpenAPI documents and delegates
 * schema parsing to JSONSchemaParser.
 */
export class OpenAPIParser implements Parser<OpenAPIDocument> {
  private jsonSchemaParser: JSONSchemaParser;
  private options: Required<ParserOptions>;

  constructor(options: ParserOptions = {}) {
    this.options = {
      strict: options.strict ?? true,
      includeMetadata: options.includeMetadata ?? true,
      customMetadata: options.customMetadata ?? {},
    };

    // Create JSON Schema parser for delegation
    this.jsonSchemaParser = new JSONSchemaParser(this.options);
  }

  /**
   * Parse an OpenAPI document and extract request body schema
   */
  parse(
    input: OpenAPIDocument,
    options?: OpenAPIParserOptions
  ): IntakeSchema {
    const mergedOptions = { ...this.options, ...options };
    this.options = mergedOptions as Required<ParserOptions>;

    // Validate OpenAPI document
    this.validateOpenAPIDocument(input);

    // Extract request body schema
    const extraction = this.extractRequestBodySchema(
      input,
      options as OpenAPIParserOptions
    );

    // Parse the schema using JSON Schema parser
    const intakeSchema = this.jsonSchemaParser.parse(extraction.schema, {
      ...this.options,
      customMetadata: {},
    });

    // Override title and description if present in operation
    if (extraction.metadata.summary && !intakeSchema.title) {
      intakeSchema.title = extraction.metadata.summary;
    }
    if (extraction.metadata.description && !intakeSchema.description) {
      intakeSchema.description = extraction.metadata.description;
    }

    // Add OpenAPI-specific metadata
    if (this.options.includeMetadata) {
      intakeSchema.metadata = {
        ...intakeSchema.metadata,
        source: 'openapi',
        openapi: input.openapi,
        operationId: extraction.metadata.operationId,
        path: extraction.metadata.path,
        method: extraction.metadata.method,
        tags: extraction.metadata.tags,
        ...this.options.customMetadata,
      };
    }

    return intakeSchema;
  }

  /**
   * Check if a value can be parsed as an OpenAPI document
   */
  canParse(input: unknown): input is OpenAPIDocument {
    if (!input || typeof input !== 'object') {
      return false;
    }

    const doc = input as OpenAPIDocument;

    // Must have openapi version field starting with "3.0" or "3.1"
    if (!doc.openapi || typeof doc.openapi !== 'string') {
      return false;
    }

    if (!doc.openapi.startsWith('3.0') && !doc.openapi.startsWith('3.1')) {
      return false;
    }

    // Must have paths object
    if (!doc.paths || typeof doc.paths !== 'object') {
      return false;
    }

    return true;
  }

  /**
   * Validate OpenAPI document structure
   */
  private validateOpenAPIDocument(doc: OpenAPIDocument): void {
    if (!doc.openapi) {
      throw new SchemaValidationError(
        'Invalid OpenAPI document: missing "openapi" version field',
        doc
      );
    }

    if (!doc.openapi.startsWith('3.0') && !doc.openapi.startsWith('3.1')) {
      throw new SchemaValidationError(
        `Unsupported OpenAPI version: ${doc.openapi}. Only OpenAPI 3.0 and 3.1 are supported.`,
        doc,
        { version: doc.openapi }
      );
    }

    if (!doc.paths || typeof doc.paths !== 'object') {
      throw new SchemaValidationError(
        'Invalid OpenAPI document: missing or invalid "paths" object',
        doc
      );
    }
  }

  /**
   * Extract request body schema from OpenAPI document
   */
  private extractRequestBodySchema(
    doc: OpenAPIDocument,
    options?: OpenAPIParserOptions
  ): {
    schema: JSONSchema;
    metadata: {
      operationId?: string;
      summary?: string;
      description?: string;
      tags?: string[];
      path?: string;
      method?: string;
    };
  } {
    const mediaType = options?.mediaType ?? 'application/json';

    // If operationId is provided, search by operation ID
    if (options?.operationId) {
      return this.findByOperationId(doc, options.operationId, mediaType);
    }

    // If path is provided, extract from specific path/method
    if (options?.path) {
      const path = options.path;
      const method = options?.method ?? this.findFirstMutationMethod(doc, path);

      if (!method) {
        throw new ParserError(
          `No mutation operation (POST/PUT/PATCH) found at path: ${path}`,
          undefined,
          { path }
        );
      }

      return this.extractFromOperation(doc, path, method, mediaType);
    }

    // Otherwise, find the first operation with a request body
    return this.findFirstRequestBody(doc, mediaType);
  }

  /**
   * Find operation by operationId
   */
  private findByOperationId(
    doc: OpenAPIDocument,
    operationId: string,
    mediaType: string
  ): {
    schema: JSONSchema;
    metadata: {
      operationId?: string;
      summary?: string;
      description?: string;
      tags?: string[];
      path?: string;
      method?: string;
    };
  } {
    if (!doc.paths) {
      throw new ParserError('OpenAPI document has no paths');
    }

    for (const [path, pathItem] of Object.entries(doc.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (operation.operationId === operationId) {
          return this.extractFromOperation(doc, path, method, mediaType);
        }
      }
    }

    throw new ParserError(
      `Operation with ID "${operationId}" not found in OpenAPI document`,
      undefined,
      { operationId }
    );
  }

  /**
   * Find the first mutation method (POST, PUT, PATCH) for a path
   */
  private findFirstMutationMethod(
    doc: OpenAPIDocument,
    path: string
  ): string | null {
    const pathItem = doc.paths?.[path];
    if (!pathItem) {
      return null;
    }

    // Check in priority order: POST, PUT, PATCH
    const methods = ['post', 'put', 'patch'];
    for (const method of methods) {
      if (pathItem[method]) {
        return method;
      }
    }

    return null;
  }

  /**
   * Find the first operation with a request body
   */
  private findFirstRequestBody(
    doc: OpenAPIDocument,
    mediaType: string
  ): {
    schema: JSONSchema;
    metadata: {
      operationId?: string;
      summary?: string;
      description?: string;
      tags?: string[];
      path?: string;
      method?: string;
    };
  } {
    if (!doc.paths) {
      throw new ParserError('OpenAPI document has no paths');
    }

    // Look for first POST/PUT/PATCH with request body
    const methods = ['post', 'put', 'patch'];

    for (const [path, pathItem] of Object.entries(doc.paths)) {
      for (const method of methods) {
        const operation = pathItem[method];
        if (operation?.requestBody) {
          return this.extractFromOperation(doc, path, method, mediaType);
        }
      }
    }

    throw new ParserError(
      'No operation with request body found in OpenAPI document'
    );
  }

  /**
   * Extract schema from a specific operation
   */
  private extractFromOperation(
    doc: OpenAPIDocument,
    path: string,
    method: string,
    mediaType: string
  ): {
    schema: JSONSchema;
    metadata: {
      operationId?: string;
      summary?: string;
      description?: string;
      tags?: string[];
      path?: string;
      method?: string;
    };
  } {
    const pathItem = doc.paths?.[path];
    if (!pathItem) {
      throw new ParserError(`Path "${path}" not found in OpenAPI document`, undefined, {
        path,
      });
    }

    const operation = pathItem[method] as OpenAPIOperation | undefined;
    if (!operation) {
      throw new ParserError(
        `Method "${method}" not found for path "${path}"`,
        undefined,
        { path, method }
      );
    }

    if (!operation.requestBody) {
      throw new ParserError(
        `No request body defined for ${method.toUpperCase()} ${path}`,
        undefined,
        { path, method }
      );
    }

    const content = operation.requestBody.content[mediaType];
    if (!content) {
      const availableTypes = Object.keys(operation.requestBody.content).join(
        ', '
      );
      throw new ParserError(
        `Media type "${mediaType}" not found in request body. Available types: ${availableTypes}`,
        undefined,
        { path, method, mediaType, availableTypes }
      );
    }

    if (!content.schema) {
      throw new ParserError(
        `No schema defined for ${mediaType} in ${method.toUpperCase()} ${path}`,
        undefined,
        { path, method, mediaType }
      );
    }

    // Extract metadata
    const metadata = {
      operationId: operation.operationId,
      summary: operation.summary,
      description: operation.description ?? operation.requestBody.description,
      tags: operation.tags,
      path,
      method: method.toLowerCase(),
    };

    return {
      schema: content.schema,
      metadata,
    };
  }
}
