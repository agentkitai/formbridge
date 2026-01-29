/**
 * Error types for FormBridge Intake Contract
 * Based on the IntakeError specification
 */

import { FieldPath } from './schema';

/**
 * Submission states from the Intake Contract
 */
export type SubmissionState =
  | 'draft'
  | 'in_progress'
  | 'awaiting_input'
  | 'awaiting_upload'
  | 'submitted'
  | 'needs_review'
  | 'approved'
  | 'rejected'
  | 'finalized'
  | 'cancelled'
  | 'expired';

/**
 * Error types from the Intake Contract
 */
export type IntakeErrorType =
  | 'missing'
  | 'invalid'
  | 'conflict'
  | 'needs_approval'
  | 'upload_pending'
  | 'delivery_failed'
  | 'expired'
  | 'cancelled';

/**
 * Field error codes
 */
export type FieldErrorCode =
  | 'required'
  | 'invalid_type'
  | 'invalid_format'
  | 'invalid_value'
  | 'too_long'
  | 'too_short'
  | 'file_required'
  | 'file_too_large'
  | 'file_wrong_type'
  | 'custom';

/**
 * Next action types
 */
export type NextActionType =
  | 'collect_field'
  | 'request_upload'
  | 'wait_for_review'
  | 'retry_delivery'
  | 'cancel';

/**
 * Per-field error details
 */
export interface FieldError {
  /** Dot-notation field path (e.g., "address.city", "items[0].name") */
  path: FieldPath;
  /** Error code */
  code: FieldErrorCode;
  /** Human-readable error message */
  message: string;
  /** What was expected (type, format, enum values, etc.) */
  expected?: unknown;
  /** What was received */
  received?: unknown;
}

/**
 * Next action suggestion
 */
export interface NextAction {
  /** The action to take */
  action: NextActionType;
  /** Which field this action relates to */
  field?: FieldPath;
  /** LLM-friendly guidance */
  hint?: string;
  /** MIME types accepted (for upload actions) */
  accept?: string[];
  /** Maximum file size in bytes (for upload actions) */
  maxBytes?: number;
}

/**
 * Structured error envelope from the Intake Contract
 */
export interface IntakeError {
  /** Always false for errors */
  ok: false;
  /** Submission ID this error relates to */
  submissionId: string;
  /** Current submission state */
  state: SubmissionState;
  /** Resume token for the next operation */
  resumeToken: string;
  /** Error details */
  error: {
    /** Error type */
    type: IntakeErrorType;
    /** Human-readable error summary */
    message?: string;
    /** Per-field error details */
    fields?: FieldError[];
    /** Suggested next actions */
    nextActions?: NextAction[];
    /** Whether the caller can retry this exact call */
    retryable: boolean;
    /** Suggested retry delay in milliseconds */
    retryAfterMs?: number;
  };
}

/**
 * Validation result (can be success or error)
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Field errors (if validation failed) */
  errors?: FieldError[];
}

/**
 * Client-side validation error
 * Simplified error format for use in the React components
 */
export interface ClientValidationError {
  /** Field path */
  path: FieldPath;
  /** Error message to display */
  message: string;
}

/**
 * Form errors by field path
 * Used for managing error state in the form
 */
export type FormErrors = Record<FieldPath, string>;

/**
 * Submission error
 * Simplified error format for form submission failures
 */
export interface SubmissionError {
  /** Error message */
  message: string;
  /** Field-specific errors */
  fieldErrors?: FieldError[];
  /** Whether the submission can be retried */
  retryable?: boolean;
}
