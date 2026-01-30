/**
 * FormBridge Intake Contract - TypeScript Type Definitions
 * Based on INTAKE_CONTRACT_SPEC.md v0.1.0-draft
 */

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
 * Field-level error details
 */
export interface FieldError {
  path: string;
  code:
    | "required"
    | "invalid_type"
    | "invalid_format"
    | "invalid_value"
    | "too_long"
    | "too_short"
    | "file_required"
    | "file_too_large"
    | "file_wrong_type"
    | "custom";
  message: string;
  expected?: unknown;
  received?: unknown;
}

/**
 * Next action guidance for agent loops
 */
export interface NextAction {
  action:
    | "collect_field"
    | "request_upload"
    | "wait_for_review"
    | "retry_delivery"
    | "cancel";
  field?: string;
  hint?: string;
  accept?: string[];
  maxBytes?: number;
}

/**
 * Structured error response envelope
 */
export interface IntakeError {
  ok: false;
  submissionId: string;
  state: SubmissionState;
  resumeToken: string;
  error: {
    type:
      | "missing"
      | "invalid"
      | "conflict"
      | "needs_approval"
      | "upload_pending"
      | "delivery_failed"
      | "expired"
      | "cancelled";
    message?: string;
    fields?: FieldError[];
    nextActions?: NextAction[];
    retryable: boolean;
    retryAfterMs?: number;
  };
}

/**
 * Event types for the intake event stream
 */
export type IntakeEventType =
  | "submission.created"
  | "field.updated"
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
  | "handoff.resumed";

/**
 * Typed event for audit trail
 */
export interface IntakeEvent {
  eventId: string;
  type: IntakeEventType;
  submissionId: string;
  ts: string;
  actor: Actor;
  state: SubmissionState;
  payload?: Record<string, unknown>;
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
  id: string;
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
  intakeId: string;
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
  submissionId: string;
  state: "draft" | "in_progress" | "submitted";
  resumeToken: string;
  schema: unknown;
  missingFields?: string[];
}

/**
 * Set fields request
 */
export interface SetFieldsRequest {
  submissionId: string;
  resumeToken: string;
  actor: Actor;
  fields: Record<string, unknown>;
}

/**
 * Submit request
 */
export interface SubmitRequest {
  submissionId: string;
  resumeToken: string;
  idempotencyKey: string;
  actor: Actor;
}

/**
 * Review request
 */
export interface ReviewRequest {
  submissionId: string;
  decision: "approved" | "rejected";
  reasons?: string[];
  actor: Actor;
}

/**
 * Cancel request
 */
export interface CancelRequest {
  submissionId: string;
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
 * Supports both the structured error envelope shape (ok: false)
 * and the flat error shape (type, fields, nextActions)
 */
export function isIntakeError(response: unknown): response is IntakeError {
  if (response && typeof response === "object") {
    // Structured shape: { ok: false, error: { ... } }
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
    return "state" in response && "submissionId" in response && !("ok" in response && (response as Record<string, unknown>).ok === false);
  }
  return false;
}
