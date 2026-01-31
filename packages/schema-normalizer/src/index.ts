/**
 * @formbridge/schema-normalizer
 *
 * Schema normalization engine that converts Zod schemas, JSON Schema, and OpenAPI specs
 * into a unified IntakeSchema IR (Internal Representation).
 *
 * This module provides the foundation for FormBridge's "define once, use everywhere" approach
 * by abstracting over three popular schema formats.
 */

// =============================================================================
// Core Types - IntakeSchema IR
// =============================================================================

export type {
  IntakeSchema,
  IntakeSchemaField,
  IntakeSchemaFieldType,
  StringField,
  NumberField,
  IntegerField,
  BooleanField,
  NullField,
  ObjectField,
  ArrayField,
  EnumField,
  StringConstraints,
  NumberConstraints,
  ArrayConstraints,
  EnumValue,
  StringFormat,
} from './types/intake-schema';

export {
  isStringField,
  isNumberField,
  isIntegerField,
  isBooleanField,
  isNullField,
  isObjectField,
  isArrayField,
  isEnumField,
} from './types/intake-schema';

// =============================================================================
// Parser Interface & Base Types
// =============================================================================

export type { Parser, ParserOptions } from './types/parser';
export { ParserError, isParser } from './types/parser';

// =============================================================================
// Error Classes
// =============================================================================

export {
  UnsupportedFeatureError,
  SchemaValidationError,
  createUnsupportedFeatureError,
} from './types/errors';

// =============================================================================
// Parsers - Convert schemas to IntakeSchema IR
// =============================================================================

export {
  JSONSchemaParser,
  type JSONSchema,
  type JSONSchemaType,
} from './parsers/json-schema-parser';

export { ZodParser } from './parsers/zod-parser';

export {
  OpenAPIParser,
  type OpenAPIDocument,
  type OpenAPIOperation,
  type OpenAPIRequestBody,
  type OpenAPIParserOptions,
} from './parsers/openapi-parser';

// =============================================================================
// Serializers - Convert IntakeSchema IR back to schemas
// =============================================================================

export {
  JSONSchemaSerializer,
  serializeToJSONSchema,
  type SerializerOptions,
  SerializerError,
} from './serializers/json-schema-serializer';

// =============================================================================
// Convenience Factory Functions
// =============================================================================

/**
 * Create a JSONSchemaParser instance with optional configuration
 *
 * @example
 * ```typescript
 * import { createJSONSchemaParser } from '@formbridge/schema-normalizer';
 *
 * const parser = createJSONSchemaParser();
 * const ir = parser.parse({ type: 'string', minLength: 3 });
 * ```
 */
export function createJSONSchemaParser(options?: import('./types/parser').ParserOptions) {
  const { JSONSchemaParser } = require('./parsers/json-schema-parser');
  return new JSONSchemaParser(options);
}

/**
 * Create a ZodParser instance with optional configuration
 *
 * @example
 * ```typescript
 * import { createZodParser } from '@formbridge/schema-normalizer';
 * import { z } from 'zod';
 *
 * const parser = createZodParser();
 * const ir = parser.parse(z.string().min(3));
 * ```
 */
export function createZodParser(options?: import('./types/parser').ParserOptions) {
  const { ZodParser } = require('./parsers/zod-parser');
  return new ZodParser(options);
}

/**
 * Create an OpenAPIParser instance with optional configuration
 *
 * @example
 * ```typescript
 * import { createOpenAPIParser } from '@formbridge/schema-normalizer';
 *
 * const parser = createOpenAPIParser();
 * const ir = parser.parse(openApiDoc, { operationId: 'createUser' });
 * ```
 */
export function createOpenAPIParser(options?: import('./types/parser').ParserOptions) {
  const { OpenAPIParser } = require('./parsers/openapi-parser');
  return new OpenAPIParser(options);
}

/**
 * Create a JSONSchemaSerializer instance with optional configuration
 *
 * @example
 * ```typescript
 * import { createJSONSchemaSerializer } from '@formbridge/schema-normalizer';
 *
 * const serializer = createJSONSchemaSerializer();
 * const jsonSchema = serializer.serialize(intakeSchema);
 * ```
 */
export function createJSONSchemaSerializer(options?: import('./serializers/json-schema-serializer').SerializerOptions) {
  const { JSONSchemaSerializer } = require('./serializers/json-schema-serializer');
  return new JSONSchemaSerializer(options);
}
