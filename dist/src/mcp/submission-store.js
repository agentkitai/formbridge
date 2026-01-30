import { randomBytes } from 'crypto';
import { SubmissionState } from "../types/intake-contract.js";
export class InMemorySubmissionStore {
    submissions = new Map();
    resumeTokenIndex = new Map();
    async get(submissionId) {
        const entry = this.submissions.get(submissionId);
        return entry ? entry.submission : null;
    }
    async save(submission) {
        const entry = {
            submission,
            resumeToken: submission.resumeToken,
        };
        this.submissions.set(submission.id, entry);
        this.resumeTokenIndex.set(submission.resumeToken, submission.id);
    }
    async getByResumeToken(resumeToken) {
        const submissionId = this.resumeTokenIndex.get(resumeToken);
        if (!submissionId) {
            return null;
        }
        const entry = this.submissions.get(submissionId);
        return entry ? entry.submission : null;
    }
    clear() {
        this.submissions.clear();
        this.resumeTokenIndex.clear();
    }
    getAll() {
        return Array.from(this.submissions.values());
    }
}
export class SubmissionStore {
    submissions = new Map();
    idempotencyKeys = new Map();
    create(intakeId, data = {}, idempotencyKey) {
        const submissionId = `sub_${Date.now()}_${randomBytes(8).toString('hex')}`;
        const resumeToken = `tok_${randomBytes(16).toString('hex')}`;
        const entry = {
            submissionId,
            resumeToken,
            intakeId,
            data,
            state: SubmissionState.CREATED,
            idempotencyKey,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        this.submissions.set(resumeToken, entry);
        if (idempotencyKey) {
            this.idempotencyKeys.set(idempotencyKey, resumeToken);
        }
        return entry;
    }
    get(resumeToken) {
        return this.submissions.get(resumeToken);
    }
    getByIdempotencyKey(idempotencyKey) {
        const resumeToken = this.idempotencyKeys.get(idempotencyKey);
        return resumeToken ? this.submissions.get(resumeToken) : undefined;
    }
    update(resumeToken, updates) {
        const entry = this.submissions.get(resumeToken);
        if (!entry) {
            return undefined;
        }
        const updated = {
            ...entry,
            ...updates,
            updatedAt: new Date()
        };
        this.submissions.set(resumeToken, updated);
        return updated;
    }
    delete(resumeToken) {
        const entry = this.submissions.get(resumeToken);
        if (entry?.idempotencyKey) {
            this.idempotencyKeys.delete(entry.idempotencyKey);
        }
        return this.submissions.delete(resumeToken);
    }
}
//# sourceMappingURL=submission-store.js.map