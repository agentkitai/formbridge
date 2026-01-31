export interface Actor {
    kind: "agent" | "human" | "system";
    id: string;
    name?: string;
    metadata?: Record<string, unknown>;
}
export type SubmissionState = "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired" | "created" | "validating" | "invalid" | "valid" | "uploading" | "submitting" | "completed" | "failed" | "pending_approval";
export declare const SubmissionState: {
    readonly DRAFT: "draft";
    readonly IN_PROGRESS: "in_progress";
    readonly AWAITING_INPUT: "awaiting_input";
    readonly AWAITING_UPLOAD: "awaiting_upload";
    readonly SUBMITTED: "submitted";
    readonly NEEDS_REVIEW: "needs_review";
    readonly APPROVED: "approved";
    readonly REJECTED: "rejected";
    readonly FINALIZED: "finalized";
    readonly CANCELLED: "cancelled";
    readonly EXPIRED: "expired";
    readonly CREATED: "created";
    readonly VALIDATING: "validating";
    readonly INVALID: "invalid";
    readonly VALID: "valid";
    readonly UPLOADING: "uploading";
    readonly SUBMITTING: "submitting";
    readonly COMPLETED: "completed";
    readonly FAILED: "failed";
    readonly PENDING_APPROVAL: "pending_approval";
};
export type IntakeErrorType = "missing" | "invalid" | "conflict" | "needs_approval" | "upload_pending" | "delivery_failed" | "expired" | "cancelled";
export interface FieldError {
    field: string;
    message: string;
    type: IntakeErrorType;
    constraint?: string;
    value?: unknown;
    path?: string;
    code?: string;
    expected?: unknown;
    received?: unknown;
}
export type NextActionType = "provide_missing_fields" | "correct_invalid_fields" | "fix_email_format" | "meet_minimum_requirements" | "fix_validation_errors" | "wait_for_review" | "collect_field" | "request_upload" | "retry_delivery" | "cancel" | "create" | "validate";
export interface NextAction {
    type?: NextActionType;
    action?: string;
    description?: string;
    field?: string;
    fields?: string[];
    hint?: string;
    accept?: string[];
    maxBytes?: number;
    params?: Record<string, unknown>;
}
export interface ValidationErrorResponse {
    type: IntakeErrorType;
    message?: string;
    fields?: FieldError[];
    nextActions?: NextAction[];
    resumeToken?: string;
    idempotencyKey?: string;
    timestamp?: string;
}
export interface IntakeError {
    ok?: false;
    submissionId?: string;
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
    type?: IntakeErrorType | string;
    message?: string;
    fields?: FieldError[];
    nextActions?: NextAction[];
    timestamp?: string;
}
export type IntakeEventType = "submission.created" | "field.updated" | "fields.updated" | "validation.passed" | "validation.failed" | "upload.requested" | "upload.completed" | "upload.failed" | "submission.submitted" | "review.requested" | "review.approved" | "review.rejected" | "delivery.attempted" | "delivery.succeeded" | "delivery.failed" | "submission.finalized" | "submission.cancelled" | "submission.expired" | "handoff.link_issued" | "handoff.resumed" | "step.started" | "step.completed" | "step.validation_failed";
export interface FieldDiff {
    fieldPath: string;
    previousValue: unknown;
    newValue: unknown;
}
export interface IntakeEvent {
    eventId: string;
    type: IntakeEventType;
    submissionId: string;
    ts: string;
    actor: Actor;
    state: SubmissionState;
    version?: number;
    payload?: Record<string, unknown>;
}
export interface DeliveryRecord {
    deliveryId: string;
    submissionId: string;
    destinationUrl: string;
    status: 'pending' | 'succeeded' | 'failed';
    attempts: number;
    lastAttemptAt?: string;
    nextRetryAt?: string;
    statusCode?: number;
    error?: string;
    createdAt: string;
}
export interface RetryPolicy {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
}
export interface ApprovalGate {
    name: string;
    reviewers: unknown;
    requiredApprovals?: number;
    autoApproveIf?: unknown;
    escalateAfterMs?: number;
}
export interface Destination {
    kind: "webhook" | "callback" | "queue";
    url?: string;
    headers?: Record<string, string>;
    retryPolicy?: unknown;
}
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
export interface CreateSubmissionRequest {
    intakeId: string;
    idempotencyKey?: string;
    actor: Actor;
    initialFields?: Record<string, unknown>;
    ttlMs?: number;
}
export interface CreateSubmissionResponse {
    ok: true;
    submissionId: string;
    state: "draft" | "in_progress" | "submitted";
    resumeToken: string;
    schema: unknown;
    missingFields?: string[];
}
export interface SetFieldsRequest {
    submissionId: string;
    resumeToken: string;
    actor: Actor;
    fields: Record<string, unknown>;
}
export interface SubmitRequest {
    submissionId: string;
    resumeToken: string;
    idempotencyKey: string;
    actor: Actor;
}
export interface ReviewRequest {
    submissionId: string;
    decision: "approved" | "rejected";
    reasons?: string[];
    actor: Actor;
}
export interface CancelRequest {
    submissionId: string;
    reason?: string;
    actor: Actor;
}
export interface SubmissionSuccess {
    state: SubmissionState;
    submissionId: string;
    message: string;
    data?: Record<string, unknown>;
    actor?: Actor;
    timestamp?: string;
    resumeToken?: string;
}
export type SubmissionResponse = SubmissionSuccess | IntakeError | ValidationErrorResponse;
export declare function isIntakeError(response: unknown): response is IntakeError;
export declare function isSubmissionSuccess(response: unknown): response is SubmissionSuccess;
//# sourceMappingURL=intake-contract.d.ts.map