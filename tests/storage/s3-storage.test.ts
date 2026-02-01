/**
 * S3StorageBackend Test Suite
 *
 * Tests the S3-compatible storage backend by replacing private s3Client
 * and getSignedUrl after construction. The source uses require() for
 * AWS SDK command classes which return real command objects — params
 * live under command.input (not command.Bucket etc).
 *
 * Covers:
 * - Construction & configuration
 * - Upload URL generation (key format, sanitization, SSE, metadata)
 * - Upload verification (completed, pending, failed, expired, size exceeded)
 * - Upload metadata retrieval
 * - Download URL generation
 * - File deletion
 * - Expired upload cleanup
 * - Storage key generation & filename sanitization
 * - End-to-end lifecycle
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { S3StorageBackend, type S3StorageConfig } from "../../src/storage/s3-storage";

// =============================================================================
// § Helpers
// =============================================================================

const defaultConfig: S3StorageConfig = {
  bucketName: "test-bucket",
  region: "us-east-1",
};

const uploadParams = {
  intakeId: "intake_1",
  submissionId: "sub_1",
  fieldPath: "docs.resume",
  filename: "resume.pdf",
  mimeType: "application/pdf",
  constraints: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ["application/pdf"],
    maxCount: 1,
  },
};

/**
 * Create an S3StorageBackend with mocked S3 internals.
 *
 * The constructor creates a real S3Client (SDK is installed as devDep).
 * We then replace the private s3Client and getSignedUrl with mocks,
 * so we can observe and control all S3 interactions.
 */
function createMockedBackend(config: Partial<S3StorageConfig> = {}) {
  const backend = new S3StorageBackend({ ...defaultConfig, ...config });

  const mockSend = vi.fn();
  const mockGetSignedUrl = vi.fn().mockResolvedValue(
    "https://s3.example.com/presigned-url"
  );

  // Replace private fields (TS private is compile-time only)
  (backend as any).s3Client = { send: mockSend };
  (backend as any).getSignedUrl = mockGetSignedUrl;
  // Mark init as already complete so ensureInitialized() is a no-op
  (backend as any).initPromise = Promise.resolve();

  return { backend, mockSend, mockGetSignedUrl };
}

/**
 * Extract the input params from the command passed to getSignedUrl.
 * AWS SDK commands store params under .input
 */
function getSignedUrlCommandInput(
  mockGetSignedUrl: ReturnType<typeof vi.fn>,
  callIndex = 0
): any {
  const command = mockGetSignedUrl.mock.calls[callIndex]?.[1];
  return command?.input ?? command;
}

/**
 * Extract the input params from the command passed to send().
 */
function getSendCommandInput(
  mockSend: ReturnType<typeof vi.fn>,
  callIndex = 0
): any {
  const command = mockSend.mock.calls[callIndex]?.[0];
  return command?.input ?? command;
}

// =============================================================================
// § Tests
// =============================================================================

describe("S3StorageBackend", () => {
  let backend: S3StorageBackend;
  let mockSend: ReturnType<typeof vi.fn>;
  let mockGetSignedUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const mocked = createMockedBackend();
    backend = mocked.backend;
    mockSend = mocked.mockSend;
    mockGetSignedUrl = mocked.mockGetSignedUrl;
  });

  // ===========================================================================
  // Construction & Configuration
  // ===========================================================================

  describe("Construction", () => {
    it("should construct without error with basic config", () => {
      expect(() => new S3StorageBackend(defaultConfig)).not.toThrow();
    });

    it("should construct with explicit credentials", () => {
      expect(
        () =>
          new S3StorageBackend({
            ...defaultConfig,
            accessKeyId: "AKID",
            secretAccessKey: "SECRET",
          })
      ).not.toThrow();
    });

    it("should construct with custom endpoint for S3-compatible services", () => {
      expect(
        () =>
          new S3StorageBackend({
            ...defaultConfig,
            endpoint: "http://localhost:9000",
            forcePathStyle: true,
          })
      ).not.toThrow();
    });

    it("should use default expiration of 900 seconds", async () => {
      const result = await backend.generateUploadUrl(uploadParams);

      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
      const options = mockGetSignedUrl.mock.calls[0][2];
      expect(options).toEqual({ expiresIn: 900 });

      // expiresAt should be ~15 minutes from now
      const diff = new Date(result.expiresAt).getTime() - Date.now();
      expect(diff).toBeGreaterThan(800_000);
      expect(diff).toBeLessThan(1_000_000);
    });

    it("should use custom expiration when configured", async () => {
      const { backend: b, mockGetSignedUrl: mgsUrl } = createMockedBackend({
        defaultExpirationSeconds: 3600,
      });
      await b.generateUploadUrl(uploadParams);

      const options = mgsUrl.mock.calls[0][2];
      expect(options).toEqual({ expiresIn: 3600 });
    });
  });

  // ===========================================================================
  // Generate Upload URL
  // ===========================================================================

  describe("generateUploadUrl", () => {
    it("should return a signed upload URL with correct structure", async () => {
      const result = await backend.generateUploadUrl(uploadParams);

      expect(result.url).toBe("https://s3.example.com/presigned-url");
      expect(result.method).toBe("PUT");
      expect(result.headers).toEqual({ "Content-Type": "application/pdf" });
      expect(result.uploadId).toMatch(/^upload_[a-f0-9]{32}$/);
      expect(result.expiresAt).toBeDefined();
      expect(result.constraints).toEqual(uploadParams.constraints);
    });

    it("should generate unique upload IDs for each call", async () => {
      const result1 = await backend.generateUploadUrl(uploadParams);
      const result2 = await backend.generateUploadUrl(uploadParams);
      expect(result1.uploadId).not.toBe(result2.uploadId);
    });

    it("should pass correct bucket and content type to PutObjectCommand", async () => {
      await backend.generateUploadUrl(uploadParams);

      const input = getSignedUrlCommandInput(mockGetSignedUrl);
      expect(input.Bucket).toBe("test-bucket");
      expect(input.ContentType).toBe("application/pdf");
    });

    it("should include S3 metadata in the command", async () => {
      await backend.generateUploadUrl(uploadParams);

      const input = getSignedUrlCommandInput(mockGetSignedUrl);
      expect(input.Metadata).toEqual(
        expect.objectContaining({
          intakeId: "intake_1",
          submissionId: "sub_1",
          fieldPath: "docs.resume",
          originalFilename: "resume.pdf",
        })
      );
    });

    it("should use key prefix when configured", async () => {
      const { backend: b, mockGetSignedUrl: mgsUrl } = createMockedBackend({
        keyPrefix: "myapp/",
      });
      await b.generateUploadUrl(uploadParams);

      const input = getSignedUrlCommandInput(mgsUrl);
      expect(input.Key).toMatch(/^myapp\/uploads\/intake_1\/sub_1\//);
    });

    it("should sanitize filename in storage key", async () => {
      await backend.generateUploadUrl({
        ...uploadParams,
        filename: "my file (1).pdf",
      });

      const input = getSignedUrlCommandInput(mockGetSignedUrl);
      expect(input.Key).toContain("my_file__1_.pdf");
      expect(input.Key).not.toContain(" ");
    });

    it("should prevent path traversal in filename", async () => {
      await backend.generateUploadUrl({
        ...uploadParams,
        filename: "../../../etc/passwd",
      });

      const input = getSignedUrlCommandInput(mockGetSignedUrl);
      expect(input.Key).not.toContain("../");
      expect(input.Key).not.toContain("/etc/passwd");
    });

    it("should include server-side encryption when configured", async () => {
      const { backend: b, mockGetSignedUrl: mgsUrl } = createMockedBackend({
        serverSideEncryption: "AES256",
      });
      await b.generateUploadUrl(uploadParams);

      const input = getSignedUrlCommandInput(mgsUrl);
      expect(input.ServerSideEncryption).toBe("AES256");
    });

    it("should not include SSE when not configured", async () => {
      await backend.generateUploadUrl(uploadParams);

      const input = getSignedUrlCommandInput(mockGetSignedUrl);
      expect(input.ServerSideEncryption).toBeUndefined();
    });

    it("should include upload ID in storage key", async () => {
      const result = await backend.generateUploadUrl(uploadParams);

      const input = getSignedUrlCommandInput(mockGetSignedUrl);
      expect(input.Key).toContain(result.uploadId);
    });

    it("should preserve dots and hyphens in filename", async () => {
      await backend.generateUploadUrl({
        ...uploadParams,
        filename: "my-report.final.pdf",
      });

      const input = getSignedUrlCommandInput(mockGetSignedUrl);
      expect(input.Key).toContain("my-report.final.pdf");
    });
  });

  // ===========================================================================
  // Verify Upload
  // ===========================================================================

  describe("verifyUpload", () => {
    it("should return 'completed' when object exists and size is within limit", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);

      mockSend.mockResolvedValueOnce({
        ContentLength: 5 * 1024 * 1024,
        LastModified: new Date("2024-01-15T10:00:00Z"),
      });

      const result = await backend.verifyUpload(uploadId);
      expect(result.status).toBe("completed");
      expect(result.file).toBeDefined();
      expect(result.file!.uploadId).toBe(uploadId);
      expect(result.file!.filename).toBe("resume.pdf");
      expect(result.file!.mimeType).toBe("application/pdf");
      expect(result.file!.size).toBe(5 * 1024 * 1024);
      expect(result.file!.uploadedAt).toBe("2024-01-15T10:00:00.000Z");
    });

    it("should send HeadObjectCommand with correct bucket and key", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);

      mockSend.mockResolvedValueOnce({
        ContentLength: 1024,
        LastModified: new Date(),
      });

      await backend.verifyUpload(uploadId);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const input = getSendCommandInput(mockSend);
      expect(input.Bucket).toBe("test-bucket");
      expect(input.Key).toContain("uploads/intake_1/sub_1/");
    });

    it("should return cached result for already verified upload", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);

      mockSend.mockResolvedValueOnce({
        ContentLength: 1024,
        LastModified: new Date("2024-01-15T10:00:00Z"),
      });

      const first = await backend.verifyUpload(uploadId);
      expect(first.status).toBe("completed");

      // Second call should NOT hit S3 again
      const second = await backend.verifyUpload(uploadId);
      expect(second.status).toBe("completed");
      expect(second.file).toEqual(first.file);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it("should return 'pending' when object not found (NotFound name)", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);

      const notFoundError = Object.assign(new Error("NotFound"), {
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      });
      mockSend.mockRejectedValueOnce(notFoundError);

      const result = await backend.verifyUpload(uploadId);
      expect(result.status).toBe("pending");
    });

    it("should return 'pending' for 404 http status code", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);

      const error = Object.assign(new Error("Not found"), {
        name: "SomeOtherError",
        $metadata: { httpStatusCode: 404 },
      });
      mockSend.mockRejectedValueOnce(error);

      const result = await backend.verifyUpload(uploadId);
      expect(result.status).toBe("pending");
    });

    it("should return 'failed' when file exceeds maxSize", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);

      mockSend.mockResolvedValueOnce({
        ContentLength: 20 * 1024 * 1024, // 20MB > 10MB limit
        LastModified: new Date(),
      });

      const result = await backend.verifyUpload(uploadId);
      expect(result.status).toBe("failed");
      expect(result.error).toContain("exceeds maximum");
    });

    it("should return 'failed' for unknown upload ID", async () => {
      const result = await backend.verifyUpload("upload_nonexistent");
      expect(result.status).toBe("failed");
      expect(result.error).toBe("Upload not found");
    });

    it("should return 'expired' when URL has expired and status is pending", async () => {
      const { backend: shortBackend } = createMockedBackend({
        defaultExpirationSeconds: 0,
      });
      const { uploadId } = await shortBackend.generateUploadUrl(uploadParams);

      // Ensure time has passed the 0-second expiration
      await new Promise((r) => setTimeout(r, 15));

      const result = await shortBackend.verifyUpload(uploadId);
      expect(result.status).toBe("expired");
      expect(result.error).toBe("Upload URL has expired");
    });

    it("should return 'failed' for non-404 S3 errors", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);

      mockSend.mockRejectedValueOnce(
        Object.assign(new Error("Access Denied"), {
          name: "AccessDenied",
          $metadata: { httpStatusCode: 403 },
        })
      );

      const result = await backend.verifyUpload(uploadId);
      expect(result.status).toBe("failed");
      expect(result.error).toContain("S3 error");
      expect(result.error).toContain("Access Denied");
    });

    it("should handle missing LastModified in S3 response", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);

      mockSend.mockResolvedValueOnce({
        ContentLength: 512,
        // No LastModified — should default to current time
      });

      const result = await backend.verifyUpload(uploadId);
      expect(result.status).toBe("completed");
      expect(result.file!.uploadedAt).toBeDefined();
    });

    // Note: The source code has `if (!metadata.size || !metadata.uploadedAt)`
    // which treats size===0 as falsy, causing a "metadata incomplete" throw.
        it("should handle zero-size uploads correctly", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);

      mockSend.mockResolvedValueOnce({
        ContentLength: 0,
        LastModified: new Date(),
      });

      const result = await backend.verifyUpload(uploadId);
      // Zero-byte files are valid — size 0 should not be treated as missing
      expect(result.status).toBe("completed");
      expect(result.file?.size).toBe(0);
    });
  });

  // ===========================================================================
  // Get Upload Metadata
  // ===========================================================================

  describe("getUploadMetadata", () => {
    it("should return metadata for completed upload", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);

      mockSend.mockResolvedValueOnce({
        ContentLength: 2048,
        LastModified: new Date("2024-06-01T12:00:00Z"),
      });
      await backend.verifyUpload(uploadId);

      const metadata = await backend.getUploadMetadata(uploadId);
      expect(metadata).toBeDefined();
      expect(metadata!.uploadId).toBe(uploadId);
      expect(metadata!.filename).toBe("resume.pdf");
      expect(metadata!.mimeType).toBe("application/pdf");
      expect(metadata!.size).toBe(2048);
      expect(metadata!.storageKey).toContain("uploads/intake_1/sub_1/");
      expect(metadata!.uploadedAt).toBe("2024-06-01T12:00:00.000Z");
    });

    it("should return undefined for unknown upload ID", async () => {
      const metadata = await backend.getUploadMetadata("upload_unknown");
      expect(metadata).toBeUndefined();
    });

    it("should return undefined for pending (not yet verified) upload", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);
      const metadata = await backend.getUploadMetadata(uploadId);
      expect(metadata).toBeUndefined();
    });

    it("should return undefined for failed upload", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);

      mockSend.mockResolvedValueOnce({
        ContentLength: 999_999_999, // exceeds 10MB limit
        LastModified: new Date(),
      });
      await backend.verifyUpload(uploadId);

      const metadata = await backend.getUploadMetadata(uploadId);
      expect(metadata).toBeUndefined();
    });

    it("should return undefined for expired upload", async () => {
      const { backend: shortBackend } = createMockedBackend({
        defaultExpirationSeconds: 0,
      });
      const { uploadId } = await shortBackend.generateUploadUrl(uploadParams);
      await new Promise((r) => setTimeout(r, 15));
      await shortBackend.verifyUpload(uploadId); // marks as expired

      const metadata = await shortBackend.getUploadMetadata(uploadId);
      expect(metadata).toBeUndefined();
    });
  });

  // ===========================================================================
  // Generate Download URL
  // ===========================================================================

  describe("generateDownloadUrl", () => {
    async function completeUpload(): Promise<string> {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);
      mockSend.mockResolvedValueOnce({
        ContentLength: 1024,
        LastModified: new Date(),
      });
      await backend.verifyUpload(uploadId);
      return uploadId;
    }

    it("should return a signed download URL for completed upload", async () => {
      const uploadId = await completeUpload();

      mockGetSignedUrl.mockResolvedValueOnce("https://s3.example.com/download-url");
      const url = await backend.generateDownloadUrl(uploadId);

      expect(url).toBe("https://s3.example.com/download-url");
    });

    it("should pass GetObjectCommand with correct bucket and key", async () => {
      const uploadId = await completeUpload();

      mockGetSignedUrl.mockResolvedValueOnce("https://s3.example.com/dl");
      await backend.generateDownloadUrl(uploadId);

      // Last getSignedUrl call is for the download (not the upload)
      const lastCallIdx = mockGetSignedUrl.mock.calls.length - 1;
      const input = getSignedUrlCommandInput(mockGetSignedUrl, lastCallIdx);
      expect(input.Bucket).toBe("test-bucket");
      expect(input.Key).toContain("uploads/intake_1/sub_1/");
    });

    it("should use default 3600s expiration", async () => {
      const uploadId = await completeUpload();

      mockGetSignedUrl.mockResolvedValueOnce("https://s3.example.com/dl");
      await backend.generateDownloadUrl(uploadId);

      const lastCallIdx = mockGetSignedUrl.mock.calls.length - 1;
      const options = mockGetSignedUrl.mock.calls[lastCallIdx][2];
      expect(options).toEqual({ expiresIn: 3600 });
    });

    it("should use custom expiration for download URL", async () => {
      const uploadId = await completeUpload();

      mockGetSignedUrl.mockResolvedValueOnce("https://s3.example.com/dl");
      await backend.generateDownloadUrl(uploadId, 7200);

      const lastCallIdx = mockGetSignedUrl.mock.calls.length - 1;
      const options = mockGetSignedUrl.mock.calls[lastCallIdx][2];
      expect(options).toEqual({ expiresIn: 7200 });
    });

    it("should return undefined for unknown upload ID", async () => {
      const url = await backend.generateDownloadUrl("upload_unknown");
      expect(url).toBeUndefined();
    });

    it("should return undefined for pending upload", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);
      const url = await backend.generateDownloadUrl(uploadId);
      expect(url).toBeUndefined();
    });
  });

  // ===========================================================================
  // Delete Upload
  // ===========================================================================

  describe("deleteUpload", () => {
    it("should delete an upload from S3 and remove metadata", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);

      mockSend.mockResolvedValueOnce({}); // DeleteObjectCommand response

      const deleted = await backend.deleteUpload(uploadId);
      expect(deleted).toBe(true);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const input = getSendCommandInput(mockSend);
      expect(input.Bucket).toBe("test-bucket");
      expect(input.Key).toContain("uploads/intake_1/sub_1/");

      // Metadata should be gone
      const metadata = await backend.getUploadMetadata(uploadId);
      expect(metadata).toBeUndefined();
    });

    it("should return false for unknown upload ID", async () => {
      const deleted = await backend.deleteUpload("upload_unknown");
      expect(deleted).toBe(false);
    });

    it("should still remove metadata even when S3 delete fails", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);

      mockSend.mockRejectedValueOnce(new Error("S3 error"));

      const deleted = await backend.deleteUpload(uploadId);
      expect(deleted).toBe(false);

      // Metadata should still be cleaned up despite S3 failure
      const verify = await backend.verifyUpload(uploadId);
      expect(verify.status).toBe("failed");
      expect(verify.error).toBe("Upload not found");
    });

    it("should handle deleting an already-verified upload", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);

      // Complete first
      mockSend.mockResolvedValueOnce({
        ContentLength: 1024,
        LastModified: new Date(),
      });
      await backend.verifyUpload(uploadId);

      // Then delete
      mockSend.mockResolvedValueOnce({});
      const deleted = await backend.deleteUpload(uploadId);
      expect(deleted).toBe(true);
    });
  });

  // ===========================================================================
  // Cleanup Expired
  // ===========================================================================

  describe("cleanupExpired", () => {
    it("should mark expired pending uploads as expired", async () => {
      const { backend: shortBackend } = createMockedBackend({
        defaultExpirationSeconds: 0,
      });
      const { uploadId } = await shortBackend.generateUploadUrl(uploadParams);

      await new Promise((r) => setTimeout(r, 15));
      await shortBackend.cleanupExpired();

      // After cleanup, the internal metadata status should be 'expired'.
      // We check via getUploadMetadata (returns undefined for non-completed)
      // and also verify verifyUpload reflects this properly.
      const metadata = await shortBackend.getUploadMetadata(uploadId);
      expect(metadata).toBeUndefined(); // not completed → undefined

      // Access internal map to confirm status was set to 'expired'
      const internalMap = (shortBackend as any).uploads as Map<string, any>;
      expect(internalMap.get(uploadId)?.status).toBe("expired");
    });

    it("should not affect completed uploads", async () => {
      const { uploadId } = await backend.generateUploadUrl(uploadParams);

      mockSend.mockResolvedValueOnce({
        ContentLength: 1024,
        LastModified: new Date(),
      });
      await backend.verifyUpload(uploadId);

      await backend.cleanupExpired();

      // Should still be completed
      const result = await backend.verifyUpload(uploadId);
      expect(result.status).toBe("completed");
    });

    it("should handle empty uploads map", async () => {
      // No uploads registered — should not throw
      await backend.cleanupExpired();
    });

    it("should expire multiple pending uploads at once", async () => {
      const { backend: shortBackend } = createMockedBackend({
        defaultExpirationSeconds: 0,
      });
      const { uploadId: id1 } = await shortBackend.generateUploadUrl(uploadParams);
      const { uploadId: id2 } = await shortBackend.generateUploadUrl({
        ...uploadParams,
        filename: "other.pdf",
      });

      await new Promise((r) => setTimeout(r, 15));
      await shortBackend.cleanupExpired();

      // Verify internal state was set to expired
      const internalMap = (shortBackend as any).uploads as Map<string, any>;
      expect(internalMap.get(id1)?.status).toBe("expired");
      expect(internalMap.get(id2)?.status).toBe("expired");
    });
  });

  // ===========================================================================
  // Storage Key Generation
  // ===========================================================================

  describe("Storage Key Generation", () => {
    it("should follow pattern: {prefix}uploads/{intakeId}/{submissionId}/{uploadId}-{filename}", async () => {
      const result = await backend.generateUploadUrl(uploadParams);
      const input = getSignedUrlCommandInput(mockGetSignedUrl);
      expect(input.Key).toMatch(
        new RegExp(`^uploads/intake_1/sub_1/${result.uploadId}-resume\\.pdf$`)
      );
    });

    it("should sanitize dangerous characters from filename", async () => {
      await backend.generateUploadUrl({
        ...uploadParams,
        filename: "../../../etc/passwd",
      });
      const input = getSignedUrlCommandInput(mockGetSignedUrl);
      expect(input.Key).not.toContain("../");
    });

    it("should sanitize spaces and special characters", async () => {
      await backend.generateUploadUrl({
        ...uploadParams,
        filename: "my report (final) [v2].pdf",
      });
      const input = getSignedUrlCommandInput(mockGetSignedUrl);
      expect(input.Key).toContain("my_report__final___v2_.pdf");
    });

    it("should handle empty key prefix", async () => {
      await backend.generateUploadUrl(uploadParams);
      const input = getSignedUrlCommandInput(mockGetSignedUrl);
      expect(input.Key).toMatch(/^uploads\//);
    });

    it("should prepend key prefix when set", async () => {
      const { backend: b, mockGetSignedUrl: mgsUrl } = createMockedBackend({
        keyPrefix: "env/prod/",
      });
      await b.generateUploadUrl(uploadParams);
      const input = getSignedUrlCommandInput(mgsUrl);
      expect(input.Key).toMatch(/^env\/prod\/uploads\//);
    });

    it("should keep allowed characters (alphanumeric, dots, hyphens, underscores)", async () => {
      await backend.generateUploadUrl({
        ...uploadParams,
        filename: "valid-file_name.2024.pdf",
      });
      const input = getSignedUrlCommandInput(mockGetSignedUrl);
      expect(input.Key).toContain("valid-file_name.2024.pdf");
    });
  });

  // ===========================================================================
  // End-to-End Upload Flow
  // ===========================================================================

  describe("End-to-End Upload Flow", () => {
    it("should support full lifecycle: generate → verify → metadata → download → delete", async () => {
      // 1. Generate upload URL
      const upload = await backend.generateUploadUrl(uploadParams);
      expect(upload.url).toBeDefined();
      expect(upload.uploadId).toBeDefined();

      // 2. Verify upload (simulate client completed PUT)
      mockSend.mockResolvedValueOnce({
        ContentLength: 4096,
        LastModified: new Date("2024-03-01T08:00:00Z"),
      });
      const verification = await backend.verifyUpload(upload.uploadId);
      expect(verification.status).toBe("completed");
      expect(verification.file!.size).toBe(4096);

      // 3. Get metadata
      const metadata = await backend.getUploadMetadata(upload.uploadId);
      expect(metadata).toBeDefined();
      expect(metadata!.size).toBe(4096);

      // 4. Generate download URL
      mockGetSignedUrl.mockResolvedValueOnce("https://s3.example.com/download");
      const downloadUrl = await backend.generateDownloadUrl(upload.uploadId);
      expect(downloadUrl).toBe("https://s3.example.com/download");

      // 5. Delete
      mockSend.mockResolvedValueOnce({});
      const deleted = await backend.deleteUpload(upload.uploadId);
      expect(deleted).toBe(true);

      // 6. Verify metadata is gone
      const afterDelete = await backend.getUploadMetadata(upload.uploadId);
      expect(afterDelete).toBeUndefined();
    });

    it("should handle multiple concurrent uploads", async () => {
      const uploads = await Promise.all([
        backend.generateUploadUrl({ ...uploadParams, filename: "file1.pdf" }),
        backend.generateUploadUrl({ ...uploadParams, filename: "file2.pdf" }),
        backend.generateUploadUrl({ ...uploadParams, filename: "file3.pdf" }),
      ]);

      // All should have unique IDs
      const ids = uploads.map((u) => u.uploadId);
      expect(new Set(ids).size).toBe(3);

      // Verify each independently
      for (const upload of uploads) {
        mockSend.mockResolvedValueOnce({
          ContentLength: 1024,
          LastModified: new Date(),
        });
        const result = await backend.verifyUpload(upload.uploadId);
        expect(result.status).toBe("completed");
      }
    });

    it("should isolate uploads between backend instances", async () => {
      const { backend: backend2 } = createMockedBackend();

      const { uploadId } = await backend.generateUploadUrl(uploadParams);

      // Should not be findable on a different backend instance
      const result = await backend2.verifyUpload(uploadId);
      expect(result.status).toBe("failed");
      expect(result.error).toBe("Upload not found");
    });
  });
});
