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
};
export function isIntakeError(response) {
    if (response && typeof response === "object") {
        if ("ok" in response && response.ok === false)
            return true;
        if ("type" in response && "fields" in response && "nextActions" in response)
            return true;
    }
    return false;
}
export function isSubmissionSuccess(response) {
    if (response && typeof response === "object") {
        return "state" in response && "submissionId" in response && !("ok" in response && response.ok === false);
    }
    return false;
}
//# sourceMappingURL=intake-contract.js.map