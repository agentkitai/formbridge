import { Validator } from "../validation/validator.js";
import { randomUUID } from "crypto";
export class SubmissionNotFoundError extends Error {
    constructor(identifier) {
        super(`Submission not found: ${identifier}`);
        this.name = "SubmissionNotFoundError";
    }
}
export class SubmissionExpiredError extends Error {
    constructor(message = "This resume link has expired") {
        super(message);
        this.name = "SubmissionExpiredError";
    }
}
export class InvalidResumeTokenError extends Error {
    constructor() {
        super("Invalid resume token");
        this.name = "InvalidResumeTokenError";
    }
}
export class SubmissionManager {
    store;
    eventEmitter;
    baseUrl;
    storageBackend;
    validator;
    constructor(store, eventEmitter, baseUrl = "http://localhost:3000", storageBackend) {
        this.store = store;
        this.eventEmitter = eventEmitter;
        this.baseUrl = baseUrl;
        this.storageBackend = storageBackend;
        this.validator = new Validator(eventEmitter);
    }
    async createSubmission(request) {
        const submissionId = `sub_${randomUUID()}`;
        const resumeToken = `rtok_${randomUUID()}`;
        const now = new Date().toISOString();
        const fieldAttribution = {};
        const fields = {};
        if (request.initialFields) {
            Object.entries(request.initialFields).forEach(([key, value]) => {
                fields[key] = value;
                fieldAttribution[key] = request.actor;
            });
        }
        const submission = {
            id: submissionId,
            intakeId: request.intakeId,
            state: "draft",
            resumeToken,
            createdAt: now,
            updatedAt: now,
            fields,
            fieldAttribution,
            createdBy: request.actor,
            updatedBy: request.actor,
            idempotencyKey: request.idempotencyKey,
            events: [],
            ttlMs: request.ttlMs,
        };
        if (request.ttlMs) {
            submission.expiresAt = new Date(Date.now() + request.ttlMs).toISOString();
        }
        await this.store.save(submission);
        const event = {
            eventId: `evt_${randomUUID()}`,
            type: "submission.created",
            submissionId,
            ts: now,
            actor: request.actor,
            state: "draft",
            payload: {
                intakeId: request.intakeId,
                initialFields: request.initialFields,
            },
        };
        submission.events.push(event);
        await this.eventEmitter.emit(event);
        await this.store.save(submission);
        return {
            ok: true,
            submissionId,
            state: "draft",
            resumeToken,
            schema: {},
            missingFields: [],
        };
    }
    async setFields(request) {
        let submission = await this.store.get(request.submissionId);
        if (!submission) {
            submission = await this.store.getByResumeToken(request.resumeToken);
        }
        if (!submission) {
            throw new SubmissionNotFoundError(request.submissionId);
        }
        if (["submitted", "finalized", "cancelled", "expired"].includes(submission.state)) {
            return {
                ok: false,
                submissionId: submission.id,
                state: submission.state,
                resumeToken: submission.resumeToken,
                error: {
                    type: "conflict",
                    message: "Cannot modify fields in current state",
                    retryable: false,
                },
            };
        }
        if (submission.resumeToken !== request.resumeToken) {
            throw new InvalidResumeTokenError();
        }
        if (submission.expiresAt && new Date(submission.expiresAt) < new Date()) {
            const error = {
                ok: false,
                submissionId: submission.id,
                state: "expired",
                resumeToken: submission.resumeToken,
                error: {
                    type: "expired",
                    message: "Submission has expired",
                    retryable: false,
                },
            };
            return error;
        }
        const now = new Date().toISOString();
        const fieldUpdates = [];
        Object.entries(request.fields).forEach(([fieldPath, value]) => {
            const oldValue = submission.fields[fieldPath];
            submission.fields[fieldPath] = value;
            submission.fieldAttribution[fieldPath] = request.actor;
            fieldUpdates.push({ fieldPath, oldValue, newValue: value });
        });
        submission.updatedAt = now;
        submission.updatedBy = request.actor;
        if (submission.state === "draft") {
            submission.state = "in_progress";
        }
        await this.store.save(submission);
        for (const fieldUpdate of fieldUpdates) {
            const event = {
                eventId: `evt_${randomUUID()}`,
                type: "field.updated",
                submissionId: submission.id,
                ts: now,
                actor: request.actor,
                state: submission.state,
                payload: {
                    fieldPath: fieldUpdate.fieldPath,
                    oldValue: fieldUpdate.oldValue,
                    newValue: fieldUpdate.newValue,
                },
            };
            submission.events.push(event);
            await this.eventEmitter.emit(event);
        }
        await this.store.save(submission);
        return {
            ok: true,
            submissionId: submission.id,
            state: submission.state,
            resumeToken: submission.resumeToken,
            schema: {},
            missingFields: [],
        };
    }
    async requestUpload(input, intakeDefinition) {
        if (!this.storageBackend) {
            throw new Error("Storage backend not configured");
        }
        const submission = await this.store.get(input.submissionId);
        if (!submission) {
            throw new SubmissionNotFoundError(input.submissionId);
        }
        if (submission.resumeToken !== input.resumeToken) {
            throw new InvalidResumeTokenError();
        }
        if (submission.expiresAt && new Date(submission.expiresAt) < new Date()) {
            throw new SubmissionExpiredError();
        }
        const schemaObj = intakeDefinition.schema;
        const properties = schemaObj?.properties;
        const fieldSchema = properties?.[input.field];
        if (!fieldSchema) {
            throw new Error(`Field '${input.field}' not found in intake schema`);
        }
        const signedUrl = await this.storageBackend.generateUploadUrl({
            intakeId: submission.intakeId,
            submissionId: submission.id,
            fieldPath: input.field,
            filename: input.filename,
            mimeType: input.mimeType,
            constraints: {
                maxSize: input.sizeBytes,
                allowedTypes: [input.mimeType],
                maxCount: 1,
            },
        });
        const uploadStatus = {
            uploadId: signedUrl.uploadId,
            field: input.field,
            filename: input.filename,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            status: "pending",
        };
        const uploads = submission.fields.__uploads || {};
        uploads[signedUrl.uploadId] = uploadStatus;
        submission.fields.__uploads = uploads;
        const now = new Date().toISOString();
        submission.updatedAt = now;
        if (submission.state === "draft" || submission.state === "in_progress") {
            submission.state = "awaiting_upload";
        }
        const newResumeToken = `rtok_${randomUUID()}`;
        submission.resumeToken = newResumeToken;
        await this.store.save(submission);
        const event = {
            eventId: `evt_${randomUUID()}`,
            type: "upload.requested",
            submissionId: submission.id,
            ts: now,
            actor: input.actor,
            state: submission.state,
            payload: {
                uploadId: signedUrl.uploadId,
                field: input.field,
                filename: input.filename,
                sizeBytes: input.sizeBytes,
            },
        };
        submission.events.push(event);
        await this.eventEmitter.emit(event);
        await this.store.save(submission);
        const expiresInMs = new Date(signedUrl.expiresAt).getTime() - Date.now();
        return {
            ok: true,
            uploadId: signedUrl.uploadId,
            method: signedUrl.method,
            url: signedUrl.url,
            headers: signedUrl.headers,
            expiresInMs,
            constraints: {
                accept: signedUrl.constraints.allowedTypes,
                maxBytes: signedUrl.constraints.maxSize,
            },
        };
    }
    async confirmUpload(input) {
        if (!this.storageBackend) {
            throw new Error("Storage backend not configured");
        }
        const submission = await this.store.get(input.submissionId);
        if (!submission) {
            throw new SubmissionNotFoundError(input.submissionId);
        }
        if (submission.resumeToken !== input.resumeToken) {
            throw new InvalidResumeTokenError();
        }
        const uploads = submission.fields.__uploads || {};
        const uploadStatus = uploads[input.uploadId];
        if (!uploadStatus) {
            throw new Error(`Upload not found: ${input.uploadId}`);
        }
        const verificationResult = await this.storageBackend.verifyUpload(input.uploadId);
        let mappedStatus;
        if (verificationResult.status === "expired") {
            mappedStatus = "failed";
        }
        else {
            mappedStatus = verificationResult.status;
        }
        uploadStatus.status = mappedStatus;
        if (verificationResult.file) {
            uploadStatus.uploadedAt = verificationResult.file.uploadedAt;
            uploadStatus.url = verificationResult.file.storageKey;
        }
        const now = new Date().toISOString();
        submission.updatedAt = now;
        submission.fields.__uploads = uploads;
        if (mappedStatus === "completed") {
            const hasPendingUploads = Object.values(uploads).some((u) => u.status === "pending");
            if (!hasPendingUploads && submission.state === "awaiting_upload") {
                submission.state = "in_progress";
            }
            const newResumeToken = `rtok_${randomUUID()}`;
            submission.resumeToken = newResumeToken;
            await this.store.save(submission);
            const event = {
                eventId: `evt_${randomUUID()}`,
                type: "upload.completed",
                submissionId: submission.id,
                ts: now,
                actor: input.actor,
                state: submission.state,
                payload: {
                    uploadId: input.uploadId,
                    field: uploadStatus.field,
                    filename: uploadStatus.filename,
                    sizeBytes: uploadStatus.sizeBytes,
                },
            };
            submission.events.push(event);
            await this.eventEmitter.emit(event);
            await this.store.save(submission);
            return {
                ok: true,
                submissionId: submission.id,
                state: submission.state,
                resumeToken: newResumeToken,
                field: uploadStatus.field,
            };
        }
        else {
            await this.store.save(submission);
            const event = {
                eventId: `evt_${randomUUID()}`,
                type: "upload.failed",
                submissionId: submission.id,
                ts: now,
                actor: input.actor,
                state: submission.state,
                payload: {
                    uploadId: input.uploadId,
                    field: uploadStatus.field,
                    error: verificationResult.error,
                },
            };
            submission.events.push(event);
            await this.eventEmitter.emit(event);
            await this.store.save(submission);
            throw new Error(`Upload verification failed: ${verificationResult.error ?? "Unknown error"}`);
        }
    }
    async submit(request) {
        const submission = await this.store.get(request.submissionId);
        if (!submission) {
            throw new SubmissionNotFoundError(request.submissionId);
        }
        if (submission.resumeToken !== request.resumeToken) {
            throw new InvalidResumeTokenError();
        }
        if (submission.state === "submitted" || submission.state === "finalized") {
            const error = {
                ok: false,
                submissionId: submission.id,
                state: submission.state,
                resumeToken: submission.resumeToken,
                error: {
                    type: "conflict",
                    message: "Submission already submitted",
                    retryable: false,
                },
            };
            return error;
        }
        const now = new Date().toISOString();
        submission.state = "submitted";
        submission.updatedAt = now;
        submission.updatedBy = request.actor;
        await this.store.save(submission);
        const event = {
            eventId: `evt_${randomUUID()}`,
            type: "submission.submitted",
            submissionId: submission.id,
            ts: now,
            actor: request.actor,
            state: "submitted",
            payload: {
                idempotencyKey: request.idempotencyKey,
            },
        };
        submission.events.push(event);
        await this.eventEmitter.emit(event);
        await this.store.save(submission);
        return {
            ok: true,
            submissionId: submission.id,
            state: submission.state,
            resumeToken: submission.resumeToken,
            schema: {},
            missingFields: [],
        };
    }
    async getSubmission(submissionId) {
        return this.store.get(submissionId);
    }
    async getSubmissionByResumeToken(resumeToken) {
        return this.store.getByResumeToken(resumeToken);
    }
    async getEvents(submissionId) {
        const submission = await this.store.get(submissionId);
        if (!submission) {
            throw new SubmissionNotFoundError(submissionId);
        }
        return submission.events || [];
    }
    async generateHandoffUrl(submissionId, actor) {
        const submission = await this.store.get(submissionId);
        if (!submission) {
            throw new SubmissionNotFoundError(submissionId);
        }
        const resumeUrl = `${this.baseUrl}/resume?token=${encodeURIComponent(submission.resumeToken)}`;
        const now = new Date().toISOString();
        const event = {
            eventId: `evt_${randomUUID()}`,
            type: "handoff.link_issued",
            submissionId: submission.id,
            ts: now,
            actor,
            state: submission.state,
            payload: {
                url: resumeUrl,
                resumeToken: submission.resumeToken,
            },
        };
        submission.events.push(event);
        await this.eventEmitter.emit(event);
        await this.store.save(submission);
        return resumeUrl;
    }
    async emitHandoffResumed(resumeToken, actor) {
        const submission = await this.store.getByResumeToken(resumeToken);
        if (!submission) {
            throw new SubmissionNotFoundError(resumeToken);
        }
        if (submission.expiresAt && new Date(submission.expiresAt) < new Date()) {
            throw new SubmissionExpiredError();
        }
        const now = new Date().toISOString();
        const event = {
            eventId: `evt_${randomUUID()}`,
            type: "handoff.resumed",
            submissionId: submission.id,
            ts: now,
            actor,
            state: submission.state,
            payload: {
                resumeToken: submission.resumeToken,
            },
        };
        submission.events.push(event);
        await this.eventEmitter.emit(event);
        await this.store.save(submission);
        return event.eventId;
    }
}
//# sourceMappingURL=submission-manager.js.map