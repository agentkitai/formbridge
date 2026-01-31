/**
 * WebhookManager — delivers submission payloads to configured webhook destinations.
 *
 * Features:
 * - HMAC-SHA256 request signing
 * - Exponential backoff retry
 * - Dry-run mode (returns what would be sent without sending)
 * - Non-blocking delivery (enqueues and returns immediately)
 * - Delivery event emission (delivery.attempted, delivery.succeeded, delivery.failed)
 */

import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import type {
  IntakeEvent,
  DeliveryRecord,
  RetryPolicy,
  Destination,
  Actor,
} from "../types/intake-contract.js";
import type { Submission } from "../types.js";
import {
  type DeliveryQueue,
  InMemoryDeliveryQueue,
  DEFAULT_RETRY_POLICY,
  calculateRetryDelay,
  type DeliveryContext,
} from "./delivery-queue.js";
import { validateWebhookUrl, sanitizeDestinationHeaders } from "./url-validation.js";

// =============================================================================
// § Types
// =============================================================================

export interface WebhookManagerOptions {
  /** Secret key for HMAC-SHA256 signing */
  signingSecret?: string;
  /** Retry policy (defaults to 5 retries, exponential backoff) */
  retryPolicy?: RetryPolicy;
  /** Custom fetch implementation (for testing) */
  fetchFn?: typeof fetch;
  /** Event emitter for delivery lifecycle events */
  eventEmitter?: WebhookEventEmitter;
}

export interface WebhookEventEmitter {
  emit(event: IntakeEvent): Promise<void>;
}

export interface DeliveryPayload {
  submissionId: string;
  intakeId: string;
  state: string;
  fields: Record<string, unknown>;
  fieldAttribution: Record<string, unknown>;
  metadata: {
    createdAt: string;
    updatedAt: string;
    createdBy: unknown;
  };
}

export interface DryRunResult {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: DeliveryPayload;
}

// =============================================================================
// § HMAC Signing
// =============================================================================

/**
 * Generate HMAC-SHA256 signature for a webhook payload.
 */
export function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify HMAC-SHA256 signature.
 */
export function verifySignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = signPayload(payload, secret);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// =============================================================================
// § WebhookManager
// =============================================================================

export class WebhookManager {
  private queue: DeliveryQueue;
  private signingSecret?: string;
  private retryPolicy: RetryPolicy;
  private fetchFn: typeof fetch;
  private eventEmitter?: WebhookEventEmitter;
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    queue?: DeliveryQueue,
    options?: WebhookManagerOptions
  ) {
    this.queue = queue ?? new InMemoryDeliveryQueue();
    this.signingSecret = options?.signingSecret;
    this.retryPolicy = options?.retryPolicy ?? DEFAULT_RETRY_POLICY;
    this.fetchFn = options?.fetchFn ?? globalThis.fetch;
    this.eventEmitter = options?.eventEmitter;
  }

  /**
   * Build the delivery payload from a submission.
   */
  buildPayload(submission: Submission): DeliveryPayload {
    return {
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
    };
  }

  /**
   * Build signed headers for a webhook request.
   */
  buildHeaders(body: string, destination: Destination): Record<string, string> {
    const timestamp = new Date().toISOString();
    // Sanitize destination headers to prevent header injection
    const sanitizedHeaders = sanitizeDestinationHeaders(destination.headers as Record<string, string> | undefined);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-FormBridge-Timestamp": timestamp,
      ...sanitizedHeaders,
    };

    if (this.signingSecret) {
      const signature = signPayload(body, this.signingSecret);
      headers["X-FormBridge-Signature"] = `sha256=${signature}`;
    }

    return headers;
  }

  /**
   * Dry-run: returns what would be sent without actually sending.
   */
  dryRun(submission: Submission, destination: Destination): DryRunResult {
    const payload = this.buildPayload(submission);
    const body = JSON.stringify(payload);
    const headers = this.buildHeaders(body, destination);

    return {
      url: destination.url ?? "",
      method: "POST",
      headers,
      body: payload,
    };
  }

  /**
   * Enqueue a delivery for non-blocking processing.
   * Returns the delivery ID immediately.
   */
  async enqueueDelivery(
    submission: Submission,
    destination: Destination
  ): Promise<string> {
    const deliveryId = `dlv_${randomUUID()}`;
    const now = new Date().toISOString();

    const record: DeliveryRecord = {
      deliveryId,
      submissionId: submission.id,
      destinationUrl: destination.url ?? "",
      status: "pending",
      attempts: 0,
      createdAt: now,
    };

    // Store context for retries
    const context: DeliveryContext = {
      submission: {
        id: submission.id,
        intakeId: submission.intakeId,
        state: submission.state,
        fields: submission.fields,
        fieldAttribution: submission.fieldAttribution,
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt,
        createdBy: submission.createdBy,
      },
      destination: {
        kind: destination.kind,
        url: destination.url,
        headers: destination.headers as Record<string, string> | undefined,
      },
    };

    await this.queue.enqueue(record, context);

    // Process asynchronously (non-blocking)
    this.processDelivery(record, submission, destination).catch(() => {
      // Errors are tracked in the delivery record
    });

    return deliveryId;
  }

  /**
   * Process a single delivery attempt with retry logic.
   */
  async processDelivery(
    record: DeliveryRecord,
    submission: Submission,
    destination: Destination
  ): Promise<void> {
    // SSRF validation at delivery time (prevents DNS rebinding attacks)
    const ssrfError = validateWebhookUrl(destination.url ?? "");
    if (ssrfError) {
      record.status = "failed";
      record.error = `SSRF blocked: ${ssrfError}`;
      await this.queue.update(record);
      await this.emitDeliveryEvent("delivery.failed", submission, {
        deliveryId: record.deliveryId,
        attempt: 0,
        error: record.error,
      });
      return;
    }

    const payload = this.buildPayload(submission);
    const body = JSON.stringify(payload);

    while (record.attempts < this.retryPolicy.maxRetries) {
      record.attempts++;
      record.lastAttemptAt = new Date().toISOString();

      try {
        // Emit delivery.attempted event
        await this.emitDeliveryEvent("delivery.attempted", submission, {
          deliveryId: record.deliveryId,
          attempt: record.attempts,
          url: destination.url,
        });

        const headers = this.buildHeaders(body, destination);

        const response = await this.fetchFn(destination.url ?? "", {
          method: "POST",
          headers,
          body,
        });

        record.statusCode = response.status;

        if (response.ok) {
          record.status = "succeeded";
          await this.queue.update(record);

          // Emit delivery.succeeded event
          await this.emitDeliveryEvent("delivery.succeeded", submission, {
            deliveryId: record.deliveryId,
            attempt: record.attempts,
            statusCode: response.status,
          });
          return;
        }

        // Non-2xx response — retry if we have attempts left
        if (record.attempts >= this.retryPolicy.maxRetries) {
          record.status = "failed";
          record.error = `HTTP ${response.status}`;
          await this.queue.update(record);

          await this.emitDeliveryEvent("delivery.failed", submission, {
            deliveryId: record.deliveryId,
            attempt: record.attempts,
            statusCode: response.status,
            error: `HTTP ${response.status}`,
          });
          return;
        }

        // Schedule retry with exponential backoff
        const delay = calculateRetryDelay(record.attempts, this.retryPolicy);
        record.nextRetryAt = new Date(Date.now() + delay).toISOString();
        await this.queue.update(record);

        // Wait for backoff delay
        await new Promise((resolve) => setTimeout(resolve, delay));
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        if (record.attempts >= this.retryPolicy.maxRetries) {
          record.status = "failed";
          record.error = errorMessage;
          await this.queue.update(record);

          await this.emitDeliveryEvent("delivery.failed", submission, {
            deliveryId: record.deliveryId,
            attempt: record.attempts,
            error: errorMessage,
          });
          return;
        }

        // Schedule retry with exponential backoff
        const delay = calculateRetryDelay(record.attempts, this.retryPolicy);
        record.nextRetryAt = new Date(Date.now() + delay).toISOString();
        await this.queue.update(record);

        // Wait for backoff delay
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Get delivery records for a submission.
   */
  async getDeliveries(submissionId: string): Promise<DeliveryRecord[]> {
    return this.queue.getBySubmission(submissionId);
  }

  /**
   * Get a single delivery record.
   */
  async getDelivery(deliveryId: string): Promise<DeliveryRecord | null> {
    return this.queue.get(deliveryId);
  }

  /**
   * Get the delivery queue for direct access.
   */
  getQueue(): DeliveryQueue {
    return this.queue;
  }

  /**
   * Start the background retry scheduler.
   * Polls for pending retries at the given interval and reprocesses them.
   */
  startRetryScheduler(intervalMs: number = 30_000): void {
    if (this.retryTimer) return;
    this.retryTimer = setInterval(() => {
      this.retryPendingDeliveries().catch((err) => {
        console.error('[WebhookManager] Retry scheduler error:', err);
      });
    }, intervalMs);
    // unref() so the timer doesn't prevent process/test exit
    if (this.retryTimer && typeof this.retryTimer === 'object' && 'unref' in this.retryTimer) {
      this.retryTimer.unref();
    }
  }

  /**
   * Stop the background retry scheduler.
   */
  stopRetryScheduler(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Process all pending deliveries that are ready for retry.
   */
  private async retryPendingDeliveries(): Promise<void> {
    const pending = await this.queue.getPendingRetries();

    for (const record of pending) {
      // Get stored context for the delivery
      const ctx = (this.queue as InMemoryDeliveryQueue).getContext?.(record.deliveryId);
      if (!ctx) continue;

      // Reconstruct submission and destination from stored context
      const submission = {
        ...ctx.submission,
        resumeToken: '',
        updatedBy: ctx.submission.createdBy as Actor,
        events: [],
      } as Submission;

      const destination: Destination = {
        kind: ctx.destination.kind as Destination['kind'],
        url: ctx.destination.url,
        headers: ctx.destination.headers,
      };

      // Process the delivery (non-blocking)
      this.processDelivery(record, submission, destination).catch(() => {
        // Errors tracked in delivery record
      });
    }
  }

  /**
   * Emit a delivery lifecycle event.
   */
  private async emitDeliveryEvent(
    type: "delivery.attempted" | "delivery.succeeded" | "delivery.failed",
    submission: Submission,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.eventEmitter) return;

    const systemActor: Actor = {
      kind: "system",
      id: "webhook-manager",
      name: "Webhook Delivery System",
    };

    const event: IntakeEvent = {
      eventId: `evt_${randomUUID()}`,
      type,
      submissionId: submission.id,
      ts: new Date().toISOString(),
      actor: systemActor,
      state: submission.state,
      payload,
    };

    await this.eventEmitter.emit(event);
  }
}
