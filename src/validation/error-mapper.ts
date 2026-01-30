/**
 * FormBridge Error Mapper Module
 *
 * This module maps Zod validation errors to the Intake Contract error format.
 * It converts ZodError objects into structured IntakeError responses with
 * field-level errors and suggested next actions.
 */

import { z } from 'zod';
import type { ValidationErrorResponse, FieldError, NextAction, IntakeErrorType } from '../types/intake-contract.js';

/**
 * Maps a Zod validation error to a ValidationErrorResponse
 *
 * This function takes a ZodError from validation and converts it into
 * a structured ValidationErrorResponse following the Intake Contract specification.
 * It categorizes each Zod error by type (missing, invalid, needs_approval, etc.) and
 * generates appropriate next actions to guide error resolution.
 *
 * @param zodError - The Zod validation error to map
 * @param options - Optional configuration for error mapping
 * @returns A structured ValidationErrorResponse with field errors and next actions
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { validateSubmission } from './validator';
 * import { mapToIntakeError } from './error-mapper';
 *
 * const schema = z.object({
 *   name: z.string().min(1),
 *   email: z.string().email(),
 *   age: z.number().min(18)
 * });
 *
 * const result = validateSubmission(schema, { name: '', age: 15 });
 *
 * if (!result.success) {
 *   const validationError = mapToIntakeError(result.error);
 *   console.log('Error:', validationError);
 *   // {
 *   //   type: 'invalid',
 *   //   message: 'Validation failed for 3 fields',
 *   //   fields: [...],
 *   //   nextActions: [...]
 *   // }
 * }
 * ```
 */
export function mapToIntakeError(
  zodError: z.ZodError,
  options?: ErrorMapperOptions
): ValidationErrorResponse {
  const fieldErrors: FieldError[] = [];
  const missingFields: string[] = [];
  const invalidFields: string[] = [];
  const approvalFields: string[] = [];

  // Process each Zod issue into a FieldError
  for (const issue of zodError.issues) {
    const fieldPath = getFieldPath(issue.path);
    const errorType = determineErrorType(issue);

    const fieldError: FieldError = {
      field: fieldPath,
      message: issue.message,
      type: errorType,
      constraint: getConstraint(issue),
      value: options?.includeValues ? getIssueValue(issue) : undefined
    };

    fieldErrors.push(fieldError);

    // Track fields by error type for generating next actions
    if (errorType === 'missing') {
      missingFields.push(fieldPath);
    } else if (errorType === 'invalid') {
      invalidFields.push(fieldPath);
    } else if (errorType === 'needs_approval') {
      approvalFields.push(fieldPath);
    }
  }

  // Determine overall error type (prioritize missing > needs_approval > invalid)
  const overallType: IntakeErrorType =
    missingFields.length > 0 ? 'missing' :
    approvalFields.length > 0 ? 'needs_approval' :
    'invalid';

  // Generate high-level message
  const message = generateErrorMessage(fieldErrors, overallType);

  // Generate next actions
  const nextActions = generateNextActions(missingFields, invalidFields, approvalFields, fieldErrors);

  return {
    type: overallType,
    message,
    fields: fieldErrors,
    nextActions,
    resumeToken: options?.resumeToken,
    idempotencyKey: options?.idempotencyKey,
    timestamp: options?.includeTimestamp ? new Date().toISOString() : undefined
  };
}

/**
 * Options for error mapping
 */
export interface ErrorMapperOptions {
  /** Include field values in error response (useful for debugging) */
  includeValues?: boolean;
  /** Resume token for continuing failed submission */
  resumeToken?: string;
  /** Idempotency key for retry safety */
  idempotencyKey?: string;
  /** Include timestamp in error response */
  includeTimestamp?: boolean;
}

/**
 * Converts a Zod issue path to a dot-notation field path
 *
 * @param path - The Zod issue path (array of keys)
 * @returns A dot-notation field path string
 *
 * @example
 * ```typescript
 * getFieldPath(['address', 'street']) // => 'address.street'
 * getFieldPath(['items', 0, 'name']) // => 'items.0.name'
 * getFieldPath([]) // => 'root'
 * ```
 */
function getFieldPath(path: (string | number)[]): string {
  if (path.length === 0) {
    return 'root';
  }
  return path.join('.');
}

/**
 * Determines the IntakeErrorType from a Zod issue
 *
 * Maps Zod error codes to Intake Contract error types:
 * - invalid_type with received 'undefined' -> missing
 * - invalid_type, invalid_string, invalid_enum, etc. -> invalid
 * - custom errors can indicate conflict or needs_approval
 *
 * @param issue - The Zod issue to analyze
 * @returns The appropriate IntakeErrorType
 */
function determineErrorType(issue: z.ZodIssue): IntakeErrorType {
  // Check for required field errors
  if (issue.code === 'invalid_type') {
    const typeIssue = issue as z.ZodInvalidTypeIssue;
    if (typeIssue.received === 'undefined' || typeIssue.received === 'null') {
      return 'missing';
    }
  }

  // Check for custom error types that might indicate special handling
  if (issue.code === 'custom') {
    const customIssue = issue as z.ZodCustomIssue;
    // Check for special params that indicate error type
    if (customIssue.params?.errorType === 'conflict') {
      return 'conflict';
    }
    if (customIssue.params?.errorType === 'needs_approval') {
      return 'needs_approval';
    }
  }

  // All other validation errors are 'invalid'
  return 'invalid';
}

/**
 * Extracts the constraint that was violated from a Zod issue
 *
 * @param issue - The Zod issue to analyze
 * @returns A string describing the constraint, or undefined
 *
 * @example
 * ```typescript
 * // For z.string().min(5)
 * getConstraint(issue) // => 'min:5'
 *
 * // For z.string().email()
 * getConstraint(issue) // => 'email'
 *
 * // For z.number().max(100)
 * getConstraint(issue) // => 'max:100'
 * ```
 */
function getConstraint(issue: z.ZodIssue): string | undefined {
  switch (issue.code) {
    case 'too_small':
      return `min:${issue.minimum}`;
    case 'too_big':
      return `max:${issue.maximum}`;
    case 'invalid_string':
      return issue.validation === 'email' ? 'email' :
             issue.validation === 'url' ? 'url' :
             issue.validation === 'uuid' ? 'uuid' :
             String(issue.validation);
    case 'invalid_type':
      return `type:${issue.expected}`;
    case 'invalid_enum_value':
      return 'enum';
    case 'invalid_literal':
      return 'literal';
    default:
      return undefined;
  }
}

/**
 * Attempts to extract the actual value from a Zod issue
 *
 * This is useful for debugging but should be used carefully
 * to avoid leaking sensitive data.
 *
 * @param issue - The Zod issue
 * @returns The value that caused the error, or undefined
 */
function getIssueValue(issue: z.ZodIssue): unknown {
  // For invalid_type issues, we can get the received value
  if ('received' in issue) {
    return issue.received;
  }

  // For other issue types, we might not have access to the value
  return undefined;
}

/**
 * Generates a high-level error message based on field errors
 *
 * @param fieldErrors - Array of field-level errors
 * @param overallType - Overall error type
 * @returns A human-readable error message
 */
function generateErrorMessage(fieldErrors: FieldError[], overallType: IntakeErrorType): string {
  const count = fieldErrors.length;
  const fieldWord = count === 1 ? 'field' : 'fields';

  if (overallType === 'missing') {
    const missingCount = fieldErrors.filter(e => e.type === 'missing').length;
    if (missingCount === count) {
      return `${missingCount} required ${fieldWord} ${missingCount === 1 ? 'is' : 'are'} missing`;
    }
    return `Validation failed: ${missingCount} required ${fieldWord} missing, ${count - missingCount} ${fieldWord} invalid`;
  }

  if (overallType === 'needs_approval') {
    const approvalCount = fieldErrors.filter(e => e.type === 'needs_approval').length;
    return `Submission requires approval for ${approvalCount} ${fieldWord}`;
  }

  return `Validation failed for ${count} ${fieldWord}`;
}

/**
 * Generates suggested next actions based on the errors
 *
 * @param missingFields - List of missing field names
 * @param invalidFields - List of invalid field names
 * @param approvalFields - List of fields requiring approval
 * @param allErrors - All field errors
 * @returns Array of suggested next actions
 */
function generateNextActions(
  missingFields: string[],
  invalidFields: string[],
  approvalFields: string[],
  allErrors: FieldError[]
): NextAction[] {
  const actions: NextAction[] = [];

  // Action for fields requiring approval (highest priority)
  if (approvalFields.length > 0) {
    actions.push({
      type: 'wait_for_review',
      description: `Submission requires review for ${approvalFields.length} ${approvalFields.length === 1 ? 'field' : 'fields'}`,
      fields: approvalFields
    });
  }

  // Action for missing fields
  if (missingFields.length > 0) {
    actions.push({
      type: 'provide_missing_fields',
      description: `Provide values for ${missingFields.length} required ${missingFields.length === 1 ? 'field' : 'fields'}`,
      fields: missingFields
    });
  }

  // Action for invalid fields
  if (invalidFields.length > 0) {
    actions.push({
      type: 'correct_invalid_fields',
      description: `Correct values for ${invalidFields.length} invalid ${invalidFields.length === 1 ? 'field' : 'fields'}`,
      fields: invalidFields
    });
  }

  // Check for specific constraint types that need special guidance
  const emailErrors = allErrors.filter(e => e.constraint === 'email');
  if (emailErrors.length > 0) {
    actions.push({
      type: 'fix_email_format',
      description: 'Provide valid email addresses',
      fields: emailErrors.map(e => e.field)
    });
  }

  const minErrors = allErrors.filter(e => e.constraint?.startsWith('min:'));
  if (minErrors.length > 0) {
    actions.push({
      type: 'meet_minimum_requirements',
      description: 'Ensure values meet minimum requirements',
      fields: minErrors.map(e => e.field),
      params: {
        constraints: minErrors.map(e => ({ field: e.field, constraint: e.constraint }))
      }
    });
  }

  // Default action if no specific actions were added
  if (actions.length === 0) {
    actions.push({
      type: 'fix_validation_errors',
      description: 'Correct all validation errors and resubmit',
      fields: allErrors.map(e => e.field)
    });
  }

  return actions;
}

/**
 * Helper function to map multiple validation failures to intake errors
 *
 * This is useful when you have multiple schemas or validation steps
 * and want to combine them into a single error response.
 *
 * @param zodErrors - Array of Zod errors to map
 * @param options - Optional configuration for error mapping
 * @returns A single ValidationErrorResponse combining all validation failures
 */
export function mapMultipleToIntakeError(
  zodErrors: z.ZodError[],
  options?: ErrorMapperOptions
): ValidationErrorResponse {
  // Combine all issues from all errors
  const allIssues = zodErrors.flatMap(err => err.issues);

  // Create a new ZodError with all combined issues
  const combinedError = new z.ZodError(allIssues);

  return mapToIntakeError(combinedError, options);
}
