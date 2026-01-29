/**
 * FormBridge Intake Contract Types
 * Based on INTAKE_CONTRACT_SPEC.md v0.1.0-draft
 */

// =============================================================================
// § 2. Submission Lifecycle - States
// =============================================================================

/**
 * All possible states a submission can be in.
 * See §2.1 for state descriptions and §2.2 for transition diagram.
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

// =============================================================================
// § 3. Error Schema
// =============================================================================

/**
 * Error type taxonomy for validation and submission errors.
 * See §3.1 for detailed descriptions.
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
 * Field-level error codes for validation failures.
 * See §3 for usage in FieldError.
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
 * Next action types that guide the caller on what to do.
 * See §3 NextAction interface.
 */
export type NextActionType =
  | 'collect_field'
  | 'request_upload'
  | 'wait_for_review'
  | 'retry_delivery'
  | 'cancel';

/**
 * Per-field validation error details.
 * Provides structured, actionable information for agents and humans.
 */
export interface FieldError {
  /** Dot-notation field path, e.g. "docs.w9" or "contact.email" */
  path: string;
  /** Specific error code indicating the type of validation failure */
  code: FieldErrorCode;
  /** Human-readable error message */
  message: string;
  /** What was expected (type, format, enum values, etc.) */
  expected?: unknown;
  /** What was actually received */
  received?: unknown;
}

/**
 * Suggested next action for the caller to take.
 * Includes LLM-friendly hints and upload-specific constraints.
 */
export interface NextAction {
  /** The action the caller should take */
  action: NextActionType;
  /** Which field this action relates to (if applicable) */
  field?: string;
  /** LLM-friendly guidance on how to proceed */
  hint?: string;
  /** For upload actions: allowed MIME types */
  accept?: string[];
  /** For upload actions: maximum file size in bytes */
  maxBytes?: number;
}

/**
 * Standard error envelope for all intake operations.
 * Agent-native design: structured, actionable, retryable.
 * See §3 for full specification.
 */
export interface IntakeError {
  ok: false;
  submissionId: string;
  state: SubmissionState;
  resumeToken: string;
  error: {
    /** Error type from the taxonomy */
    type: IntakeErrorType;
    /** Human-readable summary of the error */
    message?: string;
    /** Per-field validation details */
    fields?: FieldError[];
    /** Suggested next actions for the caller */
    nextActions?: NextAction[];
    /** Can the caller retry this exact call? */
    retryable: boolean;
    /** Suggested retry delay in milliseconds */
    retryAfterMs?: number;
  };
}

// =============================================================================
// § 5. Actors
// =============================================================================

/**
 * Actor kind taxonomy.
 * Distinguishes between agents, humans, and system-initiated actions.
 */
export type ActorKind = 'agent' | 'human' | 'system';

/**
 * Actor identity for audit trail.
 * Every operation requires an actor - recorded on every event.
 */
export interface Actor {
  /** Type of actor performing the operation */
  kind: ActorKind;
  /** Unique identifier for this actor */
  id: string;
  /** Display name (optional) */
  name?: string;
  /** Additional metadata (optional) */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// § 6. Event Stream
// =============================================================================

/**
 * All possible event types in the intake lifecycle.
 * See §6.1 for detailed descriptions.
 */
export type IntakeEventType =
  | 'submission.created'
  | 'field.updated'
  | 'validation.passed'
  | 'validation.failed'
  | 'upload.requested'
  | 'upload.completed'
  | 'upload.failed'
  | 'submission.submitted'
  | 'review.requested'
  | 'review.approved'
  | 'review.rejected'
  | 'delivery.attempted'
  | 'delivery.succeeded'
  | 'delivery.failed'
  | 'submission.finalized'
  | 'submission.cancelled'
  | 'submission.expired'
  | 'handoff.link_issued'
  | 'handoff.resumed';

/**
 * Typed event for audit trail.
 * Every state transition and significant action emits an event.
 * Events are append-only and immutable.
 */
export interface IntakeEvent {
  /** Globally unique event identifier */
  eventId: string;
  /** Event type from the taxonomy */
  type: IntakeEventType;
  /** Which submission this event belongs to */
  submissionId: string;
  /** ISO 8601 timestamp */
  ts: string;
  /** Who performed this action */
  actor: Actor;
  /** Submission state after this event */
  state: SubmissionState;
  /** Event-specific payload (optional) */
  payload?: Record<string, unknown>;
}

// =============================================================================
// § 4. Operations - Input/Output Types
// =============================================================================

// --- createSubmission (§4.1) ---

export interface CreateSubmissionInput {
  /** Which intake definition to use */
  intakeId: string;
  /** Prevents duplicate creation (optional) */
  idempotencyKey?: string;
  /** Who is creating this submission */
  actor: Actor;
  /** Pre-fill known fields (optional) */
  initialFields?: Record<string, unknown>;
  /** Override default TTL in milliseconds (optional) */
  ttlMs?: number;
}

export interface CreateSubmissionOutput {
  ok: true;
  /** Newly created submission ID */
  submissionId: string;
  /** Initial state: "draft" or "in_progress" */
  state: 'draft' | 'in_progress';
  /** Resume token for subsequent operations */
  resumeToken: string;
  /** The full intake schema (JSON Schema) */
  schema: JSONSchema;
  /** Fields still needed (if initialFields was partial) */
  missingFields?: string[];
}

// --- setFields (§4.2) ---

export interface SetFieldsInput {
  submissionId: string;
  resumeToken: string;
  actor: Actor;
  /** Fields to set or update */
  fields: Record<string, unknown>;
}

export interface SetFieldsOutput {
  ok: true;
  submissionId: string;
  state: SubmissionState;
  resumeToken: string;
  /** Updated field values */
  fields: Record<string, unknown>;
  /** Validation issues (if any) */
  errors?: FieldError[];
  /** Suggested next actions */
  nextActions?: NextAction[];
}

// --- validate (§4.3) ---

export interface ValidateInput {
  submissionId: string;
  resumeToken: string;
}

export interface ValidateOutput {
  ok: true;
  submissionId: string;
  state: SubmissionState;
  resumeToken: string;
  /** Is the submission ready to submit? */
  ready: boolean;
  /** Validation errors (if not ready) */
  errors?: FieldError[];
  /** Suggested next actions */
  nextActions?: NextAction[];
}

// --- requestUpload (§4.4) ---

export interface RequestUploadInput {
  submissionId: string;
  resumeToken: string;
  /** Dot-path to the file field */
  field: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  actor: Actor;
}

export interface RequestUploadOutput {
  ok: true;
  /** Unique upload identifier */
  uploadId: string;
  /** HTTP method for upload */
  method: 'PUT' | 'POST';
  /** Signed upload URL */
  url: string;
  /** Additional headers to send (optional) */
  headers?: Record<string, string>;
  /** URL expiration time in milliseconds */
  expiresInMs: number;
  /** Upload constraints */
  constraints: {
    /** Allowed MIME types */
    accept: string[];
    /** Maximum file size in bytes */
    maxBytes: number;
  };
}

// --- confirmUpload (§4.5) ---

export interface ConfirmUploadInput {
  submissionId: string;
  resumeToken: string;
  uploadId: string;
  actor: Actor;
}

export interface ConfirmUploadOutput {
  ok: true;
  submissionId: string;
  state: SubmissionState;
  resumeToken: string;
  /** The field that was uploaded */
  field: string;
}

// --- submit (§4.6) ---

export interface SubmitInput {
  submissionId: string;
  resumeToken: string;
  /** Required - prevents duplicate submissions */
  idempotencyKey: string;
  actor: Actor;
}

export interface SubmitOutput {
  ok: true;
  submissionId: string;
  /** New state: "submitted", "needs_review", or "finalized" */
  state: 'submitted' | 'needs_review' | 'finalized';
  resumeToken: string;
}

// --- review (§4.7) ---

export interface ReviewInput {
  submissionId: string;
  /** "approved" or "rejected" */
  decision: 'approved' | 'rejected';
  /** Required if rejected */
  reasons?: string[];
  /** Must be authorized reviewer */
  actor: Actor;
}

export interface ReviewOutput {
  ok: true;
  submissionId: string;
  state: 'approved' | 'rejected';
  resumeToken: string;
  /** Rejection reasons (if rejected) */
  reasons?: string[];
}

// --- cancel (§4.8) ---

export interface CancelInput {
  submissionId: string;
  reason?: string;
  actor: Actor;
}

export interface CancelOutput {
  ok: true;
  submissionId: string;
  state: 'cancelled';
  reason?: string;
}

// --- getSubmission (§4.9) ---

export interface GetSubmissionInput {
  submissionId: string;
}

export interface GetSubmissionOutput {
  ok: true;
  submissionId: string;
  state: SubmissionState;
  resumeToken: string;
  intakeId: string;
  /** Current field values */
  fields: Record<string, unknown>;
  /** Submission metadata */
  metadata: {
    createdAt: string;
    updatedAt: string;
    createdBy: Actor;
    expiresAt?: string;
  };
  /** Current validation errors (if any) */
  errors?: FieldError[];
}

// --- getEvents (§4.10) ---

export interface GetEventsInput {
  submissionId: string;
  afterEventId?: string;
  limit?: number;
}

export interface GetEventsOutput {
  ok: true;
  submissionId: string;
  events: IntakeEvent[];
  /** Cursor for pagination */
  nextCursor?: string;
}

// =============================================================================
// § 11. Intake Definition
// =============================================================================

/**
 * Destination configuration for finalized submissions.
 * Defines where submission data is delivered.
 */
export interface Destination {
  /** Delivery mechanism */
  kind: 'webhook' | 'callback' | 'queue';
  /** Destination URL (for webhook) */
  url?: string;
  /** Headers to include in delivery (optional) */
  headers?: Record<string, string>;
  /** Retry policy for failed deliveries (optional) */
  retryPolicy?: RetryPolicy;
}

/**
 * Retry policy for delivery failures.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Delay multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
}

/**
 * Reviewer specification for approval gates.
 */
export interface ReviewerSpec {
  /** Reviewer kind: specific users, role-based, or dynamic */
  kind: 'user_ids' | 'role' | 'dynamic';
  /** List of user IDs (if kind is 'user_ids') */
  userIds?: string[];
  /** Role name (if kind is 'role') */
  role?: string;
  /** Dynamic selection logic (if kind is 'dynamic') */
  logic?: Record<string, unknown>;
}

/**
 * Approval gate configuration.
 * Defines human review checkpoints before finalization.
 */
export interface ApprovalGate {
  /** Gate name/identifier */
  name: string;
  /** Who can approve this gate */
  reviewers: ReviewerSpec;
  /** Number of approvals required (default: 1) */
  requiredApprovals?: number;
  /** Auto-approval rules using JSONLogic (optional) */
  autoApproveIf?: Record<string, unknown>;
  /** Escalation timeout in milliseconds (optional) */
  escalateAfterMs?: number;
}

/**
 * UI hint for a specific field.
 * Guides form rendering and data collection UX.
 */
export interface FieldHint {
  /** Display label */
  label?: string;
  /** Help text or description */
  description?: string;
  /** Placeholder text */
  placeholder?: string;
  /** UI widget type */
  widget?: string;
  /** Additional widget-specific options */
  options?: Record<string, unknown>;
}

/**
 * Step definition for multi-step forms.
 */
export interface StepDefinition {
  /** Step identifier */
  id: string;
  /** Display title */
  title: string;
  /** Step description */
  description?: string;
  /** Fields included in this step */
  fields: string[];
  /** Step order (optional) */
  order?: number;
}

/**
 * Complete intake definition.
 * Binds schema, behavior, destination, and UI hints.
 * See §11 for full specification.
 */
export interface IntakeDefinition {
  /** Unique intake identifier */
  id: string;
  /** Semantic version */
  version: string;
  /** Display name */
  name: string;
  /** Human-readable description (optional) */
  description?: string;

  // The schema
  /** JSON Schema defining required fields and validation */
  schema: JSONSchema;

  // Behavior
  /** Approval gates (optional) */
  approvalGates?: ApprovalGate[];
  /** Default submission TTL in milliseconds (optional) */
  ttlMs?: number;
  /** Delivery destination for finalized submissions */
  destination: Destination;

  // UI hints (optional)
  uiHints?: {
    /** Multi-step wizard layout (optional) */
    steps?: StepDefinition[];
    /** Field-specific hints (optional) */
    fieldHints?: Record<string, FieldHint>;
  };
}

// =============================================================================
// JSON Schema Types
// =============================================================================

/**
 * Simplified JSON Schema type.
 * Supports the subset needed for intake definitions.
 */
export interface JSONSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  const?: unknown;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  additionalProperties?: boolean | JSONSchema;
  $ref?: string;
  $defs?: Record<string, JSONSchema>;
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;
}

// =============================================================================
// Internal Submission Data Structure
// =============================================================================

/**
 * Internal submission representation.
 * Used by SubmissionManager for state tracking.
 */
export interface Submission {
  id: string;
  intakeId: string;
  state: SubmissionState;
  resumeToken: string;
  fields: Record<string, unknown>;
  metadata: {
    createdAt: string;
    updatedAt: string;
    createdBy: Actor;
    expiresAt?: string;
    idempotencyKeys: string[];
  };
  uploads?: Record<string, UploadStatus>;
}

/**
 * Upload status tracking.
 */
export interface UploadStatus {
  uploadId: string;
  field: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: 'pending' | 'completed' | 'failed';
  url?: string;
  uploadedAt?: string;
}
