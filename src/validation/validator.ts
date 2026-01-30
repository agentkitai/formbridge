/**
 * FormBridge Validation Module
 *
 * This module provides validation utilities for intake submissions.
 * It validates submission data against Zod schemas and returns
 * structured validation results that can be mapped to IntakeError format.
 */

import { z } from 'zod';

/**
 * Validation result for successful validation
 */
export interface ValidationSuccess<T = any> {
  /** Whether validation succeeded */
  success: true;
  /** Validated and parsed data */
  data: T;
}

/**
 * Validation result for failed validation
 */
export interface ValidationFailure {
  /** Whether validation succeeded */
  success: false;
  /** Zod validation errors */
  error: z.ZodError;
}

/**
 * Combined validation result type
 */
export type ValidationResult<T = any> = ValidationSuccess<T> | ValidationFailure;

/**
 * Validates submission data against a Zod schema
 *
 * This function takes raw submission data and validates it against a
 * Zod schema. It returns a structured validation result that indicates
 * success or failure. On failure, the Zod error can be mapped to
 * IntakeError format using the error-mapper module.
 *
 * @param schema - The Zod schema to validate against
 * @param data - The submission data to validate
 * @returns Validation result with success status and either data or error
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { validateSubmission } from './validator';
 *
 * const schema = z.object({
 *   name: z.string().min(1, 'Name is required'),
 *   email: z.string().email('Invalid email address'),
 *   age: z.number().min(18, 'Must be at least 18 years old')
 * });
 *
 * const result = validateSubmission(schema, {
 *   name: 'John Doe',
 *   email: 'john@example.com',
 *   age: 25
 * });
 *
 * if (result.success) {
 *   console.log('Validated data:', result.data);
 * } else {
 *   console.error('Validation errors:', result.error);
 * }
 * ```
 */
export function validateSubmission<T = any>(
  schema: z.ZodType<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data
    };
  }

  return {
    success: false,
    error: result.error
  };
}

/**
 * Type guard to check if a validation result is successful
 *
 * @param result - The validation result to check
 * @returns True if validation was successful, false otherwise
 */
export function isValidationSuccess<T>(
  result: ValidationResult<T>
): result is ValidationSuccess<T> {
  return result.success === true;
}

/**
 * Type guard to check if a validation result is a failure
 *
 * @param result - The validation result to check
 * @returns True if validation failed, false otherwise
 */
export function isValidationFailure<T>(
  result: ValidationResult<T>
): result is ValidationFailure {
  return result.success === false;
}

/**
 * Validates submission data and returns only the data or throws on error
 *
 * This is a convenience function for cases where you want to handle
 * validation errors as exceptions rather than return values.
 *
 * @param schema - The Zod schema to validate against
 * @param data - The submission data to validate
 * @returns The validated and parsed data
 * @throws {z.ZodError} If validation fails
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { validateSubmissionOrThrow } from './validator';
 *
 * const schema = z.object({
 *   name: z.string(),
 *   email: z.string().email()
 * });
 *
 * try {
 *   const data = validateSubmissionOrThrow(schema, { name: 'John', email: 'invalid' });
 * } catch (error) {
 *   if (error instanceof z.ZodError) {
 *     console.error('Validation failed:', error.errors);
 *   }
 * }
 * ```
 */
export function validateSubmissionOrThrow<T = any>(
  schema: z.ZodType<T>,
  data: unknown
): T {
  return schema.parse(data);
}

/**
 * Validates partial submission data against a Zod schema
 *
 * This function is useful for validating incomplete submissions where
 * not all required fields may be present yet. It converts the schema
 * to a partial schema before validation.
 *
 * @param schema - The Zod schema to validate against
 * @param data - The partial submission data to validate
 * @returns Validation result with success status and either data or error
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { validatePartialSubmission } from './validator';
 *
 * const schema = z.object({
 *   name: z.string().min(1),
 *   email: z.string().email(),
 *   age: z.number().min(18)
 * });
 *
 * // Validate with only some fields present
 * const result = validatePartialSubmission(schema, {
 *   name: 'John Doe'
 * });
 *
 * if (result.success) {
 *   console.log('Partial data is valid:', result.data);
 * }
 * ```
 */
export function validatePartialSubmission<T = any>(
  schema: z.ZodType<T>,
  data: unknown
): ValidationResult<Partial<T>> {
  // For object schemas, make all fields optional
  if (schema instanceof z.ZodObject) {
    const partialSchema = schema.partial() as unknown as z.ZodType<Partial<T>>;
    return validateSubmission(partialSchema, data);
  }

  // For non-object schemas, just validate as-is
  // This handles primitives, arrays, etc.
  return validateSubmission(schema as z.ZodType<Partial<T>>, data);
}
