import type { Context } from 'hono';
import type { IntakeError, SubmissionState } from '../types.js';
export interface ErrorResponse {
    ok: false;
    error: {
        type: string;
        message: string;
        details?: unknown;
    };
}
export declare class SubmissionError extends Error {
    submissionId: string;
    state: SubmissionState;
    resumeToken: string;
    intakeError: IntakeError['error'];
    constructor(submissionId: string, state: SubmissionState, resumeToken: string, intakeError: IntakeError['error']);
    toIntakeError(): IntakeError;
}
export declare function createErrorHandler(options?: {
    logErrors?: boolean;
    includeStack?: boolean;
}): (err: Error, c: Context) => Response | Promise<Response>;
export declare function throwValidationError(message: string): never;
export declare function throwNotFoundError(resource: string, id: string): never;
export declare function createSubmissionError(submissionId: string, state: SubmissionState, resumeToken: string, errorDetails: IntakeError['error']): SubmissionError;
//# sourceMappingURL=error-handler.d.ts.map