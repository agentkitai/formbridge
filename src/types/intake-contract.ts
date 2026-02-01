/**
 * FormBridge Intake Contract - TypeScript Type Definitions
 * Based on INTAKE_CONTRACT_SPEC.md v0.1.0-draft
 */

import type {
  SubmissionId,
  IntakeId,
  ResumeToken,
  EventId,
  DeliveryId,
} from "./branded.js";

/**
 * Actor identity for all operations
 * Recorded on every event for audit purposes
 */
export interface Actor {
  kind: "agent" | "human" | "system";
  id: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Submission lifecycle states (type union)
 */
export type SubmissionState =
  | "draft"
  | "in_progress"
  | "awaiting_input"
  | "awaiting_upload"
  | "submitted"
  | "needs_review"
  | "approved"
  | "rejected"
  | "finalized"
  | "cancelled"
  | "expired"
  // Upload negotiation protocol states
  | "created"
  | "validating"
  | "invalid"
  | "valid"
  | "uploading"
  | "submitting"
  | "completed"
  | "failed"
  | "pending_approval";

/**
 * SubmissionState runtime constants for enum-like access.
 * Use SubmissionState.DRAFT, SubmissionState.VALIDATING, etc.
 */
export const SubmissionState = {
  DRAFT: "draft",
  IN_PROGRESS: "in_progress",
  AWAITING_INPUT: "awaiting_input",
  AWAITING_UPLOAD: "awaiting_upload",
  SUBMITTED: "submitted",
  NEEDS_REVIEW: "needs_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  FINALIZED: "finalized",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  CREATED: "created",
  VALIDATING: "validating",
  INVALID: "invalid",
  VALID: "valid",
  UPLOADING: "uploading",
  SUBMITTING: "submitting",
  COMPLETED: "completed",
  FAILED: "failed",
  PENDING_APPROVAL: "pending_approval",
} as const;

/**
 * Error types for intake validation and processing
 */
export type IntakeErrorType =
  | "missing"
  | "invalid"
  | "conflict"
  | "needs_approval"
  | "upload_pending"
  | "delivery_failed"
  | "expired"
  | "cancelled";

/**
 * Field-level error details
 */
export interface FieldError {
  field: string;
  message: string;
  type: IntakeErrorType;
  constraint?: string;
  value?: unknown;
  /** Field path (used by validator for nested field references) */
  path?: string;
  /** Machine-readable error code from validator */
  code?: string;
  /** Expected value or constraint description */
  expected?: unknown;
  /** Actual received value */
  received?: unknown;
}

/**
 * Action types for next steps
 */
export type NextActionType =
  | "provide_missing_fields"
  | "correct_invalid_fields"
  | "fix_email_format"
  | "meet_minimum_requirements"
  | "fix_validation_errors"
  | "wait_for_review"
  | "collect_field"
  | "request_upload"
  | "retry_delivery"
  | "cancel"
  | "create"
  | "validate";

/**
 * Next action guidance for agent loops
 */
export interface NextAction {
  type?: NextActionType;
  /** Action name (alternative to type, used by validator/MCP server) */
  action?: string;
  description?: string;
  field?: string;
  fields?: string[];
  hint?: string;
  accept?: string[];
  maxBytes?: number;
  params?: Record<string, unknown>;
}

/**
 * Validation error response (used internally by error mappers)
 */
export interface ValidationErrorResponse {
  type: IntakeErrorType;
  message?: string;
  fields?: FieldError[];
  nextActions?: NextAction[];
  resumeToken?: string;
  idempotencyKey?: string;
  timestamp?: string;
}

/**
 * Structured error response envelope.
 * Supports both the full envelope shape (ok, submissionId, error: {...})
 * and the flat shape used by MCP server (type, fields, nextActions at top level).
 */
export interface IntakeError {
  ok?: false;
  submissionId?: SubmissionId;
  state?: SubmissionState;
  resumeToken?: string;
  error?: {
    type: IntakeErrorType;
    message?: string;
    fields?: FieldError[];
    nextActions?: NextAction[];
    retryable: boolean;
    retryAfterMs?: number;
  };
  /** Flat shape fields (used by MCP server and error mapper) */
  type?: IntakeErrorType | string;
  message?: string;
  fields?: FieldError[];
  nextActions?: NextAction[];
  timestamp?: string;
}

/**
 * Event types for the intake event stream
 */
export type IntakeEventType =
  | "submission.created"
  | "field.updated"
  | "fields.updated"
  | "validation.passed"
  | "validation.failed"
  | "upload.requested"
  | "upload.completed"
  | "upload.failed"
  | "submission.submitted"
  | "review.requested"
  | "review.approved"
  | "review.rejected"
  | "delivery.attempted"
  | "delivery.succeeded"
  | "delivery.failed"
  | "submission.finalized"
  | "submission.cancelled"
  | "submission.expired"
  | "handoff.link_issued"
  | "handoff.resumed"
  | "step.started"
  | "step.completed"
  | "step.validation_failed";

/**
 * Field-level diff entry for field.updated events
 */
export interface FieldDiff {
  fieldPath: string;
  previousValue: unknown;
  newValue: unknown;
}

/**
 * Typed event for audit trail
 */
export interface IntakeEvent {
  eventId: EventId;
  type: IntakeEventType;
  submissionId: SubmissionId;
  ts: string;
  actor: Actor;
  state: SubmissionState;
  /** Monotonically increasing version per submission */
  version?: number;
  payload?: Record<string, unknown>;
}

/**
 * Delivery record for webhook forwarding
 */
export interface DeliveryRecord {
  deliveryId: DeliveryId;
  submissionId: SubmissionId;
  destinationUrl: string;
  status: 'pending' | 'succeeded' | 'failed';
  attempts: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  statusCode?: number;
  error?: string;
  createdAt: string;
}

/**
 * Retry policy for webhook delivery
 */
export interface RetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Approval gate configuration
 */
export interface ApprovalGate {
  name: string;
  reviewers: unknown;
  requiredApprovals?: number;
  autoApproveIf?: unknown;
  escalateAfterMs?: number;
}

/**
 * Destination for finalized submissions
 */
export interface Destination {
  kind: "webhook" | "callback" | "queue";
  url?: string;
  headers?: Record<string, string>;
  retryPolicy?: unknown;
}

/**
 * Intake definition - the template for data collection
 */
export interface IntakeDefinition {
  id: IntakeId;
  version: string;
  name: string;
  description?: string;
  schema: unknown;
  approvalGates?: ApprovalGate[];
  ttlMs?: number;
  destination: Destination;
  uiHints?: {
    steps?: unknown[];
    fieldHints?: Record<string, unknown>;
  };
}

/**
 * Create submission request
 */
export interface CreateSubmissionRequest {
  intakeId: IntakeId;
  idempotencyKey?: string;
  actor: Actor;
  initialFields?: Record<string, unknown>;
  ttlMs?: number;
}

/**
 * Create submission response
 */
export interface CreateSubmissionResponse {
  ok: true;
  submissionId: SubmissionId;
  state: "draft" | "in_progress" | "submitted";
  resumeToken: string;
  schema: unknown;
  missingFields?: string[];
}

/**
 * Set fields request
 */
export interface SetFieldsRequest {
  submissionId: SubmissionId;
  resumeToken: ResumeToken;
  actor: Actor;
  fields: Record<string, unknown>;
}

/**
 * Submit request
 */
export interface SubmitRequest {
  submissionId: SubmissionId;
  resumeToken: ResumeToken;
  idempotencyKey: string;
  actor: Actor;
}

/**
 * Review request
 */
export interface ReviewRequest {
  submissionId: SubmissionId;
  decision: "approved" | "rejected";
  reasons?: string[];
  actor: Actor;
}

/**
 * Cancel request
 */
export interface CancelRequest {
  submissionId: SubmissionId;
  reason?: string;
  actor: Actor;
}

/**
 * Successful submission response
 * Returned when a submission operation completes successfully
 */
export interface SubmissionSuccess {
  /** Submission state */
  state: SubmissionState;
  /** Unique submission identifier */
  submissionId: SubmissionId;
  /** Success message */
  message: string;
  /** Optional data returned from the destination */
  data?: Record<string, unknown>;
  /** Actor who submitted */
  actor?: Actor;
  /** Timestamp of submission */
  timestamp?: string;
  /** Resume token for continuing the submission */
  resumeToken?: string;
}

/**
 * Submission response - either success, structured error, or validation error
 */
export type SubmissionResponse = SubmissionSuccess | IntakeError | ValidationErrorResponse;

/**
 * Factory function for creating IntakeError objects with proper typing.
 * Eliminates the need for `as IntakeError` assertions.
 */
export function createIntakeError(params: {
  submissionId?: SubmissionId;
  state?: SubmissionState;
  resumeToken?: string;
  errorType: IntakeErrorType;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  fields?: FieldError[];
  nextActions?: NextAction[];
}): IntakeError {
  return {
    ok: false,
    submissionId: params.submissionId,
    state: params.state,
    resumeToken: params.resumeToken,
    error: {
      type: params.errorType,
      message: params.message,
      retryable: params.retryable,
      retryAfterMs: params.retryAfterMs,
      fields: params.fields,
      nextActions: params.nextActions,
    },
  };
}

/**
 * Type guard to check if a response is an IntakeError
 * Supports both the structured error envelope shape (ok: false)
 * and the flat error shape (type, fields, nextActions)
 */
export function isIntakeError(response: unknown): response is IntakeError {
  if (response && typeof response === "object") {
    // Structured shape: { ok: false, error: { ... } }
    // SAFE: 'in' check above proves 'ok' exists; cast needed for property access
    if ("ok" in response && (response as Record<string, unknown>).ok === false) return true;
    // Flat shape: { type, fields, nextActions }
    if ("type" in response && "fields" in response && "nextActions" in response) return true;
  }
  return false;
}

/**
 * Type guard to check if a response is a SubmissionSuccess
 */
export function isSubmissionSuccess(response: unknown): response is SubmissionSuccess {
  if (response && typeof response === "object") {
    // SAFE: 'in' check above proves 'ok' exists; cast needed for property access
    return "state" in response && "submissionId" in response && !("ok" in response && (response as Record<string, unknown>).ok === false);
  }
  return false;
}
