/**
 * Tests for webhook delivery routes
 *
 * Tests the Hono webhook router endpoints for delivery status queries and retry functionality.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { createHonoWebhookRouter } from "../../src/routes/hono-webhooks.js";
import type { WebhookManager } from "../../src/core/webhook-manager.js";
import type { DeliveryRecord, DeliveryQueue } from "../../src/types/intake-contract.js";

// ---------- Mock WebhookManager ----------

class MockWebhookManager implements Pick<WebhookManager, 'getDeliveries' | 'getDelivery' | 'getQueue'> {
  private deliveries = new Map<string, DeliveryRecord>();
  private mockQueue: MockDeliveryQueue;

  constructor() {
    this.mockQueue = new MockDeliveryQueue(this.deliveries);
  }

  async getDeliveries(submissionId: string): Promise<DeliveryRecord[]> {
    const deliveries = Array.from(this.deliveries.values()).filter(
      (delivery) => delivery.submissionId === submissionId
    );
    return deliveries;
  }

  async getDelivery(deliveryId: string): Promise<DeliveryRecord | null> {
    return this.deliveries.get(deliveryId) || null;
  }

  getQueue(): DeliveryQueue {
    return this.mockQueue as any;
  }

  // Test helper methods
  addDelivery(delivery: DeliveryRecord): void {
    this.deliveries.set(delivery.deliveryId, delivery);
  }

  updateDelivery(delivery: DeliveryRecord): void {
    if (this.deliveries.has(delivery.deliveryId)) {
      this.deliveries.set(delivery.deliveryId, delivery);
    }
  }

  clear(): void {
    this.deliveries.clear();
  }
}

class MockDeliveryQueue {
  constructor(private deliveries: Map<string, DeliveryRecord>) {}

  async update(delivery: DeliveryRecord): Promise<void> {
    if (!this.deliveries.has(delivery.deliveryId)) {
      throw new Error("Delivery not found");
    }
    this.deliveries.set(delivery.deliveryId, delivery);
  }
}

// ---------- Test Helpers ----------

function createTestDelivery(overrides?: Partial<DeliveryRecord>): DeliveryRecord {
  const timestamp = new Date().toISOString();
  return {
    deliveryId: `dlv_test_${Math.random().toString(36).slice(2)}`,
    submissionId: "sub_test_123",
    destinationUrl: "https://example.com/webhook",
    status: "pending",
    attempts: 0,
    createdAt: timestamp,
    ...overrides,
  };
}

// ---------- Tests ----------

describe("Hono Webhook Routes", () => {
  let app: Hono;
  let mockManager: MockWebhookManager;

  beforeEach(() => {
    mockManager = new MockWebhookManager();
    app = new Hono();
    app.route("/", createHonoWebhookRouter(mockManager as any));
  });

  describe("GET /submissions/:id/deliveries", () => {
    it("should return empty array when no deliveries exist", async () => {
      const res = await app.request("/submissions/sub_empty/deliveries");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        ok: true,
        submissionId: "sub_empty",
        deliveries: [],
        total: 0,
      });
    });

    it("should return deliveries for a submission", async () => {
      // Add test deliveries
      const delivery1 = createTestDelivery({
        deliveryId: "dlv_1",
        submissionId: "sub_test_123",
        status: "succeeded",
      });
      const delivery2 = createTestDelivery({
        deliveryId: "dlv_2", 
        submissionId: "sub_test_123",
        status: "pending",
      });
      const delivery3 = createTestDelivery({
        deliveryId: "dlv_3",
        submissionId: "sub_other_456",
        status: "failed",
      });

      mockManager.addDelivery(delivery1);
      mockManager.addDelivery(delivery2);
      mockManager.addDelivery(delivery3);

      const res = await app.request("/submissions/sub_test_123/deliveries");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.submissionId).toBe("sub_test_123");
      expect(data.deliveries).toHaveLength(2);
      expect(data.total).toBe(2);
      
      const deliveryIds = data.deliveries.map((d: DeliveryRecord) => d.deliveryId);
      expect(deliveryIds).toContain("dlv_1");
      expect(deliveryIds).toContain("dlv_2");
      expect(deliveryIds).not.toContain("dlv_3"); // Different submission
    });

    it("should handle submissions with multiple deliveries of different statuses", async () => {
      const deliveries = [
        createTestDelivery({ deliveryId: "dlv_pending", submissionId: "sub_multi", status: "pending" }),
        createTestDelivery({ deliveryId: "dlv_succeeded", submissionId: "sub_multi", status: "succeeded" }),
        createTestDelivery({ deliveryId: "dlv_failed", submissionId: "sub_multi", status: "failed" }),
      ];

      deliveries.forEach(d => mockManager.addDelivery(d));

      const res = await app.request("/submissions/sub_multi/deliveries");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.deliveries).toHaveLength(3);
      
      const statuses = data.deliveries.map((d: DeliveryRecord) => d.status);
      expect(statuses).toContain("pending");
      expect(statuses).toContain("succeeded");
      expect(statuses).toContain("failed");
    });
  });

  describe("GET /webhooks/deliveries/:deliveryId", () => {
    it("should return delivery when found", async () => {
      const delivery = createTestDelivery({
        deliveryId: "dlv_found",
        submissionId: "sub_test",
        status: "succeeded",
        attempts: 2,
        statusCode: 200,
      });
      
      mockManager.addDelivery(delivery);

      const res = await app.request("/webhooks/deliveries/dlv_found");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        ok: true,
        delivery: delivery,
      });
    });

    it("should return 404 when delivery not found", async () => {
      const res = await app.request("/webhooks/deliveries/dlv_nonexistent");

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toEqual({
        ok: false,
        error: {
          type: "not_found",
          message: "Delivery 'dlv_nonexistent' not found",
        },
      });
    });

    it("should return delivery with all fields intact", async () => {
      const delivery = createTestDelivery({
        deliveryId: "dlv_detailed",
        submissionId: "sub_detailed",
        destinationUrl: "https://api.example.com/webhook",
        status: "failed",
        attempts: 3,
        statusCode: 500,
        error: "HTTP 500",
        lastAttemptAt: "2024-01-01T12:00:00.000Z",
        nextRetryAt: "2024-01-01T12:05:00.000Z",
      });
      
      mockManager.addDelivery(delivery);

      const res = await app.request("/webhooks/deliveries/dlv_detailed");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.delivery).toEqual(delivery);
      expect(data.delivery.destinationUrl).toBe("https://api.example.com/webhook");
      expect(data.delivery.error).toBe("HTTP 500");
      expect(data.delivery.attempts).toBe(3);
    });
  });

  describe("POST /webhooks/deliveries/:deliveryId/retry", () => {
    it("should successfully retry a failed delivery", async () => {
      const failedDelivery = createTestDelivery({
        deliveryId: "dlv_retry_success",
        submissionId: "sub_retry",
        status: "failed",
        attempts: 3,
        error: "Connection timeout",
        nextRetryAt: "2024-01-01T12:00:00.000Z",
      });
      
      mockManager.addDelivery(failedDelivery);

      const res = await app.request("/webhooks/deliveries/dlv_retry_success/retry", {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        ok: true,
        deliveryId: "dlv_retry_success",
        status: "pending",
        message: "Delivery queued for retry",
      });

      // Verify the delivery was updated
      const updatedDelivery = await mockManager.getDelivery("dlv_retry_success");
      expect(updatedDelivery).toBeTruthy();
      expect(updatedDelivery!.status).toBe("pending");
      expect(updatedDelivery!.attempts).toBe(0);
      expect(updatedDelivery!.error).toBeUndefined();
      expect(updatedDelivery!.nextRetryAt).toBeUndefined();
    });

    it("should return 409 conflict when trying to retry a non-failed delivery", async () => {
      const succeededDelivery = createTestDelivery({
        deliveryId: "dlv_retry_conflict",
        submissionId: "sub_retry",
        status: "succeeded",
        attempts: 1,
      });
      
      mockManager.addDelivery(succeededDelivery);

      const res = await app.request("/webhooks/deliveries/dlv_retry_conflict/retry", {
        method: "POST",
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data).toEqual({
        ok: false,
        error: {
          type: "conflict",
          message: "Delivery is in 'succeeded' state, only failed deliveries can be retried",
        },
      });
    });

    it("should return 409 conflict for pending delivery", async () => {
      const pendingDelivery = createTestDelivery({
        deliveryId: "dlv_retry_pending",
        submissionId: "sub_retry",
        status: "pending",
        attempts: 1,
      });
      
      mockManager.addDelivery(pendingDelivery);

      const res = await app.request("/webhooks/deliveries/dlv_retry_pending/retry", {
        method: "POST",
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error.type).toBe("conflict");
      expect(data.error.message).toContain("pending");
    });

    it("should return 404 when trying to retry non-existent delivery", async () => {
      const res = await app.request("/webhooks/deliveries/dlv_nonexistent/retry", {
        method: "POST",
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toEqual({
        ok: false,
        error: {
          type: "not_found",
          message: "Delivery 'dlv_nonexistent' not found",
        },
      });
    });

    it("should reset all retry-related fields when retrying", async () => {
      const failedDelivery = createTestDelivery({
        deliveryId: "dlv_retry_reset",
        submissionId: "sub_retry",
        status: "failed",
        attempts: 5,
        error: "Multiple failures",
        lastAttemptAt: "2024-01-01T10:00:00.000Z",
        nextRetryAt: "2024-01-01T10:30:00.000Z",
        statusCode: 500,
      });
      
      mockManager.addDelivery(failedDelivery);

      const res = await app.request("/webhooks/deliveries/dlv_retry_reset/retry", {
        method: "POST",
      });

      expect(res.status).toBe(200);

      // Verify all retry fields were reset
      const updatedDelivery = await mockManager.getDelivery("dlv_retry_reset");
      expect(updatedDelivery).toBeTruthy();
      expect(updatedDelivery!.status).toBe("pending");
      expect(updatedDelivery!.attempts).toBe(0);
      expect(updatedDelivery!.error).toBeUndefined();
      expect(updatedDelivery!.nextRetryAt).toBeUndefined();
      
      // These fields should remain unchanged
      expect(updatedDelivery!.submissionId).toBe("sub_retry");
      expect(updatedDelivery!.destinationUrl).toBe("https://example.com/webhook");
      expect(updatedDelivery!.createdAt).toBe(failedDelivery.createdAt);
    });

    it("should handle queue update errors gracefully", async () => {
      const failedDelivery = createTestDelivery({
        deliveryId: "dlv_queue_error",
        submissionId: "sub_retry", 
        status: "failed",
        attempts: 1,
      });
      
      mockManager.addDelivery(failedDelivery);

      // Mock queue.update to throw an error
      const mockQueue = mockManager.getQueue();
      const originalUpdate = mockQueue.update;
      mockQueue.update = vi.fn().mockRejectedValue(new Error("Queue update failed"));

      const res = await app.request("/webhooks/deliveries/dlv_queue_error/retry", {
        method: "POST",
      });

      // The endpoint should still try to process but may fail
      // This tests that errors in queue operations are handled
      expect(res.status).toBeGreaterThanOrEqual(500);

      // Restore original method
      mockQueue.update = originalUpdate;
    });
  });

  describe("error response format consistency", () => {
    it("should return consistent error format for 404 responses", async () => {
      const endpoints = [
        "/webhooks/deliveries/nonexistent",
        "/webhooks/deliveries/nonexistent/retry",
      ];

      for (const endpoint of endpoints) {
        const method = endpoint.includes("/retry") ? "POST" : "GET";
        const res = await app.request(endpoint, { method });
        
        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data).toHaveProperty("ok", false);
        expect(data).toHaveProperty("error");
        expect(data.error).toHaveProperty("type", "not_found");
        expect(data.error).toHaveProperty("message");
        expect(typeof data.error.message).toBe("string");
      }
    });

    it("should return consistent error format for 409 responses", async () => {
      const succeededDelivery = createTestDelivery({
        deliveryId: "dlv_409_test",
        status: "succeeded",
      });
      
      mockManager.addDelivery(succeededDelivery);

      const res = await app.request("/webhooks/deliveries/dlv_409_test/retry", {
        method: "POST",
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data).toHaveProperty("ok", false);
      expect(data).toHaveProperty("error");
      expect(data.error).toHaveProperty("type", "conflict");
      expect(data.error).toHaveProperty("message");
    });
  });

  describe("integration edge cases", () => {
    it("should handle delivery with minimal fields", async () => {
      const minimalDelivery: DeliveryRecord = {
        deliveryId: "dlv_minimal",
        submissionId: "sub_minimal",
        destinationUrl: "https://webhook.example.com",
        status: "pending",
        attempts: 0,
        createdAt: "2024-01-01T00:00:00.000Z",
      };
      
      mockManager.addDelivery(minimalDelivery);

      const res = await app.request("/webhooks/deliveries/dlv_minimal");
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.delivery).toEqual(minimalDelivery);
    });

    it("should handle extremely long delivery IDs", async () => {
      const longId = "dlv_" + "a".repeat(100);
      const delivery = createTestDelivery({
        deliveryId: longId,
        status: "failed",
      });
      
      mockManager.addDelivery(delivery);

      const res = await app.request(`/webhooks/deliveries/${longId}/retry`, {
        method: "POST",
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.deliveryId).toBe(longId);
    });

    it("should preserve delivery order in lists", async () => {
      const now = new Date();
      const deliveries = [
        createTestDelivery({ 
          deliveryId: "dlv_first",
          submissionId: "sub_order_test",
          createdAt: new Date(now.getTime() - 2000).toISOString(),
        }),
        createTestDelivery({ 
          deliveryId: "dlv_second",
          submissionId: "sub_order_test", 
          createdAt: new Date(now.getTime() - 1000).toISOString(),
        }),
        createTestDelivery({ 
          deliveryId: "dlv_third",
          submissionId: "sub_order_test",
          createdAt: now.toISOString(),
        }),
      ];

      deliveries.forEach(d => mockManager.addDelivery(d));

      const res = await app.request("/submissions/sub_order_test/deliveries");
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.deliveries).toHaveLength(3);
      
      // The order should match what the mock manager returns
      const returnedIds = data.deliveries.map((d: DeliveryRecord) => d.deliveryId);
      expect(returnedIds).toEqual(["dlv_first", "dlv_second", "dlv_third"]);
    });
  });
});