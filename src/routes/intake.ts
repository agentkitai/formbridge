/**
 * Intake Routes
 *
 * Provides endpoints for retrieving intake definitions and their schemas.
 * These endpoints allow clients (agents, frontends, etc.) to discover
 * available intakes and fetch their JSON Schema definitions.
 *
 * Endpoints:
 * - GET /intake/:id/schema - Retrieve JSON Schema for an intake definition
 *
 * Based on INTAKE_CONTRACT_SPEC.md §12.1 (HTTP/JSON Transport)
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { IntakeRegistry } from '../core/intake-registry.js';
import { IntakeNotFoundError } from '../core/intake-registry.js';
import type { JSONSchema } from '../submission-types.js';

/**
 * Response structure for GET /intake/:id/schema
 */
export interface GetSchemaResponse {
  ok: boolean;
  intakeId: string;
  schema: JSONSchema;
}

/**
 * Error response structure for intake endpoints
 */
export interface IntakeErrorResponse {
  ok: false;
  error: {
    type: 'not_found' | 'internal_error';
    message: string;
  };
}

/**
 * Creates a Hono router with intake endpoints
 *
 * @param registry - IntakeRegistry instance for retrieving intake definitions
 * @returns Configured Hono router
 */
export function createIntakeRouter(registry: IntakeRegistry): Hono {
  const router = new Hono();

  /**
   * GET /intake/:id/schema - Retrieve JSON Schema for an intake definition
   *
   * Returns the JSON Schema that defines the structure and validation rules
   * for a specific intake. This schema can be used by:
   * - Frontend forms to render input fields
   * - AI agents to understand required data structure
   * - Validation libraries to verify submissions
   *
   * @param id - The intake definition ID
   * @returns {GetSchemaResponse} The intake's JSON Schema
   * @returns {IntakeErrorResponse} 404 if intake not found
   *
   * Example:
   * GET /intake/vendor-onboarding/schema
   * -> { ok: true, intakeId: "vendor-onboarding", schema: {...} }
   */
  router.get('/:id/schema', async (c: Context) => {
    const intakeId = c.req.param('id');

    try {
      // Retrieve schema from registry
      const schema = registry.getSchema(intakeId);

      const response: GetSchemaResponse = {
        ok: true,
        intakeId,
        schema,
      };

      return c.json(response, 200);
    } catch (error) {
      // Handle intake not found
      if (error instanceof IntakeNotFoundError) {
        const errorResponse: IntakeErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: `Intake definition '${intakeId}' not found`,
          },
        };
        return c.json(errorResponse, 404);
      }

      // Handle unexpected errors
      const errorResponse: IntakeErrorResponse = {
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
 * Standalone handler for GET /intake/:id/schema
 * Can be mounted directly without creating a full router
 *
 * @param registry - IntakeRegistry instance
 */
export function createGetSchemaHandler(registry: IntakeRegistry) {
  return async (c: Context) => {
    const intakeId = c.req.param('id');

    try {
      const schema = registry.getSchema(intakeId);

      const response: GetSchemaResponse = {
        ok: true,
        intakeId,
        schema,
      };

      return c.json(response, 200);
    } catch (error) {
      if (error instanceof IntakeNotFoundError) {
        const errorResponse: IntakeErrorResponse = {
          ok: false,
          error: {
            type: 'not_found',
            message: `Intake definition '${intakeId}' not found`,
          },
        };
        return c.json(errorResponse, 404);
      }

      const errorResponse: IntakeErrorResponse = {
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
