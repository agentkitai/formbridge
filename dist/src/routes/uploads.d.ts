import { Hono } from 'hono';
import type { IntakeRegistry } from '../core/intake-registry.js';
import type { SubmissionManager } from '../core/submission-manager.js';
export interface UploadErrorResponse {
    ok: false;
    error: {
        type: 'not_found' | 'invalid_request' | 'invalid_resume_token' | 'internal_error' | 'storage_error';
        message: string;
    };
}
export interface RequestUploadRequest {
    resumeToken: string;
    actor: {
        kind: 'agent' | 'human' | 'system';
        id: string;
        name?: string;
        metadata?: Record<string, unknown>;
    };
    field: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
}
export interface ConfirmUploadRequest {
    resumeToken: string;
    actor: {
        kind: 'agent' | 'human' | 'system';
        id: string;
        name?: string;
        metadata?: Record<string, unknown>;
    };
}
export declare function createUploadRouter(registry: IntakeRegistry, submissionManager: SubmissionManager): Hono;
//# sourceMappingURL=uploads.d.ts.map