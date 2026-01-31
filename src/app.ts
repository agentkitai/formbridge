/**
 * FormBridge App Factory
 *
 * Creates configured Hono applications for the FormBridge HTTP API.
 * Wires together routes, middleware, and core services.
 */

import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { createHealthRouter } from './routes/health.js';
import { createIntakeRouter } from './routes/intake.js';
import { createUploadRouter } from './routes/uploads.js';
import { createHonoSubmissionRouter } from './routes/hono-submissions.js';
import { createHonoEventRouter } from './routes/hono-events.js';
import { createHonoApprovalRouter } from './routes/hono-approvals.js';
import { createHonoWebhookRouter } from './routes/hono-webhooks.js';
import { createHonoAnalyticsRouter, type AnalyticsDataProvider } from './routes/hono-analytics.js';
import { createErrorHandler } from './middleware/error-handler.js';
import { createCorsMiddleware, type CorsOptions } from './middleware/cors.js';
import { IntakeRegistry } from './core/intake-registry.js';
import {
  SubmissionManager,
  SubmissionNotFoundError,
  InvalidResumeTokenError,
} from './core/submission-manager.js';
import { ApprovalManager } from './core/approval-manager.js';
import { InMemoryEventStore } from './core/event-store.js';
import { WebhookManager } from './core/webhook-manager.js';
import { Validator } from './core/validator.js';
import { z } from 'zod';
import type { IntakeDefinition } from './types.js';
import type { Submission } from './types.js';
import type {
  Actor,
  IntakeEvent,
} from './types/intake-contract.js';
import { redactEventTokens } from './routes/event-utils.js';

/** Reserved field names that cannot be set via API */
const RESERVED_FIELD_NAMES = new Set(['__proto__', 'constructor', 'prototype', '__uploads']);

/** Zod schema for actor validation */
const actorSchema = z.object({
  kind: z.enum(['agent', 'human', 'system']),
  id: z.string().min(1).max(255),
  name: z.string().max(255).optional(),
}).strict();

/** Parse and validate actor from request body */
function parseActor(raw: unknown): { ok: true; actor: Actor } | { ok: false; error: string } {
  const result = actorSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? 'Invalid actor' };
  }
  return { ok: true, actor: result.data as Actor };
}

/** Check for reserved field names in fields object */
function hasReservedFieldNames(fields: Record<string, unknown>): string | null {
  for (const key of Object.keys(fields)) {
    if (RESERVED_FIELD_NAMES.has(key)) {
      return key;
    }
  }
  return null;
}

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

  getAll(): Submission[] {
    return Array.from(this.submissions.values());
  }
}

/**
 * Bridging event emitter — fans out events to multiple listeners.
 */
class BridgingEventEmitter {
  private listeners: Array<(event: IntakeEvent) => Promise<void>> = [];

  addListener(listener: (event: IntakeEvent) => Promise<void>): void {
    this.listeners.push(listener);
  }

  async emit(event: IntakeEvent): Promise<void> {
    await Promise.all(this.listeners.map((fn) => fn(event)));
  }
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

  // Security headers
  app.use('*', secureHeaders());

  // Body size limit (1MB default)
  app.use('*', bodyLimit({ maxSize: 1024 * 1024 }));

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

  // Security headers
  app.use('*', secureHeaders());

  // Body size limit (1MB default)
  app.use('*', bodyLimit({ maxSize: 1024 * 1024 }));

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

  // Core services
  const store = new InMemorySubmissionStore();
  const eventStore = new InMemoryEventStore();
  const emitter = new BridgingEventEmitter();

  // Pass the shared eventStore to SubmissionManager — it already appends events
  // via its triple-write pattern (submission.events + emitter.emit + eventStore.appendEvent).
  // No need for an additional listener on the emitter to avoid duplicates.
  const manager = new SubmissionManager(store, emitter, registry, 'http://localhost:3000', undefined, eventStore);
  const approvalManager = new ApprovalManager(store, emitter);

  // Webhook manager — wired to receive events from the bridging emitter
  const signingSecret = process.env['FORMBRIDGE_WEBHOOK_SECRET'];
  if (!signingSecret) {
    console.warn('[FormBridge] WARNING: FORMBRIDGE_WEBHOOK_SECRET is not set. Webhooks will be delivered unsigned.');
  }
  const webhookManager = new WebhookManager(undefined, { signingSecret, eventEmitter: emitter });

  // Schema validator for HTTP API field validation
  const validator = new Validator({ strict: false, allowAdditionalProperties: true });

  // Analytics provider — reads from shared store
  const analyticsProvider: AnalyticsDataProvider = {
    getIntakeIds: () => registry.listIntakeIds(),
    getTotalSubmissions: () => store.getAll().length,
    getPendingApprovalCount: () => store.getAll().filter((s) => s.state === 'needs_review').length,
    getSubmissionsByState: () => {
      const byState: Record<string, number> = {};
      for (const sub of store.getAll()) {
        byState[sub.state] = (byState[sub.state] ?? 0) + 1;
      }
      return byState;
    },
    getRecentEvents: (limit) => {
      const allEvents: IntakeEvent[] = [];
      for (const sub of store.getAll()) {
        if (sub.events) allEvents.push(...sub.events);
      }
      allEvents.sort((a, b) => b.ts.localeCompare(a.ts));
      return allEvents.slice(0, limit);
    },
    getEventsByType: (type) => {
      const matched: IntakeEvent[] = [];
      for (const sub of store.getAll()) {
        if (sub.events) {
          for (const ev of sub.events) {
            if (ev.type === type) matched.push(ev);
          }
        }
      }
      return matched;
    },
  };

  // Hono route modules
  app.route('/', createHonoSubmissionRouter(manager));
  app.route('/', createHonoEventRouter(manager));
  app.route('/', createHonoApprovalRouter(approvalManager));

  // Upload routes
  app.route('/intake', createUploadRouter(registry, manager));

  // Webhook routes
  app.route('/', createHonoWebhookRouter(webhookManager));

  // Analytics routes
  app.route('/', createHonoAnalyticsRouter(analyticsProvider));

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

    // Validate actor using Zod schema
    const actorResult = parseActor(body.actor);
    if (!actorResult.ok) {
      return c.json(
        {
          ok: false,
          error: { type: 'invalid_request', message: `Invalid actor: ${actorResult.error}` },
        },
        400
      );
    }
    const actor = actorResult.actor;

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

    // Check initial fields for reserved names and validate against schema
    const initFields = body.initialFields || body.fields;
    if (initFields && typeof initFields === 'object') {
      const reservedKey = hasReservedFieldNames(initFields as Record<string, unknown>);
      if (reservedKey) {
        return c.json(
          {
            ok: false,
            error: { type: 'invalid_request', message: `Reserved field name '${reservedKey}' cannot be used` },
          },
          400
        );
      }

      // Validate initial fields against intake schema
      const intake = registry.getIntake(intakeId);
      const intakeSchema = intake.schema as import('./types.js').JSONSchema;
      if (intakeSchema.properties) {
        const partialSchema: import('./types.js').JSONSchema = {
          type: 'object',
          properties: {},
        };
        for (const fieldName of Object.keys(initFields as Record<string, unknown>)) {
          if (intakeSchema.properties[fieldName]) {
            partialSchema.properties![fieldName] = intakeSchema.properties[fieldName];
          }
        }
        const validationResult = validator.validate(initFields as Record<string, unknown>, partialSchema);
        if (!validationResult.valid) {
          return c.json(
            {
              ok: false,
              error: {
                type: 'validation_error',
                message: 'Initial field validation failed',
                fieldErrors: validationResult.errors,
              },
            },
            400
          );
        }
      }
    }

    // Create submission
    const result = await manager.createSubmission({
      intakeId,
      actor,
      idempotencyKey: body.idempotencyKey,
    });

    // If initial fields provided, set them via setFields to trigger state transition + token rotation
    if (initFields && Object.keys(initFields).length > 0) {
      const setResult = await manager.setFields({
        submissionId: result.submissionId,
        resumeToken: result.resumeToken,
        actor,
        fields: initFields,
      });

      if (setResult.ok) {
        const intake = registry.getIntake(intakeId);
        const schema = intake.schema as { required?: string[] };
        const requiredFields = schema.required ?? [];
        const providedFields = Object.keys(initFields as Record<string, unknown>);
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
    const { missingFields: _missingFields, ...rest } = result as unknown as Record<string, unknown>;
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
      fields: submission.fields,
      fieldAttribution: submission.fieldAttribution,
      metadata: {
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt,
        createdBy: submission.createdBy,
      },
      events: (submission.events ?? []).map(redactEventTokens),
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

    // Validate actor using Zod schema
    const actorResult = parseActor(body.actor);
    if (!actorResult.ok) {
      return c.json(
        {
          ok: false,
          error: { type: 'invalid_request', message: `Invalid actor: ${actorResult.error}` },
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

    // Check for reserved field names
    const reservedKey = hasReservedFieldNames(body.fields as Record<string, unknown>);
    if (reservedKey) {
      return c.json(
        {
          ok: false,
          error: { type: 'invalid_request', message: `Reserved field name '${reservedKey}' cannot be used` },
        },
        400
      );
    }

    // Validate fields against intake schema (partial validation — only validate provided fields)
    const intake = registry.getIntake(intakeId);
    const intakeSchema = intake.schema as import('./types.js').JSONSchema;
    if (intakeSchema.properties) {
      const partialSchema: import('./types.js').JSONSchema = {
        type: 'object',
        properties: {},
      };
      for (const fieldName of Object.keys(body.fields as Record<string, unknown>)) {
        if (intakeSchema.properties[fieldName]) {
          partialSchema.properties![fieldName] = intakeSchema.properties[fieldName];
        }
      }
      const validationResult = validator.validate(body.fields as Record<string, unknown>, partialSchema);
      if (!validationResult.valid) {
        return c.json(
          {
            ok: false,
            error: {
              type: 'validation_error',
              message: 'Field validation failed',
              fieldErrors: validationResult.errors,
            },
          },
          400
        );
      }
    }

    try {
      const result = await manager.setFields({
        submissionId,
        resumeToken: body.resumeToken,
        actor: actorResult.actor,
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
