/**
 * FormBridgeStorage — Unified pluggable storage interface.
 *
 * Provides a single abstraction over all storage needs:
 * submissions, events, and files.
 *
 * Implementations:
 * - MemoryStorage: In-memory for dev/testing (wraps existing stores)
 * - SqliteStorage: SQLite for single-node production (via better-sqlite3)
 */

import type { Submission } from "../submission-types.js";
import type { EventStore } from "../core/event-store.js";
import type { StorageBackend } from "./storage-backend.js";

// =============================================================================
// § Submission Filter & Pagination
// =============================================================================

export interface SubmissionFilter {
  intakeId?: string;
  state?: string;
  createdAfter?: string;
  createdBefore?: string;
  searchQuery?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

// =============================================================================
// § Submission Storage Interface
// =============================================================================

export interface SubmissionStorage {
  get(id: string): Promise<Submission | null>;
  getByResumeToken(token: string): Promise<Submission | null>;
  getByIdempotencyKey(key: string): Promise<Submission | null>;
  save(submission: Submission): Promise<void>;
  delete(id: string): Promise<boolean>;
  list(
    filter: SubmissionFilter,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<Submission>>;
  count(filter: SubmissionFilter): Promise<number>;
}

// =============================================================================
// § Unified Storage Interface
// =============================================================================

export interface FormBridgeStorage {
  submissions: SubmissionStorage;
  events: EventStore;
  files: StorageBackend;
  initialize(): Promise<void>;
  close(): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number }>;
}
