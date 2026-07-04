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
import { createProbeRouter } from './routes/probes.js';
import { createIntakeRouter } from './routes/intake.js';
import { createUploadRouter } from './routes/uploads.js';
import { createHonoSubmissionRouter } from './routes/hono-submissions.js';
import { createHonoEventRouter } from './routes/hono-events.js';
import { createHonoWellKnownRouter } from './routes/hono-well-known.js';
import { createHonoReceiptRouter } from './routes/hono-receipts.js';
import { loadReceiptManagerFromEnv } from './core/receipt-manager.js';
import { createHonoApprovalRouter } from './routes/hono-approvals.js';
import { createHonoWebhookRouter } from './routes/hono-webhooks.js';
import { createHonoAnalyticsRouter, type AnalyticsDataProvider, type IntakeMetrics } from './routes/hono-analytics.js';
import { createErrorHandler } from './middleware/error-handler.js';
import { createCorsMiddleware, type CorsOptions } from './middleware/cors.js';
import { createAuthMiddleware, requirePermission, getRequestTenantId, matchesTenantScope, type AuthConfig } from './auth/middleware.js';
import { loadAuthConfigFromEnv } from './auth/config.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { requestLoggerMiddleware } from './middleware/request-logger.js';
import { getLogger } from './logging.js';
import type { FormBridgeStorage, SubmissionStorage } from './storage/storage-interface.js';
import { MemoryStorage } from './storage/memory-storage.js';
import { createStorageFromEnv } from './storage/storage-factory.js';
import { IntakeRegistry } from './core/intake-registry.js';
import {
  SubmissionManager,
  SubmissionNotFoundError,
  InvalidResumeTokenError,
} from './core/submission-manager.js';
import { ApprovalManager } from './core/approval-manager.js';
import { approvalDelegateFromEnv } from './core/agentgate-delegate.js';
import { createPiiRedactor } from './core/pii-redactor.js';
import type { EventStore } from './core/event-store.js';
import type { DeliveryQueue } from './core/delivery-queue.js';
import { WebhookManager } from './core/webhook-manager.js';
import { Validator } from './core/validator.js';
import type { IntakeDefinition } from './submission-types.js';
import type { IntakeEvent } from './types/intake-contract.js';
import { BridgingEventEmitter } from './core/bridging-event-emitter.js';
import { WebhookNotifierImpl } from './core/webhook-notifier-impl.js';
import { ExpiryScheduler } from './core/expiry-scheduler.js';
import { redactEventTokens } from './routes/event-sanitizer.js';
import { attachMetricsListeners, getMetricsText, getMetricsContentType } from './metrics.js';
import { parseActor } from './routes/shared/actor-validation.js';
import { SubmissionId, IntakeId, ResumeToken } from "./types/branded.js";

/** Reserved field names that cannot be set via API */
const RESERVED_FIELD_NAMES = new Set(['__proto__', 'constructor', 'prototype', '__uploads']);

/** Runtime type guard for plain record objects */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function extractSchemaRequired(schema: unknown): { required?: string[] } {
  if (schema && typeof schema === 'object' && 'required' in schema) {
    const { required } = schema;
    if (Array.isArray(required) && required.every((item): item is string => typeof item === 'string')) {
      return { required };
    }
  }
  return {};
}

function isSchemaWithProperties(schema: unknown): schema is import('./submission-types.js').JSONSchema {
  return (
    schema != null &&
    typeof schema === 'object' &&
    'properties' in schema &&
    schema.properties != null &&
    typeof schema.properties === 'object'
  );
}

function extractSchemaProperties(schema: unknown): import('./submission-types.js').JSONSchema | undefined {
  if (isSchemaWithProperties(schema)) {
    return schema;
  }
  return undefined;
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
 * Options for createFormBridgeApp
 */
export interface FormBridgeAppOptions {
  basePath?: string;
  cors?: CorsOptions;
  auth?: AuthConfig;
  storage?: FormBridgeStorage;
  /** When true, skip registering /metrics on the main app (served on separate METRICS_PORT) */
  skipMetricsRoute?: boolean;
}

/**
 * The bundle of core services wired to a single storage backend. Returned by
 * createSubmissionServices and consumed by the app factory.
 */
export interface SubmissionServices {
  storage: FormBridgeStorage;
  store: SubmissionStorage;
  eventStore: EventStore;
  deliveryQueue: DeliveryQueue;
  emitter: BridgingEventEmitter;
  manager: SubmissionManager;
  approvalManager: ApprovalManager;
  webhookManager: WebhookManager;
  analyticsProvider: AnalyticsDataProvider;
  expiryScheduler: ExpiryScheduler;
  receiptManager: ReturnType<typeof loadReceiptManagerFromEnv>;
}

interface WireSubmissionServicesOptions {
  registry: IntakeRegistry;
  storage: FormBridgeStorage;
  baseUrl?: string;
  logger?: ReturnType<typeof getLogger>;
}

/** Optional analytics-only methods present on the in-memory event store. */
interface AnalyticsEventStore {
  getRecentEventsAll(limit: number): IntakeEvent[];
  getEventsByTypeAll(type: string): IntakeEvent[];
}

function hasAnalyticsEventMethods(
  es: EventStore
): es is EventStore & AnalyticsEventStore {
  const candidate = es as Partial<AnalyticsEventStore>;
  return (
    typeof candidate.getRecentEventsAll === 'function' &&
    typeof candidate.getEventsByTypeAll === 'function'
  );
}

/**
 * Wire the core submission services to an already-initialized storage backend.
 * Synchronous: constructing the managers requires no async work — the async
 * part is creating/initializing the storage (see createSubmissionServices).
 */
export function wireSubmissionServices(
  opts: WireSubmissionServicesOptions
): SubmissionServices {
  const { registry, storage } = opts;
  const logger = opts.logger ?? getLogger();
  const baseUrl = opts.baseUrl ?? 'http://localhost:3000';

  const store = storage.submissions;
  const eventStore = storage.events;
  const deliveryQueue = storage.deliveries;
  const emitter = new BridgingEventEmitter();

  // Attach Prometheus metrics listeners to the event emitter.
  attachMetricsListeners(emitter);

  // Provenance receipt signer (#15) — issues JWT-VC receipts at finalize.
  // Unsigned mode when FORMBRIDGE_RECEIPT_PRIVATE_KEY is unset (finalize still works).
  const receiptManager = loadReceiptManagerFromEnv(baseUrl);

  // SubmissionManager owns the event-sourced write path. Passing `storage`
  // enables the transactional save-before-emit path; store/eventStore point at
  // the same backend for reads and the legacy interface surface.
  const manager = new SubmissionManager({
    store,
    eventEmitter: emitter,
    intakeRegistry: registry,
    baseUrl,
    eventStore,
    storage,
    piiRedactor: createPiiRedactor(),
    receiptManager,
  });

  // Webhook manager — durable outbox from the storage backend is injected.
  const signingSecret = process.env['FORMBRIDGE_WEBHOOK_SECRET'];
  if (!signingSecret) {
    logger.warn('FORMBRIDGE_WEBHOOK_SECRET is not set. Webhooks will be delivered unsigned.');
  }
  const webhookManager = new WebhookManager(deliveryQueue, { signingSecret, eventEmitter: emitter });

  // Start webhook delivery retry scheduler (checks every 30s)
  webhookManager.startRetryScheduler();

  // Webhook notifier for approval reviewer notifications
  const reviewerNotificationUrl = process.env['FORMBRIDGE_REVIEWER_WEBHOOK_URL'];
  const webhookNotifier = new WebhookNotifierImpl(webhookManager, reviewerNotificationUrl);
  // Optionally delegate the approval gate to AgentGate (#12); undefined when
  // FORMBRIDGE_AGENTGATE_URL/API_KEY are unset → local approval flow, unchanged.
  // eventStore + storage route review events through the durable event store
  // (transactional, save-before-emit).
  const approvalManager = new ApprovalManager(
    store,
    emitter,
    webhookNotifier,
    approvalDelegateFromEnv(),
    eventStore,
    storage
  );

  // Submission TTL expiry scheduler (checks every 60s)
  const expiryScheduler = new ExpiryScheduler(manager);
  expiryScheduler.start();

  // Terminal states for completion rate calculation
  const completedStates = new Set(['submitted', 'finalized', 'approved']);

  const analyticsProvider: AnalyticsDataProvider = {
    getIntakeIds: () => registry.listIntakeIds(),
    getTotalSubmissions: () => store.getTotalCount(),
    getPendingApprovalCount: () => store.getPendingApprovalCount(),
    getSubmissionsByState: () => store.getStateCounts(),
    getRecentEvents: (limit) =>
      hasAnalyticsEventMethods(eventStore) ? eventStore.getRecentEventsAll(limit) : [],
    getEventsByType: (type) =>
      hasAnalyticsEventMethods(eventStore) ? eventStore.getEventsByTypeAll(type) : [],
    getSubmissionsByIntake: async (): Promise<IntakeMetrics[]> => {
      const all = await store.getAll();
      const byIntake = new Map<string, { total: number; byState: Record<string, number>; completed: number }>();
      for (const sub of all) {
        let entry = byIntake.get(sub.intakeId);
        if (!entry) {
          entry = { total: 0, byState: {}, completed: 0 };
          byIntake.set(sub.intakeId, entry);
        }
        entry.total++;
        entry.byState[sub.state] = (entry.byState[sub.state] ?? 0) + 1;
        if (completedStates.has(sub.state)) entry.completed++;
      }
      const result: IntakeMetrics[] = [];
      for (const [intakeId, entry] of byIntake) {
        result.push({
          intakeId,
          total: entry.total,
          byState: entry.byState,
          completionRate: entry.total > 0 ? entry.completed / entry.total : 0,
        });
      }
      return result;
    },
    getCompletionRates: async () => {
      const stateCounts = await store.getStateCounts();
      const total = await store.getTotalCount();
      const funnelOrder = ['draft', 'in_progress', 'awaiting_upload', 'needs_review', 'approved', 'submitted', 'finalized', 'rejected', 'cancelled', 'expired'];
      return funnelOrder
        .filter((state) => (stateCounts[state] ?? 0) > 0)
        .map((state) => ({
          state,
          count: stateCounts[state] ?? 0,
          percentage: total > 0 ? ((stateCounts[state] ?? 0) / total) * 100 : 0,
        }));
    },
  };

  return {
    storage,
    store,
    eventStore,
    deliveryQueue,
    emitter,
    manager,
    approvalManager,
    webhookManager,
    analyticsProvider,
    expiryScheduler,
    receiptManager,
  };
}

/**
 * Async factory: resolve a storage backend (from env by default) and wire the
 * core submission services to it. Use this when you want to pick the durable
 * backend via FORMBRIDGE_STORAGE without going through the HTTP app factory.
 */
export async function createSubmissionServices(opts?: {
  intakes?: IntakeDefinition[];
  registry?: IntakeRegistry;
  storage?: FormBridgeStorage;
  baseUrl?: string;
}): Promise<SubmissionServices> {
  let registry = opts?.registry;
  if (!registry) {
    registry = new IntakeRegistry({ validateOnRegister: true });
    for (const intake of opts?.intakes ?? []) {
      registry.registerIntake(intake);
    }
  }
  const storage = opts?.storage ?? (await createStorageFromEnv());
  return wireSubmissionServices({ registry, storage, baseUrl: opts?.baseUrl });
}

/**
 * Creates a minimal FormBridge Hono app with health check and optional CORS.
 * Does not register any intakes.
 */
export function createFormBridgeApp(options?: FormBridgeAppOptions): Hono {
  const app = new Hono();
  const logger = getLogger();
  const storage = options?.storage ?? new MemoryStorage();

  // Request ID + structured logging
  app.use('*', requestIdMiddleware());
  app.use('*', requestLoggerMiddleware(logger));

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

  // Prometheus metrics endpoint (bypasses auth) — skip if served on separate METRICS_PORT
  if (!options?.skipMetricsRoute) {
    app.get('/metrics', async (c) => {
      const text = await getMetricsText();
      return c.text(text, 200, { 'Content-Type': getMetricsContentType() });
    });
  }

  // Health check (liveness probe — unchanged)
  app.route('/health', createHealthRouter());

  // Readiness + Startup probes (FB-E2)
  app.route('/', createProbeRouter({ storage }));

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
  const logger = getLogger();
  const storage = options?.storage ?? new MemoryStorage();

  // Request ID + structured logging
  app.use('*', requestIdMiddleware());
  app.use('*', requestLoggerMiddleware(logger));

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

  // Health check (liveness probe — unchanged)
  app.route('/health', createHealthRouter());

  // Set up registry (needed before probes for intake count)
  const registry = new IntakeRegistry({ validateOnRegister: true });
  for (const intake of intakes) {
    registry.registerIntake(intake);
  }

  // Readiness + Startup probes (FB-E2)
  app.route('/', createProbeRouter({
    storage,
    getIntakeCount: () => registry.listIntakeIds().length,
  }));

  // Prometheus metrics endpoint (bypasses auth) — skip if served on separate METRICS_PORT
  if (!options?.skipMetricsRoute) {
    app.get('/metrics', async (c) => {
      const text = await getMetricsText();
      return c.text(text, 200, { 'Content-Type': getMetricsContentType() });
    });
  }

  // Intake schema routes
  app.route('/intake', createIntakeRouter(registry));

  // Core services — wired to the (durable or in-memory) storage backend.
  const services = wireSubmissionServices({ registry, storage, logger });
  const { store, manager, approvalManager, webhookManager, analyticsProvider } =
    services;
  const receiptManager = services.receiptManager;

  // Schema validator for HTTP API field validation
  const validator = new Validator({ strict: false, allowAdditionalProperties: true });

  // Auth middleware — applied to all API routes except health and resume-token routes
  const authConfig = options?.auth ?? loadAuthConfigFromEnv();
  const authMiddleware = createAuthMiddleware(authConfig);

  // Apply auth to API routes
  // NOTE: Resume-token routes (/submissions/resume/*) bypass auth — token IS the credential
  app.use('/intake/*', authMiddleware);
  app.use('/webhooks/*', authMiddleware);
  app.use('/analytics/*', authMiddleware);

  // Permission gates for analytics
  app.use('/analytics/*', requirePermission('analytics:read'));

  // Webhook permission: retry requires webhook:write, reads require webhook:read
  app.post('/webhooks/deliveries/:deliveryId/retry', requirePermission('webhook:write'));
  app.get('/webhooks/*', requirePermission('webhook:read'));

  // Intake read permission for GET /intake/:id
  app.get('/intake/:id', requirePermission('intake:read'));
  app.get('/intake/:id/schema', requirePermission('intake:read'));

  // Submit route permission (inside submission router, under /intake/*)
  app.post('/intake/:intakeId/submissions/:submissionId/submit', requirePermission('submission:write'));

  // Resume-token routes — NO auth (token is the credential)
  // Registered before auth-gated submission routes
  app.route('/', createHonoSubmissionRouter(manager));

  // Events route
  app.route('/', createHonoEventRouter(manager));

  // Approval routes — auth applied per-route via middleware on the approval router paths
  app.use('/submissions/:id/approve', authMiddleware);
  app.use('/submissions/:id/approve', requirePermission('approval:approve'));
  app.use('/submissions/:id/reject', authMiddleware);
  app.use('/submissions/:id/reject', requirePermission('approval:reject'));
  app.use('/submissions/:id/request-changes', authMiddleware);
  app.use('/submissions/:id/request-changes', requirePermission('approval:approve'));
  app.route('/', createHonoApprovalRouter(approvalManager));

  // Handoff route needs auth
  app.use('/submissions/:id/handoff', authMiddleware);
  app.use('/submissions/:id/handoff', requirePermission('submission:write'));

  // Webhook delivery routes under /submissions need auth
  app.use('/submissions/:id/deliveries', authMiddleware);
  app.use('/submissions/:id/deliveries', requirePermission('webhook:read'));

  // Upload routes
  app.route('/intake', createUploadRouter(registry, manager));

  // Webhook routes
  app.route('/', createHonoWebhookRouter(webhookManager));

  // Analytics routes
  app.route('/', createHonoAnalyticsRouter(analyticsProvider));

  // Provenance receipts (#15)
  // Public: JWKS (offline verification) + /receipts/verify (self-contained JWS).
  app.route('/', createHonoWellKnownRouter(receiptManager));
  // GET a stored receipt needs auth + submission:read; POST /receipts/verify stays public.
  app.get('/receipts/:submissionId', authMiddleware, requirePermission('submission:read'));
  app.route('/', createHonoReceiptRouter(manager, receiptManager));

  // POST /intake/:intakeId/submissions/:submissionId/finalize — finalize + issue receipt
  // (auth from the /intake/* middleware above; submission:write here)
  app.post(
    '/intake/:intakeId/submissions/:submissionId/finalize',
    requirePermission('submission:write'),
    async (c) => {
      const submissionId = c.req.param('submissionId')!;
      let body: { actor?: unknown } = {};
      try {
        body = await c.req.json();
      } catch {
        // actor validated below
      }
      const actorResult = parseActor(body.actor);
      if (!actorResult.ok) {
        return c.json(
          { ok: false, error: { type: 'invalid_request', message: `Invalid actor: ${actorResult.error}` } },
          400
        );
      }
      const { submission, receipt } = await manager.finalize(submissionId, actorResult.actor);
      return c.json({ ok: true, submissionId: submission.id, state: submission.state, receipt });
    }
  );

  // POST /intake/:intakeId/submissions — create submission (submission:write)
  app.post('/intake/:intakeId/submissions', requirePermission('submission:write'), async (c) => {
    const intakeId = c.req.param('intakeId')!;

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
        const schema = extractSchemaRequired(intake.schema);
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
    const initFields: unknown = body.initialFields || body.fields;
    if (isRecord(initFields)) {
      const reservedKey = hasReservedFieldNames(initFields);
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
      const intakeSchema = extractSchemaProperties(intake.schema);
      if (intakeSchema?.properties) {
        const partialSchema: import('./submission-types.js').JSONSchema = {
          type: 'object',
          properties: {},
        };
        for (const fieldName of Object.keys(initFields)) {
          if (intakeSchema.properties[fieldName]) {
            partialSchema.properties![fieldName] = intakeSchema.properties[fieldName];
          }
        }
        const validationResult = validator.validate(initFields, partialSchema);
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

    // Create submission with tenant context
    const result = await manager.createSubmission({
      intakeId: IntakeId(intakeId),
      actor,
      idempotencyKey: body.idempotencyKey,
      tenantId: getRequestTenantId(c),
    });

    // If initial fields provided, set them via setFields to trigger state transition + token rotation
    if (isRecord(initFields) && Object.keys(initFields).length > 0) {
      const setResult = await manager.setFields({
        submissionId: result.submissionId,
        resumeToken: ResumeToken(result.resumeToken),
        actor,
        fields: initFields,
      });

      if ('ok' in setResult && setResult.ok) {
        const intake = registry.getIntake(intakeId);
        const schema = extractSchemaRequired(intake.schema);
        const requiredFields = schema.required ?? [];
        const providedFields = Object.keys(initFields);
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
    const { missingFields: _missingFields, ...rest } = result;
    return c.json(rest, 201);
  });

  // GET /intake/:intakeId/submissions/:submissionId — get submission (submission:read)
  app.get('/intake/:intakeId/submissions/:submissionId', requirePermission('submission:read'), async (c) => {
    const intakeId = c.req.param('intakeId')!;
    const submissionId = c.req.param('submissionId')!;

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

    // Tenant isolation — cross-tenant access returns not_found (not 403)
    if (!matchesTenantScope(c, submission.tenantId)) {
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

  // PATCH /intake/:intakeId/submissions/:submissionId — update fields (submission:write)
  app.patch('/intake/:intakeId/submissions/:submissionId', requirePermission('submission:write'), async (c) => {
    const intakeId = c.req.param('intakeId')!;
    const submissionId = c.req.param('submissionId')!;

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

    const fields: unknown = body.fields;
    if (!fields || !isRecord(fields) || Object.keys(fields).length === 0) {
      return c.json(
        {
          ok: false,
          error: { type: 'invalid_request', message: 'fields object is required' },
        },
        400
      );
    }

    // Check for reserved field names
    const reservedKey = hasReservedFieldNames(fields);
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
    const intakeSchema = extractSchemaProperties(intake.schema);
    if (intakeSchema?.properties) {
      const partialSchema: import('./submission-types.js').JSONSchema = {
        type: 'object',
        properties: {},
      };
      for (const fieldName of Object.keys(fields)) {
        if (intakeSchema.properties[fieldName]) {
          partialSchema.properties![fieldName] = intakeSchema.properties[fieldName];
        }
      }
      const validationResult = validator.validate(fields, partialSchema);
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
        submissionId: SubmissionId(submissionId),
        resumeToken: ResumeToken(body.resumeToken),
        actor: actorResult.actor,
        fields,
      });

      if (!('ok' in result) || !result.ok) {
        // IntakeError — return appropriate status
        let isTokenError = false;
        if ('error' in result && result.error != null && typeof result.error === 'object' && 'type' in result.error) {
          const errorType: unknown = result.error.type;
          isTokenError = errorType === 'invalid_resume_token';
        }
        return c.json(result, isTokenError ? 409 : 400);
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
