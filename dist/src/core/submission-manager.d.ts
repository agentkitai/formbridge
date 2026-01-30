import type { Actor, IntakeEvent, CreateSubmissionRequest, CreateSubmissionResponse, SetFieldsRequest, SubmitRequest, IntakeError, IntakeDefinition } from "../types/intake-contract";
import type { Submission } from "../types";
import type { StorageBackend } from "../storage/storage-backend.js";
export declare class SubmissionNotFoundError extends Error {
    constructor(identifier: string);
}
export declare class SubmissionExpiredError extends Error {
    constructor(message?: string);
}
export declare class InvalidResumeTokenError extends Error {
    constructor();
}
export interface SubmissionStore {
    get(submissionId: string): Promise<Submission | null>;
    save(submission: Submission): Promise<void>;
    getByResumeToken(resumeToken: string): Promise<Submission | null>;
}
export interface EventEmitter {
    emit(event: IntakeEvent): Promise<void>;
}
export interface RequestUploadInput {
    submissionId: string;
    resumeToken: string;
    field: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    actor: Actor;
}
export interface RequestUploadOutput {
    ok: true;
    uploadId: string;
    method: string;
    url: string;
    headers?: Record<string, string>;
    expiresInMs: number;
    constraints: {
        accept: string[];
        maxBytes: number;
    };
}
export interface ConfirmUploadInput {
    submissionId: string;
    resumeToken: string;
    uploadId: string;
    actor: Actor;
}
export interface ConfirmUploadOutput {
    ok: true;
    submissionId: string;
    state: string;
    resumeToken: string;
    field: string;
}
export declare class SubmissionManager {
    private store;
    private eventEmitter;
    private baseUrl;
    private storageBackend?;
    private validator;
    constructor(store: SubmissionStore, eventEmitter: EventEmitter, baseUrl?: string, storageBackend?: StorageBackend | undefined);
    createSubmission(request: CreateSubmissionRequest): Promise<CreateSubmissionResponse>;
    setFields(request: SetFieldsRequest): Promise<CreateSubmissionResponse | IntakeError>;
    requestUpload(input: RequestUploadInput, intakeDefinition: IntakeDefinition): Promise<RequestUploadOutput>;
    confirmUpload(input: ConfirmUploadInput): Promise<ConfirmUploadOutput>;
    submit(request: SubmitRequest): Promise<CreateSubmissionResponse | IntakeError>;
    getSubmission(submissionId: string): Promise<Submission | null>;
    getSubmissionByResumeToken(resumeToken: string): Promise<Submission | null>;
    getEvents(submissionId: string): Promise<IntakeEvent[]>;
    generateHandoffUrl(submissionId: string, actor: Actor): Promise<string>;
    emitHandoffResumed(resumeToken: string, actor: Actor): Promise<string>;
}
//# sourceMappingURL=submission-manager.d.ts.map