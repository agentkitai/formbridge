/**
 * Submission Routes
 *
 * Provides endpoints for creating, retrieving, and updating submissions.
 * These endpoints implement the core submission lifecycle operations from
 * the Intake Contract specification.
 *
 * Endpoints:
 * - POST /intake/:id/submissions - Create a new submission
 * - GET /intake/:id/submissions/:submissionId - Retrieve submission status
 * - PATCH /intake/:id/submissions/:submissionId - Update submission fields
 *
 * Based on INTAKE_CONTRACT_SPEC.md §4.1, §4.2, §4.9 and §12.1 (HTTP/JSON Transport)
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { IntakeRegistry } from '../core/intake-registry.js';
import { IntakeNotFoundError } from '../core/intake-registry.js';
import type { SubmissionManager } from '../core/submission-manager.js';
import type {
  CreateSubmissionInput,
  CreateSubmissionOutput,
  SetFieldsInput,
  SetFieldsOutput,
  GetSubmissionOutput,
  IntakeError,
} from '../types.js';

/**
 * Error response structure for submission endpoints
 */
export interface SubmissionErrorResponse {
  ok: false;
  error: {
    type: 'not_found' | 'invalid_request' | 'invalid_resume_token' | 'internal_error';
    message: string;
    fields?: Array<{
      path: string;
      message: string;
    }>;
  };
}

/**
 * HTTP request body for POST /intake/:id/submissions
 */
export interface CreateSubmissionRequest {
  idempotencyKey?: string;
  actor: {
    kind: 'agent' | 'human' | 'system';
    id: string;
    name?: string;
    metadata?: Record<string, unknown>;
  };
  initialFields?: Record<string, unknown>;
  ttlMs?: number;
}

/**
 * HTTP request body for PATCH /intake/:id/submissions/:submissionId
 */
export interface UpdateSubmissionRequest {
  resumeToken: string;
  actor: {
    kind: 'agent' | 'human' | 'system';
    id: string;
    name?: string;
    metadata?: Record<string, unknown>;
  };
  fields: Record<string, unknown>;
}

/**
 * Creates a Hono router with submission endpoints
 *
 * @param registry - IntakeRegistry instance for retrieving intake definitions
 * @param submissionManager - SubmissionManager instance for managing submissions
 * @returns Configured Hono router
 */
export function createSubmissionRouter(
  registry: IntakeRegistry,
  submissionManager: SubmissionManager
): Hono {
  const router = new Hono();

  /**
   * POST /intake/:id/submissions - Create a new submission
   *
   * Creates a new submission for the specified intake definition.
   * Supports idempotency via optional idempotencyKey.
   * Initial fields can be provided to pre-fill the submission.
   *
   * Implements §4.1 createSubmission
   *
   * @param id - The intake definition ID
   * @body {CreateSubmissionRequest} Request body with actor and optional fields
   * @returns {CreateSubmissionOutput} The created submission with resume token
   * @returns {SubmissionErrorResponse} 404 if intake not found, 400 for invalid request
   *
   * Example:
   * POST /intake/vendor-onboarding/submissions
   * Body: {
   *   "actor": { "kind": "agent", "id": "claude-assistant" },
   *   "initialFields": { "companyName": "Acme Corp" }
   * }
   * -> {
   *   "ok": true,
   *   "submissionId": "sub_abc123",
   *   "state": "in_progress",
   *   "resumeToken": "rtok_xyz789",
   *   "schema": {...},
   *   "missingFields": ["taxId", "address"]
   * }
   */
  router.post('/:id/submissions', async (c: Context) => {
    const intakeId = c.req.param('id');

    try {
      // Parse request body
      const body = await c.req.json<CreateSubmissionRequest>();

      // Validate required fields
      if (!body.actor || !body.actor.kind || !body.actor.id) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_request',
            message: 'Missing required field: actor (with kind and id)',
          },
        };
        return c.json(errorResponse, 400);
      }

      // Retrieve intake definition
      const intakeDefinition = registry.getIntake(intakeId);

      // Create submission input
      const input: CreateSubmissionInput = {
        intakeId,
        idempotencyKey: body.idempotencyKey,
        actor: body.actor,
        initialFields: body.initialFields,
        ttlMs: body.ttlMs,
      };

      // Create submission
      const result = submissionManager.createSubmission(input, intakeDefinition);

      return c.json(result, 201);
    } catch (error) {
      // Handle intake not found
      if (error instanceof IntakeNotFoundError) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: `Intake definition '${intakeId}' not found`,
          },
        };
        return c.json(errorResponse, 404);
      }

      // Handle unexpected errors
      const errorResponse: SubmissionErrorResponse = {
        ok: false,
        error: {
          type: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * GET /intake/:id/submissions/:submissionId - Retrieve submission status
   *
   * Returns the current state, fields, and metadata for a submission.
   * Checks for expiration and updates state if TTL has elapsed.
   * Includes current validation errors if any fields are missing or invalid.
   *
   * Implements §4.9 getSubmission
   *
   * @param id - The intake definition ID
   * @param submissionId - The submission ID
   * @returns {GetSubmissionOutput} Submission status and data
   * @returns {SubmissionErrorResponse} 404 if intake or submission not found
   *
   * Example:
   * GET /intake/vendor-onboarding/submissions/sub_abc123
   * -> {
   *   "ok": true,
   *   "submissionId": "sub_abc123",
   *   "state": "in_progress",
   *   "resumeToken": "rtok_xyz789",
   *   "intakeId": "vendor-onboarding",
   *   "fields": { "companyName": "Acme Corp" },
   *   "metadata": {
   *     "createdAt": "2024-01-01T00:00:00Z",
   *     "updatedAt": "2024-01-01T00:00:00Z",
   *     "createdBy": { "kind": "agent", "id": "claude-assistant" },
   *     "expiresAt": "2024-01-08T00:00:00Z"
   *   },
   *   "errors": [...]
   * }
   */
  router.get('/:id/submissions/:submissionId', async (c: Context) => {
    const intakeId = c.req.param('id');
    const submissionId = c.req.param('submissionId');

    try {
      // Retrieve intake definition
      const intakeDefinition = registry.getIntake(intakeId);

      // Get submission
      const result = submissionManager.getSubmission(
        { submissionId },
        intakeDefinition
      );

      // Verify submission belongs to this intake
      if (result.intakeId !== intakeId) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: `Submission '${submissionId}' not found for intake '${intakeId}'`,
          },
        };
        return c.json(errorResponse, 404);
      }

      return c.json(result, 200);
    } catch (error) {
      // Handle intake not found
      if (error instanceof IntakeNotFoundError) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: `Intake definition '${intakeId}' not found`,
          },
        };
        return c.json(errorResponse, 404);
      }

      // Handle submission not found
      if (error instanceof Error && error.message.includes('not found')) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: `Submission '${submissionId}' not found`,
          },
        };
        return c.json(errorResponse, 404);
      }

      // Handle unexpected errors
      const errorResponse: SubmissionErrorResponse = {
        ok: false,
        error: {
          type: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      };
      return c.json(errorResponse, 500);
    }
  });

  /**
   * PATCH /intake/:id/submissions/:submissionId - Update submission fields
   *
   * Sets or updates fields on an existing submission.
   * Requires valid resume token for optimistic concurrency control.
   * Returns new resume token and validation errors if any.
   * Transitions from 'draft' to 'in_progress' if this is the first update.
   *
   * Implements §4.2 setFields
   *
   * @param id - The intake definition ID
   * @param submissionId - The submission ID
   * @body {UpdateSubmissionRequest} Request body with resume token, actor, and fields
   * @returns {SetFieldsOutput} Updated submission state with new resume token
   * @returns {SubmissionErrorResponse} 404 if not found, 400 for invalid request, 409 for invalid resume token
   *
   * Example:
   * PATCH /intake/vendor-onboarding/submissions/sub_abc123
   * Body: {
   *   "resumeToken": "rtok_xyz789",
   *   "actor": { "kind": "agent", "id": "claude-assistant" },
   *   "fields": { "taxId": "12-3456789", "address": "123 Main St" }
   * }
   * -> {
   *   "ok": true,
   *   "submissionId": "sub_abc123",
   *   "state": "in_progress",
   *   "resumeToken": "rtok_new123",
   *   "fields": { "companyName": "Acme Corp", "taxId": "12-3456789", "address": "123 Main St" },
   *   "errors": [...],
   *   "nextActions": [...]
   * }
   */
  router.patch('/:id/submissions/:submissionId', async (c: Context) => {
    const intakeId = c.req.param('id');
    const submissionId = c.req.param('submissionId');

    try {
      // Parse request body
      const body = await c.req.json<UpdateSubmissionRequest>();

      // Validate required fields
      if (!body.resumeToken) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_request',
            message: 'Missing required field: resumeToken',
          },
        };
        return c.json(errorResponse, 400);
      }

      if (!body.actor || !body.actor.kind || !body.actor.id) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_request',
            message: 'Missing required field: actor (with kind and id)',
          },
        };
        return c.json(errorResponse, 400);
      }

      if (!body.fields || typeof body.fields !== 'object') {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_request',
            message: 'Missing required field: fields (must be an object)',
          },
        };
        return c.json(errorResponse, 400);
      }

      // Retrieve intake definition
      const intakeDefinition = registry.getIntake(intakeId);

      // Create setFields input
      const input: SetFieldsInput = {
        submissionId,
        resumeToken: body.resumeToken,
        actor: body.actor,
        fields: body.fields,
      };

      // Update fields
      const result = submissionManager.setFields(input, intakeDefinition);

      return c.json(result, 200);
    } catch (error) {
      // Handle intake not found
      if (error instanceof IntakeNotFoundError) {
        const errorResponse: SubmissionErrorResponse = {
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
        const errorResponse: SubmissionErrorResponse = {
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
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: `Submission '${submissionId}' not found`,
          },
        };
        return c.json(errorResponse, 404);
      }

      // Handle unexpected errors
      const errorResponse: SubmissionErrorResponse = {
        ok: false,
        error: {
          type: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      };
      return c.json(errorResponse, 500);
    }
  });

  return router;
}

/**
 * Standalone handler factory for POST /intake/:id/submissions
 * Can be mounted directly without creating a full router
 *
 * @param registry - IntakeRegistry instance
 * @param submissionManager - SubmissionManager instance
 */
export function createCreateSubmissionHandler(
  registry: IntakeRegistry,
  submissionManager: SubmissionManager
) {
  return async (c: Context) => {
    const intakeId = c.req.param('id');

    try {
      const body = await c.req.json<CreateSubmissionRequest>();

      if (!body.actor || !body.actor.kind || !body.actor.id) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_request',
            message: 'Missing required field: actor (with kind and id)',
          },
        };
        return c.json(errorResponse, 400);
      }

      const intakeDefinition = registry.getIntake(intakeId);

      const input: CreateSubmissionInput = {
        intakeId,
        idempotencyKey: body.idempotencyKey,
        actor: body.actor,
        initialFields: body.initialFields,
        ttlMs: body.ttlMs,
      };

      const result = submissionManager.createSubmission(input, intakeDefinition);

      return c.json(result, 201);
    } catch (error) {
      if (error instanceof IntakeNotFoundError) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: `Intake definition '${intakeId}' not found`,
          },
        };
        return c.json(errorResponse, 404);
      }

      const errorResponse: SubmissionErrorResponse = {
        ok: false,
        error: {
          type: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      };
      return c.json(errorResponse, 500);
    }
  };
}

/**
 * Standalone handler factory for GET /intake/:id/submissions/:submissionId
 * Can be mounted directly without creating a full router
 *
 * @param registry - IntakeRegistry instance
 * @param submissionManager - SubmissionManager instance
 */
export function createGetSubmissionHandler(
  registry: IntakeRegistry,
  submissionManager: SubmissionManager
) {
  return async (c: Context) => {
    const intakeId = c.req.param('id');
    const submissionId = c.req.param('submissionId');

    try {
      const intakeDefinition = registry.getIntake(intakeId);
      const result = submissionManager.getSubmission(
        { submissionId },
        intakeDefinition
      );

      if (result.intakeId !== intakeId) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: `Submission '${submissionId}' not found for intake '${intakeId}'`,
          },
        };
        return c.json(errorResponse, 404);
      }

      return c.json(result, 200);
    } catch (error) {
      if (error instanceof IntakeNotFoundError) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: `Intake definition '${intakeId}' not found`,
          },
        };
        return c.json(errorResponse, 404);
      }

      if (error instanceof Error && error.message.includes('not found')) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: `Submission '${submissionId}' not found`,
          },
        };
        return c.json(errorResponse, 404);
      }

      const errorResponse: SubmissionErrorResponse = {
        ok: false,
        error: {
          type: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      };
      return c.json(errorResponse, 500);
    }
  };
}

/**
 * Standalone handler factory for PATCH /intake/:id/submissions/:submissionId
 * Can be mounted directly without creating a full router
 *
 * @param registry - IntakeRegistry instance
 * @param submissionManager - SubmissionManager instance
 */
export function createUpdateSubmissionHandler(
  registry: IntakeRegistry,
  submissionManager: SubmissionManager
) {
  return async (c: Context) => {
    const intakeId = c.req.param('id');
    const submissionId = c.req.param('submissionId');

    try {
      const body = await c.req.json<UpdateSubmissionRequest>();

      if (!body.resumeToken) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_request',
            message: 'Missing required field: resumeToken',
          },
        };
        return c.json(errorResponse, 400);
      }

      if (!body.actor || !body.actor.kind || !body.actor.id) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_request',
            message: 'Missing required field: actor (with kind and id)',
          },
        };
        return c.json(errorResponse, 400);
      }

      if (!body.fields || typeof body.fields !== 'object') {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_request',
            message: 'Missing required field: fields (must be an object)',
          },
        };
        return c.json(errorResponse, 400);
      }

      const intakeDefinition = registry.getIntake(intakeId);

      const input: SetFieldsInput = {
        submissionId,
        resumeToken: body.resumeToken,
        actor: body.actor,
        fields: body.fields,
      };

      const result = submissionManager.setFields(input, intakeDefinition);

      return c.json(result, 200);
    } catch (error) {
      if (error instanceof IntakeNotFoundError) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: `Intake definition '${intakeId}' not found`,
          },
        };
        return c.json(errorResponse, 404);
      }

      if (error instanceof Error && error.message.includes('Invalid resume token')) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'invalid_resume_token',
            message: 'Invalid or expired resume token',
          },
        };
        return c.json(errorResponse, 409);
      }

      if (error instanceof Error && error.message.includes('not found')) {
        const errorResponse: SubmissionErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: `Submission '${submissionId}' not found`,
          },
        };
        return c.json(errorResponse, 404);
      }

      const errorResponse: SubmissionErrorResponse = {
        ok: false,
        error: {
          type: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      };
      return c.json(errorResponse, 500);
    }
  };
}
