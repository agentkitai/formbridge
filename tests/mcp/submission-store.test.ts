/**
 * InMemorySubmissionStore tests.
 *
 * The former `MCPSessionStore` block was removed with the class: the MCP
 * transport now runs on the shared SubmissionManager lifecycle (see
 * tests/mcp/handlers.test.ts), so there is no parallel MCP-only store.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySubmissionStore } from "../../src/mcp/submission-store";
import type { Submission } from "../../src/submission-types";

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
    idempotencyKey: undefined,
    ...overrides,
  };
}

describe("InMemorySubmissionStore", () => {
  let store: InMemorySubmissionStore;

  beforeEach(() => {
    store = new InMemorySubmissionStore();
  });

  describe("getByResumeToken - not found cases", () => {
    it("should return null when resume token does not exist", async () => {
      const result = await store.getByResumeToken("nonexistent_token");
      expect(result).toBeNull();
    });

    it("should return null when resume token is empty string", async () => {
      const result = await store.getByResumeToken("");
      expect(result).toBeNull();
    });

    it("should handle concurrent access when token is being updated", async () => {
      const submission = createTestSubmission();
      await store.save(submission);

      // Simulate concurrent access - get by old token after save with new token
      const updatedSubmission = createTestSubmission({
        resumeToken: "new_token",
      });
      await store.save(updatedSubmission);

      // Old token should now return null
      const result = await store.getByResumeToken("rtok_test");
      expect(result).toBeNull();
    });
  });

  describe("getByIdempotencyKey - not found cases", () => {
    it("should return null when idempotency key does not exist", async () => {
      const result = await store.getByIdempotencyKey("nonexistent_key");
      expect(result).toBeNull();
    });

    it("should return null when idempotency key is undefined/empty", async () => {
      const result = await store.getByIdempotencyKey("");
      expect(result).toBeNull();
    });
  });

  describe("stale token cleanup", () => {
    it("should properly cleanup old resume tokens when submission is updated", async () => {
      const submission = createTestSubmission();
      await store.save(submission);

      // Update with new resume token
      const updatedSubmission = createTestSubmission({
        resumeToken: "new_rtok_test",
      });
      await store.save(updatedSubmission);

      // Old token should be cleaned up
      const oldTokenResult = await store.getByResumeToken("rtok_test");
      expect(oldTokenResult).toBeNull();

      // New token should work
      const newTokenResult = await store.getByResumeToken("new_rtok_test");
      expect(newTokenResult).not.toBeNull();
      expect(newTokenResult!.id).toBe("sub_test_123");
    });

    it("should handle multiple token updates for same submission", async () => {
      const submission = createTestSubmission();
      await store.save(submission);

      // Multiple updates with different tokens
      const updates = ["token_1", "token_2", "token_3"];
      for (const token of updates) {
        const updated = createTestSubmission({ resumeToken: token });
        await store.save(updated);
      }

      // Only the latest token should work
      const result = await store.getByResumeToken("token_3");
      expect(result).not.toBeNull();

      // All previous tokens should be cleaned up
      for (const oldToken of ["rtok_test", "token_1", "token_2"]) {
        const oldResult = await store.getByResumeToken(oldToken);
        expect(oldResult).toBeNull();
      }
    });
  });

  describe("idempotency key management", () => {
    it("should handle submissions with and without idempotency keys", async () => {
      // Save submission without idempotency key
      const submission1 = createTestSubmission();
      await store.save(submission1);

      // Save submission with idempotency key
      const submission2 = createTestSubmission({
        id: "sub_test_456",
        resumeToken: "rtok_test_2",
        idempotencyKey: "idem_key_1",
      });
      await store.save(submission2);

      // Verify both can be retrieved
      const result1 = await store.get("sub_test_123");
      expect(result1).not.toBeNull();

      const result2 = await store.getByIdempotencyKey("idem_key_1");
      expect(result2).not.toBeNull();
      expect(result2!.id).toBe("sub_test_456");
    });
  });

  describe("getAll method", () => {
    it("should return all stored submissions", () => {
      store.clear(); // Ensure clean state

      const submissions = [
        createTestSubmission({ id: "sub_1", resumeToken: "tok_1" }),
        createTestSubmission({ id: "sub_2", resumeToken: "tok_2" }),
        createTestSubmission({ id: "sub_3", resumeToken: "tok_3" }),
      ];

      // Save all submissions
      submissions.forEach(async (sub) => await store.save(sub));

      const all = store.getAll();
      expect(all.length).toBe(3);

      // Verify all submissions are present
      const ids = all.map(entry => entry.submission.id);
      expect(ids).toContain("sub_1");
      expect(ids).toContain("sub_2");
      expect(ids).toContain("sub_3");
    });

    it("should return empty array when no submissions exist", () => {
      store.clear();
      const all = store.getAll();
      expect(all).toEqual([]);
    });
  });
});
