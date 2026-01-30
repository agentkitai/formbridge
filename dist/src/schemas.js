import { z } from 'zod';
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
export const NextActionTypeSchema = z.enum([
    'collect_field',
    'request_upload',
    'wait_for_review',
    'retry_delivery',
    'cancel',
]);
export const FieldErrorSchema = z.object({
    path: z.string(),
    code: FieldErrorCodeSchema,
    message: z.string(),
    expected: z.unknown().optional(),
    received: z.unknown().optional(),
});
export const NextActionSchema = z.object({
    action: NextActionTypeSchema,
    field: z.string().optional(),
    hint: z.string().optional(),
    accept: z.array(z.string()).optional(),
    maxBytes: z.number().int().positive().optional(),
});
export const IntakeErrorSchema = z.object({
    ok: z.literal(false),
    submissionId: z.string(),
    state: SubmissionStateSchema,
    resumeToken: z.string(),
    error: z.object({
        type: IntakeErrorTypeSchema,
        message: z.string().optional(),
        fields: z.array(FieldErrorSchema).optional(),
        nextActions: z.array(NextActionSchema).optional(),
        retryable: z.boolean(),
        retryAfterMs: z.number().int().positive().optional(),
    }),
});
export const ActorKindSchema = z.enum(['agent', 'human', 'system']);
export const ActorSchema = z.object({
    kind: ActorKindSchema,
    id: z.string(),
    name: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
});
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
export const IntakeEventSchema = z.object({
    eventId: z.string(),
    type: IntakeEventTypeSchema,
    submissionId: z.string(),
    ts: z.string().datetime(),
    actor: ActorSchema,
    state: SubmissionStateSchema,
    payload: z.record(z.unknown()).optional(),
});
export const RetryPolicySchema = z.object({
    maxAttempts: z.number().int().positive(),
    initialDelayMs: z.number().int().positive(),
    backoffMultiplier: z.number().positive(),
    maxDelayMs: z.number().int().positive(),
});
export const DestinationSchema = z.object({
    kind: z.enum(['webhook', 'callback', 'queue']),
    url: z.string().url().optional(),
    headers: z.record(z.string()).optional(),
    retryPolicy: RetryPolicySchema.optional(),
});
export const ReviewerSpecSchema = z.object({
    kind: z.enum(['user_ids', 'role', 'dynamic']),
    userIds: z.array(z.string()).optional(),
    role: z.string().optional(),
    logic: z.record(z.unknown()).optional(),
});
export const ApprovalGateSchema = z.object({
    name: z.string(),
    reviewers: ReviewerSpecSchema,
    requiredApprovals: z.number().int().positive().optional(),
    autoApproveIf: z.record(z.unknown()).optional(),
    escalateAfterMs: z.number().int().positive().optional(),
});
export const FieldHintSchema = z.object({
    label: z.string().optional(),
    description: z.string().optional(),
    placeholder: z.string().optional(),
    widget: z.string().optional(),
    options: z.record(z.unknown()).optional(),
});
export const StepDefinitionSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    fields: z.array(z.string()),
    order: z.number().int().optional(),
});
export const JSONSchemaSchema = z.lazy(() => z.object({
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
}));
export const IntakeDefinitionSchema = z.object({
    id: z.string(),
    version: z.string(),
    name: z.string(),
    description: z.string().optional(),
    schema: JSONSchemaSchema,
    approvalGates: z.array(ApprovalGateSchema).optional(),
    ttlMs: z.number().int().positive().optional(),
    destination: DestinationSchema,
    uiHints: z
        .object({
        steps: z.array(StepDefinitionSchema).optional(),
        fieldHints: z.record(FieldHintSchema).optional(),
    })
        .optional(),
});
export const CreateSubmissionInputSchema = z.object({
    intakeId: z.string(),
    idempotencyKey: z.string().optional(),
    actor: ActorSchema,
    initialFields: z.record(z.unknown()).optional(),
    ttlMs: z.number().int().positive().optional(),
});
export const CreateSubmissionOutputSchema = z.object({
    ok: z.literal(true),
    submissionId: z.string(),
    state: z.enum(['draft', 'in_progress']),
    resumeToken: z.string(),
    schema: JSONSchemaSchema,
    missingFields: z.array(z.string()).optional(),
});
export const SetFieldsInputSchema = z.object({
    submissionId: z.string(),
    resumeToken: z.string(),
    actor: ActorSchema,
    fields: z.record(z.unknown()),
});
export const SetFieldsOutputSchema = z.object({
    ok: z.literal(true),
    submissionId: z.string(),
    state: SubmissionStateSchema,
    resumeToken: z.string(),
    fields: z.record(z.unknown()),
    errors: z.array(FieldErrorSchema).optional(),
    nextActions: z.array(NextActionSchema).optional(),
});
export const ValidateInputSchema = z.object({
    submissionId: z.string(),
    resumeToken: z.string(),
});
export const ValidateOutputSchema = z.object({
    ok: z.literal(true),
    submissionId: z.string(),
    state: SubmissionStateSchema,
    resumeToken: z.string(),
    ready: z.boolean(),
    errors: z.array(FieldErrorSchema).optional(),
    nextActions: z.array(NextActionSchema).optional(),
});
export const RequestUploadInputSchema = z.object({
    submissionId: z.string(),
    resumeToken: z.string(),
    field: z.string(),
    filename: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().positive(),
    actor: ActorSchema,
});
export const RequestUploadOutputSchema = z.object({
    ok: z.literal(true),
    uploadId: z.string(),
    method: z.enum(['PUT', 'POST']),
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
    expiresInMs: z.number().int().positive(),
    constraints: z.object({
        accept: z.array(z.string()),
        maxBytes: z.number().int().positive(),
    }),
});
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
    field: z.string(),
});
export const SubmitInputSchema = z.object({
    submissionId: z.string(),
    resumeToken: z.string(),
    idempotencyKey: z.string(),
    actor: ActorSchema,
});
export const SubmitOutputSchema = z.object({
    ok: z.literal(true),
    submissionId: z.string(),
    state: z.enum(['submitted', 'needs_review', 'finalized']),
    resumeToken: z.string(),
});
export const ReviewInputSchema = z.object({
    submissionId: z.string(),
    decision: z.enum(['approved', 'rejected']),
    reasons: z.array(z.string()).optional(),
    actor: ActorSchema,
});
export const ReviewOutputSchema = z.object({
    ok: z.literal(true),
    submissionId: z.string(),
    state: z.enum(['approved', 'rejected']),
    resumeToken: z.string(),
    reasons: z.array(z.string()).optional(),
});
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
export const GetSubmissionInputSchema = z.object({
    submissionId: z.string(),
});
export const GetSubmissionOutputSchema = z.object({
    ok: z.literal(true),
    submissionId: z.string(),
    state: SubmissionStateSchema,
    resumeToken: z.string(),
    intakeId: z.string(),
    fields: z.record(z.unknown()),
    metadata: z.object({
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
        createdBy: ActorSchema,
        expiresAt: z.string().datetime().optional(),
    }),
    errors: z.array(FieldErrorSchema).optional(),
});
export const GetEventsInputSchema = z.object({
    submissionId: z.string(),
    afterEventId: z.string().optional(),
    limit: z.number().int().positive().optional(),
});
export const GetEventsOutputSchema = z.object({
    ok: z.literal(true),
    submissionId: z.string(),
    events: z.array(IntakeEventSchema),
    nextCursor: z.string().optional(),
});
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
//# sourceMappingURL=schemas.js.map