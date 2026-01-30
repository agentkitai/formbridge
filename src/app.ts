/**
 * FormBridge App Factory
 *
 * Creates configured Hono applications for the FormBridge HTTP API.
 * Wires together routes, middleware, and core services.
 */

import { Hono } from 'hono';
import { createHealthRouter } from './routes/health.js';
import { createIntakeRouter } from './routes/intake.js';
import { createErrorHandler } from './middleware/error-handler.js';
import { createCorsMiddleware, type CorsOptions } from './middleware/cors.js';
import { IntakeRegistry } from './core/intake-registry.js';
import {
  SubmissionManager,
  SubmissionNotFoundError,
  InvalidResumeTokenError,
} from './core/submission-manager.js';
import type { IntakeDefinition } from './types.js';
import type { Submission } from './types.js';
import type {
  Actor,
  IntakeEvent,
} from './types/intake-contract.js';

/**
 * In-memory SubmissionStore for the app factory
 */
class InMemorySubmissionStore {
  private submissions = new Map<string, Submission>();
  private idempotencyIndex = new Map<string, string>(); // idempotencyKey -> submissionId

  async get(submissionId: string): Promise<Submission | null> {
    return this.submissions.get(submissionId) ?? null;
  }

  async save(submission: Submission): Promise<void> {
    this.submissions.set(submission.id, submission);
    if (submission.idempotencyKey) {
      this.idempotencyIndex.set(submission.idempotencyKey, submission.id);
    }
  }

  async getByResumeToken(resumeToken: string): Promise<Submission | null> {
    for (const sub of this.submissions.values()) {
      if (sub.resumeToken === resumeToken) {
        return sub;
      }
    }
    return null;
  }

  async getByIdempotencyKey(key: string): Promise<Submission | null> {
    const id = this.idempotencyIndex.get(key);
    if (!id) return null;
    return this.submissions.get(id) ?? null;
  }
}

/**
 * No-op event emitter
 */
class NoopEventEmitter {
  async emit(_event: IntakeEvent): Promise<void> {}
}

/**
 * Options for createFormBridgeApp
 */
export interface FormBridgeAppOptions {
  basePath?: string;
  cors?: CorsOptions;
}

/**
 * Creates a minimal FormBridge Hono app with health check and optional CORS.
 * Does not register any intakes.
 */
export function createFormBridgeApp(options?: FormBridgeAppOptions): Hono {
  const app = new Hono();

  // Error handler
  app.onError(createErrorHandler({ logErrors: false }));

  // CORS middleware
  if (options?.cors) {
    app.use('*', createCorsMiddleware(options.cors));
  }

  // Health check
  app.route('/health', createHealthRouter());

  return app;
}

/**
 * Creates a FormBridge Hono app pre-configured with intake definitions.
 * Sets up all routes: health, intake schema, submission CRUD.
 */
export function createFormBridgeAppWithIntakes(
  intakes: IntakeDefinition[],
  options?: FormBridgeAppOptions
): Hono {
  const app = new Hono();

  // Error handler
  app.onError(createErrorHandler({ logErrors: false }));

  // CORS middleware
  if (options?.cors) {
    app.use('*', createCorsMiddleware(options.cors));
  }

  // Health check
  app.route('/health', createHealthRouter());

  // Set up registry
  const registry = new IntakeRegistry({ validateOnRegister: true });
  for (const intake of intakes) {
    registry.registerIntake(intake);
  }

  // Intake schema routes
  app.route('/intake', createIntakeRouter(registry));

  // Submission routes
  const store = new InMemorySubmissionStore();
  const emitter = new NoopEventEmitter();
  const manager = new SubmissionManager(store, emitter, undefined, 'http://localhost:3000');

  // POST /intake/:intakeId/submissions — create submission
  app.post('/intake/:intakeId/submissions', async (c) => {
    const intakeId = c.req.param('intakeId');

    // Verify intake exists
    if (!registry.hasIntake(intakeId)) {
      return c.json(
        { ok: false, error: { type: 'not_found', message: `Intake '${intakeId}' not found` } },
        404
      );
    }

    const body = await c.req.json();

    // Validate actor
    if (!body.actor || !body.actor.kind || !body.actor.id) {
      return c.json(
        {
          ok: false,
          error: { type: 'invalid_request', message: 'actor with kind and id is required' },
        },
        400
      );
    }

    const actor = body.actor as Actor;

    // Handle idempotency: check if submission already exists for this key
    if (body.idempotencyKey) {
      const existing = await store.getByIdempotencyKey(body.idempotencyKey);
      if (existing) {
        const intake = registry.getIntake(intakeId);
        const schema = intake.schema as { required?: string[] };
        const requiredFields = schema.required ?? [];
        const providedFields = Object.keys(existing.fields);
        const missingFields = requiredFields.filter((f: string) => !providedFields.includes(f));

        return c.json(
          {
            ok: true,
            submissionId: existing.id,
            state: existing.state,
            resumeToken: existing.resumeToken,
            schema: intake.schema,
            missingFields: missingFields.length > 0 ? missingFields : undefined,
          },
          201
        );
      }
    }

    // Create submission
    const result = await manager.createSubmission({
      intakeId,
      actor,
      idempotencyKey: body.idempotencyKey,
    });

    // If initial fields provided, set them via setFields to trigger state transition + token rotation
    if (body.initialFields && Object.keys(body.initialFields).length > 0) {
      const setResult = await manager.setFields({
        submissionId: result.submissionId,
        resumeToken: result.resumeToken,
        actor,
        fields: body.initialFields,
      });

      if (setResult.ok) {
        const intake = registry.getIntake(intakeId);
        const schema = intake.schema as { required?: string[] };
        const requiredFields = schema.required ?? [];
        const providedFields = Object.keys(body.initialFields);
        const missingFields = requiredFields.filter((f: string) => !providedFields.includes(f));

        return c.json(
          {
            ok: true,
            submissionId: setResult.submissionId,
            state: setResult.state,
            resumeToken: setResult.resumeToken,
            schema: intake.schema,
            missingFields: missingFields.length > 0 ? missingFields : undefined,
          },
          201
        );
      }
    }

    // For submissions with no initial fields, omit missingFields
    const { missingFields, ...rest } = result as any;
    return c.json(rest, 201);
  });

  // GET /intake/:intakeId/submissions/:submissionId — get submission
  app.get('/intake/:intakeId/submissions/:submissionId', async (c) => {
    const intakeId = c.req.param('intakeId');
    const submissionId = c.req.param('submissionId');

    // Verify intake exists
    if (!registry.hasIntake(intakeId)) {
      return c.json(
        { ok: false, error: { type: 'not_found', message: `Intake '${intakeId}' not found` } },
        404
      );
    }

    const submission = await manager.getSubmission(submissionId);
    if (!submission) {
      return c.json(
        {
          ok: false,
          error: { type: 'not_found', message: `Submission '${submissionId}' not found` },
        },
        404
      );
    }

    // Verify submission belongs to this intake
    if (submission.intakeId !== intakeId) {
      return c.json(
        {
          ok: false,
          error: {
            type: 'not_found',
            message: `Submission '${submissionId}' not found for intake '${intakeId}'`,
          },
        },
        404
      );
    }

    return c.json({
      ok: true,
      submissionId: submission.id,
      intakeId: submission.intakeId,
      state: submission.state,
      resumeToken: submission.resumeToken,
      fields: submission.fields,
      fieldAttribution: submission.fieldAttribution,
      metadata: {
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt,
        createdBy: submission.createdBy,
      },
      events: submission.events,
    });
  });

  // PATCH /intake/:intakeId/submissions/:submissionId — update fields
  app.patch('/intake/:intakeId/submissions/:submissionId', async (c) => {
    const intakeId = c.req.param('intakeId');
    const submissionId = c.req.param('submissionId');

    // Verify intake exists
    if (!registry.hasIntake(intakeId)) {
      return c.json(
        { ok: false, error: { type: 'not_found', message: `Intake '${intakeId}' not found` } },
        404
      );
    }

    const body = await c.req.json();

    // Validate required fields
    if (!body.resumeToken) {
      return c.json(
        {
          ok: false,
          error: { type: 'invalid_request', message: 'resumeToken is required' },
        },
        400
      );
    }

    if (!body.actor || !body.actor.kind || !body.actor.id) {
      return c.json(
        {
          ok: false,
          error: { type: 'invalid_request', message: 'actor with kind and id is required' },
        },
        400
      );
    }

    if (!body.fields || typeof body.fields !== 'object' || Object.keys(body.fields).length === 0) {
      return c.json(
        {
          ok: false,
          error: { type: 'invalid_request', message: 'fields object is required' },
        },
        400
      );
    }

    try {
      const result = await manager.setFields({
        submissionId,
        resumeToken: body.resumeToken,
        actor: body.actor as Actor,
        fields: body.fields,
      });

      if (!result.ok) {
        // IntakeError — return appropriate status
        const error = result as { ok: false; error: { type: string } };
        const status = error.error.type === 'invalid_resume_token' ? 409 : 400;
        return c.json(result, status);
      }

      // Get updated submission for full response
      const submission = await manager.getSubmission(submissionId);

      return c.json({
        ...result,
        fields: submission?.fields,
      });
    } catch (error) {
      if (error instanceof SubmissionNotFoundError) {
        return c.json(
          {
            ok: false,
            error: { type: 'not_found', message: `Submission '${submissionId}' not found` },
          },
          404
        );
      }
      if (error instanceof InvalidResumeTokenError) {
        return c.json(
          {
            ok: false,
            error: { type: 'invalid_resume_token', message: 'Resume token is invalid or stale' },
          },
          409
        );
      }
      throw error;
    }
  });

  return app;
}
