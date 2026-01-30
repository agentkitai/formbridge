/**
 * Upload Routes
 *
 * Provides endpoints for file upload negotiation.
 * These endpoints implement the upload lifecycle operations from
 * the Intake Contract specification.
 *
 * Endpoints:
 * - POST /intake/:id/submissions/:sid/uploads - Request a signed upload URL
 * - POST /intake/:id/submissions/:sid/uploads/:uploadId/confirm - Confirm upload completion
 *
 * Based on INTAKE_CONTRACT_SPEC.md §4.4, §4.5 and §12.1 (HTTP/JSON Transport)
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { IntakeRegistry } from '../core/intake-registry.js';
import { IntakeNotFoundError } from '../core/intake-registry.js';
import type {
  SubmissionManager,
  RequestUploadInput,
  ConfirmUploadInput,
} from '../core/submission-manager.js';

/**
 * Error response structure for upload endpoints
 */
export interface UploadErrorResponse {
  ok: false;
  error: {
    type: 'not_found' | 'invalid_request' | 'invalid_resume_token' | 'internal_error' | 'storage_error';
    message: string;
  };
}

/**
 * HTTP request body for POST /intake/:id/submissions/:sid/uploads
 */
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

/**
 * HTTP request body for POST /intake/:id/submissions/:sid/uploads/:uploadId/confirm
 */
export interface ConfirmUploadRequest {
  resumeToken: string;
  actor: {
    kind: 'agent' | 'human' | 'system';
    id: string;
    name?: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Creates a Hono router with upload endpoints
 *
 * @param registry - IntakeRegistry instance for retrieving intake definitions
 * @param submissionManager - SubmissionManager instance for managing submissions
 * @returns Configured Hono router
 */
export function createUploadRouter(
  registry: IntakeRegistry,
  submissionManager: SubmissionManager
): Hono {
  const router = new Hono();

  /**
   * POST /intake/:id/submissions/:sid/uploads - Request a signed upload URL
   *
   * Initiates the upload negotiation process by generating a signed URL
   * that the client can use to upload a file directly to the storage backend.
   * The URL is time-limited and includes validation constraints.
   *
   * Implements §4.4 requestUpload
   *
   * @param id - The intake definition ID
   * @param sid - The submission ID
   * @body {RequestUploadRequest} Request body with field details and actor
   * @returns {RequestUploadOutput} Signed upload URL with constraints
   * @returns {UploadErrorResponse} 404 if intake/submission not found, 400 for invalid request
   *
   * Example:
   * POST /intake/vendor-onboarding/submissions/sub_abc123/uploads
   * Body: {
   *   "resumeToken": "rtok_xyz789",
   *   "actor": { "kind": "agent", "id": "claude-assistant" },
   *   "field": "documents.w9",
   *   "filename": "w9-form.pdf",
   *   "mimeType": "application/pdf",
   *   "sizeBytes": 524288
   * }
   * -> {
   *   "ok": true,
   *   "uploadId": "upl_123abc",
   *   "method": "PUT",
   *   "url": "https://storage.example.com/signed-url",
   *   "expiresInMs": 900000,
   *   "constraints": {
   *     "accept": ["application/pdf"],
   *     "maxBytes": 10485760
   *   }
   * }
   */
  router.post('/:id/submissions/:sid/uploads', async (c: Context) => {
    const intakeId = c.req.param('id');
    const submissionId = c.req.param('sid');

    try {
      // Parse request body
      const body = await c.req.json<RequestUploadRequest>();

      // Validate required fields
      if (!body.resumeToken) {
        const errorResponse: UploadErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_request',
            message: 'Missing required field: resumeToken',
          },
        };
        return c.json(errorResponse, 400);
      }

      if (!body.actor || !body.actor.kind || !body.actor.id) {
        const errorResponse: UploadErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_request',
            message: 'Missing required field: actor (with kind and id)',
          },
        };
        return c.json(errorResponse, 400);
      }

      if (!body.field || !body.filename || !body.mimeType || typeof body.sizeBytes !== 'number') {
        const errorResponse: UploadErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_request',
            message: 'Missing required fields: field, filename, mimeType, sizeBytes',
          },
        };
        return c.json(errorResponse, 400);
      }

      if (!Number.isFinite(body.sizeBytes) || body.sizeBytes <= 0 || !Number.isInteger(body.sizeBytes)) {
        const errorResponse: UploadErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_request',
            message: 'sizeBytes must be a positive integer',
          },
        };
        return c.json(errorResponse, 400);
      }

      // Retrieve intake definition
      const intakeDefinition = registry.getIntake(intakeId);

      // Create request upload input
      const input: RequestUploadInput = {
        submissionId,
        resumeToken: body.resumeToken,
        field: body.field,
        filename: body.filename,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        actor: body.actor,
      };

      // Request upload from submission manager
      const result = await submissionManager.requestUpload(input, intakeDefinition);

      return c.json(result, 201);
    } catch (error) {
      // Handle intake not found
      if (error instanceof IntakeNotFoundError) {
        const errorResponse: UploadErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: `Intake definition '${intakeId}' not found`,
          },
        };
        return c.json(errorResponse, 404);
      }

      // Handle invalid resume token
      if (error instanceof Error && error.message.includes('Invalid resume token')) {
        const errorResponse: UploadErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_resume_token',
            message: 'Invalid or expired resume token',
          },
        };
        return c.json(errorResponse, 409);
      }

      // Handle submission not found
      if (error instanceof Error && error.message.includes('not found')) {
        const errorResponse: UploadErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: 'Submission or resource not found',
          },
        };
        return c.json(errorResponse, 404);
      }

      // Handle storage backend errors
      if (error instanceof Error && error.message.includes('Storage backend')) {
        const errorResponse: UploadErrorResponse = {
          ok: false,
          error: {
            type: 'storage_error',
            message: 'Storage backend error',
          },
        };
        return c.json(errorResponse, 500);
      }

      // Handle unexpected errors
      const errorResponse: UploadErrorResponse = {
        ok: false,
        error: {
          type: 'internal_error',
          message: 'An internal error occurred',
        },
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * POST /intake/:id/submissions/:sid/uploads/:uploadId/confirm - Confirm upload completion
   *
   * Verifies that a file upload has been completed successfully
   * and updates the submission state accordingly. The storage backend
   * validates that the file was uploaded and meets all constraints.
   *
   * Implements §4.5 confirmUpload
   *
   * @param id - The intake definition ID
   * @param sid - The submission ID
   * @param uploadId - The upload ID from requestUpload
   * @body {ConfirmUploadRequest} Request body with resume token and actor
   * @returns {ConfirmUploadOutput} Confirmation status with updated resume token
   * @returns {UploadErrorResponse} 404 if not found, 401 for invalid token, 400 for failed upload
   *
   * Example:
   * POST /intake/vendor-onboarding/submissions/sub_abc123/uploads/upl_123abc/confirm
   * Body: {
   *   "resumeToken": "rtok_xyz789",
   *   "actor": { "kind": "agent", "id": "claude-assistant" }
   * }
   * -> {
   *   "ok": true,
   *   "submissionId": "sub_abc123",
   *   "state": "in_progress",
   *   "resumeToken": "rtok_new456",
   *   "field": "documents.w9"
   * }
   */
  router.post('/:id/submissions/:sid/uploads/:uploadId/confirm', async (c: Context) => {
    const intakeId = c.req.param('id');
    const submissionId = c.req.param('sid');
    const uploadId = c.req.param('uploadId');

    try {
      // Parse request body
      const body = await c.req.json<ConfirmUploadRequest>();

      // Validate required fields
      if (!body.resumeToken) {
        const errorResponse: UploadErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_request',
            message: 'Missing required field: resumeToken',
          },
        };
        return c.json(errorResponse, 400);
      }

      if (!body.actor || !body.actor.kind || !body.actor.id) {
        const errorResponse: UploadErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_request',
            message: 'Missing required field: actor (with kind and id)',
          },
        };
        return c.json(errorResponse, 400);
      }

      // Verify intake exists (even though we don't use it, validates the route)
      registry.getIntake(intakeId);

      // Create confirm upload input
      const input: ConfirmUploadInput = {
        submissionId,
        resumeToken: body.resumeToken,
        uploadId,
        actor: body.actor,
      };

      // Confirm upload with submission manager
      const result = await submissionManager.confirmUpload(input);

      return c.json(result, 200);
    } catch (error) {
      // Handle intake not found
      if (error instanceof IntakeNotFoundError) {
        const errorResponse: UploadErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: `Intake definition '${intakeId}' not found`,
          },
        };
        return c.json(errorResponse, 404);
      }

      // Handle invalid resume token
      if (error instanceof Error && error.message.includes('Invalid resume token')) {
        const errorResponse: UploadErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_resume_token',
            message: 'Invalid or expired resume token',
          },
        };
        return c.json(errorResponse, 409);
      }

      // Handle submission or upload not found
      if (error instanceof Error && error.message.includes('not found')) {
        const errorResponse: UploadErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: 'Submission or resource not found',
          },
        };
        return c.json(errorResponse, 404);
      }

      // Handle upload verification failures
      if (error instanceof Error && error.message.includes('verification failed')) {
        const errorResponse: UploadErrorResponse = {
          ok: false,
          error: {
            type: 'storage_error',
            message: 'Upload verification failed',
          },
        };
        return c.json(errorResponse, 400);
      }

      // Handle storage backend errors
      if (error instanceof Error && error.message.includes('Storage backend')) {
        const errorResponse: UploadErrorResponse = {
          ok: false,
          error: {
            type: 'storage_error',
            message: 'Storage backend error',
          },
        };
        return c.json(errorResponse, 500);
      }

      // Handle unexpected errors
      const errorResponse: UploadErrorResponse = {
        ok: false,
        error: {
          type: 'internal_error',
          message: 'An internal error occurred',
        },
      };
      return c.json(errorResponse, 500);
    }
  });

  return router;
}
