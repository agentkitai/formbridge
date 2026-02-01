/**
 * MemoryStorage — In-memory implementation of FormBridgeStorage.
 * Wraps existing in-memory stores for backward compatibility.
 */

import type { Submission } from "../submission-types.js";
import type { EventStore } from "../core/event-store.js";
import type { StorageBackend } from "./storage-backend.js";
import { InMemoryEventStore } from "../core/event-store.js";
import type {
  FormBridgeStorage,
  SubmissionStorage,
  SubmissionFilter,
  PaginatedResult,
  PaginationOptions,
} from "./storage-interface.js";

// =============================================================================
// § In-Memory Submission Storage
// =============================================================================

export class InMemorySubmissionStorage implements SubmissionStorage {
  private submissions = new Map<string, Submission>();
  private byResumeToken = new Map<string, string>(); // token -> submissionId
  private byIdempotencyKey = new Map<string, string>(); // key -> submissionId
  private lastKnownToken = new Map<string, string>(); // submissionId -> last saved token

  async get(id: string): Promise<Submission | null> {
    return this.submissions.get(id) ?? null;
  }

  async getByResumeToken(token: string): Promise<Submission | null> {
    const id = this.byResumeToken.get(token);
    if (!id) return null;
    return this.submissions.get(id) ?? null;
  }

  async getByIdempotencyKey(key: string): Promise<Submission | null> {
    const id = this.byIdempotencyKey.get(key);
    if (!id) return null;
    return this.submissions.get(id) ?? null;
  }

  async save(submission: Submission): Promise<void> {
    // O(1) stale token cleanup using reverse index
    const oldToken = this.lastKnownToken.get(submission.id);
    if (oldToken && oldToken !== submission.resumeToken) {
      this.byResumeToken.delete(oldToken);
    }

    this.submissions.set(submission.id, submission);
    this.byResumeToken.set(submission.resumeToken, submission.id);
    this.lastKnownToken.set(submission.id, submission.resumeToken);

    if (submission.idempotencyKey) {
      this.byIdempotencyKey.set(submission.idempotencyKey, submission.id);
    }
  }

  async delete(id: string): Promise<boolean> {
    const submission = this.submissions.get(id);
    if (!submission) return false;

    this.byResumeToken.delete(submission.resumeToken);
    if (submission.idempotencyKey) {
      this.byIdempotencyKey.delete(submission.idempotencyKey);
    }
    this.submissions.delete(id);
    return true;
  }

  async list(
    filter: SubmissionFilter,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<Submission>> {
    let items = Array.from(this.submissions.values());

    // Apply filters
    if (filter.intakeId) {
      items = items.filter((s) => s.intakeId === filter.intakeId);
    }
    if (filter.state) {
      items = items.filter((s) => s.state === filter.state);
    }
    if (filter.createdAfter) {
      items = items.filter((s) => s.createdAt >= filter.createdAfter!);
    }
    if (filter.createdBefore) {
      items = items.filter((s) => s.createdAt <= filter.createdBefore!);
    }

    // Sort by createdAt descending (newest first)
    items.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const total = items.length;
    const offset = pagination?.offset ?? 0;
    const limit = pagination?.limit ?? 50;

    const paginatedItems = items.slice(offset, offset + limit);

    return {
      items: paginatedItems,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    };
  }

  async count(filter: SubmissionFilter): Promise<number> {
    const result = await this.list(filter, { limit: 0 });
    return result.total;
  }
}

// =============================================================================
// § No-Op File Storage Backend (for when files aren't needed)
// =============================================================================

class NoopStorageBackend implements StorageBackend {
  async generateUploadUrl(): Promise<never> {
    throw new Error("File storage not configured");
  }
  async verifyUpload(): Promise<never> {
    throw new Error("File storage not configured");
  }
  async getUploadMetadata(): Promise<undefined> {
    throw new Error("File storage not configured");
  }
  async generateDownloadUrl(): Promise<undefined> {
    throw new Error("File storage not configured");
  }
  async deleteUpload(): Promise<boolean> {
    throw new Error("File storage not configured");
  }
  async cleanupExpired(): Promise<void> {
    throw new Error("File storage not configured");
  }
}

// =============================================================================
// § MemoryStorage — Unified In-Memory Storage
// =============================================================================

export class MemoryStorage implements FormBridgeStorage {
  submissions: InMemorySubmissionStorage;
  events: EventStore;
  files: StorageBackend;

  constructor(options?: {
    eventStore?: EventStore;
    fileStorage?: StorageBackend;
  }) {
    this.submissions = new InMemorySubmissionStorage();
    this.events = options?.eventStore ?? new InMemoryEventStore();
    this.files = options?.fileStorage ?? new NoopStorageBackend();
  }

  async initialize(): Promise<void> {
    // No-op for in-memory storage
  }

  async close(): Promise<void> {
    // No-op for in-memory storage
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    // Simple read test
    await this.submissions.get("__health_check__");
    return { ok: true, latencyMs: Date.now() - start };
  }
}
