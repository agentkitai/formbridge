/**
 * Parser Interface
 *
 * Base interface for all schema parsers (Zod, JSON Schema, OpenAPI).
 * Each parser implementation converts its specific schema format into the unified IntakeSchema IR.
 */

import type { IntakeSchema } from './intake-schema';

/**
 * Parser configuration options
 */
export interface ParserOptions {
  /**
   * Strict mode - fail on unsupported features rather than silently ignoring them
   * @default true
   */
  strict?: boolean;

  /**
   * Include source metadata in the parsed IntakeSchema
   * @default true
   */
  includeMetadata?: boolean;

  /**
   * Custom metadata to merge into the IntakeSchema metadata
   */
  customMetadata?: Record<string, unknown>;
}

/**
 * Parser error thrown when a schema cannot be parsed
 */
export class ParserError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ParserError';

    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ParserError);
    }
  }
}

/**
 * Base Parser interface
 *
 * All schema parsers (JSON Schema, Zod, OpenAPI) implement this interface to provide
 * a consistent API for converting their respective schema formats into IntakeSchema IR.
 *
 * @template TInput - The input schema type (e.g., JSONSchema, ZodSchema, OpenAPIDocument)
 */
export interface Parser<TInput = unknown> {
  /**
   * Parse a schema into IntakeSchema IR
   *
   * @param input - The schema to parse (format depends on parser implementation)
   * @param options - Parser configuration options
   * @returns Normalized IntakeSchema IR
   * @throws {ParserError} If the schema is invalid or contains unsupported constructs
   */
  parse(input: TInput, options?: ParserOptions): IntakeSchema;

  /**
   * Validate that a schema can be parsed without actually parsing it
   *
   * This is useful for early validation without the overhead of full parsing.
   *
   * @param input - The schema to validate
   * @returns true if the schema is valid and parseable, false otherwise
   */
  canParse(input: TInput): boolean;
}

/**
 * Type guard: check if an object implements the Parser interface
 */
export function isParser<TInput = unknown>(
  obj: unknown
): obj is Parser<TInput> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'parse' in obj &&
    typeof (obj as Parser<TInput>).parse === 'function' &&
    'canParse' in obj &&
    typeof (obj as Parser<TInput>).canParse === 'function'
  );
}
