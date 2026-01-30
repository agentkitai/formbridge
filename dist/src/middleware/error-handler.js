import { HTTPException } from 'hono/http-exception';
import { IntakeNotFoundError, IntakeDuplicateError, IntakeValidationError, } from '../core/intake-registry.js';
export class SubmissionError extends Error {
    submissionId;
    state;
    resumeToken;
    intakeError;
    constructor(submissionId, state, resumeToken, intakeError) {
        super(intakeError.message || 'Submission error');
        this.submissionId = submissionId;
        this.state = state;
        this.resumeToken = resumeToken;
        this.intakeError = intakeError;
        this.name = 'SubmissionError';
    }
    toIntakeError() {
        return {
            ok: false,
            submissionId: this.submissionId,
            state: this.state,
            resumeToken: this.resumeToken,
            error: this.intakeError,
        };
    }
}
function getStatusCodeForError(error) {
    if (error instanceof HTTPException) {
        return error.status;
    }
    if (error instanceof IntakeNotFoundError) {
        return 404;
    }
    if (error instanceof IntakeDuplicateError) {
        return 409;
    }
    if (error instanceof IntakeValidationError) {
        return 400;
    }
    if (error instanceof SubmissionError) {
        const errorType = error.intakeError.type;
        switch (errorType) {
            case 'missing':
            case 'invalid':
                return 400;
            case 'conflict':
                return 409;
            case 'needs_approval':
                return 202;
            case 'upload_pending':
                return 202;
            case 'delivery_failed':
                return 502;
            case 'expired':
                return 410;
            case 'cancelled':
                return 410;
            default:
                return 400;
        }
    }
    return 500;
}
function formatError(error) {
    if (error instanceof SubmissionError) {
        return error.toIntakeError();
    }
    if (error instanceof IntakeNotFoundError) {
        return {
            ok: false,
            error: {
                type: 'not_found',
                message: error.message,
            },
        };
    }
    if (error instanceof IntakeDuplicateError) {
        return {
            ok: false,
            error: {
                type: 'conflict',
                message: error.message,
            },
        };
    }
    if (error instanceof IntakeValidationError) {
        return {
            ok: false,
            error: {
                type: 'invalid_request',
                message: error.message,
            },
        };
    }
    if (error instanceof HTTPException) {
        return {
            ok: false,
            error: {
                type: error.status >= 500 ? 'internal_error' : 'invalid_request',
                message: error.message,
            },
        };
    }
    if (error instanceof Error) {
        return {
            ok: false,
            error: {
                type: 'internal_error',
                message: error.message,
            },
        };
    }
    return {
        ok: false,
        error: {
            type: 'internal_error',
            message: 'Unknown error occurred',
        },
    };
}
export function createErrorHandler(options) {
    const logErrors = options?.logErrors ?? process.env.NODE_ENV !== 'production';
    const includeStack = options?.includeStack ?? process.env.NODE_ENV !== 'production';
    return (err, c) => {
        if (logErrors) {
            console.error('[Error Handler]', err);
            if (includeStack && err.stack) {
                console.error(err.stack);
            }
        }
        const statusCode = getStatusCodeForError(err);
        const errorResponse = formatError(err);
        if (includeStack && err.stack && 'error' in errorResponse) {
            errorResponse.error.stack = err.stack;
        }
        return c.json(errorResponse, statusCode);
    };
}
export function throwValidationError(message) {
    throw new HTTPException(400, { message });
}
export function throwNotFoundError(resource, id) {
    throw new HTTPException(404, {
        message: `${resource} '${id}' not found`,
    });
}
export function createSubmissionError(submissionId, state, resumeToken, errorDetails) {
    return new SubmissionError(submissionId, state, resumeToken, errorDetails);
}
//# sourceMappingURL=error-handler.js.map