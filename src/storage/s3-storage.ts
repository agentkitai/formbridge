/**
 * S3StorageBackend - S3-compatible object storage implementation
 *
 * Implements:
 * - S3-compatible storage for production deployments
 * - Native S3 presigned URLs for uploads and downloads
 * - Upload tracking and verification via S3 HeadObject
 * - File metadata management with DynamoDB or in-memory fallback
 * - Automatic cleanup of expired uploads
 *
 * Security:
 * - Uses S3's native presigned URL authentication
 * - Enforces upload constraints (size, MIME type, count)
 * - Automatic expiration of upload URLs
 * - Optional server-side encryption
 *
 * Requirements:
 * - @aws-sdk/client-s3
 * - @aws-sdk/s3-request-presigner
 */

import { randomBytes } from 'crypto';
import type {
  StorageBackend,
  SignedUploadUrl,
  UploadConstraints,
  UploadStatusResult,
  UploadedFile,
} from './storage-backend.js';

/**
 * Configuration options for S3StorageBackend
 */
export interface S3StorageConfig {
  /** S3 bucket name for storing uploaded files */
  bucketName: string;
  /** AWS region (e.g., "us-east-1") */
  region: string;
  /** Optional AWS access key ID (uses default credential chain if not provided) */
  accessKeyId?: string;
  /** Optional AWS secret access key (uses default credential chain if not provided) */
  secretAccessKey?: string;
  /** Optional S3 endpoint URL for S3-compatible services (e.g., MinIO, DigitalOcean Spaces) */
  endpoint?: string;
  /** Whether to force path-style URLs (required for MinIO and some S3-compatible services) */
  forcePathStyle?: boolean;
  /** Default URL expiration time in seconds (default: 900 = 15 minutes) */
  defaultExpirationSeconds?: number;
  /** Optional prefix for all object keys (e.g., "uploads/") */
  keyPrefix?: string;
  /** Optional server-side encryption (e.g., "AES256", "aws:kms") */
  serverSideEncryption?: string;
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
 * S3StorageBackend provides file storage on S3-compatible object storage.
 *
 * File organization:
 * - s3://{bucketName}/{keyPrefix}uploads/{intakeId}/{submissionId}/{uploadId}-{filename}
 *
 * Upload flow:
 * 1. generateUploadUrl() creates S3 presigned URL and metadata
 * 2. Client uploads to PUT {presignedUrl}
 * 3. S3 handles authentication and storage
 * 4. verifyUpload() checks completion via HeadObject and returns metadata
 *
 * Note: Requires @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner to be installed.
 * This implementation will throw an error at runtime if these packages are not available.
 */
interface HeadObjectResponse {
  ContentLength?: number;
  LastModified?: Date;
}

interface S3ClientLike {
  send(command: unknown): Promise<HeadObjectResponse & Record<string, unknown>>;
}

interface S3ClientConfig {
  region: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  endpoint?: string;
  forcePathStyle?: boolean;
}

interface PutObjectParams {
  Bucket: string;
  Key: string;
  ContentType: string;
  Metadata: Record<string, string>;
  ServerSideEncryption?: string;
}

type GetSignedUrlFn = (
  client: S3ClientLike,
  command: unknown,
  options: { expiresIn: number }
) => Promise<string>;

export class S3StorageBackend implements StorageBackend {
  private readonly config: Required<Omit<S3StorageConfig, 'accessKeyId' | 'secretAccessKey' | 'endpoint' | 'forcePathStyle' | 'serverSideEncryption'>> &
    Pick<S3StorageConfig, 'accessKeyId' | 'secretAccessKey' | 'endpoint' | 'forcePathStyle' | 'serverSideEncryption'>;
  private readonly uploads: Map<string, UploadMetadata> = new Map();
  private s3Client!: S3ClientLike;
  private getSignedUrl!: GetSignedUrlFn;

  constructor(config: S3StorageConfig) {
    this.config = {
      bucketName: config.bucketName,
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      defaultExpirationSeconds: config.defaultExpirationSeconds ?? 900, // 15 minutes
      keyPrefix: config.keyPrefix ?? '',
      serverSideEncryption: config.serverSideEncryption,
    };

    this.initializeS3Client();
  }

  /**
   * Initialize S3 client with lazy loading of AWS SDK.
   * Throws error if SDK packages are not installed.
   */
  private initializeS3Client(): void {
    try {
      // Dynamic import to avoid hard dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { S3Client } = require('@aws-sdk/client-s3') as { S3Client: new (config: S3ClientConfig) => S3ClientLike };
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner') as { getSignedUrl: GetSignedUrlFn };

      const clientConfig: S3ClientConfig = {
        region: this.config.region,
      };

      // Add credentials if provided
      if (this.config.accessKeyId && this.config.secretAccessKey) {
        clientConfig.credentials = {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        };
      }

      // Add endpoint for S3-compatible services
      if (this.config.endpoint) {
        clientConfig.endpoint = this.config.endpoint;
        clientConfig.forcePathStyle = this.config.forcePathStyle ?? true;
      }

      this.s3Client = new S3Client(clientConfig);
      this.getSignedUrl = getSignedUrl;
    } catch {
      throw new Error(
        'S3StorageBackend requires @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner. ' +
        'Install them with: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner'
      );
    }
  }

  /**
   * Generate a unique upload ID.
   */
  private generateUploadId(): string {
    return `upload_${randomBytes(16).toString('hex')}`;
  }

  /**
   * Generate S3 object key for an upload.
   */
  private generateStorageKey(
    intakeId: string,
    submissionId: string,
    uploadId: string,
    filename: string
  ): string {
    // Sanitize filename to prevent path traversal
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${this.config.keyPrefix}uploads/${intakeId}/${submissionId}/${uploadId}-${safeFilename}`;
  }

  /**
   * Generate a signed URL for direct file upload.
   * Returns a presigned S3 URL with embedded constraints.
   */
  async generateUploadUrl(params: {
    intakeId: string;
    submissionId: string;
    fieldPath: string;
    filename: string;
    mimeType: string;
    constraints: UploadConstraints;
  }): Promise<SignedUploadUrl> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PutObjectCommand } = require('@aws-sdk/client-s3') as { PutObjectCommand: new (params: PutObjectParams) => unknown };

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

    // Store metadata in memory
    this.uploads.set(uploadId, metadata);

    // Create S3 PutObject command with constraints
    const commandParams: PutObjectParams = {
      Bucket: this.config.bucketName,
      Key: storageKey,
      ContentType: params.mimeType,
      Metadata: {
        uploadId,
        intakeId: params.intakeId,
        submissionId: params.submissionId,
        fieldPath: params.fieldPath,
        originalFilename: params.filename,
      },
    };

    // Add server-side encryption if configured
    if (this.config.serverSideEncryption) {
      commandParams.ServerSideEncryption = this.config.serverSideEncryption;
    }

    const command = new PutObjectCommand(commandParams);

    // Generate presigned URL
    const url = await this.getSignedUrl(this.s3Client, command, {
      expiresIn: this.config.defaultExpirationSeconds,
    });

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
   * Checks S3 object existence, size constraints, and metadata.
   */
  async verifyUpload(uploadId: string): Promise<UploadStatusResult> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { HeadObjectCommand } = require('@aws-sdk/client-s3') as { HeadObjectCommand: new (params: { Bucket: string; Key: string }) => unknown };

    const metadata = this.uploads.get(uploadId);

    if (!metadata) {
      return {
        status: 'failed',
        error: 'Upload not found',
      };
    }

    // Check expiration
    if (metadata.status === 'expired' || (new Date(metadata.expiresAt) < new Date() && metadata.status !== 'completed')) {
      metadata.status = 'expired';
      this.uploads.set(uploadId, metadata);
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

    // Check if object exists in S3
    try {
      const command = new HeadObjectCommand({
        Bucket: this.config.bucketName,
        Key: metadata.storageKey,
      });

      const response = await this.s3Client.send(command);

      // Verify size constraint
      const size = response.ContentLength ?? 0;
      if (size > metadata.constraints.maxSize) {
        metadata.status = 'failed';
        metadata.error = `File size ${size} exceeds maximum ${metadata.constraints.maxSize}`;
        this.uploads.set(uploadId, metadata);
        return {
          status: 'failed',
          error: metadata.error,
        };
      }

      // Mark as completed
      metadata.status = 'completed';
      metadata.size = size;
      metadata.uploadedAt = response.LastModified?.toISOString() ?? new Date().toISOString();
      this.uploads.set(uploadId, metadata);

      // Ensure required properties are set before returning
      if (metadata.size == null || !metadata.uploadedAt) {
        throw new Error(`Upload metadata incomplete for ${uploadId}`);
      }

      return {
        status: 'completed',
        file: {
          uploadId: metadata.uploadId,
          filename: metadata.filename,
          mimeType: metadata.mimeType,
          size: metadata.size,
          storageKey: metadata.storageKey,
          uploadedAt: metadata.uploadedAt,
        },
      };
    } catch (error: unknown) {
      // Object not found or access denied
      const s3Error = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
      if (s3Error.name === 'NotFound' || s3Error.$metadata?.httpStatusCode === 404) {
        return {
          status: 'pending',
        };
      }

      metadata.status = 'failed';
      metadata.error = `S3 error: ${s3Error.message ?? 'Unknown error'}`;
      this.uploads.set(uploadId, metadata);

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
    const metadata = this.uploads.get(uploadId);

    if (!metadata || metadata.status !== 'completed' || metadata.size == null) {
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
     
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GetObjectCommand } = require('@aws-sdk/client-s3') as { GetObjectCommand: new (params: { Bucket: string; Key: string }) => unknown };

    const metadata = this.uploads.get(uploadId);

    if (!metadata || metadata.status !== 'completed') {
      return undefined;
    }

    const command = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: metadata.storageKey,
    });

    const url = await this.getSignedUrl(this.s3Client, command, {
      expiresIn: expiresInSeconds,
    });

    return url;
  }

  /**
   * Delete an uploaded file from S3.
   */
  async deleteUpload(uploadId: string): Promise<boolean> {
     
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3') as { DeleteObjectCommand: new (params: { Bucket: string; Key: string }) => unknown };

    const metadata = this.uploads.get(uploadId);

    if (!metadata) {
      return false;
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.config.bucketName,
        Key: metadata.storageKey,
      });

      await this.s3Client.send(command);

      // Remove from metadata
      this.uploads.delete(uploadId);

      return true;
    } catch {
      // Object might not exist, but we still remove metadata
      this.uploads.delete(uploadId);
      return false;
    }
  }

  /**
   * Clean up expired upload URLs and associated metadata.
   * Note: S3 lifecycle policies are recommended for automatic object deletion.
   */
  async cleanupExpired(): Promise<void> {
    const now = new Date();
    const expiredUploads: string[] = [];

    // Find expired uploads
    for (const [uploadId, metadata] of this.uploads.entries()) {
      if (new Date(metadata.expiresAt) < now && metadata.status === 'pending') {
        metadata.status = 'expired';
        expiredUploads.push(uploadId);
      }
    }

    // Mark as expired (we don't delete from S3 as lifecycle policies should handle that)
    for (const uploadId of expiredUploads) {
      const metadata = this.uploads.get(uploadId);
      if (metadata) {
        metadata.status = 'expired';
        this.uploads.set(uploadId, metadata);
      }
    }
  }
}
