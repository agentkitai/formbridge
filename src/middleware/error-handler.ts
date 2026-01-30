/**
 * Error Handler Middleware
 *
 * Provides centralized error handling middleware for the FormBridge API server.
 * Catches errors thrown by route handlers and formats them according to the
 * IntakeError schema from the Intake Contract specification (§3).
 *
 * This middleware ensures consistent error responses across all endpoints,
 * with proper HTTP status codes and structured error details that are
 * actionable for both AI agents and human clients.
 *
 * Based on INTAKE_CONTRACT_SPEC.md §3 (Error Schema)
 */

import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { IntakeError, SubmissionState } from '../types.js';
import {
  IntakeNotFoundError,
  IntakeDuplicateError,
  IntakeValidationError,
} from '../core/intake-registry.js';

/**
 * Generic error response structure for non-submission errors
 * (e.g., intake not found, invalid request)
 */
export interface ErrorResponse {
  ok: false;
  error: {
    type: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Custom error class for submission-related errors that need IntakeError formatting
 */
export class SubmissionError extends Error {
  constructor(
    public submissionId: string,
    public state: SubmissionState,
    public resumeToken: string,
    public intakeError: IntakeError['error']
  ) {
    super(intakeError.message || 'Submission error');
    this.name = 'SubmissionError';
  }

  /**
   * Converts this error to an IntakeError response
   */
  toIntakeError(): IntakeError {
    return {
      ok: false,
      submissionId: this.submissionId,
      state: this.state,
      resumeToken: this.resumeToken,
      error: this.intakeError,
    };
  }
}

/**
 * Maps error types to HTTP status codes
 */
function getStatusCodeForError(error: unknown): number {
  // HTTPException from Hono (explicitly set status)
  if (error instanceof HTTPException) {
    return error.status;
  }

  // Intake Registry errors
  if (error instanceof IntakeNotFoundError) {
    return 404;
  }
  if (error instanceof IntakeDuplicateError) {
    return 409;
  }
  if (error instanceof IntakeValidationError) {
    return 400;
  }

  // Submission errors map to 400-level codes based on error type
  if (error instanceof SubmissionError) {
    const errorType = error.intakeError.type;
    switch (errorType) {
      case 'missing':
      case 'invalid':
        return 400; // Bad request
      case 'conflict':
        return 409; // Conflict (idempotency key mismatch)
      case 'needs_approval':
        return 202; // Accepted but needs review
      case 'upload_pending':
        return 202; // Accepted but awaiting uploads
      case 'delivery_failed':
        return 502; // Bad gateway (delivery endpoint failed)
      case 'expired':
        return 410; // Gone
      case 'cancelled':
        return 410; // Gone
      default:
        return 400;
    }
  }

  // Default to 500 for unexpected errors
  return 500;
}

/**
 * Formats errors according to IntakeError schema or generic error response
 */
function formatError(error: unknown): IntakeError | ErrorResponse {
  // SubmissionError → IntakeError format
  if (error instanceof SubmissionError) {
    return error.toIntakeError();
  }

  // IntakeRegistry errors → Generic error response
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

  // HTTPException from Hono
  if (error instanceof HTTPException) {
    return {
      ok: false,
      error: {
        type: error.status >= 500 ? 'internal_error' : 'invalid_request',
        message: error.message,
      },
    };
  }

  // Generic Error
  if (error instanceof Error) {
    return {
      ok: false,
      error: {
        type: 'internal_error',
        message: process.env.NODE_ENV === 'production'
          ? 'An internal error occurred'
          : error.message,
      },
    };
  }

  // Unknown error type
  return {
    ok: false,
    error: {
      type: 'internal_error',
      message: 'Unknown error occurred',
    },
  };
}

/**
 * Error handler middleware factory
 *
 * Creates a Hono middleware that catches errors from route handlers
 * and formats them according to the IntakeError schema.
 *
 * Usage:
 * ```typescript
 * const app = new Hono();
 * app.onError(createErrorHandler());
 * ```
 *
 * @param options - Configuration options for error handling
 * @param options.logErrors - Whether to log errors to console (default: true in dev)
 * @param options.includeStack - Whether to include stack traces in development (default: NODE_ENV !== 'production')
 * @returns Hono error handler function
 */
export function createErrorHandler(options?: {
  logErrors?: boolean;
  includeStack?: boolean;
}): (err: Error, c: Context) => Response | Promise<Response> {
  const logErrors = options?.logErrors ?? process.env.NODE_ENV !== 'production';
  const includeStack = options?.includeStack ?? process.env.NODE_ENV !== 'production';

  return (err: Error, c: Context): Response => {
    // Log error if enabled
    if (logErrors) {
      console.error('[Error Handler]', err);
      if (includeStack && err.stack) {
        console.error(err.stack);
      }
    }

    // Format error response
    const statusCode = getStatusCodeForError(err);
    const errorResponse = formatError(err);

    // Add stack trace in development mode if requested
    if (includeStack && err.stack && 'error' in errorResponse) {
      (errorResponse.error as any).stack = err.stack;
    }

    return c.json(errorResponse, statusCode);
  };
}

/**
 * Request validation error helper
 *
 * Throws an HTTPException with 400 status for invalid request body/params
 *
 * @param message - Error message describing the validation failure
 */
export function throwValidationError(message: string): never {
  throw new HTTPException(400, { message });
}

/**
 * Not found error helper
 *
 * Throws an HTTPException with 404 status
 *
 * @param resource - The type of resource that wasn't found (e.g., "Submission", "Intake")
 * @param id - The ID of the resource that wasn't found
 */
export function throwNotFoundError(resource: string, id: string): never {
  throw new HTTPException(404, {
    message: `${resource} '${id}' not found`,
  });
}

/**
 * Creates a SubmissionError for validation failures
 *
 * Helper function to create submission errors that will be formatted
 * as IntakeError responses by the error handler middleware.
 *
 * @param submissionId - The submission ID
 * @param state - Current submission state
 * @param resumeToken - Resume token for this submission
 * @param errorDetails - IntakeError.error object with validation details
 * @returns SubmissionError instance to be thrown
 */
export function createSubmissionError(
  submissionId: string,
  state: SubmissionState,
  resumeToken: string,
  errorDetails: IntakeError['error']
): SubmissionError {
  return new SubmissionError(submissionId, state, resumeToken, errorDetails);
}
