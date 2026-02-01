/**
 * Webhook Delivery Integration Test
 *
 * Tests the end-to-end webhook delivery flow including:
 * - Submission → webhook delivery trigger
 * - HMAC signature verification
 * - Retry with exponential backoff
 * - Delivery status tracking
 * - Dry-run mode
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { WebhookManager, signPayload as _signPayload, verifySignature } from "../../src/core/webhook-manager";
import { InMemoryDeliveryQueue } from "../../src/core/delivery-queue";
import type { Submission } from "../../src/submission-types";
import type { Destination, IntakeEvent } from "../../src/types/intake-contract";

function createSubmission(overrides?: Partial<Submission>): Submission {
  return {
    id: "sub_integ_123",
    intakeId: "intake_vendor",
    state: "submitted",
    resumeToken: "rtok_test",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T01:00:00.000Z",
    fields: {
      companyName: "TechCorp",
      taxId: "12-3456789",
      contactEmail: "contact@techcorp.com",
    },
    fieldAttribution: {
      companyName: { kind: "agent" as const, id: "agent-1" },
      taxId: { kind: "human" as const, id: "user-1" },
      contactEmail: { kind: "agent" as const, id: "agent-1" },
    },
    createdBy: { kind: "agent" as const, id: "agent-1" },
    updatedBy: { kind: "human" as const, id: "user-1" },
    events: [],
    ...overrides,
  };
}

describe("Webhook Delivery Integration", () => {
  let queue: InMemoryDeliveryQueue;
  const testDestination: Destination = {
    kind: "webhook",
    url: "https://api.example.com/webhook",
    headers: { Authorization: "Bearer test-token" },
  };

  beforeEach(() => {
    queue = new InMemoryDeliveryQueue();
  });

  describe("End-to-End Delivery Flow", () => {
    it("should deliver submission to webhook endpoint", async () => {
      const receivedPayloads: string[] = [];
      const receivedHeaders: Record<string, string>[] = [];

      const mockFetch = vi.fn(async (url: string, init: any) => {
        receivedPayloads.push(init.body);
        receivedHeaders.push(init.headers);
        return { ok: true, status: 200 };
      });

      const manager = new WebhookManager(queue, {
        signingSecret: "webhook-secret-key",
        fetchFn: mockFetch as any,
      });

      const submission = createSubmission();
      const deliveryId = await manager.enqueueDelivery(submission, testDestination);

      // Wait for async delivery
      await new Promise((r) => setTimeout(r, 100));

      // Verify delivery was made
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(receivedPayloads.length).toBe(1);

      // Verify payload content
      const payload = JSON.parse(receivedPayloads[0]);
      expect(payload.submissionId).toBe("sub_integ_123");
      expect(payload.intakeId).toBe("intake_vendor");
      expect(payload.fields.companyName).toBe("TechCorp");

      // Verify headers
      expect(receivedHeaders[0]["Content-Type"]).toBe("application/json");
      expect(receivedHeaders[0]["Authorization"]).toBe("Bearer test-token");
      expect(receivedHeaders[0]["X-FormBridge-Timestamp"]).toBeDefined();
      expect(receivedHeaders[0]["X-FormBridge-Signature"]).toMatch(/^sha256=/);

      // Verify signature
      const signature = receivedHeaders[0]["X-FormBridge-Signature"].replace("sha256=", "");
      expect(verifySignature(receivedPayloads[0], signature, "webhook-secret-key")).toBe(true);

      // Verify delivery record updated
      const record = await queue.get(deliveryId);
      expect(record!.status).toBe("succeeded");
      expect(record!.attempts).toBe(1);
    });

    it("should retry on failure with exponential backoff", async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async () => {
        callCount++;
        if (callCount < 3) {
          return { ok: false, status: 503 };
        }
        return { ok: true, status: 200 };
      });

      const manager = new WebhookManager(queue, {
        fetchFn: mockFetch as any,
        retryPolicy: {
          maxRetries: 5,
          initialDelayMs: 1,
          maxDelayMs: 10,
          backoffMultiplier: 2,
        },
      });

      const submission = createSubmission();
      const deliveryId = await manager.enqueueDelivery(submission, testDestination);

      await new Promise((r) => setTimeout(r, 500));

      expect(mockFetch).toHaveBeenCalledTimes(3); // 2 failures + 1 success
      const record = await queue.get(deliveryId);
      expect(record!.status).toBe("succeeded");
      expect(record!.attempts).toBe(3);
    });
  });

  describe("Dry-Run Mode", () => {
    it("should return what would be sent without sending", () => {
      const manager = new WebhookManager(queue, {
        signingSecret: "dry-run-secret",
      });

      const submission = createSubmission();
      const result = manager.dryRun(submission, testDestination);

      expect(result.url).toBe("https://api.example.com/webhook");
      expect(result.method).toBe("POST");
      expect(result.headers["Content-Type"]).toBe("application/json");
      expect(result.headers["Authorization"]).toBe("Bearer test-token");
      expect(result.headers["X-FormBridge-Signature"]).toMatch(/^sha256=/);
      expect(result.body.submissionId).toBe("sub_integ_123");
      expect(result.body.fields.companyName).toBe("TechCorp");
    });
  });

  describe("Delivery Event Emission", () => {
    it("should emit delivery lifecycle events", async () => {
      const emittedEvents: IntakeEvent[] = [];
      const mockEmitter = {
        emit: vi.fn(async (event: IntakeEvent) => {
          emittedEvents.push(event);
        }),
      };

      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

      const manager = new WebhookManager(queue, {
        fetchFn: mockFetch as any,
        eventEmitter: mockEmitter,
      });

      const submission = createSubmission();
      await manager.enqueueDelivery(submission, testDestination);

      await new Promise((r) => setTimeout(r, 100));

      // Should have attempted + succeeded events
      const eventTypes = emittedEvents.map((e) => e.type);
      expect(eventTypes).toContain("delivery.attempted");
      expect(eventTypes).toContain("delivery.succeeded");

      // Verify event structure
      emittedEvents.forEach((event) => {
        expect(event.eventId).toMatch(/^evt_/);
        expect(event.submissionId).toBe("sub_integ_123");
        expect(event.actor.kind).toBe("system");
        expect(event.actor.id).toBe("webhook-manager");
      });
    });
  });

  describe("Queue Statistics", () => {
    it("should track delivery statistics across multiple submissions", async () => {
      const mockFetchSuccess = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      const mockFetchFail = vi.fn().mockResolvedValue({ ok: false, status: 500 });

      // Success delivery
      const manager1 = new WebhookManager(queue, {
        fetchFn: mockFetchSuccess as any,
      });
      await manager1.enqueueDelivery(
        createSubmission({ id: "sub_1" }),
        testDestination
      );

      // Failure delivery
      const manager2 = new WebhookManager(queue, {
        fetchFn: mockFetchFail as any,
        retryPolicy: { maxRetries: 1, initialDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2 },
      });
      await manager2.enqueueDelivery(
        createSubmission({ id: "sub_2" }),
        testDestination
      );

      await new Promise((r) => setTimeout(r, 200));

      const stats = await queue.getStats();
      expect(stats.total).toBe(2);
      expect(stats.succeeded).toBe(1);
      expect(stats.failed).toBe(1);
    });
  });
});
