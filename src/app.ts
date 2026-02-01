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
import { createHonoAnalyticsRouter, type AnalyticsDataProvider, type IntakeMetrics } from './routes/hono-analytics.js';
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
import type { IntakeDefinition } from './submission-types.js';
import type { Submission } from './submission-types.js';
import type {
  IntakeEvent,
  Destination,
} from './types/intake-contract.js';
import type { WebhookNotifier, ReviewerNotification } from './core/approval-manager.js';
import { redactEventTokens } from './routes/event-sanitizer.js';
import { parseActor } from './routes/shared/actor-validation.js';

/** Reserved field names that cannot be set via API */
const RESERVED_FIELD_NAMES = new Set(['__proto__', 'constructor', 'prototype', '__uploads']);

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
  private resumeTokenIndex = new Map<string, string>(); // resumeToken -> submissionId
  private lastKnownToken = new Map<string, string>(); // submissionId -> last saved token

  // Incremental counters for O(1) analytics
  private stateCountMap = new Map<string, number>();
  private lastKnownState = new Map<string, string>(); // submissionId -> last saved state

  async get(submissionId: string): Promise<Submission | null> {
    return this.submissions.get(submissionId) ?? null;
  }

  async save(submission: Submission): Promise<void> {
    // O(1) stale token cleanup using reverse index
    const oldToken = this.lastKnownToken.get(submission.id);
    if (oldToken && oldToken !== submission.resumeToken) {
      this.resumeTokenIndex.delete(oldToken);
    }

    // Update incremental state counters
    const oldState = this.lastKnownState.get(submission.id);
    if (oldState !== submission.state) {
      if (oldState) {
        this.stateCountMap.set(oldState, (this.stateCountMap.get(oldState) ?? 1) - 1);
      }
      this.stateCountMap.set(submission.state, (this.stateCountMap.get(submission.state) ?? 0) + 1);
      this.lastKnownState.set(submission.id, submission.state);
    }

    this.submissions.set(submission.id, submission);
    if (submission.idempotencyKey) {
      this.idempotencyIndex.set(submission.idempotencyKey, submission.id);
    }
    this.resumeTokenIndex.set(submission.resumeToken, submission.id);
    this.lastKnownToken.set(submission.id, submission.resumeToken);
  }

  async getByResumeToken(resumeToken: string): Promise<Submission | null> {
    const id = this.resumeTokenIndex.get(resumeToken);
    if (!id) return null;
    return this.submissions.get(id) ?? null;
  }

  async getByIdempotencyKey(key: string): Promise<Submission | null> {
    const id = this.idempotencyIndex.get(key);
    if (!id) return null;
    return this.submissions.get(id) ?? null;
  }

  getAll(): Submission[] {
    return Array.from(this.submissions.values());
  }

  /** Returns submissions with expiresAt in the past that are not in a terminal state */
  async getExpired(): Promise<Submission[]> {
    const now = new Date();
    const terminal = new Set(['rejected', 'finalized', 'cancelled', 'expired']);
    const result: Submission[] = [];
    for (const sub of this.submissions.values()) {
      if (sub.expiresAt && new Date(sub.expiresAt) < now && !terminal.has(sub.state)) {
        result.push(sub);
      }
    }
    return result;
  }

  /** O(1) total submission count */
  getTotalCount(): number {
    return this.submissions.size;
  }

  /** O(1) submissions-by-state counts */
  getStateCounts(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [state, count] of this.stateCountMap) {
      if (count > 0) result[state] = count;
    }
    return result;
  }

  /** O(1) pending approval count */
  getPendingApprovalCount(): number {
    return this.stateCountMap.get('needs_review') ?? 0;
  }

  /**
   * Evict terminal-state submissions beyond the configured max.
   * Removes oldest terminal submissions first (by updatedAt).
   * @returns Number of evicted submissions
   */
  evictTerminal(maxEntries: number): number {
    if (this.submissions.size <= maxEntries) return 0;

    const terminal = new Set(['rejected', 'finalized', 'cancelled', 'expired']);
    const candidates: Submission[] = [];
    for (const sub of this.submissions.values()) {
      if (terminal.has(sub.state)) {
        candidates.push(sub);
      }
    }

    // Sort oldest first
    candidates.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

    const toEvict = Math.min(candidates.length, this.submissions.size - maxEntries);
    let evicted = 0;
    for (let i = 0; i < toEvict; i++) {
      const sub = candidates[i]!;
      this.submissions.delete(sub.id);
      this.resumeTokenIndex.delete(sub.resumeToken);
      this.lastKnownToken.delete(sub.id);
      if (sub.idempotencyKey) this.idempotencyIndex.delete(sub.idempotencyKey);
      const st = this.lastKnownState.get(sub.id);
      if (st) {
        this.stateCountMap.set(st, (this.stateCountMap.get(st) ?? 1) - 1);
        this.lastKnownState.delete(sub.id);
      }
      evicted++;
    }
    return evicted;
  }

  /**
   * Remove submissions that have expired (expiresAt in the past + terminal state).
   * @returns Number of cleaned-up submissions
   */
  cleanupExpired(): number {
    const now = new Date().toISOString();
    const terminal = new Set(['rejected', 'finalized', 'cancelled', 'expired']);
    let removed = 0;
    for (const [id, sub] of this.submissions) {
      if (sub.expiresAt && sub.expiresAt < now && terminal.has(sub.state)) {
        this.submissions.delete(id);
        this.resumeTokenIndex.delete(sub.resumeToken);
        this.lastKnownToken.delete(id);
        if (sub.idempotencyKey) this.idempotencyIndex.delete(sub.idempotencyKey);
        const st = this.lastKnownState.get(id);
        if (st) {
          this.stateCountMap.set(st, (this.stateCountMap.get(st) ?? 1) - 1);
          this.lastKnownState.delete(id);
        }
        removed++;
      }
    }
    return removed;
  }

  /** Current number of stored submissions */
  get size(): number {
    return this.submissions.size;
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
    // Use allSettled for error isolation — one failing listener won't block others
    const results = await Promise.allSettled(this.listeners.map((fn) => fn(event)));
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[BridgingEventEmitter] Listener error:', result.reason);
      }
    }
  }
}

/**
 * WebhookNotifierImpl — bridges ApprovalManager's WebhookNotifier to WebhookManager.
 * Formats ReviewerNotification payloads and delivers via the existing webhook infrastructure
 * (HMAC signing, exponential backoff retry, delivery queue tracking).
 */
class WebhookNotifierImpl implements WebhookNotifier {
  constructor(
    private webhookManager: WebhookManager,
    private notificationUrl?: string
  ) {}

  async notifyReviewers(notification: ReviewerNotification): Promise<void> {
    if (!this.notificationUrl) return;

    // Build a synthetic Submission-like object for the webhook manager
    const syntheticSubmission: Submission = {
      id: notification.submissionId,
      intakeId: notification.intakeId,
      state: notification.state,
      resumeToken: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fields: notification.fields,
      fieldAttribution: {},
      createdBy: notification.createdBy,
      updatedBy: notification.createdBy,
      events: [],
    };

    const destination: Destination = {
      kind: 'webhook',
      url: this.notificationUrl,
    };

    await this.webhookManager.enqueueDelivery(syntheticSubmission, destination);
  }
}

/**
 * ExpiryScheduler — periodically expires stale submissions via SubmissionManager.
 * Uses setInterval with configurable interval (default 60s).
 */
class ExpiryScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private manager: SubmissionManager,
    private intervalMs: number = 60_000
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.manager.expireStaleSubmissions().catch((err) => {
        console.error('[ExpiryScheduler] Error expiring submissions:', err);
      });
    }, this.intervalMs);
    // unref() so the timer doesn't prevent Node.js process/test exit
    if (this.timer && typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
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

  // Webhook manager — wired to receive events from the bridging emitter
  const signingSecret = process.env['FORMBRIDGE_WEBHOOK_SECRET'];
  if (!signingSecret) {
    console.warn('[FormBridge] WARNING: FORMBRIDGE_WEBHOOK_SECRET is not set. Webhooks will be delivered unsigned.');
  }
  const webhookManager = new WebhookManager(undefined, { signingSecret, eventEmitter: emitter });

  // Start webhook delivery retry scheduler (checks every 30s)
  webhookManager.startRetryScheduler();

  // Webhook notifier for approval reviewer notifications
  const reviewerNotificationUrl = process.env['FORMBRIDGE_REVIEWER_WEBHOOK_URL'];
  const webhookNotifier = new WebhookNotifierImpl(webhookManager, reviewerNotificationUrl);
  const approvalManager = new ApprovalManager(store, emitter, webhookNotifier);

  // Submission TTL expiry scheduler (checks every 60s)
  const expiryScheduler = new ExpiryScheduler(manager);
  expiryScheduler.start();

  // Schema validator for HTTP API field validation
  const validator = new Validator({ strict: false, allowAdditionalProperties: true });

  // Terminal states for completion rate calculation
  const completedStates = new Set(['submitted', 'finalized', 'approved']);

  // Analytics provider — uses pre-computed indexes for O(1) reads
  const analyticsProvider: AnalyticsDataProvider = {
    getIntakeIds: () => registry.listIntakeIds(),
    getTotalSubmissions: () => store.getTotalCount(),
    getPendingApprovalCount: () => store.getPendingApprovalCount(),
    getSubmissionsByState: () => store.getStateCounts(),
    getRecentEvents: (limit) => eventStore.getRecentEventsAll(limit),
    getEventsByType: (type) => eventStore.getEventsByTypeAll(type),
    getSubmissionsByIntake: (): IntakeMetrics[] => {
      const all = store.getAll();
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
    getCompletionRates: () => {
      const stateCounts = store.getStateCounts();
      const total = store.getTotalCount();
      // Define funnel order
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
      const intakeSchema = intake.schema as import('./submission-types.js').JSONSchema;
      if (intakeSchema.properties) {
        const partialSchema: import('./submission-types.js').JSONSchema = {
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
    const intakeSchema = intake.schema as import('./submission-types.js').JSONSchema;
    if (intakeSchema.properties) {
      const partialSchema: import('./submission-types.js').JSONSchema = {
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
