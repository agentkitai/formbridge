import type { Submission, SubmissionEntry } from "../types";
import type { SubmissionStore as ISubmissionStore } from "../core/submission-manager";
import { SubmissionState } from "../types/intake-contract.js";
export interface UploadEntry {
    uploadId: string;
    field: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    status: 'pending' | 'completed' | 'failed';
    url?: string;
    uploadedAt?: Date;
    downloadUrl?: string;
    error?: string;
}
export declare class InMemorySubmissionStore implements ISubmissionStore {
    private submissions;
    private resumeTokenIndex;
    get(submissionId: string): Promise<Submission | null>;
    save(submission: Submission): Promise<void>;
    getByResumeToken(resumeToken: string): Promise<Submission | null>;
    clear(): void;
    getAll(): SubmissionEntry[];
}
export interface MCPSubmissionEntry {
    submissionId: string;
    resumeToken: string;
    intakeId: string;
    data: Record<string, unknown>;
    state: SubmissionState;
    idempotencyKey?: string;
    createdAt: Date;
    updatedAt: Date;
    uploads?: Record<string, UploadEntry>;
}
export declare class SubmissionStore {
    private submissions;
    private idempotencyKeys;
    create(intakeId: string, data?: Record<string, unknown>, idempotencyKey?: string): MCPSubmissionEntry;
    get(resumeToken: string): MCPSubmissionEntry | undefined;
    getByIdempotencyKey(idempotencyKey: string): MCPSubmissionEntry | undefined;
    update(resumeToken: string, updates: Partial<MCPSubmissionEntry>): MCPSubmissionEntry | undefined;
    delete(resumeToken: string): boolean;
}
//# sourceMappingURL=submission-store.d.ts.map