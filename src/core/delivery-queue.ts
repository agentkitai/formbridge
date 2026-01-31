/**
 * Delivery Queue — manages webhook delivery attempts with retry support.
 * Provides an in-memory implementation for development and testing.
 */

import type { DeliveryRecord, RetryPolicy } from "../types/intake-contract.js";

// =============================================================================
// § Delivery Queue Interface
// =============================================================================

export interface DeliveryQueue {
  /** Enqueue a new delivery for processing, with optional context for retries */
  enqueue(record: DeliveryRecord, context?: DeliveryContext): Promise<void>;

  /** Get a delivery by ID */
  get(deliveryId: string): Promise<DeliveryRecord | null>;

  /** Get all deliveries for a submission */
  getBySubmission(submissionId: string): Promise<DeliveryRecord[]>;

  /** Update an existing delivery record */
  update(record: DeliveryRecord): Promise<void>;

  /** Get all pending deliveries that are ready for retry */
  getPendingRetries(): Promise<DeliveryRecord[]>;

  /** Get queue statistics */
  getStats(): Promise<DeliveryQueueStats>;
}

export interface DeliveryQueueStats {
  total: number;
  pending: number;
  succeeded: number;
  failed: number;
}

// =============================================================================
// § Default Retry Policy
// =============================================================================

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
};

/**
 * Calculate the next retry delay using exponential backoff.
 */
export function calculateRetryDelay(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY
): number {
  const delay = Math.min(
    policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attempt - 1),
    policy.maxDelayMs
  );
  return delay;
}

// =============================================================================
// § InMemoryDeliveryQueue
// =============================================================================

/** Stored context needed to retry a delivery */
export interface DeliveryContext {
  submission: { id: string; intakeId: string; state: string; fields: Record<string, unknown>; fieldAttribution: Record<string, unknown>; createdAt: string; updatedAt: string; createdBy: unknown };
  destination: { kind: string; url?: string; headers?: Record<string, string> };
}

export class InMemoryDeliveryQueue implements DeliveryQueue {
  private deliveries = new Map<string, DeliveryRecord>();
  private bySubmission = new Map<string, Set<string>>();
  private contexts = new Map<string, DeliveryContext>();

  async enqueue(record: DeliveryRecord, context?: DeliveryContext): Promise<void> {
    this.deliveries.set(record.deliveryId, record);
    if (context) {
      this.contexts.set(record.deliveryId, context);
    }

    let submissionSet = this.bySubmission.get(record.submissionId);
    if (!submissionSet) {
      submissionSet = new Set();
      this.bySubmission.set(record.submissionId, submissionSet);
    }
    submissionSet.add(record.deliveryId);
  }

  /** Get stored context for a delivery (needed for retries) */
  getContext(deliveryId: string): DeliveryContext | undefined {
    return this.contexts.get(deliveryId);
  }

  async get(deliveryId: string): Promise<DeliveryRecord | null> {
    return this.deliveries.get(deliveryId) ?? null;
  }

  async getBySubmission(submissionId: string): Promise<DeliveryRecord[]> {
    const ids = this.bySubmission.get(submissionId);
    if (!ids) return [];

    const records: DeliveryRecord[] = [];
    for (const id of ids) {
      const record = this.deliveries.get(id);
      if (record) records.push(record);
    }
    return records.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  async update(record: DeliveryRecord): Promise<void> {
    if (!this.deliveries.has(record.deliveryId)) {
      throw new Error(`Delivery not found: ${record.deliveryId}`);
    }
    this.deliveries.set(record.deliveryId, record);
  }

  async getPendingRetries(): Promise<DeliveryRecord[]> {
    const now = new Date().toISOString();
    const pending: DeliveryRecord[] = [];

    for (const record of this.deliveries.values()) {
      if (record.status === "pending") {
        if (!record.nextRetryAt || record.nextRetryAt <= now) {
          pending.push(record);
        }
      }
    }

    return pending.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  async getStats(): Promise<DeliveryQueueStats> {
    let pending = 0;
    let succeeded = 0;
    let failed = 0;

    for (const record of this.deliveries.values()) {
      switch (record.status) {
        case "pending":
          pending++;
          break;
        case "succeeded":
          succeeded++;
          break;
        case "failed":
          failed++;
          break;
      }
    }

    return {
      total: this.deliveries.size,
      pending,
      succeeded,
      failed,
    };
  }
}
