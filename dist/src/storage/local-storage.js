import { randomBytes, createHmac, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import { join, dirname, basename } from 'path';
export class LocalStorageBackend {
    config;
    uploads = new Map();
    constructor(config) {
        this.config = {
            storageDir: config.storageDir,
            baseUrl: config.baseUrl.replace(/\/$/, ''),
            signatureSecret: config.signatureSecret ?? randomBytes(32).toString('hex'),
            defaultExpirationSeconds: config.defaultExpirationSeconds ?? 900,
        };
    }
    async generateUploadUrl(params) {
        const uploadId = this.generateUploadId();
        const expiresAt = new Date(Date.now() + this.config.defaultExpirationSeconds * 1000).toISOString();
        const storageKey = this.generateStorageKey(params.intakeId, params.submissionId, uploadId, params.filename);
        const metadata = {
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
        this.uploads.set(uploadId, metadata);
        await this.persistMetadata(metadata);
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
    async verifyUpload(uploadId) {
        const metadata = this.uploads.get(uploadId) ?? (await this.loadMetadata(uploadId));
        if (!metadata) {
            return {
                status: 'failed',
                error: 'Upload not found',
            };
        }
        if (new Date(metadata.expiresAt) < new Date() && metadata.status === 'pending') {
            metadata.status = 'expired';
            this.uploads.set(uploadId, metadata);
            await this.persistMetadata(metadata);
            return {
                status: 'expired',
                error: 'Upload URL has expired',
            };
        }
        if (metadata.status === 'completed' && metadata.size !== undefined) {
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
        }
        const filePath = join(this.config.storageDir, metadata.storageKey);
        try {
            const stats = await fs.stat(filePath);
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
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return {
                    status: 'pending',
                };
            }
            metadata.status = 'failed';
            metadata.error = `Verification failed: ${error.message}`;
            this.uploads.set(uploadId, metadata);
            await this.persistMetadata(metadata);
            return {
                status: 'failed',
                error: metadata.error,
            };
        }
    }
    async getUploadMetadata(uploadId) {
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
            uploadedAt: metadata.uploadedAt,
        };
    }
    async generateDownloadUrl(uploadId, expiresInSeconds = 3600) {
        const metadata = this.uploads.get(uploadId) ?? (await this.loadMetadata(uploadId));
        if (!metadata || metadata.status !== 'completed') {
            return undefined;
        }
        const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
        const signature = this.generateSignature(uploadId, expiresAt);
        return `${this.config.baseUrl}/downloads/${uploadId}?signature=${signature}&expires=${encodeURIComponent(expiresAt)}`;
    }
    async deleteUpload(uploadId) {
        const metadata = this.uploads.get(uploadId) ?? (await this.loadMetadata(uploadId));
        if (!metadata) {
            return false;
        }
        const filePath = join(this.config.storageDir, metadata.storageKey);
        try {
            await fs.unlink(filePath);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
        const metadataPath = join(this.config.storageDir, '.metadata', `${uploadId}.json`);
        try {
            await fs.unlink(metadataPath);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
        this.uploads.delete(uploadId);
        return true;
    }
    async cleanupExpired() {
        const now = new Date();
        for (const [uploadId, metadata] of this.uploads.entries()) {
            if (new Date(metadata.expiresAt) < now && metadata.status === 'pending') {
                await this.deleteUpload(uploadId);
            }
        }
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
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
    async initialize() {
        await fs.mkdir(this.config.storageDir, { recursive: true });
        await fs.mkdir(join(this.config.storageDir, '.metadata'), { recursive: true });
    }
    verifySignature(uploadId, signature, expiresAt) {
        if (new Date(expiresAt) < new Date()) {
            return false;
        }
        const expectedSignature = this.generateSignature(uploadId, expiresAt);
        if (signature.length !== expectedSignature.length) {
            return false;
        }
        return timingSafeEqual(Buffer.from(signature, 'utf-8'), Buffer.from(expectedSignature, 'utf-8'));
    }
    async getUploadPath(uploadId) {
        const metadata = this.uploads.get(uploadId) ?? (await this.loadMetadata(uploadId));
        if (!metadata) {
            return undefined;
        }
        const filePath = join(this.config.storageDir, metadata.storageKey);
        await fs.mkdir(dirname(filePath), { recursive: true });
        return filePath;
    }
    async markUploadCompleted(uploadId, size) {
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
    generateUploadId() {
        return `upl_${randomBytes(16).toString('hex')}`;
    }
    generateStorageKey(intakeId, submissionId, uploadId, filename) {
        const sanitize = (s) => basename(s).replace(/[^a-zA-Z0-9._-]/g, '_');
        const sanitizedIntakeId = sanitize(intakeId);
        const sanitizedSubmissionId = sanitize(submissionId);
        const sanitizedUploadId = sanitize(uploadId);
        const sanitizedFilename = sanitize(filename);
        return join('uploads', sanitizedIntakeId, sanitizedSubmissionId, `${sanitizedUploadId}-${sanitizedFilename}`);
    }
    generateSignature(uploadId, expiresAt) {
        const message = `${uploadId}:${expiresAt}`;
        return createHmac('sha256', this.config.signatureSecret)
            .update(message)
            .digest('hex');
    }
    async persistMetadata(metadata) {
        const metadataPath = join(this.config.storageDir, '.metadata', `${metadata.uploadId}.json`);
        await fs.mkdir(dirname(metadataPath), { recursive: true });
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    }
    async loadMetadata(uploadId) {
        const metadataPath = join(this.config.storageDir, '.metadata', `${uploadId}.json`);
        try {
            const data = await fs.readFile(metadataPath, 'utf-8');
            const metadata = JSON.parse(data);
            this.uploads.set(uploadId, metadata);
            return metadata;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return undefined;
            }
            throw error;
        }
    }
}
//# sourceMappingURL=local-storage.js.map