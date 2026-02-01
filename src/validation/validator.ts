/**
 * FormBridge Validation Module
 *
 * This module provides validation utilities for intake submissions.
 * It validates submission data against Zod schemas and returns
 * structured validation results that can be mapped to IntakeError format.
 */

import { z } from 'zod';
import type { IntakeEvent, Actor, SubmissionState } from '../types/intake-contract';
import { randomUUID } from 'crypto';
import { EventId, SubmissionId } from '../types/branded.js';

/**
 * Event emitter interface for validation events
 */
export interface EventEmitter {
  emit(event: IntakeEvent): Promise<void>;
}

/**
 * Validation result for successful validation
 */
export interface ValidationSuccess<T = unknown> {
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
export type ValidationResult<T = unknown> = ValidationSuccess<T> | ValidationFailure;

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
export function validateSubmission<T = unknown>(
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
export function validateSubmissionOrThrow<T = unknown>(
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
export function validatePartialSubmission<T = unknown>(
  schema: z.ZodType<T>,
  data: unknown
): ValidationResult<Partial<T>> {
  // For object schemas, make all fields optional
  if (schema instanceof z.ZodObject) {
    const partialResult = schema.partial().safeParse(data);
    if (partialResult.success) {
      return { success: true, data: partialResult.data as Partial<T> };
    }
    return { success: false, error: partialResult.error };
  }

  // For non-object schemas, just validate as-is
  // This handles primitives, arrays, etc.
  return validateSubmission(schema as z.ZodType<Partial<T>>, data);
}

/**
 * Validator class with event emission capabilities
 *
 * This class provides validation methods that emit validation events
 * for audit trail purposes. It follows the same pattern as SubmissionManager
 * by accepting an EventEmitter in the constructor.
 */
export class Validator {
  constructor(private eventEmitter: EventEmitter) {}

  /**
   * Protected method to emit validation events
   * Used internally by validation methods to emit audit trail events
   */
  protected async emitEvent(event: IntakeEvent): Promise<void> {
    await this.eventEmitter.emit(event);
  }

  /**
   * Validates submission data against a Zod schema
   *
   * @param schema - The Zod schema to validate against
   * @param data - The submission data to validate
   * @param submissionId - The submission ID for event emission
   * @param actor - The actor performing the validation
   * @param state - The current submission state
   * @returns Validation result with success status and either data or error
   */
  async validateSubmission<T = unknown>(
    schema: z.ZodType<T>,
    data: unknown,
    submissionId: string,
    actor: Actor,
    state: SubmissionState
  ): Promise<ValidationResult<T>> {
    const result = validateSubmission(schema, data);

    if (result.success) {
      // Emit validation.passed event on successful validation
      const event: IntakeEvent = {
        eventId: EventId(`evt_${randomUUID()}`),
        type: 'validation.passed',
        submissionId: SubmissionId(submissionId),
        ts: new Date().toISOString(),
        actor,
        state,
        payload: {
          data: result.data,
        },
      };

      await this.emitEvent(event);
    } else {
      // Emit validation.failed event on validation errors
      const event: IntakeEvent = {
        eventId: EventId(`evt_${randomUUID()}`),
        type: 'validation.failed',
        submissionId: SubmissionId(submissionId),
        ts: new Date().toISOString(),
        actor,
        state,
        payload: {
          errors: result.error.errors,
        },
      };

      await this.emitEvent(event);
    }

    return result;
  }

  /**
   * Validates submission data and returns only the data or throws on error
   *
   * @param schema - The Zod schema to validate against
   * @param data - The submission data to validate
   * @param submissionId - The submission ID for event emission
   * @param actor - The actor performing the validation
   * @param state - The current submission state
   * @returns The validated and parsed data
   * @throws {z.ZodError} If validation fails
   */
  async validateSubmissionOrThrow<T = unknown>(
    schema: z.ZodType<T>,
    data: unknown,
    submissionId: string,
    actor: Actor,
    state: SubmissionState
  ): Promise<T> {
    const result = validateSubmission(schema, data);

    // Emit validation.passed event on successful validation
    if (result.success) {
      const event: IntakeEvent = {
        eventId: EventId(`evt_${randomUUID()}`),
        type: 'validation.passed',
        submissionId: SubmissionId(submissionId),
        ts: new Date().toISOString(),
        actor,
        state,
        payload: {
          data: result.data,
        },
      };

      await this.emitEvent(event);
      return result.data;
    }

    // Emit validation.failed event on validation errors
    const event: IntakeEvent = {
      eventId: EventId(`evt_${randomUUID()}`),
      type: 'validation.failed',
      submissionId: SubmissionId(submissionId),
      ts: new Date().toISOString(),
      actor,
      state,
      payload: {
        errors: result.error.errors,
      },
    };

    await this.emitEvent(event);

    throw result.error;
  }

  /**
   * Validates partial submission data against a Zod schema
   *
   * @param schema - The Zod schema to validate against
   * @param data - The partial submission data to validate
   * @param submissionId - The submission ID for event emission
   * @param actor - The actor performing the validation
   * @param state - The current submission state
   * @returns Validation result with success status and either data or error
   */
  async validatePartialSubmission<T = unknown>(
    schema: z.ZodType<T>,
    data: unknown,
    submissionId: string,
    actor: Actor,
    state: SubmissionState
  ): Promise<ValidationResult<Partial<T>>> {
    const result = validatePartialSubmission(schema, data);

    // Emit validation.passed event on successful validation
    if (result.success) {
      const event: IntakeEvent = {
        eventId: EventId(`evt_${randomUUID()}`),
        type: 'validation.passed',
        submissionId: SubmissionId(submissionId),
        ts: new Date().toISOString(),
        actor,
        state,
        payload: {
          data: result.data,
        },
      };

      await this.emitEvent(event);
    } else {
      // Emit validation.failed event on validation errors
      const event: IntakeEvent = {
        eventId: EventId(`evt_${randomUUID()}`),
        type: 'validation.failed',
        submissionId: SubmissionId(submissionId),
        ts: new Date().toISOString(),
        actor,
        state,
        payload: {
          errors: result.error.errors,
        },
      };

      await this.emitEvent(event);
    }

    return result;
  }
}
