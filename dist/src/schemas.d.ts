import { z } from 'zod';
export declare const SubmissionStateSchema: z.ZodEnum<["draft", "in_progress", "awaiting_input", "awaiting_upload", "submitted", "needs_review", "approved", "rejected", "finalized", "cancelled", "expired"]>;
export declare const IntakeErrorTypeSchema: z.ZodEnum<["missing", "invalid", "conflict", "needs_approval", "upload_pending", "delivery_failed", "expired", "cancelled"]>;
export declare const FieldErrorCodeSchema: z.ZodEnum<["required", "invalid_type", "invalid_format", "invalid_value", "too_long", "too_short", "file_required", "file_too_large", "file_wrong_type", "custom"]>;
export declare const NextActionTypeSchema: z.ZodEnum<["collect_field", "request_upload", "wait_for_review", "retry_delivery", "cancel"]>;
export declare const FieldErrorSchema: z.ZodObject<{
    path: z.ZodString;
    code: z.ZodEnum<["required", "invalid_type", "invalid_format", "invalid_value", "too_long", "too_short", "file_required", "file_too_large", "file_wrong_type", "custom"]>;
    message: z.ZodString;
    expected: z.ZodOptional<z.ZodUnknown>;
    received: z.ZodOptional<z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
    message: string;
    path: string;
    expected?: unknown;
    received?: unknown;
}, {
    code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
    message: string;
    path: string;
    expected?: unknown;
    received?: unknown;
}>;
export declare const NextActionSchema: z.ZodObject<{
    action: z.ZodEnum<["collect_field", "request_upload", "wait_for_review", "retry_delivery", "cancel"]>;
    field: z.ZodOptional<z.ZodString>;
    hint: z.ZodOptional<z.ZodString>;
    accept: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    maxBytes: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
    field?: string | undefined;
    hint?: string | undefined;
    accept?: string[] | undefined;
    maxBytes?: number | undefined;
}, {
    action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
    field?: string | undefined;
    hint?: string | undefined;
    accept?: string[] | undefined;
    maxBytes?: number | undefined;
}>;
export declare const IntakeErrorSchema: z.ZodObject<{
    ok: z.ZodLiteral<false>;
    submissionId: z.ZodString;
    state: z.ZodEnum<["draft", "in_progress", "awaiting_input", "awaiting_upload", "submitted", "needs_review", "approved", "rejected", "finalized", "cancelled", "expired"]>;
    resumeToken: z.ZodString;
    error: z.ZodObject<{
        type: z.ZodEnum<["missing", "invalid", "conflict", "needs_approval", "upload_pending", "delivery_failed", "expired", "cancelled"]>;
        message: z.ZodOptional<z.ZodString>;
        fields: z.ZodOptional<z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            code: z.ZodEnum<["required", "invalid_type", "invalid_format", "invalid_value", "too_long", "too_short", "file_required", "file_too_large", "file_wrong_type", "custom"]>;
            message: z.ZodString;
            expected: z.ZodOptional<z.ZodUnknown>;
            received: z.ZodOptional<z.ZodUnknown>;
        }, "strip", z.ZodTypeAny, {
            code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
            message: string;
            path: string;
            expected?: unknown;
            received?: unknown;
        }, {
            code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
            message: string;
            path: string;
            expected?: unknown;
            received?: unknown;
        }>, "many">>;
        nextActions: z.ZodOptional<z.ZodArray<z.ZodObject<{
            action: z.ZodEnum<["collect_field", "request_upload", "wait_for_review", "retry_delivery", "cancel"]>;
            field: z.ZodOptional<z.ZodString>;
            hint: z.ZodOptional<z.ZodString>;
            accept: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            maxBytes: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
            field?: string | undefined;
            hint?: string | undefined;
            accept?: string[] | undefined;
            maxBytes?: number | undefined;
        }, {
            action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
            field?: string | undefined;
            hint?: string | undefined;
            accept?: string[] | undefined;
            maxBytes?: number | undefined;
        }>, "many">>;
        retryable: z.ZodBoolean;
        retryAfterMs: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        type: "cancelled" | "expired" | "invalid" | "missing" | "conflict" | "needs_approval" | "upload_pending" | "delivery_failed";
        retryable: boolean;
        fields?: {
            code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
            message: string;
            path: string;
            expected?: unknown;
            received?: unknown;
        }[] | undefined;
        nextActions?: {
            action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
            field?: string | undefined;
            hint?: string | undefined;
            accept?: string[] | undefined;
            maxBytes?: number | undefined;
        }[] | undefined;
        message?: string | undefined;
        retryAfterMs?: number | undefined;
    }, {
        type: "cancelled" | "expired" | "invalid" | "missing" | "conflict" | "needs_approval" | "upload_pending" | "delivery_failed";
        retryable: boolean;
        fields?: {
            code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
            message: string;
            path: string;
            expected?: unknown;
            received?: unknown;
        }[] | undefined;
        nextActions?: {
            action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
            field?: string | undefined;
            hint?: string | undefined;
            accept?: string[] | undefined;
            maxBytes?: number | undefined;
        }[] | undefined;
        message?: string | undefined;
        retryAfterMs?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    ok: false;
    state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
    submissionId: string;
    error: {
        type: "cancelled" | "expired" | "invalid" | "missing" | "conflict" | "needs_approval" | "upload_pending" | "delivery_failed";
        retryable: boolean;
        fields?: {
            code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
            message: string;
            path: string;
            expected?: unknown;
            received?: unknown;
        }[] | undefined;
        nextActions?: {
            action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
            field?: string | undefined;
            hint?: string | undefined;
            accept?: string[] | undefined;
            maxBytes?: number | undefined;
        }[] | undefined;
        message?: string | undefined;
        retryAfterMs?: number | undefined;
    };
    resumeToken: string;
}, {
    ok: false;
    state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
    submissionId: string;
    error: {
        type: "cancelled" | "expired" | "invalid" | "missing" | "conflict" | "needs_approval" | "upload_pending" | "delivery_failed";
        retryable: boolean;
        fields?: {
            code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
            message: string;
            path: string;
            expected?: unknown;
            received?: unknown;
        }[] | undefined;
        nextActions?: {
            action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
            field?: string | undefined;
            hint?: string | undefined;
            accept?: string[] | undefined;
            maxBytes?: number | undefined;
        }[] | undefined;
        message?: string | undefined;
        retryAfterMs?: number | undefined;
    };
    resumeToken: string;
}>;
export declare const ActorKindSchema: z.ZodEnum<["agent", "human", "system"]>;
export declare const ActorSchema: z.ZodObject<{
    kind: z.ZodEnum<["agent", "human", "system"]>;
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: "agent" | "human" | "system";
    name?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    id: string;
    kind: "agent" | "human" | "system";
    name?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export declare const IntakeEventTypeSchema: z.ZodEnum<["submission.created", "field.updated", "validation.passed", "validation.failed", "upload.requested", "upload.completed", "upload.failed", "submission.submitted", "review.requested", "review.approved", "review.rejected", "delivery.attempted", "delivery.succeeded", "delivery.failed", "submission.finalized", "submission.cancelled", "submission.expired", "handoff.link_issued", "handoff.resumed"]>;
export declare const IntakeEventSchema: z.ZodObject<{
    eventId: z.ZodString;
    type: z.ZodEnum<["submission.created", "field.updated", "validation.passed", "validation.failed", "upload.requested", "upload.completed", "upload.failed", "submission.submitted", "review.requested", "review.approved", "review.rejected", "delivery.attempted", "delivery.succeeded", "delivery.failed", "submission.finalized", "submission.cancelled", "submission.expired", "handoff.link_issued", "handoff.resumed"]>;
    submissionId: z.ZodString;
    ts: z.ZodString;
    actor: z.ZodObject<{
        kind: z.ZodEnum<["agent", "human", "system"]>;
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>;
    state: z.ZodEnum<["draft", "in_progress", "awaiting_input", "awaiting_upload", "submitted", "needs_review", "approved", "rejected", "finalized", "cancelled", "expired"]>;
    payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    type: "submission.created" | "field.updated" | "validation.passed" | "validation.failed" | "upload.requested" | "upload.completed" | "upload.failed" | "submission.submitted" | "review.requested" | "review.approved" | "review.rejected" | "delivery.attempted" | "delivery.succeeded" | "delivery.failed" | "submission.finalized" | "submission.cancelled" | "submission.expired" | "handoff.link_issued" | "handoff.resumed";
    state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
    submissionId: string;
    actor: {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
    eventId: string;
    ts: string;
    payload?: Record<string, unknown> | undefined;
}, {
    type: "submission.created" | "field.updated" | "validation.passed" | "validation.failed" | "upload.requested" | "upload.completed" | "upload.failed" | "submission.submitted" | "review.requested" | "review.approved" | "review.rejected" | "delivery.attempted" | "delivery.succeeded" | "delivery.failed" | "submission.finalized" | "submission.cancelled" | "submission.expired" | "handoff.link_issued" | "handoff.resumed";
    state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
    submissionId: string;
    actor: {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
    eventId: string;
    ts: string;
    payload?: Record<string, unknown> | undefined;
}>;
export declare const RetryPolicySchema: z.ZodObject<{
    maxAttempts: z.ZodNumber;
    initialDelayMs: z.ZodNumber;
    backoffMultiplier: z.ZodNumber;
    maxDelayMs: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    maxAttempts: number;
    initialDelayMs: number;
    backoffMultiplier: number;
    maxDelayMs: number;
}, {
    maxAttempts: number;
    initialDelayMs: number;
    backoffMultiplier: number;
    maxDelayMs: number;
}>;
export declare const DestinationSchema: z.ZodObject<{
    kind: z.ZodEnum<["webhook", "callback", "queue"]>;
    url: z.ZodOptional<z.ZodString>;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    retryPolicy: z.ZodOptional<z.ZodObject<{
        maxAttempts: z.ZodNumber;
        initialDelayMs: z.ZodNumber;
        backoffMultiplier: z.ZodNumber;
        maxDelayMs: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        maxAttempts: number;
        initialDelayMs: number;
        backoffMultiplier: number;
        maxDelayMs: number;
    }, {
        maxAttempts: number;
        initialDelayMs: number;
        backoffMultiplier: number;
        maxDelayMs: number;
    }>>;
}, "strip", z.ZodTypeAny, {
    kind: "webhook" | "callback" | "queue";
    url?: string | undefined;
    headers?: Record<string, string> | undefined;
    retryPolicy?: {
        maxAttempts: number;
        initialDelayMs: number;
        backoffMultiplier: number;
        maxDelayMs: number;
    } | undefined;
}, {
    kind: "webhook" | "callback" | "queue";
    url?: string | undefined;
    headers?: Record<string, string> | undefined;
    retryPolicy?: {
        maxAttempts: number;
        initialDelayMs: number;
        backoffMultiplier: number;
        maxDelayMs: number;
    } | undefined;
}>;
export declare const ReviewerSpecSchema: z.ZodObject<{
    kind: z.ZodEnum<["user_ids", "role", "dynamic"]>;
    userIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    role: z.ZodOptional<z.ZodString>;
    logic: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    kind: "role" | "user_ids" | "dynamic";
    role?: string | undefined;
    userIds?: string[] | undefined;
    logic?: Record<string, unknown> | undefined;
}, {
    kind: "role" | "user_ids" | "dynamic";
    role?: string | undefined;
    userIds?: string[] | undefined;
    logic?: Record<string, unknown> | undefined;
}>;
export declare const ApprovalGateSchema: z.ZodObject<{
    name: z.ZodString;
    reviewers: z.ZodObject<{
        kind: z.ZodEnum<["user_ids", "role", "dynamic"]>;
        userIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        role: z.ZodOptional<z.ZodString>;
        logic: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        kind: "role" | "user_ids" | "dynamic";
        role?: string | undefined;
        userIds?: string[] | undefined;
        logic?: Record<string, unknown> | undefined;
    }, {
        kind: "role" | "user_ids" | "dynamic";
        role?: string | undefined;
        userIds?: string[] | undefined;
        logic?: Record<string, unknown> | undefined;
    }>;
    requiredApprovals: z.ZodOptional<z.ZodNumber>;
    autoApproveIf: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    escalateAfterMs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    name: string;
    reviewers: {
        kind: "role" | "user_ids" | "dynamic";
        role?: string | undefined;
        userIds?: string[] | undefined;
        logic?: Record<string, unknown> | undefined;
    };
    requiredApprovals?: number | undefined;
    autoApproveIf?: Record<string, unknown> | undefined;
    escalateAfterMs?: number | undefined;
}, {
    name: string;
    reviewers: {
        kind: "role" | "user_ids" | "dynamic";
        role?: string | undefined;
        userIds?: string[] | undefined;
        logic?: Record<string, unknown> | undefined;
    };
    requiredApprovals?: number | undefined;
    autoApproveIf?: Record<string, unknown> | undefined;
    escalateAfterMs?: number | undefined;
}>;
export declare const FieldHintSchema: z.ZodObject<{
    label: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    placeholder: z.ZodOptional<z.ZodString>;
    widget: z.ZodOptional<z.ZodString>;
    options: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    description?: string | undefined;
    options?: Record<string, unknown> | undefined;
    label?: string | undefined;
    placeholder?: string | undefined;
    widget?: string | undefined;
}, {
    description?: string | undefined;
    options?: Record<string, unknown> | undefined;
    label?: string | undefined;
    placeholder?: string | undefined;
    widget?: string | undefined;
}>;
export declare const StepDefinitionSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    fields: z.ZodArray<z.ZodString, "many">;
    order: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    fields: string[];
    title: string;
    description?: string | undefined;
    order?: number | undefined;
}, {
    id: string;
    fields: string[];
    title: string;
    description?: string | undefined;
    order?: number | undefined;
}>;
export declare const JSONSchemaSchema: z.ZodType<any>;
export declare const IntakeDefinitionSchema: z.ZodObject<{
    id: z.ZodString;
    version: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    schema: z.ZodType<any, z.ZodTypeDef, any>;
    approvalGates: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        reviewers: z.ZodObject<{
            kind: z.ZodEnum<["user_ids", "role", "dynamic"]>;
            userIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            role: z.ZodOptional<z.ZodString>;
            logic: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            kind: "role" | "user_ids" | "dynamic";
            role?: string | undefined;
            userIds?: string[] | undefined;
            logic?: Record<string, unknown> | undefined;
        }, {
            kind: "role" | "user_ids" | "dynamic";
            role?: string | undefined;
            userIds?: string[] | undefined;
            logic?: Record<string, unknown> | undefined;
        }>;
        requiredApprovals: z.ZodOptional<z.ZodNumber>;
        autoApproveIf: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        escalateAfterMs: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        reviewers: {
            kind: "role" | "user_ids" | "dynamic";
            role?: string | undefined;
            userIds?: string[] | undefined;
            logic?: Record<string, unknown> | undefined;
        };
        requiredApprovals?: number | undefined;
        autoApproveIf?: Record<string, unknown> | undefined;
        escalateAfterMs?: number | undefined;
    }, {
        name: string;
        reviewers: {
            kind: "role" | "user_ids" | "dynamic";
            role?: string | undefined;
            userIds?: string[] | undefined;
            logic?: Record<string, unknown> | undefined;
        };
        requiredApprovals?: number | undefined;
        autoApproveIf?: Record<string, unknown> | undefined;
        escalateAfterMs?: number | undefined;
    }>, "many">>;
    ttlMs: z.ZodOptional<z.ZodNumber>;
    destination: z.ZodObject<{
        kind: z.ZodEnum<["webhook", "callback", "queue"]>;
        url: z.ZodOptional<z.ZodString>;
        headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        retryPolicy: z.ZodOptional<z.ZodObject<{
            maxAttempts: z.ZodNumber;
            initialDelayMs: z.ZodNumber;
            backoffMultiplier: z.ZodNumber;
            maxDelayMs: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            maxAttempts: number;
            initialDelayMs: number;
            backoffMultiplier: number;
            maxDelayMs: number;
        }, {
            maxAttempts: number;
            initialDelayMs: number;
            backoffMultiplier: number;
            maxDelayMs: number;
        }>>;
    }, "strip", z.ZodTypeAny, {
        kind: "webhook" | "callback" | "queue";
        url?: string | undefined;
        headers?: Record<string, string> | undefined;
        retryPolicy?: {
            maxAttempts: number;
            initialDelayMs: number;
            backoffMultiplier: number;
            maxDelayMs: number;
        } | undefined;
    }, {
        kind: "webhook" | "callback" | "queue";
        url?: string | undefined;
        headers?: Record<string, string> | undefined;
        retryPolicy?: {
            maxAttempts: number;
            initialDelayMs: number;
            backoffMultiplier: number;
            maxDelayMs: number;
        } | undefined;
    }>;
    uiHints: z.ZodOptional<z.ZodObject<{
        steps: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            fields: z.ZodArray<z.ZodString, "many">;
            order: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            fields: string[];
            title: string;
            description?: string | undefined;
            order?: number | undefined;
        }, {
            id: string;
            fields: string[];
            title: string;
            description?: string | undefined;
            order?: number | undefined;
        }>, "many">>;
        fieldHints: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            label: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            placeholder: z.ZodOptional<z.ZodString>;
            widget: z.ZodOptional<z.ZodString>;
            options: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            description?: string | undefined;
            options?: Record<string, unknown> | undefined;
            label?: string | undefined;
            placeholder?: string | undefined;
            widget?: string | undefined;
        }, {
            description?: string | undefined;
            options?: Record<string, unknown> | undefined;
            label?: string | undefined;
            placeholder?: string | undefined;
            widget?: string | undefined;
        }>>>;
    }, "strip", z.ZodTypeAny, {
        fieldHints?: Record<string, {
            description?: string | undefined;
            options?: Record<string, unknown> | undefined;
            label?: string | undefined;
            placeholder?: string | undefined;
            widget?: string | undefined;
        }> | undefined;
        steps?: {
            id: string;
            fields: string[];
            title: string;
            description?: string | undefined;
            order?: number | undefined;
        }[] | undefined;
    }, {
        fieldHints?: Record<string, {
            description?: string | undefined;
            options?: Record<string, unknown> | undefined;
            label?: string | undefined;
            placeholder?: string | undefined;
            widget?: string | undefined;
        }> | undefined;
        steps?: {
            id: string;
            fields: string[];
            title: string;
            description?: string | undefined;
            order?: number | undefined;
        }[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    version: string;
    name: string;
    destination: {
        kind: "webhook" | "callback" | "queue";
        url?: string | undefined;
        headers?: Record<string, string> | undefined;
        retryPolicy?: {
            maxAttempts: number;
            initialDelayMs: number;
            backoffMultiplier: number;
            maxDelayMs: number;
        } | undefined;
    };
    description?: string | undefined;
    schema?: any;
    approvalGates?: {
        name: string;
        reviewers: {
            kind: "role" | "user_ids" | "dynamic";
            role?: string | undefined;
            userIds?: string[] | undefined;
            logic?: Record<string, unknown> | undefined;
        };
        requiredApprovals?: number | undefined;
        autoApproveIf?: Record<string, unknown> | undefined;
        escalateAfterMs?: number | undefined;
    }[] | undefined;
    uiHints?: {
        fieldHints?: Record<string, {
            description?: string | undefined;
            options?: Record<string, unknown> | undefined;
            label?: string | undefined;
            placeholder?: string | undefined;
            widget?: string | undefined;
        }> | undefined;
        steps?: {
            id: string;
            fields: string[];
            title: string;
            description?: string | undefined;
            order?: number | undefined;
        }[] | undefined;
    } | undefined;
    ttlMs?: number | undefined;
}, {
    id: string;
    version: string;
    name: string;
    destination: {
        kind: "webhook" | "callback" | "queue";
        url?: string | undefined;
        headers?: Record<string, string> | undefined;
        retryPolicy?: {
            maxAttempts: number;
            initialDelayMs: number;
            backoffMultiplier: number;
            maxDelayMs: number;
        } | undefined;
    };
    description?: string | undefined;
    schema?: any;
    approvalGates?: {
        name: string;
        reviewers: {
            kind: "role" | "user_ids" | "dynamic";
            role?: string | undefined;
            userIds?: string[] | undefined;
            logic?: Record<string, unknown> | undefined;
        };
        requiredApprovals?: number | undefined;
        autoApproveIf?: Record<string, unknown> | undefined;
        escalateAfterMs?: number | undefined;
    }[] | undefined;
    uiHints?: {
        fieldHints?: Record<string, {
            description?: string | undefined;
            options?: Record<string, unknown> | undefined;
            label?: string | undefined;
            placeholder?: string | undefined;
            widget?: string | undefined;
        }> | undefined;
        steps?: {
            id: string;
            fields: string[];
            title: string;
            description?: string | undefined;
            order?: number | undefined;
        }[] | undefined;
    } | undefined;
    ttlMs?: number | undefined;
}>;
export declare const CreateSubmissionInputSchema: z.ZodObject<{
    intakeId: z.ZodString;
    idempotencyKey: z.ZodOptional<z.ZodString>;
    actor: z.ZodObject<{
        kind: z.ZodEnum<["agent", "human", "system"]>;
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>;
    initialFields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    ttlMs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    intakeId: string;
    actor: {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
    initialFields?: Record<string, unknown> | undefined;
    idempotencyKey?: string | undefined;
    ttlMs?: number | undefined;
}, {
    intakeId: string;
    actor: {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
    initialFields?: Record<string, unknown> | undefined;
    idempotencyKey?: string | undefined;
    ttlMs?: number | undefined;
}>;
export declare const CreateSubmissionOutputSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    submissionId: z.ZodString;
    state: z.ZodEnum<["draft", "in_progress"]>;
    resumeToken: z.ZodString;
    schema: z.ZodType<any, z.ZodTypeDef, any>;
    missingFields: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    ok: true;
    state: "draft" | "in_progress";
    submissionId: string;
    resumeToken: string;
    schema?: any;
    missingFields?: string[] | undefined;
}, {
    ok: true;
    state: "draft" | "in_progress";
    submissionId: string;
    resumeToken: string;
    schema?: any;
    missingFields?: string[] | undefined;
}>;
export declare const SetFieldsInputSchema: z.ZodObject<{
    submissionId: z.ZodString;
    resumeToken: z.ZodString;
    actor: z.ZodObject<{
        kind: z.ZodEnum<["agent", "human", "system"]>;
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>;
    fields: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    fields: Record<string, unknown>;
    submissionId: string;
    resumeToken: string;
    actor: {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
}, {
    fields: Record<string, unknown>;
    submissionId: string;
    resumeToken: string;
    actor: {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
}>;
export declare const SetFieldsOutputSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    submissionId: z.ZodString;
    state: z.ZodEnum<["draft", "in_progress", "awaiting_input", "awaiting_upload", "submitted", "needs_review", "approved", "rejected", "finalized", "cancelled", "expired"]>;
    resumeToken: z.ZodString;
    fields: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    errors: z.ZodOptional<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        code: z.ZodEnum<["required", "invalid_type", "invalid_format", "invalid_value", "too_long", "too_short", "file_required", "file_too_large", "file_wrong_type", "custom"]>;
        message: z.ZodString;
        expected: z.ZodOptional<z.ZodUnknown>;
        received: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
        message: string;
        path: string;
        expected?: unknown;
        received?: unknown;
    }, {
        code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
        message: string;
        path: string;
        expected?: unknown;
        received?: unknown;
    }>, "many">>;
    nextActions: z.ZodOptional<z.ZodArray<z.ZodObject<{
        action: z.ZodEnum<["collect_field", "request_upload", "wait_for_review", "retry_delivery", "cancel"]>;
        field: z.ZodOptional<z.ZodString>;
        hint: z.ZodOptional<z.ZodString>;
        accept: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        maxBytes: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
        field?: string | undefined;
        hint?: string | undefined;
        accept?: string[] | undefined;
        maxBytes?: number | undefined;
    }, {
        action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
        field?: string | undefined;
        hint?: string | undefined;
        accept?: string[] | undefined;
        maxBytes?: number | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    ok: true;
    fields: Record<string, unknown>;
    state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
    submissionId: string;
    resumeToken: string;
    nextActions?: {
        action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
        field?: string | undefined;
        hint?: string | undefined;
        accept?: string[] | undefined;
        maxBytes?: number | undefined;
    }[] | undefined;
    errors?: {
        code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
        message: string;
        path: string;
        expected?: unknown;
        received?: unknown;
    }[] | undefined;
}, {
    ok: true;
    fields: Record<string, unknown>;
    state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
    submissionId: string;
    resumeToken: string;
    nextActions?: {
        action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
        field?: string | undefined;
        hint?: string | undefined;
        accept?: string[] | undefined;
        maxBytes?: number | undefined;
    }[] | undefined;
    errors?: {
        code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
        message: string;
        path: string;
        expected?: unknown;
        received?: unknown;
    }[] | undefined;
}>;
export declare const ValidateInputSchema: z.ZodObject<{
    submissionId: z.ZodString;
    resumeToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    submissionId: string;
    resumeToken: string;
}, {
    submissionId: string;
    resumeToken: string;
}>;
export declare const ValidateOutputSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    submissionId: z.ZodString;
    state: z.ZodEnum<["draft", "in_progress", "awaiting_input", "awaiting_upload", "submitted", "needs_review", "approved", "rejected", "finalized", "cancelled", "expired"]>;
    resumeToken: z.ZodString;
    ready: z.ZodBoolean;
    errors: z.ZodOptional<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        code: z.ZodEnum<["required", "invalid_type", "invalid_format", "invalid_value", "too_long", "too_short", "file_required", "file_too_large", "file_wrong_type", "custom"]>;
        message: z.ZodString;
        expected: z.ZodOptional<z.ZodUnknown>;
        received: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
        message: string;
        path: string;
        expected?: unknown;
        received?: unknown;
    }, {
        code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
        message: string;
        path: string;
        expected?: unknown;
        received?: unknown;
    }>, "many">>;
    nextActions: z.ZodOptional<z.ZodArray<z.ZodObject<{
        action: z.ZodEnum<["collect_field", "request_upload", "wait_for_review", "retry_delivery", "cancel"]>;
        field: z.ZodOptional<z.ZodString>;
        hint: z.ZodOptional<z.ZodString>;
        accept: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        maxBytes: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
        field?: string | undefined;
        hint?: string | undefined;
        accept?: string[] | undefined;
        maxBytes?: number | undefined;
    }, {
        action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
        field?: string | undefined;
        hint?: string | undefined;
        accept?: string[] | undefined;
        maxBytes?: number | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    ok: true;
    state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
    submissionId: string;
    resumeToken: string;
    ready: boolean;
    nextActions?: {
        action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
        field?: string | undefined;
        hint?: string | undefined;
        accept?: string[] | undefined;
        maxBytes?: number | undefined;
    }[] | undefined;
    errors?: {
        code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
        message: string;
        path: string;
        expected?: unknown;
        received?: unknown;
    }[] | undefined;
}, {
    ok: true;
    state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
    submissionId: string;
    resumeToken: string;
    ready: boolean;
    nextActions?: {
        action: "collect_field" | "request_upload" | "wait_for_review" | "retry_delivery" | "cancel";
        field?: string | undefined;
        hint?: string | undefined;
        accept?: string[] | undefined;
        maxBytes?: number | undefined;
    }[] | undefined;
    errors?: {
        code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
        message: string;
        path: string;
        expected?: unknown;
        received?: unknown;
    }[] | undefined;
}>;
export declare const RequestUploadInputSchema: z.ZodObject<{
    submissionId: z.ZodString;
    resumeToken: z.ZodString;
    field: z.ZodString;
    filename: z.ZodString;
    mimeType: z.ZodString;
    sizeBytes: z.ZodNumber;
    actor: z.ZodObject<{
        kind: z.ZodEnum<["agent", "human", "system"]>;
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    submissionId: string;
    field: string;
    resumeToken: string;
    filename: string;
    sizeBytes: number;
    mimeType: string;
    actor: {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
}, {
    submissionId: string;
    field: string;
    resumeToken: string;
    filename: string;
    sizeBytes: number;
    mimeType: string;
    actor: {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
}>;
export declare const RequestUploadOutputSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    uploadId: z.ZodString;
    method: z.ZodEnum<["PUT", "POST"]>;
    url: z.ZodString;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    expiresInMs: z.ZodNumber;
    constraints: z.ZodObject<{
        accept: z.ZodArray<z.ZodString, "many">;
        maxBytes: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        accept: string[];
        maxBytes: number;
    }, {
        accept: string[];
        maxBytes: number;
    }>;
}, "strip", z.ZodTypeAny, {
    ok: true;
    uploadId: string;
    method: "PUT" | "POST";
    url: string;
    expiresInMs: number;
    constraints: {
        accept: string[];
        maxBytes: number;
    };
    headers?: Record<string, string> | undefined;
}, {
    ok: true;
    uploadId: string;
    method: "PUT" | "POST";
    url: string;
    expiresInMs: number;
    constraints: {
        accept: string[];
        maxBytes: number;
    };
    headers?: Record<string, string> | undefined;
}>;
export declare const ConfirmUploadInputSchema: z.ZodObject<{
    submissionId: z.ZodString;
    resumeToken: z.ZodString;
    uploadId: z.ZodString;
    actor: z.ZodObject<{
        kind: z.ZodEnum<["agent", "human", "system"]>;
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    submissionId: string;
    resumeToken: string;
    uploadId: string;
    actor: {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
}, {
    submissionId: string;
    resumeToken: string;
    uploadId: string;
    actor: {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
}>;
export declare const ConfirmUploadOutputSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    submissionId: z.ZodString;
    state: z.ZodEnum<["draft", "in_progress", "awaiting_input", "awaiting_upload", "submitted", "needs_review", "approved", "rejected", "finalized", "cancelled", "expired"]>;
    resumeToken: z.ZodString;
    field: z.ZodString;
}, "strip", z.ZodTypeAny, {
    ok: true;
    state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
    submissionId: string;
    field: string;
    resumeToken: string;
}, {
    ok: true;
    state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
    submissionId: string;
    field: string;
    resumeToken: string;
}>;
export declare const SubmitInputSchema: z.ZodObject<{
    submissionId: z.ZodString;
    resumeToken: z.ZodString;
    idempotencyKey: z.ZodString;
    actor: z.ZodObject<{
        kind: z.ZodEnum<["agent", "human", "system"]>;
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    submissionId: string;
    resumeToken: string;
    idempotencyKey: string;
    actor: {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
}, {
    submissionId: string;
    resumeToken: string;
    idempotencyKey: string;
    actor: {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
}>;
export declare const SubmitOutputSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    submissionId: z.ZodString;
    state: z.ZodEnum<["submitted", "needs_review", "finalized"]>;
    resumeToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    ok: true;
    state: "submitted" | "needs_review" | "finalized";
    submissionId: string;
    resumeToken: string;
}, {
    ok: true;
    state: "submitted" | "needs_review" | "finalized";
    submissionId: string;
    resumeToken: string;
}>;
export declare const ReviewInputSchema: z.ZodObject<{
    submissionId: z.ZodString;
    decision: z.ZodEnum<["approved", "rejected"]>;
    reasons: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    actor: z.ZodObject<{
        kind: z.ZodEnum<["agent", "human", "system"]>;
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    submissionId: string;
    actor: {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
    decision: "approved" | "rejected";
    reasons?: string[] | undefined;
}, {
    submissionId: string;
    actor: {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
    decision: "approved" | "rejected";
    reasons?: string[] | undefined;
}>;
export declare const ReviewOutputSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    submissionId: z.ZodString;
    state: z.ZodEnum<["approved", "rejected"]>;
    resumeToken: z.ZodString;
    reasons: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    ok: true;
    state: "approved" | "rejected";
    submissionId: string;
    resumeToken: string;
    reasons?: string[] | undefined;
}, {
    ok: true;
    state: "approved" | "rejected";
    submissionId: string;
    resumeToken: string;
    reasons?: string[] | undefined;
}>;
export declare const CancelInputSchema: z.ZodObject<{
    submissionId: z.ZodString;
    reason: z.ZodOptional<z.ZodString>;
    actor: z.ZodObject<{
        kind: z.ZodEnum<["agent", "human", "system"]>;
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }, {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    submissionId: string;
    actor: {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
    reason?: string | undefined;
}, {
    submissionId: string;
    actor: {
        id: string;
        kind: "agent" | "human" | "system";
        name?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    };
    reason?: string | undefined;
}>;
export declare const CancelOutputSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    submissionId: z.ZodString;
    state: z.ZodLiteral<"cancelled">;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    ok: true;
    state: "cancelled";
    submissionId: string;
    reason?: string | undefined;
}, {
    ok: true;
    state: "cancelled";
    submissionId: string;
    reason?: string | undefined;
}>;
export declare const GetSubmissionInputSchema: z.ZodObject<{
    submissionId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    submissionId: string;
}, {
    submissionId: string;
}>;
export declare const GetSubmissionOutputSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    submissionId: z.ZodString;
    state: z.ZodEnum<["draft", "in_progress", "awaiting_input", "awaiting_upload", "submitted", "needs_review", "approved", "rejected", "finalized", "cancelled", "expired"]>;
    resumeToken: z.ZodString;
    intakeId: z.ZodString;
    fields: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    metadata: z.ZodObject<{
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        createdBy: z.ZodObject<{
            kind: z.ZodEnum<["agent", "human", "system"]>;
            id: z.ZodString;
            name: z.ZodOptional<z.ZodString>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        }, {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        }>;
        expiresAt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        createdAt: string;
        updatedAt: string;
        createdBy: {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        };
        expiresAt?: string | undefined;
    }, {
        createdAt: string;
        updatedAt: string;
        createdBy: {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        };
        expiresAt?: string | undefined;
    }>;
    errors: z.ZodOptional<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        code: z.ZodEnum<["required", "invalid_type", "invalid_format", "invalid_value", "too_long", "too_short", "file_required", "file_too_large", "file_wrong_type", "custom"]>;
        message: z.ZodString;
        expected: z.ZodOptional<z.ZodUnknown>;
        received: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
        message: string;
        path: string;
        expected?: unknown;
        received?: unknown;
    }, {
        code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
        message: string;
        path: string;
        expected?: unknown;
        received?: unknown;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    metadata: {
        createdAt: string;
        updatedAt: string;
        createdBy: {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        };
        expiresAt?: string | undefined;
    };
    ok: true;
    fields: Record<string, unknown>;
    state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
    submissionId: string;
    intakeId: string;
    resumeToken: string;
    errors?: {
        code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
        message: string;
        path: string;
        expected?: unknown;
        received?: unknown;
    }[] | undefined;
}, {
    metadata: {
        createdAt: string;
        updatedAt: string;
        createdBy: {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        };
        expiresAt?: string | undefined;
    };
    ok: true;
    fields: Record<string, unknown>;
    state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
    submissionId: string;
    intakeId: string;
    resumeToken: string;
    errors?: {
        code: "required" | "invalid_type" | "invalid_format" | "invalid_value" | "too_long" | "too_short" | "file_required" | "file_too_large" | "file_wrong_type" | "custom";
        message: string;
        path: string;
        expected?: unknown;
        received?: unknown;
    }[] | undefined;
}>;
export declare const GetEventsInputSchema: z.ZodObject<{
    submissionId: z.ZodString;
    afterEventId: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    submissionId: string;
    afterEventId?: string | undefined;
    limit?: number | undefined;
}, {
    submissionId: string;
    afterEventId?: string | undefined;
    limit?: number | undefined;
}>;
export declare const GetEventsOutputSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
    submissionId: z.ZodString;
    events: z.ZodArray<z.ZodObject<{
        eventId: z.ZodString;
        type: z.ZodEnum<["submission.created", "field.updated", "validation.passed", "validation.failed", "upload.requested", "upload.completed", "upload.failed", "submission.submitted", "review.requested", "review.approved", "review.rejected", "delivery.attempted", "delivery.succeeded", "delivery.failed", "submission.finalized", "submission.cancelled", "submission.expired", "handoff.link_issued", "handoff.resumed"]>;
        submissionId: z.ZodString;
        ts: z.ZodString;
        actor: z.ZodObject<{
            kind: z.ZodEnum<["agent", "human", "system"]>;
            id: z.ZodString;
            name: z.ZodOptional<z.ZodString>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        }, {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        }>;
        state: z.ZodEnum<["draft", "in_progress", "awaiting_input", "awaiting_upload", "submitted", "needs_review", "approved", "rejected", "finalized", "cancelled", "expired"]>;
        payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        type: "submission.created" | "field.updated" | "validation.passed" | "validation.failed" | "upload.requested" | "upload.completed" | "upload.failed" | "submission.submitted" | "review.requested" | "review.approved" | "review.rejected" | "delivery.attempted" | "delivery.succeeded" | "delivery.failed" | "submission.finalized" | "submission.cancelled" | "submission.expired" | "handoff.link_issued" | "handoff.resumed";
        state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
        submissionId: string;
        actor: {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        };
        eventId: string;
        ts: string;
        payload?: Record<string, unknown> | undefined;
    }, {
        type: "submission.created" | "field.updated" | "validation.passed" | "validation.failed" | "upload.requested" | "upload.completed" | "upload.failed" | "submission.submitted" | "review.requested" | "review.approved" | "review.rejected" | "delivery.attempted" | "delivery.succeeded" | "delivery.failed" | "submission.finalized" | "submission.cancelled" | "submission.expired" | "handoff.link_issued" | "handoff.resumed";
        state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
        submissionId: string;
        actor: {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        };
        eventId: string;
        ts: string;
        payload?: Record<string, unknown> | undefined;
    }>, "many">;
    nextCursor: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    ok: true;
    submissionId: string;
    events: {
        type: "submission.created" | "field.updated" | "validation.passed" | "validation.failed" | "upload.requested" | "upload.completed" | "upload.failed" | "submission.submitted" | "review.requested" | "review.approved" | "review.rejected" | "delivery.attempted" | "delivery.succeeded" | "delivery.failed" | "submission.finalized" | "submission.cancelled" | "submission.expired" | "handoff.link_issued" | "handoff.resumed";
        state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
        submissionId: string;
        actor: {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        };
        eventId: string;
        ts: string;
        payload?: Record<string, unknown> | undefined;
    }[];
    nextCursor?: string | undefined;
}, {
    ok: true;
    submissionId: string;
    events: {
        type: "submission.created" | "field.updated" | "validation.passed" | "validation.failed" | "upload.requested" | "upload.completed" | "upload.failed" | "submission.submitted" | "review.requested" | "review.approved" | "review.rejected" | "delivery.attempted" | "delivery.succeeded" | "delivery.failed" | "submission.finalized" | "submission.cancelled" | "submission.expired" | "handoff.link_issued" | "handoff.resumed";
        state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
        submissionId: string;
        actor: {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        };
        eventId: string;
        ts: string;
        payload?: Record<string, unknown> | undefined;
    }[];
    nextCursor?: string | undefined;
}>;
export declare const UploadStatusSchema: z.ZodObject<{
    uploadId: z.ZodString;
    field: z.ZodString;
    filename: z.ZodString;
    mimeType: z.ZodString;
    sizeBytes: z.ZodNumber;
    status: z.ZodEnum<["pending", "completed", "failed"]>;
    url: z.ZodOptional<z.ZodString>;
    uploadedAt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    field: string;
    status: "completed" | "failed" | "pending";
    uploadId: string;
    filename: string;
    sizeBytes: number;
    mimeType: string;
    url?: string | undefined;
    uploadedAt?: string | undefined;
}, {
    field: string;
    status: "completed" | "failed" | "pending";
    uploadId: string;
    filename: string;
    sizeBytes: number;
    mimeType: string;
    url?: string | undefined;
    uploadedAt?: string | undefined;
}>;
export declare const SubmissionSchema: z.ZodObject<{
    id: z.ZodString;
    intakeId: z.ZodString;
    state: z.ZodEnum<["draft", "in_progress", "awaiting_input", "awaiting_upload", "submitted", "needs_review", "approved", "rejected", "finalized", "cancelled", "expired"]>;
    resumeToken: z.ZodString;
    fields: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    metadata: z.ZodObject<{
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        createdBy: z.ZodObject<{
            kind: z.ZodEnum<["agent", "human", "system"]>;
            id: z.ZodString;
            name: z.ZodOptional<z.ZodString>;
            metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, "strip", z.ZodTypeAny, {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        }, {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        }>;
        expiresAt: z.ZodOptional<z.ZodString>;
        idempotencyKeys: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        createdAt: string;
        updatedAt: string;
        createdBy: {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        };
        idempotencyKeys: string[];
        expiresAt?: string | undefined;
    }, {
        createdAt: string;
        updatedAt: string;
        createdBy: {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        };
        idempotencyKeys: string[];
        expiresAt?: string | undefined;
    }>;
    uploads: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        uploadId: z.ZodString;
        field: z.ZodString;
        filename: z.ZodString;
        mimeType: z.ZodString;
        sizeBytes: z.ZodNumber;
        status: z.ZodEnum<["pending", "completed", "failed"]>;
        url: z.ZodOptional<z.ZodString>;
        uploadedAt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        field: string;
        status: "completed" | "failed" | "pending";
        uploadId: string;
        filename: string;
        sizeBytes: number;
        mimeType: string;
        url?: string | undefined;
        uploadedAt?: string | undefined;
    }, {
        field: string;
        status: "completed" | "failed" | "pending";
        uploadId: string;
        filename: string;
        sizeBytes: number;
        mimeType: string;
        url?: string | undefined;
        uploadedAt?: string | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    metadata: {
        createdAt: string;
        updatedAt: string;
        createdBy: {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        };
        idempotencyKeys: string[];
        expiresAt?: string | undefined;
    };
    fields: Record<string, unknown>;
    state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
    intakeId: string;
    resumeToken: string;
    uploads?: Record<string, {
        field: string;
        status: "completed" | "failed" | "pending";
        uploadId: string;
        filename: string;
        sizeBytes: number;
        mimeType: string;
        url?: string | undefined;
        uploadedAt?: string | undefined;
    }> | undefined;
}, {
    id: string;
    metadata: {
        createdAt: string;
        updatedAt: string;
        createdBy: {
            id: string;
            kind: "agent" | "human" | "system";
            name?: string | undefined;
            metadata?: Record<string, unknown> | undefined;
        };
        idempotencyKeys: string[];
        expiresAt?: string | undefined;
    };
    fields: Record<string, unknown>;
    state: "draft" | "in_progress" | "awaiting_input" | "awaiting_upload" | "submitted" | "needs_review" | "approved" | "rejected" | "finalized" | "cancelled" | "expired";
    intakeId: string;
    resumeToken: string;
    uploads?: Record<string, {
        field: string;
        status: "completed" | "failed" | "pending";
        uploadId: string;
        filename: string;
        sizeBytes: number;
        mimeType: string;
        url?: string | undefined;
        uploadedAt?: string | undefined;
    }> | undefined;
}>;
//# sourceMappingURL=schemas.d.ts.map