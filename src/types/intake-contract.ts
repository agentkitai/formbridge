/**
 * FormBridge Intake Contract Type Definitions
 *
 * This module defines the core types for the Intake Contract protocol,
 * which provides structured error responses and submission state management
 * for agent-native form submissions.
 */

/**
 * Submission state enumeration
 * Tracks the lifecycle of an intake submission
 */
export enum SubmissionState {
  /** Initial state - submission created but not validated */
  CREATED = 'created',
  /** Submission data is being validated */
  VALIDATING = 'validating',
  /** Validation failed - errors present */
  INVALID = 'invalid',
  /** Validation passed - ready for submission */
  VALID = 'valid',
  /** Submission is awaiting approval */
  PENDING_APPROVAL = 'pending_approval',
  /** File upload in progress */
  UPLOADING = 'uploading',
  /** Submission is being processed */
  SUBMITTING = 'submitting',
  /** Submission completed successfully */
  COMPLETED = 'completed',
  /** Submission failed during processing */
  FAILED = 'failed',
  /** Submission was cancelled */
  CANCELLED = 'cancelled',
  /** Submission has expired */
  EXPIRED = 'expired'
}

/**
 * Error type taxonomy for intake submissions
 * Provides semantic categorization of validation and processing errors
 */
export type IntakeErrorType =
  | 'missing'           // Required field is missing
  | 'invalid'           // Field value is invalid
  | 'conflict'          // Field value conflicts with another field
  | 'needs_approval'    // Submission requires human approval
  | 'upload_pending'    // File upload is not yet complete
  | 'delivery_failed'   // Failed to deliver submission to destination
  | 'expired'           // Submission or session has expired
  | 'cancelled';        // Submission was cancelled

/**
 * Field-level error information
 * Describes a specific validation error for a single field
 */
export interface FieldError {
  /** Name of the field with the error */
  field: string;
  /** Human-readable error message */
  message: string;
  /** Error type for programmatic handling */
  type: IntakeErrorType;
  /** Optional constraint that was violated (e.g., "min:5", "email") */
  constraint?: string;
  /** Optional current value that caused the error (for debugging) */
  value?: unknown;
}

/**
 * Actor information
 * Tracks who performed an action in the submission lifecycle
 */
export interface Actor {
  /** Actor type - agent or human */
  type: 'agent' | 'human';
  /** Unique identifier for the actor */
  id: string;
  /** Optional display name */
  name?: string;
  /** Optional email address */
  email?: string;
}

/**
 * Suggested next action for resolving errors
 * Guides agents on how to proceed when errors occur
 */
export interface NextAction {
  /** Action type identifier */
  type: string;
  /** Human-readable description of the action */
  description: string;
  /** Optional fields that need attention for this action */
  fields?: string[];
  /** Optional parameters for the action */
  params?: Record<string, unknown>;
}

/**
 * Structured intake error response
 * Returned by MCP tools to communicate validation and processing errors
 */
export interface IntakeError {
  /** Error type from the Intake Contract taxonomy */
  type: IntakeErrorType;
  /** High-level error message */
  message: string;
  /** Array of field-level errors */
  fields: FieldError[];
  /** Suggested next actions to resolve the error */
  nextActions: NextAction[];
  /** Optional resume token for continuing a failed submission */
  resumeToken?: string;
  /** Optional idempotency key for retry safety */
  idempotencyKey?: string;
  /** Timestamp when the error occurred */
  timestamp?: string;
}

/**
 * Successful submission response
 * Returned when a submission completes successfully
 */
export interface SubmissionSuccess {
  /** Submission state */
  state: SubmissionState;
  /** Unique submission identifier */
  submissionId: string;
  /** Success message */
  message: string;
  /** Optional data returned from the destination */
  data?: Record<string, unknown>;
  /** Actor who submitted */
  actor?: Actor;
  /** Timestamp of submission */
  timestamp?: string;
}

/**
 * Submission response - either success or error
 */
export type SubmissionResponse = SubmissionSuccess | IntakeError;

/**
 * Type guard to check if a response is an IntakeError
 */
export function isIntakeError(response: SubmissionResponse): response is IntakeError {
  return 'type' in response && 'fields' in response && 'nextActions' in response;
}

/**
 * Type guard to check if a response is a SubmissionSuccess
 */
export function isSubmissionSuccess(response: SubmissionResponse): response is SubmissionSuccess {
  return 'state' in response && 'submissionId' in response;
}
