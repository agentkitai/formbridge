/**
 * FormBridge Intake Contract Zod Schemas
 * Runtime validation schemas corresponding to types.ts
 * Based on INTAKE_CONTRACT_SPEC.md v0.1.0-draft
 */

import { z } from 'zod';

// =============================================================================
// § 2. Submission Lifecycle - States
// =============================================================================

/**
 * All possible states a submission can be in.
 * See §2.1 for state descriptions and §2.2 for transition diagram.
 */
export const SubmissionStateSchema = z.enum([
  'draft',
  'in_progress',
  'awaiting_input',
  'awaiting_upload',
  'submitted',
  'needs_review',
  'approved',
  'rejected',
  'finalized',
  'cancelled',
  'expired',
]);

// =============================================================================
// § 3. Error Schema
// =============================================================================

/**
 * Error type taxonomy for validation and submission errors.
 * See §3.1 for detailed descriptions.
 */
export const IntakeErrorTypeSchema = z.enum([
  'missing',
  'invalid',
  'conflict',
  'needs_approval',
  'upload_pending',
  'delivery_failed',
  'expired',
  'cancelled',
]);

/**
 * Field-level error codes for validation failures.
 * See §3 for usage in FieldError.
 */
export const FieldErrorCodeSchema = z.enum([
  'required',
  'invalid_type',
  'invalid_format',
  'invalid_value',
  'too_long',
  'too_short',
  'file_required',
  'file_too_large',
  'file_wrong_type',
  'custom',
]);

/**
 * Next action types that guide the caller on what to do.
 * See §3 NextAction interface.
 */
export const NextActionTypeSchema = z.enum([
  'collect_field',
  'request_upload',
  'wait_for_review',
  'retry_delivery',
  'cancel',
]);

/**
 * Per-field validation error details.
 * Provides structured, actionable information for agents and humans.
 */
export const FieldErrorSchema = z.object({
  /** Dot-notation field path, e.g. "docs.w9" or "contact.email" */
  path: z.string(),
  /** Specific error code indicating the type of validation failure */
  code: FieldErrorCodeSchema,
  /** Human-readable error message */
  message: z.string(),
  /** What was expected (type, format, enum values, etc.) */
  expected: z.unknown().optional(),
  /** What was actually received */
  received: z.unknown().optional(),
});

/**
 * Suggested next action for the caller to take.
 * Includes LLM-friendly hints and upload-specific constraints.
 */
export const NextActionSchema = z.object({
  /** The action the caller should take */
  action: NextActionTypeSchema,
  /** Which field this action relates to (if applicable) */
  field: z.string().optional(),
  /** LLM-friendly guidance on how to proceed */
  hint: z.string().optional(),
  /** For upload actions: allowed MIME types */
  accept: z.array(z.string()).optional(),
  /** For upload actions: maximum file size in bytes */
  maxBytes: z.number().int().positive().optional(),
});

/**
 * Standard error envelope for all intake operations.
 * Agent-native design: structured, actionable, retryable.
 * See §3 for full specification.
 */
export const IntakeErrorSchema = z.object({
  ok: z.literal(false),
  submissionId: z.string(),
  state: SubmissionStateSchema,
  resumeToken: z.string(),
  error: z.object({
    /** Error type from the taxonomy */
    type: IntakeErrorTypeSchema,
    /** Human-readable summary of the error */
    message: z.string().optional(),
    /** Per-field validation details */
    fields: z.array(FieldErrorSchema).optional(),
    /** Suggested next actions for the caller */
    nextActions: z.array(NextActionSchema).optional(),
    /** Can the caller retry this exact call? */
    retryable: z.boolean(),
    /** Suggested retry delay in milliseconds */
    retryAfterMs: z.number().int().positive().optional(),
  }),
});

// =============================================================================
// § 5. Actors
// =============================================================================

/**
 * Actor kind taxonomy.
 * Distinguishes between agents, humans, and system-initiated actions.
 */
export const ActorKindSchema = z.enum(['agent', 'human', 'system']);

/**
 * Actor identity for audit trail.
 * Every operation requires an actor - recorded on every event.
 */
export const ActorSchema = z.object({
  /** Type of actor performing the operation */
  kind: ActorKindSchema,
  /** Unique identifier for this actor */
  id: z.string(),
  /** Display name (optional) */
  name: z.string().optional(),
  /** Additional metadata (optional) */
  metadata: z.record(z.unknown()).optional(),
});

// =============================================================================
// § 6. Event Stream
// =============================================================================

/**
 * All possible event types in the intake lifecycle.
 * See §6.1 for detailed descriptions.
 */
export const IntakeEventTypeSchema = z.enum([
  'submission.created',
  'field.updated',
  'validation.passed',
  'validation.failed',
  'upload.requested',
  'upload.completed',
  'upload.failed',
  'submission.submitted',
  'review.requested',
  'review.approved',
  'review.rejected',
  'delivery.attempted',
  'delivery.succeeded',
  'delivery.failed',
  'submission.finalized',
  'submission.cancelled',
  'submission.expired',
  'handoff.link_issued',
  'handoff.resumed',
]);

/**
 * Typed event for audit trail.
 * Every state transition and significant action emits an event.
 * Events are append-only and immutable.
 */
export const IntakeEventSchema = z.object({
  /** Globally unique event identifier */
  eventId: z.string(),
  /** Event type from the taxonomy */
  type: IntakeEventTypeSchema,
  /** Which submission this event belongs to */
  submissionId: z.string(),
  /** ISO 8601 timestamp */
  ts: z.string().datetime(),
  /** Who performed this action */
  actor: ActorSchema,
  /** Submission state after this event */
  state: SubmissionStateSchema,
  /** Event-specific payload (optional) */
  payload: z.record(z.unknown()).optional(),
});

// =============================================================================
// § 11. Intake Definition - Supporting Schemas
// =============================================================================

/**
 * Retry policy for delivery failures.
 */
export const RetryPolicySchema = z.object({
  /** Maximum number of retry attempts */
  maxAttempts: z.number().int().positive(),
  /** Initial delay in milliseconds */
  initialDelayMs: z.number().int().positive(),
  /** Delay multiplier for exponential backoff */
  backoffMultiplier: z.number().positive(),
  /** Maximum delay in milliseconds */
  maxDelayMs: z.number().int().positive(),
});

/**
 * Destination configuration for finalized submissions.
 * Defines where submission data is delivered.
 */
export const DestinationSchema = z.object({
  /** Delivery mechanism */
  kind: z.enum(['webhook', 'callback', 'queue']),
  /** Destination URL (for webhook) */
  url: z.string().url().optional(),
  /** Headers to include in delivery (optional) */
  headers: z.record(z.string()).optional(),
  /** Retry policy for failed deliveries (optional) */
  retryPolicy: RetryPolicySchema.optional(),
});

/**
 * Reviewer specification for approval gates.
 */
export const ReviewerSpecSchema = z.object({
  /** Reviewer kind: specific users, role-based, or dynamic */
  kind: z.enum(['user_ids', 'role', 'dynamic']),
  /** List of user IDs (if kind is 'user_ids') */
  userIds: z.array(z.string()).optional(),
  /** Role name (if kind is 'role') */
  role: z.string().optional(),
  /** Dynamic selection logic (if kind is 'dynamic') */
  logic: z.record(z.unknown()).optional(),
});

/**
 * Approval gate configuration.
 * Defines human review checkpoints before finalization.
 */
export const ApprovalGateSchema = z.object({
  /** Gate name/identifier */
  name: z.string(),
  /** Who can approve this gate */
  reviewers: ReviewerSpecSchema,
  /** Number of approvals required (default: 1) */
  requiredApprovals: z.number().int().positive().optional(),
  /** Auto-approval rules using JSONLogic (optional) */
  autoApproveIf: z.record(z.unknown()).optional(),
  /** Escalation timeout in milliseconds (optional) */
  escalateAfterMs: z.number().int().positive().optional(),
});

/**
 * UI hint for a specific field.
 * Guides form rendering and data collection UX.
 */
export const FieldHintSchema = z.object({
  /** Display label */
  label: z.string().optional(),
  /** Help text or description */
  description: z.string().optional(),
  /** Placeholder text */
  placeholder: z.string().optional(),
  /** UI widget type */
  widget: z.string().optional(),
  /** Additional widget-specific options */
  options: z.record(z.unknown()).optional(),
});

/**
 * Step definition for multi-step forms.
 */
export const StepDefinitionSchema = z.object({
  /** Step identifier */
  id: z.string(),
  /** Display title */
  title: z.string(),
  /** Step description */
  description: z.string().optional(),
  /** Fields included in this step */
  fields: z.array(z.string()),
  /** Step order (optional) */
  order: z.number().int().optional(),
});

/**
 * Simplified JSON Schema type.
 * Supports the subset needed for intake definitions.
 * Using z.lazy for recursive schema references.
 */
export const JSONSchemaSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    $schema: z.string().optional(),
    $id: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    type: z
      .enum(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])
      .optional(),
    properties: z.record(JSONSchemaSchema).optional(),
    required: z.array(z.string()).optional(),
    items: JSONSchemaSchema.optional(),
    enum: z.array(z.unknown()).optional(),
    const: z.unknown().optional(),
    format: z.string().optional(),
    pattern: z.string().optional(),
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().nonnegative().optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    additionalProperties: z.union([z.boolean(), JSONSchemaSchema]).optional(),
    $ref: z.string().optional(),
    $defs: z.record(JSONSchemaSchema).optional(),
    allOf: z.array(JSONSchemaSchema).optional(),
    anyOf: z.array(JSONSchemaSchema).optional(),
    oneOf: z.array(JSONSchemaSchema).optional(),
    not: JSONSchemaSchema.optional(),
  })
);

/**
 * Complete intake definition.
 * Binds schema, behavior, destination, and UI hints.
 * See §11 for full specification.
 */
export const IntakeDefinitionSchema = z.object({
  /** Unique intake identifier */
  id: z.string(),
  /** Semantic version */
  version: z.string(),
  /** Display name */
  name: z.string(),
  /** Human-readable description (optional) */
  description: z.string().optional(),

  // The schema
  /** JSON Schema defining required fields and validation */
  schema: JSONSchemaSchema,

  // Behavior
  /** Approval gates (optional) */
  approvalGates: z.array(ApprovalGateSchema).optional(),
  /** Default submission TTL in milliseconds (optional) */
  ttlMs: z.number().int().positive().optional(),
  /** Delivery destination for finalized submissions */
  destination: DestinationSchema,

  // UI hints (optional)
  uiHints: z
    .object({
      /** Multi-step wizard layout (optional) */
      steps: z.array(StepDefinitionSchema).optional(),
      /** Field-specific hints (optional) */
      fieldHints: z.record(FieldHintSchema).optional(),
    })
    .optional(),
});

// =============================================================================
// § 4. Operations - Input/Output Schemas
// =============================================================================

// --- createSubmission (§4.1) ---

export const CreateSubmissionInputSchema = z.object({
  /** Which intake definition to use */
  intakeId: z.string(),
  /** Prevents duplicate creation (optional) */
  idempotencyKey: z.string().optional(),
  /** Who is creating this submission */
  actor: ActorSchema,
  /** Pre-fill known fields (optional) */
  initialFields: z.record(z.unknown()).optional(),
  /** Override default TTL in milliseconds (optional) */
  ttlMs: z.number().int().positive().optional(),
});

export const CreateSubmissionOutputSchema = z.object({
  ok: z.literal(true),
  /** Newly created submission ID */
  submissionId: z.string(),
  /** Initial state: "draft" or "in_progress" */
  state: z.enum(['draft', 'in_progress']),
  /** Resume token for subsequent operations */
  resumeToken: z.string(),
  /** The full intake schema (JSON Schema) */
  schema: JSONSchemaSchema,
  /** Fields still needed (if initialFields was partial) */
  missingFields: z.array(z.string()).optional(),
});

// --- setFields (§4.2) ---

export const SetFieldsInputSchema = z.object({
  submissionId: z.string(),
  resumeToken: z.string(),
  actor: ActorSchema,
  /** Fields to set or update */
  fields: z.record(z.unknown()),
});

export const SetFieldsOutputSchema = z.object({
  ok: z.literal(true),
  submissionId: z.string(),
  state: SubmissionStateSchema,
  resumeToken: z.string(),
  /** Updated field values */
  fields: z.record(z.unknown()),
  /** Validation issues (if any) */
  errors: z.array(FieldErrorSchema).optional(),
  /** Suggested next actions */
  nextActions: z.array(NextActionSchema).optional(),
});

// --- validate (§4.3) ---

export const ValidateInputSchema = z.object({
  submissionId: z.string(),
  resumeToken: z.string(),
});

export const ValidateOutputSchema = z.object({
  ok: z.literal(true),
  submissionId: z.string(),
  state: SubmissionStateSchema,
  resumeToken: z.string(),
  /** Is the submission ready to submit? */
  ready: z.boolean(),
  /** Validation errors (if not ready) */
  errors: z.array(FieldErrorSchema).optional(),
  /** Suggested next actions */
  nextActions: z.array(NextActionSchema).optional(),
});

// --- requestUpload (§4.4) ---

export const RequestUploadInputSchema = z.object({
  submissionId: z.string(),
  resumeToken: z.string(),
  /** Dot-path to the file field */
  field: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  actor: ActorSchema,
});

export const RequestUploadOutputSchema = z.object({
  ok: z.literal(true),
  /** Unique upload identifier */
  uploadId: z.string(),
  /** HTTP method for upload */
  method: z.enum(['PUT', 'POST']),
  /** Signed upload URL */
  url: z.string().url(),
  /** Additional headers to send (optional) */
  headers: z.record(z.string()).optional(),
  /** URL expiration time in milliseconds */
  expiresInMs: z.number().int().positive(),
  /** Upload constraints */
  constraints: z.object({
    /** Allowed MIME types */
    accept: z.array(z.string()),
    /** Maximum file size in bytes */
    maxBytes: z.number().int().positive(),
  }),
});

// --- confirmUpload (§4.5) ---

export const ConfirmUploadInputSchema = z.object({
  submissionId: z.string(),
  resumeToken: z.string(),
  uploadId: z.string(),
  actor: ActorSchema,
});

export const ConfirmUploadOutputSchema = z.object({
  ok: z.literal(true),
  submissionId: z.string(),
  state: SubmissionStateSchema,
  resumeToken: z.string(),
  /** The field that was uploaded */
  field: z.string(),
});

// --- submit (§4.6) ---

export const SubmitInputSchema = z.object({
  submissionId: z.string(),
  resumeToken: z.string(),
  /** Required - prevents duplicate submissions */
  idempotencyKey: z.string(),
  actor: ActorSchema,
});

export const SubmitOutputSchema = z.object({
  ok: z.literal(true),
  submissionId: z.string(),
  /** New state: "submitted", "needs_review", or "finalized" */
  state: z.enum(['submitted', 'needs_review', 'finalized']),
  resumeToken: z.string(),
});

// --- review (§4.7) ---

export const ReviewInputSchema = z.object({
  submissionId: z.string(),
  /** "approved" or "rejected" */
  decision: z.enum(['approved', 'rejected']),
  /** Required if rejected */
  reasons: z.array(z.string()).optional(),
  /** Must be authorized reviewer */
  actor: ActorSchema,
});

export const ReviewOutputSchema = z.object({
  ok: z.literal(true),
  submissionId: z.string(),
  state: z.enum(['approved', 'rejected']),
  resumeToken: z.string(),
  /** Rejection reasons (if rejected) */
  reasons: z.array(z.string()).optional(),
});

// --- cancel (§4.8) ---

export const CancelInputSchema = z.object({
  submissionId: z.string(),
  reason: z.string().optional(),
  actor: ActorSchema,
});

export const CancelOutputSchema = z.object({
  ok: z.literal(true),
  submissionId: z.string(),
  state: z.literal('cancelled'),
  reason: z.string().optional(),
});

// --- getSubmission (§4.9) ---

export const GetSubmissionInputSchema = z.object({
  submissionId: z.string(),
});

export const GetSubmissionOutputSchema = z.object({
  ok: z.literal(true),
  submissionId: z.string(),
  state: SubmissionStateSchema,
  resumeToken: z.string(),
  intakeId: z.string(),
  /** Current field values */
  fields: z.record(z.unknown()),
  /** Submission metadata */
  metadata: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: ActorSchema,
    expiresAt: z.string().datetime().optional(),
  }),
  /** Current validation errors (if any) */
  errors: z.array(FieldErrorSchema).optional(),
});

// --- getEvents (§4.10) ---

export const GetEventsInputSchema = z.object({
  submissionId: z.string(),
  afterEventId: z.string().optional(),
  limit: z.number().int().positive().optional(),
});

export const GetEventsOutputSchema = z.object({
  ok: z.literal(true),
  submissionId: z.string(),
  events: z.array(IntakeEventSchema),
  /** Cursor for pagination */
  nextCursor: z.string().optional(),
});

// =============================================================================
// Internal Submission Data Structure
// =============================================================================

/**
 * Upload status tracking.
 */
export const UploadStatusSchema = z.object({
  uploadId: z.string(),
  field: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  status: z.enum(['pending', 'completed', 'failed']),
  url: z.string().url().optional(),
  uploadedAt: z.string().datetime().optional(),
});

/**
 * Internal submission representation.
 * Used by SubmissionManager for state tracking.
 */
export const SubmissionSchema = z.object({
  id: z.string(),
  intakeId: z.string(),
  state: SubmissionStateSchema,
  resumeToken: z.string(),
  fields: z.record(z.unknown()),
  metadata: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    createdBy: ActorSchema,
    expiresAt: z.string().datetime().optional(),
    idempotencyKeys: z.array(z.string()),
  }),
  uploads: z.record(UploadStatusSchema).optional(),
});
