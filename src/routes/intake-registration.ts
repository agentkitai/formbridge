/**
 * Intake Registration Routes (runtime intake management)
 *
 * Lets an authenticated caller register a typed intake at runtime over HTTP,
 * instead of only at startup via `createFormBridgeAppWithIntakes([...])` or over
 * MCP. The router writes into the SAME `IntakeRegistry` instance the submission
 * routes read from, so a freshly-registered intake is immediately usable by
 * `POST /intake/:intakeId/submissions`.
 *
 * Endpoints (mounted at `/intakes` in app.ts, guarded by `intake:write` /
 * `intake:read`):
 * - POST /intakes        — create a new intake (409 if the id already exists)
 * - PUT  /intakes/:id    — upsert (create if absent → 201, replace if present → 200)
 * - GET  /intakes/:id    — fetch a registered intake definition (redacted summary)
 *
 * Semantics: POST is create-only (idempotent id collisions surface as 409); use
 * PUT to update an existing intake. The `schema` field is JSON Schema on this
 * HTTP path (mirroring `IntakeDefinition.schema` for the HTTP/JSON transport).
 *
 * Based on INTAKE_CONTRACT_SPEC.md §11 (Intake Definitions).
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { IntakeRegistry } from '../core/intake-registry.js';
import {
  IntakeDuplicateError,
  IntakeValidationError,
  IntakeNotFoundError,
} from '../core/intake-registry.js';
import type { IntakeDefinition } from '../submission-types.js';

/** Runtime type guard for plain record objects. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Redacted, read-safe view of an intake definition for HTTP responses.
 *
 * Omits `destination.headers` so that secret-bearing webhook auth headers a
 * caller supplied at registration are never echoed back over the read path
 * (GET /intakes/:id is readable by any `intake:read` role, e.g. viewer).
 */
function toIntakeSummary(intake: IntakeDefinition): Record<string, unknown> {
  const { headers: _headers, ...destination } = intake.destination;
  return {
    id: intake.id,
    version: intake.version,
    name: intake.name,
    description: intake.description,
    schema: intake.schema,
    destination,
    approvalGates: intake.approvalGates,
    ttlMs: intake.ttlMs,
    uiHints: intake.uiHints,
  };
}

/**
 * Creates a Hono router with runtime intake-registration endpoints.
 *
 * @param registry - The shared IntakeRegistry the submission routes also read
 *   from. Registering here makes the intake immediately usable for submissions.
 */
export function createIntakeRegistrationRouter(registry: IntakeRegistry): Hono {
  const router = new Hono();

  /**
   * POST /intakes — register a new intake definition (create-only).
   *
   * Body is an `IntakeDefinition` (JSON-Schema `schema`). The registry validates
   * both the contract shape (id/version/name/schema/destination) and the schema
   * itself. Returns 201 with a redacted summary of the registered intake.
   *
   * - 400 on malformed JSON / invalid definition (validation error)
   * - 409 if an intake with the same id already exists (use PUT to update)
   */
  router.post('/', async (c: Context) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { ok: false, error: { type: 'invalid_request', message: 'Request body must be valid JSON' } },
        400
      );
    }

    if (!isRecord(body)) {
      return c.json(
        {
          ok: false,
          error: { type: 'invalid_request', message: 'Request body must be an intake definition object' },
        },
        400
      );
    }

    const intake = body as unknown as IntakeDefinition;

    try {
      // registerIntake validates the contract shape + schema and rejects a
      // duplicate id (registry is constructed with allowOverwrite: false).
      registry.registerIntake(intake);
    } catch (error) {
      if (error instanceof IntakeDuplicateError) {
        return c.json(
          {
            ok: false,
            error: {
              type: 'conflict',
              message: `${error.message} Use PUT /intakes/${String((body as { id?: unknown }).id ?? '')} to update it.`,
            },
          },
          409
        );
      }
      if (error instanceof IntakeValidationError) {
        return c.json(
          { ok: false, error: { type: 'validation_error', message: error.message } },
          400
        );
      }
      throw error;
    }

    const registered = registry.getIntake(intake.id);
    return c.json({ ok: true, intakeId: registered.id, intake: toIntakeSummary(registered) }, 201);
  });

  /**
   * PUT /intakes/:id — upsert an intake definition.
   *
   * Create if absent (201) or replace in place (200). The URL id is
   * authoritative: a body `id` that disagrees is rejected (400); an omitted body
   * `id` is filled from the URL. Validation runs before the store is mutated, so
   * a rejected update leaves the existing intake intact.
   */
  router.put('/:id', async (c: Context) => {
    const idParam = c.req.param('id')!;

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { ok: false, error: { type: 'invalid_request', message: 'Request body must be valid JSON' } },
        400
      );
    }

    if (!isRecord(body)) {
      return c.json(
        {
          ok: false,
          error: { type: 'invalid_request', message: 'Request body must be an intake definition object' },
        },
        400
      );
    }

    const bodyId = body['id'];
    if (bodyId !== undefined && bodyId !== idParam) {
      return c.json(
        {
          ok: false,
          error: {
            type: 'invalid_request',
            message: `Body id '${String(bodyId)}' does not match URL id '${idParam}'`,
          },
        },
        400
      );
    }

    // URL id is authoritative.
    const intake = { ...body, id: idParam } as unknown as IntakeDefinition;
    const existed = registry.hasIntake(idParam);

    try {
      registry.registerIntake(intake, { overwrite: true });
    } catch (error) {
      if (error instanceof IntakeValidationError) {
        return c.json(
          { ok: false, error: { type: 'validation_error', message: error.message } },
          400
        );
      }
      throw error;
    }

    const registered = registry.getIntake(idParam);
    return c.json(
      { ok: true, intakeId: registered.id, intake: toIntakeSummary(registered) },
      existed ? 200 : 201
    );
  });

  /**
   * GET /intakes/:id — fetch a registered intake definition (redacted summary).
   *
   * - 404 if the intake is not registered.
   */
  router.get('/:id', (c: Context) => {
    const idParam = c.req.param('id')!;
    try {
      const intake = registry.getIntake(idParam);
      return c.json({ ok: true, intakeId: intake.id, intake: toIntakeSummary(intake) }, 200);
    } catch (error) {
      if (error instanceof IntakeNotFoundError) {
        return c.json(
          { ok: false, error: { type: 'not_found', message: `Intake '${idParam}' not found` } },
          404
        );
      }
      throw error;
    }
  });

  return router;
}
