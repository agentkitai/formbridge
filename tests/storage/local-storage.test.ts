/**
 * LocalStorageBackend Test Suite
 *
 * Tests the local filesystem storage backend by using a temporary directory
 * for file operations. This suite focuses on the uncovered areas from lines
 * ~250-400+: file upload/download/delete operations.
 *
 * Covers:
 * - Construction & configuration
 * - Upload URL generation (key format, sanitization, signing, metadata)
 * - Upload verification (completed, pending, failed, expired, size exceeded)
 * - Upload metadata retrieval
 * - Download URL generation
 * - File deletion
 * - Expired upload cleanup
 * - Storage key generation & filename sanitization
 * - File system operations & error handling
 * - End-to-end lifecycle
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalStorageBackend, type LocalStorageConfig } from '../../src/storage/local-storage';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHmac } from 'crypto';

// =============================================================================
// § Test Helpers
// =============================================================================

async function createTempDir(): Promise<string> {
  const tempDir = join(tmpdir(), `formbridge-test-${Date.now()}-${Math.random().toString(36)}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
}

async function cleanupDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

const defaultConfig = (storageDir: string): LocalStorageConfig => ({
  storageDir,
  baseUrl: 'http://localhost:3000',
  signatureSecret: 'test-secret-key-for-signing-urls',
});

const uploadParams = {
  intakeId: 'intake_1',
  submissionId: 'sub_1',
  fieldPath: 'docs.resume',
  filename: 'resume.pdf',
  mimeType: 'application/pdf',
  constraints: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['application/pdf'],
    maxCount: 1,
  },
};

// =============================================================================
// § Tests
// =============================================================================

describe('LocalStorageBackend', () => {
  let storageDir: string;
  let backend: LocalStorageBackend;

  beforeEach(async () => {
    storageDir = await createTempDir();
    backend = new LocalStorageBackend(defaultConfig(storageDir));
    await backend.initialize();
  });

  afterEach(async () => {
    await cleanupDir(storageDir);
  });

  // Helper function available to all tests
  async function createAndUploadFile(
    uploadParams: any,
    content: Buffer = Buffer.from('test file content'),
    backendInstance: LocalStorageBackend = backend
  ): Promise<string> {
    const result = await backendInstance.generateUploadUrl(uploadParams);
    const uploadPath = await backendInstance.getUploadPath(result.uploadId);
    
    if (!uploadPath) {
      throw new Error('Upload path not found');
    }

    // Write file to simulate completed upload
    await fs.writeFile(uploadPath, content);

    return result.uploadId;
  }

  // ===========================================================================
  // Construction & Configuration
  // ===========================================================================

  describe('Construction', () => {
    it('should construct without error with basic config', () => {
      expect(() => new LocalStorageBackend(defaultConfig(storageDir))).not.toThrow();
    });

    it('should auto-generate signature secret when not provided', async () => {
      const backend1 = new LocalStorageBackend({
        storageDir: storageDir,
        baseUrl: 'http://localhost:3000',
      });
      const backend2 = new LocalStorageBackend({
        storageDir: storageDir,
        baseUrl: 'http://localhost:3000',
      });

      // Different instances should have different secrets
      const result1 = await backend1.generateUploadUrl(uploadParams);
      const result2 = await backend2.generateUploadUrl(uploadParams);

      // URLs should be different due to different signature secrets
      expect(result1.url).not.toEqual(result2.url);
    });

    it('should use default expiration of 900 seconds', async () => {
      const result = await backend.generateUploadUrl(uploadParams);

      // expiresAt should be ~15 minutes from now
      const diff = new Date(result.expiresAt).getTime() - Date.now();
      expect(diff).toBeGreaterThan(800_000);
      expect(diff).toBeLessThan(1_000_000);
    });

    it('should use custom expiration when configured', async () => {
      const customBackend = new LocalStorageBackend({
        ...defaultConfig(storageDir),
        defaultExpirationSeconds: 3600,
      });

      const result = await customBackend.generateUploadUrl(uploadParams);

      const diff = new Date(result.expiresAt).getTime() - Date.now();
      expect(diff).toBeGreaterThan(3500_000); // ~58+ minutes
      expect(diff).toBeLessThan(3700_000); // ~61- minutes
    });

    it('should strip trailing slash from baseUrl', async () => {
      const backendWithSlash = new LocalStorageBackend({
        ...defaultConfig(storageDir),
        baseUrl: 'http://localhost:3000/',
      });

      const result = await backendWithSlash.generateUploadUrl(uploadParams);
      expect(result.url).not.toContain('//uploads/');
      expect(result.url).toContain('/uploads/');
    });
  });

  // ===========================================================================
  // Initialize
  // ===========================================================================

  describe('initialize', () => {
    it('should create storage directory if it does not exist', async () => {
      const newDir = join(tmpdir(), 'formbridge-new-dir');
      const newBackend = new LocalStorageBackend(defaultConfig(newDir));

      await newBackend.initialize();

      const stats = await fs.stat(newDir);
      expect(stats.isDirectory()).toBe(true);

      // Cleanup
      await cleanupDir(newDir);
    });

    it('should create .metadata subdirectory', async () => {
      await backend.initialize();

      const metadataDir = join(storageDir, '.metadata');
      const stats = await fs.stat(metadataDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should work with existing directories', async () => {
      // Initialize twice should not error
      await backend.initialize();
      await backend.initialize();
    });
  });

  // ===========================================================================
  // Generate Upload URL
  // ===========================================================================

  describe('generateUploadUrl', () => {
    it('should return a signed upload URL with correct structure', async () => {
      const result = await backend.generateUploadUrl(uploadParams);

      expect(result.method).toBe('PUT');
      expect(result.headers).toEqual({ 'Content-Type': 'application/pdf' });
      expect(result.uploadId).toMatch(/^upl_[a-f0-9]{32}$/);
      expect(result.expiresAt).toBeDefined();
      expect(result.constraints).toEqual(uploadParams.constraints);

      // URL should contain upload endpoint, signature, and expiry
      expect(result.url).toContain(`http://localhost:3000/uploads/${result.uploadId}`);
      expect(result.url).toContain('signature=');
      expect(result.url).toContain('expires=');
    });

    it('should generate unique upload IDs for each call', async () => {
      const result1 = await backend.generateUploadUrl(uploadParams);
      const result2 = await backend.generateUploadUrl(uploadParams);

      expect(result1.uploadId).not.toBe(result2.uploadId);
    });

    it('should create valid HMAC signature', async () => {
      const result = await backend.generateUploadUrl(uploadParams);

      // Extract signature from URL
      const url = new URL(result.url);
      const signature = url.searchParams.get('signature');
      const expires = url.searchParams.get('expires');

      expect(signature).toBeDefined();
      expect(expires).toBeDefined();

      // Verify signature manually
      const message = `${result.uploadId}:${expires}`;
      const expectedSignature = createHmac('sha256', 'test-secret-key-for-signing-urls')
        .update(message)
        .digest('hex');

      expect(signature).toBe(expectedSignature);
    });

    it('should sanitize filename in storage key', async () => {
      const result = await backend.generateUploadUrl({
        ...uploadParams,
        filename: 'my file (1).pdf',
      });

      // Get metadata to check storage key
      const metadata = await backend.getUploadMetadata(result.uploadId);
      // Since upload isn't completed yet, metadata will be undefined
      // So let's verify via upload path instead
      const uploadPath = await backend.getUploadPath(result.uploadId);
      expect(uploadPath).toContain('my_file__1_.pdf');
      expect(uploadPath).not.toContain(' ');
      expect(uploadPath).not.toContain('(');
      expect(uploadPath).not.toContain(')');
    });

    it('should prevent path traversal in filename', async () => {
      const result = await backend.generateUploadUrl({
        ...uploadParams,
        filename: '../../../etc/passwd',
      });

      const uploadPath = await backend.getUploadPath(result.uploadId);
      expect(uploadPath).not.toContain('../');
      expect(uploadPath).not.toContain('/etc/passwd');
    });

    it('should include upload ID in storage key', async () => {
      const result = await backend.generateUploadUrl(uploadParams);
      const uploadPath = await backend.getUploadPath(result.uploadId);

      expect(uploadPath).toContain(result.uploadId);
    });

    it('should preserve dots and hyphens in filename', async () => {
      const result = await backend.generateUploadUrl({
        ...uploadParams,
        filename: 'my-report.final.pdf',
      });

      const uploadPath = await backend.getUploadPath(result.uploadId);
      expect(uploadPath).toContain('my-report.final.pdf');
    });

    it('should persist metadata to disk', async () => {
      const result = await backend.generateUploadUrl(uploadParams);

      // Check that metadata file exists
      const metadataPath = join(storageDir, '.metadata', `${result.uploadId}.json`);
      const exists = await fs.stat(metadataPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Check metadata content
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);

      expect(metadata.uploadId).toBe(result.uploadId);
      expect(metadata.filename).toBe('resume.pdf');
      expect(metadata.status).toBe('pending');
      expect(metadata.intakeId).toBe('intake_1');
    });
  });

  // ===========================================================================
  // Verify Upload
  // ===========================================================================

  describe('verifyUpload', () => {

    it('should return "completed" when file exists and size is within limit', async () => {
      const content = Buffer.from('test file content');
      const uploadId = await createAndUploadFile(uploadParams, content);

      const result = await backend.verifyUpload(uploadId);

      expect(result.status).toBe('completed');
      expect(result.file).toBeDefined();
      expect(result.file!.uploadId).toBe(uploadId);
      expect(result.file!.filename).toBe('resume.pdf');
      expect(result.file!.mimeType).toBe('application/pdf');
      expect(result.file!.size).toBe(content.length);
      expect(result.file!.uploadedAt).toBeDefined();
    });

    it('should return cached result for already verified upload', async () => {
      const uploadId = await createAndUploadFile(uploadParams);

      // First verification
      const first = await backend.verifyUpload(uploadId);
      expect(first.status).toBe('completed');

      // Second verification should return same result
      const second = await backend.verifyUpload(uploadId);
      expect(second.status).toBe('completed');
      expect(second.file).toEqual(first.file);
    });

    it('should return "pending" when file does not exist', async () => {
      const result = await backend.generateUploadUrl(uploadParams);

      const verification = await backend.verifyUpload(result.uploadId);
      expect(verification.status).toBe('pending');
    });

    it('should return "failed" when file exceeds maxSize', async () => {
      const largeContent = Buffer.alloc(20 * 1024 * 1024, 'a'); // 20MB > 10MB limit
      const uploadId = await createAndUploadFile(uploadParams, largeContent);

      const result = await backend.verifyUpload(uploadId);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('exceeds maximum');
      expect(result.error).toContain('20971520'); // 20MB in bytes
      expect(result.error).toContain('10485760'); // 10MB in bytes
    });

    it('should return "failed" for unknown upload ID', async () => {
      const result = await backend.verifyUpload('upl_nonexistent');

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Upload not found');
    });

    it('should return "expired" when URL has expired and status is pending', async () => {
      const shortBackend = new LocalStorageBackend({
        ...defaultConfig(storageDir),
        defaultExpirationSeconds: 0, // Immediate expiration
      });
      await shortBackend.initialize();

      const result = await shortBackend.generateUploadUrl(uploadParams);

      // Wait a bit to ensure expiration
      await new Promise((r) => setTimeout(r, 50));

      const verification = await shortBackend.verifyUpload(result.uploadId);

      expect(verification.status).toBe('expired');
      expect(verification.error).toBe('Upload URL has expired');
    });

    it('should handle filesystem errors gracefully', async () => {
      const result = await backend.generateUploadUrl(uploadParams);
      
      // Mock fs.stat to throw an error
      const originalStat = fs.stat;
      const mockStat = vi.fn().mockRejectedValue(new Error('Filesystem error'));
      (fs as any).stat = mockStat;

      try {
        const verification = await backend.verifyUpload(result.uploadId);
        expect(verification.status).toBe('failed');
        expect(verification.error).toContain('Verification failed');
      } finally {
        // Restore original fs.stat
        (fs as any).stat = originalStat;
      }
    });

    it('should load metadata from disk if not in memory', async () => {
      // Create a new backend instance to test metadata loading
      const uploadId = await createAndUploadFile(uploadParams);

      // Create fresh backend instance (no in-memory metadata)
      const freshBackend = new LocalStorageBackend(defaultConfig(storageDir));
      await freshBackend.initialize();

      const result = await freshBackend.verifyUpload(uploadId);

      expect(result.status).toBe('completed');
      expect(result.file?.uploadId).toBe(uploadId);
    });

    it('should handle zero-size uploads correctly', async () => {
      const emptyContent = Buffer.alloc(0);
      const uploadId = await createAndUploadFile(uploadParams, emptyContent);

      const result = await backend.verifyUpload(uploadId);

      expect(result.status).toBe('completed');
      expect(result.file?.size).toBe(0);
    });
  });

  // ===========================================================================
  // Get Upload Metadata
  // ===========================================================================

  describe('getUploadMetadata', () => {
    it('should return metadata for completed upload', async () => {
      const content = Buffer.from('test content');
      const uploadId = await createAndUploadFile(uploadParams, content);

      // Complete the upload
      await backend.verifyUpload(uploadId);

      const metadata = await backend.getUploadMetadata(uploadId);

      expect(metadata).toBeDefined();
      expect(metadata!.uploadId).toBe(uploadId);
      expect(metadata!.filename).toBe('resume.pdf');
      expect(metadata!.mimeType).toBe('application/pdf');
      expect(metadata!.size).toBe(content.length);
      expect(metadata!.storageKey).toContain('uploads/intake_1/sub_1/');
      expect(metadata!.uploadedAt).toBeDefined();
    });

    it('should return undefined for unknown upload ID', async () => {
      const metadata = await backend.getUploadMetadata('upl_unknown');
      expect(metadata).toBeUndefined();
    });

    it('should return undefined for pending (not yet verified) upload', async () => {
      const result = await backend.generateUploadUrl(uploadParams);
      const metadata = await backend.getUploadMetadata(result.uploadId);
      expect(metadata).toBeUndefined();
    });

    it('should return undefined for failed upload', async () => {
      const largeContent = Buffer.alloc(20 * 1024 * 1024, 'a'); // Too large
      const uploadId = await createAndUploadFile(uploadParams, largeContent);

      // Verify to mark as failed
      await backend.verifyUpload(uploadId);

      const metadata = await backend.getUploadMetadata(uploadId);
      expect(metadata).toBeUndefined();
    });

    it('should return undefined for expired upload', async () => {
      const shortBackend = new LocalStorageBackend({
        ...defaultConfig(storageDir),
        defaultExpirationSeconds: 0,
      });
      await shortBackend.initialize();

      const result = await shortBackend.generateUploadUrl(uploadParams);
      await new Promise((r) => setTimeout(r, 50));
      await shortBackend.verifyUpload(result.uploadId); // marks as expired

      const metadata = await shortBackend.getUploadMetadata(result.uploadId);
      expect(metadata).toBeUndefined();
    });
  });

  // ===========================================================================
  // Generate Download URL
  // ===========================================================================

  describe('generateDownloadUrl', () => {
    async function completeUpload(): Promise<string> {
      const uploadId = await createAndUploadFile(uploadParams);
      await backend.verifyUpload(uploadId);
      return uploadId;
    }

    it('should return a signed download URL for completed upload', async () => {
      const uploadId = await completeUpload();

      const url = await backend.generateDownloadUrl(uploadId);

      expect(url).toBeDefined();
      expect(url).toContain(`http://localhost:3000/downloads/${uploadId}`);
      expect(url).toContain('signature=');
      expect(url).toContain('expires=');
    });

    it('should use default 3600s expiration', async () => {
      const uploadId = await completeUpload();

      const url = await backend.generateDownloadUrl(uploadId);
      const urlObj = new URL(url!);
      const expiresParam = urlObj.searchParams.get('expires');

      const expiresAt = new Date(decodeURIComponent(expiresParam!));
      const diff = expiresAt.getTime() - Date.now();

      // Should be around 1 hour (3600 seconds)
      expect(diff).toBeGreaterThan(3500_000); // ~58+ minutes
      expect(diff).toBeLessThan(3700_000); // ~61- minutes
    });

    it('should use custom expiration for download URL', async () => {
      const uploadId = await completeUpload();

      const url = await backend.generateDownloadUrl(uploadId, 7200); // 2 hours
      const urlObj = new URL(url!);
      const expiresParam = urlObj.searchParams.get('expires');

      const expiresAt = new Date(decodeURIComponent(expiresParam!));
      const diff = expiresAt.getTime() - Date.now();

      // Should be around 2 hours (7200 seconds)
      expect(diff).toBeGreaterThan(7000_000); // ~116+ minutes
      expect(diff).toBeLessThan(7300_000); // ~121- minutes
    });

    it('should return undefined for unknown upload ID', async () => {
      const url = await backend.generateDownloadUrl('upl_unknown');
      expect(url).toBeUndefined();
    });

    it('should return undefined for pending upload', async () => {
      const result = await backend.generateUploadUrl(uploadParams);
      const url = await backend.generateDownloadUrl(result.uploadId);
      expect(url).toBeUndefined();
    });

    it('should return undefined for failed upload', async () => {
      const largeContent = Buffer.alloc(20 * 1024 * 1024, 'a');
      const uploadId = await createAndUploadFile(uploadParams, largeContent);
      await backend.verifyUpload(uploadId); // Will mark as failed

      const url = await backend.generateDownloadUrl(uploadId);
      expect(url).toBeUndefined();
    });

    it('should create valid HMAC signature for download', async () => {
      const uploadId = await completeUpload();

      const url = await backend.generateDownloadUrl(uploadId);
      const urlObj = new URL(url!);
      const signature = urlObj.searchParams.get('signature');
      const expires = urlObj.searchParams.get('expires');

      // Verify signature manually
      const message = `${uploadId}:${decodeURIComponent(expires!)}`;
      const expectedSignature = createHmac('sha256', 'test-secret-key-for-signing-urls')
        .update(message)
        .digest('hex');

      expect(signature).toBe(expectedSignature);
    });
  });

  // ===========================================================================
  // Delete Upload
  // ===========================================================================

  describe('deleteUpload', () => {
    it('should delete file and metadata for existing upload', async () => {
      const uploadId = await createAndUploadFile(uploadParams);
      await backend.verifyUpload(uploadId);

      const uploadPath = await backend.getUploadPath(uploadId);
      const metadataPath = join(storageDir, '.metadata', `${uploadId}.json`);

      // Verify files exist before deletion
      expect(await fs.stat(uploadPath!).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.stat(metadataPath).then(() => true).catch(() => false)).toBe(true);

      const deleted = await backend.deleteUpload(uploadId);
      expect(deleted).toBe(true);

      // Verify files are deleted
      expect(await fs.stat(uploadPath!).then(() => true).catch(() => false)).toBe(false);
      expect(await fs.stat(metadataPath).then(() => true).catch(() => false)).toBe(false);

      // Metadata should be gone from memory too
      const metadata = await backend.getUploadMetadata(uploadId);
      expect(metadata).toBeUndefined();
    });

    it('should return false for unknown upload ID', async () => {
      const deleted = await backend.deleteUpload('upl_unknown');
      expect(deleted).toBe(false);
    });

    it('should handle missing file gracefully', async () => {
      const result = await backend.generateUploadUrl(uploadParams);
      
      // Delete the upload that was never actually uploaded
      const deleted = await backend.deleteUpload(result.uploadId);
      expect(deleted).toBe(true);
    });

    it('should delete metadata even when file is already missing', async () => {
      const uploadId = await createAndUploadFile(uploadParams);
      const uploadPath = await backend.getUploadPath(uploadId);
      
      // Delete the file manually (simulating external deletion)
      await fs.unlink(uploadPath!);

      // Should still succeed in deleting metadata
      const deleted = await backend.deleteUpload(uploadId);
      expect(deleted).toBe(true);

      // Metadata should be cleaned up
      const metadata = await backend.getUploadMetadata(uploadId);
      expect(metadata).toBeUndefined();
    });

    it('should throw error when file deletion fails with non-ENOENT error', async () => {
      const uploadId = await createAndUploadFile(uploadParams);

      // Mock fs.unlink to throw a non-ENOENT error
      const originalUnlink = fs.unlink;
      const mockUnlink = vi.fn().mockRejectedValue(Object.assign(new Error('Permission denied'), {
        code: 'EPERM'
      }));
      (fs as any).unlink = mockUnlink;

      try {
        await expect(backend.deleteUpload(uploadId)).rejects.toThrow('Permission denied');
      } finally {
        // Restore original fs.unlink
        (fs as any).unlink = originalUnlink;
      }
    });
  });

  // ===========================================================================
  // Cleanup Expired
  // ===========================================================================

  describe('cleanupExpired', () => {
    it('should delete expired pending uploads', async () => {
      const shortBackend = new LocalStorageBackend({
        ...defaultConfig(storageDir),
        defaultExpirationSeconds: 0,
      });
      await shortBackend.initialize();

      const result = await shortBackend.generateUploadUrl(uploadParams);
      const metadataPath = join(storageDir, '.metadata', `${result.uploadId}.json`);

      // Verify metadata exists
      expect(await fs.stat(metadataPath).then(() => true).catch(() => false)).toBe(true);

      await new Promise((r) => setTimeout(r, 50));
      await shortBackend.cleanupExpired();

      // Metadata should be deleted
      expect(await fs.stat(metadataPath).then(() => true).catch(() => false)).toBe(false);
    });

    it('should not affect completed uploads', async () => {
      const uploadId = await createAndUploadFile(uploadParams);
      await backend.verifyUpload(uploadId);

      const uploadPath = await backend.getUploadPath(uploadId);
      const metadataPath = join(storageDir, '.metadata', `${uploadId}.json`);

      await backend.cleanupExpired();

      // Files should still exist
      expect(await fs.stat(uploadPath!).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.stat(metadataPath).then(() => true).catch(() => false)).toBe(true);

      // Should still be retrievable
      const verification = await backend.verifyUpload(uploadId);
      expect(verification.status).toBe('completed');
    });

    it('should handle empty metadata directory', async () => {
      // No uploads registered — should not throw
      await backend.cleanupExpired();
    });

    it('should expire multiple pending uploads at once', async () => {
      const shortBackend = new LocalStorageBackend({
        ...defaultConfig(storageDir),
        defaultExpirationSeconds: 0,
      });
      await shortBackend.initialize();

      const result1 = await shortBackend.generateUploadUrl(uploadParams);
      const result2 = await shortBackend.generateUploadUrl({
        ...uploadParams,
        filename: 'other.pdf',
      });

      await new Promise((r) => setTimeout(r, 50));
      await shortBackend.cleanupExpired();

      // Both should be gone
      const metadataPath1 = join(storageDir, '.metadata', `${result1.uploadId}.json`);
      const metadataPath2 = join(storageDir, '.metadata', `${result2.uploadId}.json`);

      expect(await fs.stat(metadataPath1).then(() => true).catch(() => false)).toBe(false);
      expect(await fs.stat(metadataPath2).then(() => true).catch(() => false)).toBe(false);
    });

    it('should handle corrupted metadata files', async () => {
      const result = await backend.generateUploadUrl(uploadParams);
      const metadataPath = join(storageDir, '.metadata', `${result.uploadId}.json`);

      // Corrupt the metadata file
      await fs.writeFile(metadataPath, 'invalid json');

      // The current implementation throws on JSON parse errors
      await expect(backend.cleanupExpired()).rejects.toThrow();
    });

    it('should cleanup files from disk for expired uploads', async () => {
      const shortBackend = new LocalStorageBackend({
        ...defaultConfig(storageDir),
        defaultExpirationSeconds: 0,
      });
      await shortBackend.initialize();

      // Create expired upload with actual file
      const uploadId = await createAndUploadFile(uploadParams, Buffer.from('test'), shortBackend);
      const uploadPath = await shortBackend.getUploadPath(uploadId);

      await new Promise((r) => setTimeout(r, 50));
      await shortBackend.cleanupExpired();

      // File should be deleted
      expect(await fs.stat(uploadPath!).then(() => true).catch(() => false)).toBe(false);
    });
  });

  // ===========================================================================
  // Signature Verification
  // ===========================================================================

  describe('verifySignature', () => {
    it('should return true for valid signature and non-expired URL', async () => {
      const result = await backend.generateUploadUrl(uploadParams);
      const url = new URL(result.url);
      const signature = url.searchParams.get('signature')!;
      const expires = url.searchParams.get('expires')!;

      const isValid = backend.verifySignature(result.uploadId, signature, decodeURIComponent(expires));
      expect(isValid).toBe(true);
    });

    it('should return false for invalid signature', async () => {
      const result = await backend.generateUploadUrl(uploadParams);
      const url = new URL(result.url);
      const expires = url.searchParams.get('expires')!;

      const isValid = backend.verifySignature(result.uploadId, 'invalid-signature', decodeURIComponent(expires));
      expect(isValid).toBe(false);
    });

    it('should return false for expired URL', async () => {
      const result = await backend.generateUploadUrl(uploadParams);
      const url = new URL(result.url);
      const signature = url.searchParams.get('signature')!;

      // Use past timestamp
      const expiredTime = new Date(Date.now() - 10000).toISOString();

      const isValid = backend.verifySignature(result.uploadId, signature, expiredTime);
      expect(isValid).toBe(false);
    });

    it('should use timing-safe comparison for signatures', async () => {
      const result = await backend.generateUploadUrl(uploadParams);
      const url = new URL(result.url);
      const signature = url.searchParams.get('signature')!;
      const expires = url.searchParams.get('expires')!;

      // Test with signature of different length (should handle gracefully)
      const isValid = backend.verifySignature(result.uploadId, signature.slice(0, -1), decodeURIComponent(expires));
      expect(isValid).toBe(false);
    });
  });

  // ===========================================================================
  // Get Upload Path
  // ===========================================================================

  describe('getUploadPath', () => {
    it('should return correct file path for existing upload', async () => {
      const result = await backend.generateUploadUrl(uploadParams);
      const path = await backend.getUploadPath(result.uploadId);

      expect(path).toBeDefined();
      expect(path).toContain(storageDir);
      expect(path).toContain('uploads/intake_1/sub_1/');
      expect(path).toContain(result.uploadId);
      expect(path).toContain('resume.pdf');
    });

    it('should return undefined for unknown upload ID', async () => {
      const path = await backend.getUploadPath('upl_unknown');
      expect(path).toBeUndefined();
    });

    it('should create parent directories when called', async () => {
      const result = await backend.generateUploadUrl(uploadParams);
      const path = await backend.getUploadPath(result.uploadId);

      // Parent directory should exist
      const parentDir = join(path!, '..');
      const stats = await fs.stat(parentDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  // ===========================================================================
  // Mark Upload Completed
  // ===========================================================================

  describe('markUploadCompleted', () => {
    it('should mark upload as completed with correct metadata', async () => {
      const result = await backend.generateUploadUrl(uploadParams);
      const fileSize = 12345;

      await backend.markUploadCompleted(result.uploadId, fileSize);

      // Verify metadata was updated
      const metadata = await backend.getUploadMetadata(result.uploadId);
      expect(metadata).toBeDefined();
      expect(metadata!.size).toBe(fileSize);
      expect(metadata!.uploadedAt).toBeDefined();

      // Verify status via verifyUpload
      const verification = await backend.verifyUpload(result.uploadId);
      expect(verification.status).toBe('completed');
    });

    it('should throw for unknown upload ID', async () => {
      await expect(backend.markUploadCompleted('upl_unknown', 123)).rejects.toThrow('Upload not found');
    });

    it('should persist completed status to disk', async () => {
      const result = await backend.generateUploadUrl(uploadParams);
      await backend.markUploadCompleted(result.uploadId, 456);

      // Create fresh backend to test persistence
      const freshBackend = new LocalStorageBackend(defaultConfig(storageDir));
      await freshBackend.initialize();

      const metadata = await freshBackend.getUploadMetadata(result.uploadId);
      expect(metadata).toBeDefined();
      expect(metadata!.size).toBe(456);
    });
  });

  // ===========================================================================
  // End-to-End Upload Flow
  // ===========================================================================

  describe('End-to-End Upload Flow', () => {
    it('should support full lifecycle: generate → upload → verify → metadata → download → delete', async () => {
      // 1. Generate upload URL
      const upload = await backend.generateUploadUrl(uploadParams);
      expect(upload.url).toBeDefined();
      expect(upload.uploadId).toBeDefined();

      // 2. Simulate file upload
      const content = Buffer.from('test file content for lifecycle test');
      const uploadPath = await backend.getUploadPath(upload.uploadId);
      await fs.writeFile(uploadPath!, content);

      // 3. Verify upload
      const verification = await backend.verifyUpload(upload.uploadId);
      expect(verification.status).toBe('completed');
      expect(verification.file!.size).toBe(content.length);

      // 4. Get metadata
      const metadata = await backend.getUploadMetadata(upload.uploadId);
      expect(metadata).toBeDefined();
      expect(metadata!.size).toBe(content.length);

      // 5. Generate download URL
      const downloadUrl = await backend.generateDownloadUrl(upload.uploadId);
      expect(downloadUrl).toBeDefined();
      expect(downloadUrl).toContain('/downloads/');

      // 6. Delete
      const deleted = await backend.deleteUpload(upload.uploadId);
      expect(deleted).toBe(true);

      // 7. Verify metadata is gone
      const afterDelete = await backend.getUploadMetadata(upload.uploadId);
      expect(afterDelete).toBeUndefined();
    });

    it('should handle multiple concurrent uploads', async () => {
      const uploads = await Promise.all([
        backend.generateUploadUrl({ ...uploadParams, filename: 'file1.pdf' }),
        backend.generateUploadUrl({ ...uploadParams, filename: 'file2.pdf' }),
        backend.generateUploadUrl({ ...uploadParams, filename: 'file3.pdf' }),
      ]);

      // All should have unique IDs
      const ids = uploads.map((u) => u.uploadId);
      expect(new Set(ids).size).toBe(3);

      // Create and verify each upload
      for (const [index, upload] of uploads.entries()) {
        const content = Buffer.from(`File ${index + 1} content`);
        const uploadPath = await backend.getUploadPath(upload.uploadId);
        await fs.writeFile(uploadPath!, content);

        const result = await backend.verifyUpload(upload.uploadId);
        expect(result.status).toBe('completed');
      }
    });

    it('should isolate uploads between backend instances', async () => {
      const backend2 = new LocalStorageBackend({
        ...defaultConfig(await createTempDir()),
      });
      await backend2.initialize();

      const result = await backend.generateUploadUrl(uploadParams);

      // Should not be findable on a different backend instance
      const verification = await backend2.verifyUpload(result.uploadId);
      expect(verification.status).toBe('failed');
      expect(verification.error).toBe('Upload not found');

      await cleanupDir((backend2 as any).config.storageDir);
    });
  });
});