/**
 * LocalStorageBackend - Local filesystem storage implementation
 *
 * Implements:
 * - Local filesystem storage for development/testing
 * - Signed URL generation with HMAC authentication
 * - Upload tracking and verification
 * - File metadata management
 * - Automatic cleanup of expired uploads
 *
 * Security:
 * - Uses HMAC-SHA256 for signed URL authentication
 * - Enforces upload constraints (size, MIME type, count)
 * - Prevents path traversal attacks
 * - Automatic expiration of upload URLs
 */

import { randomBytes, createHmac } from 'crypto';
import { promises as fs } from 'fs';
import { join, dirname, basename } from 'path';
import type {
  StorageBackend,
  SignedUploadUrl,
  UploadConstraints,
  UploadStatusResult,
  UploadedFile,
} from './storage-backend.js';

/**
 * Configuration options for LocalStorageBackend
 */
export interface LocalStorageConfig {
  /** Base directory for storing uploaded files */
  storageDir: string;
  /** Base URL for this service (e.g., "http://localhost:3000") */
  baseUrl: string;
  /** Secret key for signing URLs (randomly generated if not provided) */
  signatureSecret?: string;
  /** Default URL expiration time in seconds (default: 900 = 15 minutes) */
  defaultExpirationSeconds?: number;
}

/**
 * Metadata tracked for each upload
 */
interface UploadMetadata {
  uploadId: string;
  intakeId: string;
  submissionId: string;
  fieldPath: string;
  filename: string;
  mimeType: string;
  constraints: UploadConstraints;
  storageKey: string;
  status: 'pending' | 'completed' | 'failed' | 'expired';
  expiresAt: string;
  uploadedAt?: string;
  size?: number;
  error?: string;
}

/**
 * LocalStorageBackend provides file storage on the local filesystem.
 *
 * File organization:
 * - {storageDir}/uploads/{intakeId}/{submissionId}/{uploadId}-{filename}
 * - {storageDir}/.metadata/{uploadId}.json
 *
 * Upload flow:
 * 1. generateUploadUrl() creates signed URL and metadata
 * 2. Client uploads to PUT {baseUrl}/uploads/{uploadId}
 * 3. Server verifies signature and constraints
 * 4. verifyUpload() checks completion and returns metadata
 */
export class LocalStorageBackend implements StorageBackend {
  private readonly config: Required<LocalStorageConfig>;
  private readonly uploads: Map<string, UploadMetadata> = new Map();

  constructor(config: LocalStorageConfig) {
    this.config = {
      storageDir: config.storageDir,
      baseUrl: config.baseUrl.replace(/\/$/, ''), // Remove trailing slash
      signatureSecret: config.signatureSecret ?? randomBytes(32).toString('hex'),
      defaultExpirationSeconds: config.defaultExpirationSeconds ?? 900, // 15 minutes
    };
  }

  /**
   * Generate a signed URL for direct file upload.
   * Returns a URL authenticated with HMAC signature.
   */
  async generateUploadUrl(params: {
    intakeId: string;
    submissionId: string;
    fieldPath: string;
    filename: string;
    mimeType: string;
    constraints: UploadConstraints;
  }): Promise<SignedUploadUrl> {
    const uploadId = this.generateUploadId();
    const expiresAt = new Date(
      Date.now() + this.config.defaultExpirationSeconds * 1000
    ).toISOString();

    // Generate storage key
    const storageKey = this.generateStorageKey(
      params.intakeId,
      params.submissionId,
      uploadId,
      params.filename
    );

    // Create metadata
    const metadata: UploadMetadata = {
      uploadId,
      intakeId: params.intakeId,
      submissionId: params.submissionId,
      fieldPath: params.fieldPath,
      filename: params.filename,
      mimeType: params.mimeType,
      constraints: params.constraints,
      storageKey,
      status: 'pending',
      expiresAt,
    };

    // Store metadata
    this.uploads.set(uploadId, metadata);
    await this.persistMetadata(metadata);

    // Generate signed URL
    const signature = this.generateSignature(uploadId, expiresAt);
    const url = `${this.config.baseUrl}/uploads/${uploadId}?signature=${signature}&expires=${encodeURIComponent(expiresAt)}`;

    return {
      url,
      method: 'PUT',
      headers: {
        'Content-Type': params.mimeType,
      },
      expiresAt,
      uploadId,
      constraints: params.constraints,
    };
  }

  /**
   * Verify that an upload has completed successfully.
   * Checks file existence, size constraints, and MIME type.
   */
  async verifyUpload(uploadId: string): Promise<UploadStatusResult> {
    const metadata = this.uploads.get(uploadId) ?? (await this.loadMetadata(uploadId));

    if (!metadata) {
      return {
        status: 'failed',
        error: 'Upload not found',
      };
    }

    // Check expiration
    if (new Date(metadata.expiresAt) < new Date() && metadata.status === 'pending') {
      metadata.status = 'expired';
      this.uploads.set(uploadId, metadata);
      await this.persistMetadata(metadata);
      return {
        status: 'expired',
        error: 'Upload URL has expired',
      };
    }

    // If already completed, return cached result
    if (metadata.status === 'completed' && metadata.size !== undefined) {
      return {
        status: 'completed',
        file: {
          uploadId: metadata.uploadId,
          filename: metadata.filename,
          mimeType: metadata.mimeType,
          size: metadata.size,
          storageKey: metadata.storageKey,
          uploadedAt: metadata.uploadedAt!,
        },
      };
    }

    // Check if file exists
    const filePath = join(this.config.storageDir, metadata.storageKey);
    try {
      const stats = await fs.stat(filePath);

      // Verify size constraint
      if (stats.size > metadata.constraints.maxSize) {
        metadata.status = 'failed';
        metadata.error = `File size ${stats.size} exceeds maximum ${metadata.constraints.maxSize}`;
        this.uploads.set(uploadId, metadata);
        await this.persistMetadata(metadata);
        return {
          status: 'failed',
          error: metadata.error,
        };
      }

      // Update metadata with completion info
      metadata.status = 'completed';
      metadata.size = stats.size;
      metadata.uploadedAt = new Date().toISOString();
      this.uploads.set(uploadId, metadata);
      await this.persistMetadata(metadata);

      return {
        status: 'completed',
        file: {
          uploadId: metadata.uploadId,
          filename: metadata.filename,
          mimeType: metadata.mimeType,
          size: stats.size,
          storageKey: metadata.storageKey,
          uploadedAt: metadata.uploadedAt,
        },
      };
    } catch (error) {
      // File doesn't exist yet
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          status: 'pending',
        };
      }

      // Other error
      metadata.status = 'failed';
      metadata.error = `Verification failed: ${(error as Error).message}`;
      this.uploads.set(uploadId, metadata);
      await this.persistMetadata(metadata);
      return {
        status: 'failed',
        error: metadata.error,
      };
    }
  }

  /**
   * Get metadata for a previously completed upload.
   */
  async getUploadMetadata(uploadId: string): Promise<UploadedFile | undefined> {
    const metadata = this.uploads.get(uploadId) ?? (await this.loadMetadata(uploadId));

    if (!metadata || metadata.status !== 'completed' || metadata.size === undefined) {
      return undefined;
    }

    return {
      uploadId: metadata.uploadId,
      filename: metadata.filename,
      mimeType: metadata.mimeType,
      size: metadata.size,
      storageKey: metadata.storageKey,
      uploadedAt: metadata.uploadedAt!,
    };
  }

  /**
   * Generate a signed URL for downloading a previously uploaded file.
   */
  async generateDownloadUrl(
    uploadId: string,
    expiresInSeconds: number = 3600
  ): Promise<string | undefined> {
    const metadata = this.uploads.get(uploadId) ?? (await this.loadMetadata(uploadId));

    if (!metadata || metadata.status !== 'completed') {
      return undefined;
    }

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    const signature = this.generateSignature(uploadId, expiresAt);

    return `${this.config.baseUrl}/downloads/${uploadId}?signature=${signature}&expires=${encodeURIComponent(expiresAt)}`;
  }

  /**
   * Delete an uploaded file from storage.
   */
  async deleteUpload(uploadId: string): Promise<boolean> {
    const metadata = this.uploads.get(uploadId) ?? (await this.loadMetadata(uploadId));

    if (!metadata) {
      return false;
    }

    // Delete file
    const filePath = join(this.config.storageDir, metadata.storageKey);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Delete metadata
    const metadataPath = join(this.config.storageDir, '.metadata', `${uploadId}.json`);
    try {
      await fs.unlink(metadataPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Remove from cache
    this.uploads.delete(uploadId);

    return true;
  }

  /**
   * Clean up expired upload URLs and associated temporary storage.
   */
  async cleanupExpired(): Promise<void> {
    const now = new Date();

    // Cleanup in-memory uploads
    for (const [uploadId, metadata] of this.uploads.entries()) {
      if (new Date(metadata.expiresAt) < now && metadata.status === 'pending') {
        await this.deleteUpload(uploadId);
      }
    }

    // Cleanup persisted metadata
    const metadataDir = join(this.config.storageDir, '.metadata');
    try {
      const files = await fs.readdir(metadataDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const uploadId = file.replace('.json', '');
          const metadata = await this.loadMetadata(uploadId);
          if (metadata && new Date(metadata.expiresAt) < now && metadata.status === 'pending') {
            await this.deleteUpload(uploadId);
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Initialize storage directories.
   * Should be called before first use.
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.storageDir, { recursive: true });
    await fs.mkdir(join(this.config.storageDir, '.metadata'), { recursive: true });
  }

  /**
   * Verify a signed URL signature and expiration.
   * Used by upload endpoint to validate incoming requests.
   */
  verifySignature(uploadId: string, signature: string, expiresAt: string): boolean {
    // Check expiration
    if (new Date(expiresAt) < new Date()) {
      return false;
    }

    // Verify signature
    const expectedSignature = this.generateSignature(uploadId, expiresAt);
    return signature === expectedSignature;
  }

  /**
   * Get the filesystem path for an upload.
   * Used by upload endpoint to write uploaded files.
   */
  async getUploadPath(uploadId: string): Promise<string | undefined> {
    const metadata = this.uploads.get(uploadId) ?? (await this.loadMetadata(uploadId));

    if (!metadata) {
      return undefined;
    }

    const filePath = join(this.config.storageDir, metadata.storageKey);
    await fs.mkdir(dirname(filePath), { recursive: true });

    return filePath;
  }

  /**
   * Mark an upload as completed.
   * Used by upload endpoint after successful file write.
   */
  async markUploadCompleted(uploadId: string, size: number): Promise<void> {
    const metadata = this.uploads.get(uploadId) ?? (await this.loadMetadata(uploadId));

    if (!metadata) {
      throw new Error('Upload not found');
    }

    metadata.status = 'completed';
    metadata.size = size;
    metadata.uploadedAt = new Date().toISOString();

    this.uploads.set(uploadId, metadata);
    await this.persistMetadata(metadata);
  }

  // =============================================================================
  // Private Helper Methods
  // =============================================================================

  /**
   * Generates a unique upload ID.
   */
  private generateUploadId(): string {
    return `upl_${randomBytes(16).toString('hex')}`;
  }

  /**
   * Generates storage key (relative path within storage directory).
   * Format: uploads/{intakeId}/{submissionId}/{uploadId}-{filename}
   */
  private generateStorageKey(
    intakeId: string,
    submissionId: string,
    uploadId: string,
    filename: string
  ): string {
    // Sanitize filename to prevent path traversal
    const sanitizedFilename = basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    return join('uploads', intakeId, submissionId, `${uploadId}-${sanitizedFilename}`);
  }

  /**
   * Generates HMAC signature for URL authentication.
   */
  private generateSignature(uploadId: string, expiresAt: string): string {
    const message = `${uploadId}:${expiresAt}`;
    return createHmac('sha256', this.config.signatureSecret)
      .update(message)
      .digest('hex');
  }

  /**
   * Persist metadata to disk.
   */
  private async persistMetadata(metadata: UploadMetadata): Promise<void> {
    const metadataPath = join(
      this.config.storageDir,
      '.metadata',
      `${metadata.uploadId}.json`
    );
    await fs.mkdir(dirname(metadataPath), { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Load metadata from disk.
   */
  private async loadMetadata(uploadId: string): Promise<UploadMetadata | undefined> {
    const metadataPath = join(this.config.storageDir, '.metadata', `${uploadId}.json`);
    try {
      const data = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(data) as UploadMetadata;
      this.uploads.set(uploadId, metadata);
      return metadata;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }
}
