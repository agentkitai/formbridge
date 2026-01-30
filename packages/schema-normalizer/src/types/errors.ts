/**
 * Schema Parser Error Types
 *
 * Specialized error classes for different parsing failure scenarios.
 * These provide more specific error messages and context than generic ParserError.
 */

import { ParserError } from './parser';

/**
 * Error thrown when an unsupported schema feature is encountered
 *
 * This is used for features that are valid in the source schema format
 * but are explicitly not supported in FormBridge v1 (e.g., $ref, allOf, anyOf, oneOf).
 */
export class UnsupportedFeatureError extends ParserError {
  constructor(
    /**
     * The name of the unsupported feature (e.g., "$ref", "allOf")
     */
    public readonly feature: string,
    /**
     * Human-readable explanation of why this feature is not supported
     * and potential alternatives or workarounds
     */
    public readonly reason: string,
    /**
     * Additional context about where the feature was encountered
     */
    context?: Record<string, unknown>
  ) {
    super(
      `Unsupported feature: ${feature}. ${reason}`,
      undefined,
      context
    );
    this.name = 'UnsupportedFeatureError';

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UnsupportedFeatureError);
    }
  }
}

/**
 * Error thrown when a schema validation fails
 *
 * This is used when the schema structure itself is invalid
 * (e.g., missing required properties, invalid types).
 */
export class SchemaValidationError extends ParserError {
  constructor(
    message: string,
    /**
     * The schema or schema fragment that failed validation
     */
    public readonly schema?: unknown,
    context?: Record<string, unknown>
  ) {
    super(message, undefined, { ...context, schema });
    this.name = 'SchemaValidationError';

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SchemaValidationError);
    }
  }
}

/**
 * Helper function to create descriptive error messages for unsupported JSON Schema features
 */
export function createUnsupportedFeatureError(
  feature: '$ref' | 'allOf' | 'anyOf' | 'oneOf' | 'not',
  context?: Record<string, unknown>
): UnsupportedFeatureError {
  const messages: Record<typeof feature, string> = {
    $ref:
      'Schema references ($ref) are not supported in FormBridge v1. ' +
      'Please inline the referenced schema or flatten your schema structure.',
    allOf:
      'Schema composition with allOf is not supported in FormBridge v1. ' +
      'Please merge the schemas manually or use a single schema definition.',
    anyOf:
      'Schema composition with anyOf is not supported in FormBridge v1. ' +
      'Union types and conditional schemas are not supported. ' +
      'Consider using separate schemas for different variants.',
    oneOf:
      'Schema composition with oneOf is not supported in FormBridge v1. ' +
      'Discriminated unions and exclusive schemas are not supported. ' +
      'Consider using separate schemas for different variants.',
    not:
      'Schema negation with not is not supported in FormBridge v1. ' +
      'Please express validation rules using positive constraints instead.',
  };

  return new UnsupportedFeatureError(feature, messages[feature], context);
}
