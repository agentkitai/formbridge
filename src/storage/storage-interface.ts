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
import type { DeliveryQueue } from "../core/delivery-queue.js";

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

  // ---------------------------------------------------------------------------
  // Analytics / lifecycle surface (used by the analytics provider + expiry).
  // These were previously satisfied by an inline in-memory store in app.ts;
  // they are now part of the durable SubmissionStorage contract.
  // ---------------------------------------------------------------------------

  /** Submissions with expiresAt in the past that are NOT in a terminal state. */
  getExpired(): Promise<Submission[]>;
  /**
   * All submissions, optionally scoped to a tenant. When tenantId is provided,
   * returns submissions with no tenant OR a matching tenant (matches the prior
   * inline-store semantics used by tenant-scoped analytics).
   */
  getAll(tenantId?: string): Promise<Submission[]>;
  /** Count of submissions per state (only states with count > 0). */
  getStateCounts(): Promise<Record<string, number>>;
  /** Total number of stored submissions. */
  getTotalCount(): Promise<number>;
  /** Number of submissions currently in the needs_review state. */
  getPendingApprovalCount(): Promise<number>;
}

// =============================================================================
// § Storage Transaction
// =============================================================================

/**
 * A single-connection/single-transaction view over the writable stores.
 * All writes performed through `tx` commit or roll back atomically.
 * Exposes only the write surface needed by the event-sourced write path
 * (save submission + append event + enqueue delivery).
 */
export interface StorageTransaction {
  submissions: Pick<SubmissionStorage, "save">;
  events: Pick<EventStore, "appendEvent">;
  deliveries: Pick<DeliveryQueue, "enqueue">;
}

// =============================================================================
// § Unified Storage Interface
// =============================================================================

export interface FormBridgeStorage {
  submissions: SubmissionStorage;
  events: EventStore;
  files: StorageBackend;
  /** Durable outbox for webhook/destination deliveries. */
  deliveries: DeliveryQueue;
  initialize(): Promise<void>;
  close(): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number }>;
  /**
   * Run `fn` inside a single atomic transaction. All writes made through the
   * provided `tx` handle commit together, or roll back together if `fn` throws.
   * In-memory storage runs `fn` against itself (pass-through, no rollback).
   */
  transaction<T>(fn: (tx: StorageTransaction) => Promise<T>): Promise<T>;
}
