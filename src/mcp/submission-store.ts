/**
 * Submission store implementations
 *
 * Contains two store implementations:
 * 1. InMemorySubmissionStore - Used by SubmissionManager for field attribution tracking
 * 2. SubmissionStore - Used by FormBridgeMCPServer for MCP session management
 */

import { randomBytes } from 'crypto';
import type { Submission, SubmissionEntry } from "../types";
import type { SubmissionStore as ISubmissionStore } from "../core/submission-manager";
import { SubmissionState } from "../types/intake-contract.js";

/**
 * Upload metadata for a submission
 */
export interface UploadEntry {
  /** Unique upload identifier */
  uploadId: string;
  /** Field path this upload is for */
  field: string;
  /** Original filename */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** Size in bytes */
  sizeBytes: number;
  /** Upload status */
  status: 'pending' | 'completed' | 'failed';
  /** Signed upload URL */
  url?: string;
  /** When upload was completed */
  uploadedAt?: Date;
  /** Download URL if completed */
  downloadUrl?: string;
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// § InMemorySubmissionStore - for SubmissionManager (main branch architecture)
// =============================================================================

/**
 * In-memory implementation of SubmissionStore interface
 * Used by SubmissionManager for field attribution tracking
 */
export class InMemorySubmissionStore implements ISubmissionStore {
  private submissions: Map<string, SubmissionEntry> = new Map();
  private resumeTokenIndex: Map<string, string> = new Map();

  /**
   * Get submission by ID
   */
  async get(submissionId: string): Promise<Submission | null> {
    const entry = this.submissions.get(submissionId);
    return entry ? entry.submission : null;
  }

  /**
   * Save submission
   * Stores submission with field attribution for audit trail
   */
  async save(submission: Submission): Promise<void> {
    const entry: SubmissionEntry = {
      submission,
      resumeToken: submission.resumeToken,
    };

    this.submissions.set(submission.id, entry);
    this.resumeTokenIndex.set(submission.resumeToken, submission.id);
  }

  /**
   * Get submission by resume token
   */
  async getByResumeToken(resumeToken: string): Promise<Submission | null> {
    const submissionId = this.resumeTokenIndex.get(resumeToken);
    if (!submissionId) {
      return null;
    }

    const entry = this.submissions.get(submissionId);
    return entry ? entry.submission : null;
  }

  /**
   * Clear all submissions (useful for testing)
   */
  clear(): void {
    this.submissions.clear();
    this.resumeTokenIndex.clear();
  }

  /**
   * Get all submissions (useful for debugging)
   */
  getAll(): SubmissionEntry[] {
    return Array.from(this.submissions.values());
  }
}

// =============================================================================
// § SubmissionStore - for FormBridgeMCPServer (MCP session management)
// =============================================================================

/**
 * MCP submission entry stored in memory
 */
export interface MCPSubmissionEntry {
  /** Unique submission identifier */
  submissionId: string;
  /** Resume token for this submission */
  resumeToken: string;
  /** Intake form ID */
  intakeId: string;
  /** Current submission data */
  data: Record<string, unknown>;
  /** Current submission state */
  state: SubmissionState;
  /** Optional idempotency key */
  idempotencyKey?: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** File uploads for this submission */
  uploads?: Record<string, UploadEntry>;
}

/**
 * In-memory submission store for FormBridgeMCPServer
 *
 * Tracks active submission sessions with resumeToken-based access.
 * In production, this should be replaced with a persistent store.
 */
export class SubmissionStore {
  private submissions = new Map<string, MCPSubmissionEntry>();
  private idempotencyKeys = new Map<string, string>(); // idempotencyKey -> resumeToken

  /**
   * Creates a new submission entry
   */
  create(
    intakeId: string,
    data: Record<string, unknown> = {},
    idempotencyKey?: string
  ): MCPSubmissionEntry {
    const submissionId = `sub_${Date.now()}_${randomBytes(8).toString('hex')}`;
    const resumeToken = `tok_${randomBytes(16).toString('hex')}`;

    const entry: MCPSubmissionEntry = {
      submissionId,
      resumeToken,
      intakeId,
      data,
      state: SubmissionState.CREATED,
      idempotencyKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.submissions.set(resumeToken, entry);

    if (idempotencyKey) {
      this.idempotencyKeys.set(idempotencyKey, resumeToken);
    }

    return entry;
  }

  /**
   * Gets a submission by resume token
   */
  get(resumeToken: string): MCPSubmissionEntry | undefined {
    return this.submissions.get(resumeToken);
  }

  /**
   * Gets a submission by idempotency key
   */
  getByIdempotencyKey(idempotencyKey: string): MCPSubmissionEntry | undefined {
    const resumeToken = this.idempotencyKeys.get(idempotencyKey);
    return resumeToken ? this.submissions.get(resumeToken) : undefined;
  }

  /**
   * Updates a submission entry
   */
  update(resumeToken: string, updates: Partial<MCPSubmissionEntry>): MCPSubmissionEntry | undefined {
    const entry = this.submissions.get(resumeToken);
    if (!entry) {
      return undefined;
    }

    const updated = {
      ...entry,
      ...updates,
      updatedAt: new Date()
    };

    this.submissions.set(resumeToken, updated);
    return updated;
  }

  /**
   * Deletes a submission entry
   */
  delete(resumeToken: string): boolean {
    const entry = this.submissions.get(resumeToken);
    if (entry?.idempotencyKey) {
      this.idempotencyKeys.delete(entry.idempotencyKey);
    }
    return this.submissions.delete(resumeToken);
  }
}
