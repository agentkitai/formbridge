/**
 * Prometheus metrics for FormBridge (FB-E4)
 *
 * Attaches listeners to BridgingEventEmitter for zero-overhead instrumentation.
 */
import client from 'prom-client';
import type { BridgingEventEmitter } from './core/bridging-event-emitter.js';
import type { IntakeEvent } from './types/intake-contract.js';

// Use a dedicated registry to avoid polluting the global one in tests
export const metricsRegistry = new client.Registry();

// Default Node.js metrics (event loop lag, heap, GC, etc.)
client.collectDefaultMetrics({ register: metricsRegistry });

// ── FormBridge-specific metrics ──

export const submissionsTotal = new client.Counter({
  name: 'formbridge_submissions_total',
  help: 'Total submissions by intake and state',
  labelNames: ['intake_id', 'state'] as const,
  registers: [metricsRegistry],
});

export const submissionDurationSeconds = new client.Histogram({
  name: 'formbridge_submission_duration_seconds',
  help: 'Duration from draft creation to submission (seconds)',
  buckets: [1, 5, 15, 30, 60, 120, 300, 600, 1800, 3600],
  registers: [metricsRegistry],
});

export const webhookDeliveriesTotal = new client.Counter({
  name: 'formbridge_webhook_deliveries_total',
  help: 'Total webhook deliveries by status',
  labelNames: ['status'] as const,
  registers: [metricsRegistry],
});

export const webhookDeliveryDurationSeconds = new client.Histogram({
  name: 'formbridge_webhook_delivery_duration_seconds',
  help: 'Webhook delivery duration (seconds)',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const activeSubmissions = new client.Gauge({
  name: 'formbridge_active_submissions',
  help: 'Currently active submissions by state',
  labelNames: ['state'] as const,
  registers: [metricsRegistry],
});

export const approvalLatencySeconds = new client.Histogram({
  name: 'formbridge_approval_latency_seconds',
  help: 'Time from review requested to approved/rejected (seconds)',
  buckets: [60, 300, 900, 1800, 3600, 7200, 14400, 43200, 86400],
  registers: [metricsRegistry],
});

export const authRequestsTotal = new client.Counter({
  name: 'formbridge_auth_requests_total',
  help: 'Total auth requests by method and result',
  labelNames: ['method', 'result'] as const,
  registers: [metricsRegistry],
});

export const rateLimitHitsTotal = new client.Counter({
  name: 'formbridge_rate_limit_hits_total',
  help: 'Total rate limit hits',
  registers: [metricsRegistry],
});

// Track review-requested timestamps for approval latency calculation
const reviewRequestedAt = new Map<string, number>();

// Track submission creation timestamps for duration calculation
const submissionCreatedAt = new Map<string, number>();

/**
 * Wire metrics listeners to a BridgingEventEmitter.
 * Call once at app startup.
 */
export function attachMetricsListeners(emitter: BridgingEventEmitter): void {
  emitter.addListener(async (event: IntakeEvent) => {
    const { type, submissionId } = event;

    switch (type) {
      case 'submission.created':
        submissionsTotal.inc({ intake_id: event.payload?.['intakeId'] as string ?? 'unknown', state: 'created' });
        activeSubmissions.inc({ state: 'draft' });
        submissionCreatedAt.set(submissionId, Date.now());
        break;

      case 'submission.submitted':
        submissionsTotal.inc({ intake_id: event.payload?.['intakeId'] as string ?? 'unknown', state: 'submitted' });
        activeSubmissions.dec({ state: 'draft' });
        activeSubmissions.inc({ state: 'submitted' });
        // Record duration from creation to submission
        {
          const createdTs = submissionCreatedAt.get(submissionId);
          if (createdTs) {
            submissionDurationSeconds.observe((Date.now() - createdTs) / 1000);
            submissionCreatedAt.delete(submissionId);
          }
        }
        break;

      case 'review.requested':
        activeSubmissions.dec({ state: 'submitted' });
        activeSubmissions.inc({ state: 'needs_review' });
        reviewRequestedAt.set(submissionId, Date.now());
        break;

      case 'review.approved':
      case 'review.rejected': {
        const reviewState = type === 'review.approved' ? 'approved' : 'rejected';
        activeSubmissions.dec({ state: 'needs_review' });
        activeSubmissions.inc({ state: reviewState });
        const requestedTs = reviewRequestedAt.get(submissionId);
        if (requestedTs) {
          approvalLatencySeconds.observe((Date.now() - requestedTs) / 1000);
          reviewRequestedAt.delete(submissionId);
        }
        break;
      }

      case 'delivery.succeeded':
        webhookDeliveriesTotal.inc({ status: 'succeeded' });
        if (event.payload?.['durationMs']) {
          webhookDeliveryDurationSeconds.observe((event.payload['durationMs'] as number) / 1000);
        }
        break;

      case 'delivery.failed':
        webhookDeliveriesTotal.inc({ status: 'failed' });
        if (event.payload?.['durationMs']) {
          webhookDeliveryDurationSeconds.observe((event.payload['durationMs'] as number) / 1000);
        }
        break;

      case 'delivery.attempted':
        webhookDeliveriesTotal.inc({ status: 'attempted' });
        break;

      case 'submission.finalized':
        activeSubmissions.dec({ state: event.payload?.['previousState'] as string ?? 'submitted' });
        break;

      case 'submission.cancelled':
        activeSubmissions.dec({ state: event.payload?.['previousState'] as string ?? 'draft' });
        break;

      case 'submission.expired':
        activeSubmissions.dec({ state: event.payload?.['previousState'] as string ?? 'draft' });
        break;
    }
  });
}

/**
 * Returns the Prometheus text format metrics string.
 */
export async function getMetricsText(): Promise<string> {
  return metricsRegistry.metrics();
}

/**
 * Returns the content type for Prometheus metrics.
 */
export function getMetricsContentType(): string {
  return metricsRegistry.contentType;
}
