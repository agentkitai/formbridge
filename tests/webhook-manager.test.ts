/**
 * WebhookManager unit tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  WebhookManager,
  signPayload,
  verifySignature,
} from "../src/core/webhook-manager";
import { InMemoryDeliveryQueue } from "../src/core/delivery-queue";
import type { Submission } from "../src/submission-types";
import type { Destination, IntakeEvent } from "../src/types/intake-contract";

function createTestSubmission(overrides?: Partial<Submission>): Submission {
  return {
    id: "sub_test_123",
    intakeId: "intake_test",
    state: "submitted",
    resumeToken: "rtok_test",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T01:00:00.000Z",
    fields: { name: "John", email: "john@test.com" },
    fieldAttribution: { name: { kind: "agent", id: "agent-1" } },
    createdBy: { kind: "agent", id: "agent-1" },
    updatedBy: { kind: "human", id: "user-1" },
    events: [],
    ...overrides,
  };
}

const testDestination: Destination = {
  kind: "webhook",
  url: "https://example.com/webhook",
  headers: { "X-Custom": "value" },
};

describe("WebhookManager", () => {
  let queue: InMemoryDeliveryQueue;
  let manager: WebhookManager;

  beforeEach(() => {
    queue = new InMemoryDeliveryQueue();
  });

  describe("buildPayload", () => {
    it("should build a delivery payload from a submission", () => {
      manager = new WebhookManager(queue);
      const submission = createTestSubmission();
      const payload = manager.buildPayload(submission);

      expect(payload.submissionId).toBe("sub_test_123");
      expect(payload.intakeId).toBe("intake_test");
      expect(payload.state).toBe("submitted");
      expect(payload.fields).toEqual({ name: "John", email: "john@test.com" });
      expect(payload.metadata.createdAt).toBe("2024-01-01T00:00:00.000Z");
    });
  });

  describe("HMAC-SHA256 signing", () => {
    it("should sign payload with HMAC-SHA256", () => {
      const signature = signPayload('{"test": true}', "secret-key");
      expect(signature).toBeDefined();
      expect(typeof signature).toBe("string");
      expect(signature.length).toBe(64); // SHA-256 hex output
    });

    it("should verify a valid signature", () => {
      const payload = '{"test": true}';
      const secret = "my-secret";
      const signature = signPayload(payload, secret);

      expect(verifySignature(payload, signature, secret)).toBe(true);
    });

    it("should reject an invalid signature", () => {
      const payload = '{"test": true}';
      const secret = "my-secret";

      expect(verifySignature(payload, "invalid-signature", secret)).toBe(false);
    });

    it("should produce different signatures for different payloads", () => {
      const secret = "my-secret";
      const sig1 = signPayload("payload1", secret);
      const sig2 = signPayload("payload2", secret);

      expect(sig1).not.toBe(sig2);
    });
  });

  describe("buildHeaders", () => {
    it("should include Content-Type and timestamp", () => {
      manager = new WebhookManager(queue);
      const headers = manager.buildHeaders("{}", testDestination);

      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["X-FormBridge-Timestamp"]).toBeDefined();
    });

    it("should include custom destination headers", () => {
      manager = new WebhookManager(queue);
      const headers = manager.buildHeaders("{}", testDestination);

      expect(headers["X-Custom"]).toBe("value");
    });

    it("should include signature when signing secret is configured", () => {
      manager = new WebhookManager(queue, { signingSecret: "test-secret" });
      const body = '{"test": true}';
      const headers = manager.buildHeaders(body, testDestination);

      expect(headers["X-FormBridge-Signature"]).toBeDefined();
      expect(headers["X-FormBridge-Signature"]).toMatch(/^sha256=/);
    });

    it("should not include signature without signing secret", () => {
      manager = new WebhookManager(queue);
      const headers = manager.buildHeaders("{}", testDestination);

      expect(headers["X-FormBridge-Signature"]).toBeUndefined();
    });
  });

  describe("dryRun", () => {
    it("should return what would be sent without sending", () => {
      manager = new WebhookManager(queue, { signingSecret: "secret" });
      const submission = createTestSubmission();
      const result = manager.dryRun(submission, testDestination);

      expect(result.url).toBe("https://example.com/webhook");
      expect(result.method).toBe("POST");
      expect(result.headers["Content-Type"]).toBe("application/json");
      expect(result.headers["X-FormBridge-Signature"]).toMatch(/^sha256=/);
      expect(result.body.submissionId).toBe("sub_test_123");
    });
  });

  describe("delivery lifecycle", () => {
    it("should enqueue delivery and return delivery ID", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      manager = new WebhookManager(queue, { fetchFn: mockFetch as any });
      const submission = createTestSubmission();
      const deliveryId = await manager.enqueueDelivery(
        submission,
        testDestination
      );

      expect(deliveryId).toMatch(/^dlv_/);

      // Allow async processing
      await new Promise((r) => setTimeout(r, 50));

      const record = await queue.get(deliveryId);
      expect(record).toBeDefined();
      expect(record!.status).toBe("succeeded");
    });

    it("should mark delivery as failed after max retries", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      manager = new WebhookManager(queue, {
        fetchFn: mockFetch as any,
        retryPolicy: {
          maxRetries: 2,
          initialDelayMs: 1,
          maxDelayMs: 10,
          backoffMultiplier: 2,
        },
      });

      const submission = createTestSubmission();
      const deliveryId = await manager.enqueueDelivery(
        submission,
        testDestination
      );

      // Wait for retries to complete
      await new Promise((r) => setTimeout(r, 200));

      const record = await queue.get(deliveryId);
      expect(record).toBeDefined();
      expect(record!.status).toBe("failed");
      expect(record!.attempts).toBe(2);
      expect(record!.error).toMatch(/HTTP 500/);
    });

    it("should handle network errors with retry", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));

      manager = new WebhookManager(queue, {
        fetchFn: mockFetch as any,
        retryPolicy: {
          maxRetries: 1,
          initialDelayMs: 1,
          maxDelayMs: 10,
          backoffMultiplier: 2,
        },
      });

      const submission = createTestSubmission();
      const deliveryId = await manager.enqueueDelivery(
        submission,
        testDestination
      );

      await new Promise((r) => setTimeout(r, 100));

      const record = await queue.get(deliveryId);
      expect(record).toBeDefined();
      expect(record!.status).toBe("failed");
      expect(record!.error).toBe("Network error");
    });
  });

  describe("delivery events", () => {
    it("should emit delivery.attempted and delivery.succeeded events", async () => {
      const emittedEvents: IntakeEvent[] = [];
      const mockEmitter = {
        emit: vi.fn(async (event: IntakeEvent) => {
          emittedEvents.push(event);
        }),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      manager = new WebhookManager(queue, {
        fetchFn: mockFetch as any,
        eventEmitter: mockEmitter,
      });

      const submission = createTestSubmission();
      await manager.enqueueDelivery(submission, testDestination);

      await new Promise((r) => setTimeout(r, 100));

      const attempted = emittedEvents.filter(
        (e) => e.type === "delivery.attempted"
      );
      const succeeded = emittedEvents.filter(
        (e) => e.type === "delivery.succeeded"
      );

      expect(attempted.length).toBeGreaterThan(0);
      expect(succeeded.length).toBe(1);
      expect(succeeded[0].payload?.statusCode).toBe(200);
    });

    it("should emit delivery.failed event on failure", async () => {
      const emittedEvents: IntakeEvent[] = [];
      const mockEmitter = {
        emit: vi.fn(async (event: IntakeEvent) => {
          emittedEvents.push(event);
        }),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      manager = new WebhookManager(queue, {
        fetchFn: mockFetch as any,
        eventEmitter: mockEmitter,
        retryPolicy: {
          maxRetries: 1,
          initialDelayMs: 1,
          maxDelayMs: 10,
          backoffMultiplier: 2,
        },
      });

      const submission = createTestSubmission();
      await manager.enqueueDelivery(submission, testDestination);

      await new Promise((r) => setTimeout(r, 100));

      const failed = emittedEvents.filter(
        (e) => e.type === "delivery.failed"
      );
      expect(failed.length).toBe(1);
    });
  });

  describe("getDeliveries", () => {
    it("should return deliveries for a submission", async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

      manager = new WebhookManager(queue, { fetchFn: mockFetch as any });
      const submission = createTestSubmission();

      await manager.enqueueDelivery(submission, testDestination);
      await new Promise((r) => setTimeout(r, 50));

      const deliveries = await manager.getDeliveries("sub_test_123");
      expect(deliveries.length).toBe(1);
      expect(deliveries[0].submissionId).toBe("sub_test_123");
    });
  });
});
