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
export interface FieldError {
    path: string;
    code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
    message: string;
    expected?: unknown;
    received?: unknown;
}
export interface NextAction {
    action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
    field?: string;
    hint?: string;
    accept?: string[];
    maxBytes?: number;
}
export interface IntakeError {
    ok: false;
    submissionId: string;
    state: SubmissionState;
    resumeToken: string;
    error: {
        type: "missing" | "invalid" | "conflict" | "needs_approval" | "upload_pending" | "delivery_failed" | "expired" | "cancelled";
        message?: string;
        fields?: FieldError[];
        nextActions?: NextAction[];
        retryable: boolean;
        retryAfterMs?: number;
    };
}
export type IntakeEventType = "submission.created" | "field.updated" | "validation.passed" | "validation.failed" | "upload.requested" | "upload.completed" | "upload.failed" | "submission.submitted" | "review.requested" | "review.approved" | "review.rejected" | "delivery.attempted" | "delivery.succeeded" | "delivery.failed" | "submission.finalized" | "submission.cancelled" | "submission.expired" | "handoff.link_issued" | "handoff.resumed";
export interface IntakeEvent {
    eventId: string;
    type: IntakeEventType;
    submissionId: string;
    ts: string;
    actor: Actor;
    state: SubmissionState;
    payload?: Record<string, unknown>;
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
}
export type SubmissionResponse = SubmissionSuccess | IntakeError;
export declare function isIntakeError(response: unknown): response is IntakeError;
export declare function isSubmissionSuccess(response: unknown): response is SubmissionSuccess;
//# sourceMappingURL=intake-contract.d.ts.map