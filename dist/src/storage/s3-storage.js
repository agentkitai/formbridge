import { randomBytes } from 'crypto';
export class S3StorageBackend {
    config;
    uploads = new Map();
    s3Client;
    getSignedUrl;
    constructor(config) {
        this.config = {
            bucketName: config.bucketName,
            region: config.region,
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            endpoint: config.endpoint,
            forcePathStyle: config.forcePathStyle,
            defaultExpirationSeconds: config.defaultExpirationSeconds ?? 900,
            keyPrefix: config.keyPrefix ?? '',
            serverSideEncryption: config.serverSideEncryption,
        };
        this.initializeS3Client();
    }
    initializeS3Client() {
        try {
            const { S3Client } = require('@aws-sdk/client-s3');
            const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
            const clientConfig = {
                region: this.config.region,
            };
            if (this.config.accessKeyId && this.config.secretAccessKey) {
                clientConfig.credentials = {
                    accessKeyId: this.config.accessKeyId,
                    secretAccessKey: this.config.secretAccessKey,
                };
            }
            if (this.config.endpoint) {
                clientConfig.endpoint = this.config.endpoint;
                clientConfig.forcePathStyle = this.config.forcePathStyle ?? true;
            }
            this.s3Client = new S3Client(clientConfig);
            this.getSignedUrl = getSignedUrl;
        }
        catch (error) {
            throw new Error('S3StorageBackend requires @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner. ' +
                'Install them with: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner');
        }
    }
    generateUploadId() {
        return `upload_${randomBytes(16).toString('hex')}`;
    }
    generateStorageKey(intakeId, submissionId, uploadId, filename) {
        const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        return `${this.config.keyPrefix}uploads/${intakeId}/${submissionId}/${uploadId}-${safeFilename}`;
    }
    async generateUploadUrl(params) {
        const { PutObjectCommand } = require('@aws-sdk/client-s3');
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
        const commandParams = {
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
        if (this.config.serverSideEncryption) {
            commandParams.ServerSideEncryption = this.config.serverSideEncryption;
        }
        const command = new PutObjectCommand(commandParams);
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
    async verifyUpload(uploadId) {
        const { HeadObjectCommand } = require('@aws-sdk/client-s3');
        const metadata = this.uploads.get(uploadId);
        if (!metadata) {
            return {
                status: 'failed',
                error: 'Upload not found',
            };
        }
        if (new Date(metadata.expiresAt) < new Date() && metadata.status === 'pending') {
            metadata.status = 'expired';
            this.uploads.set(uploadId, metadata);
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
        try {
            const command = new HeadObjectCommand({
                Bucket: this.config.bucketName,
                Key: metadata.storageKey,
            });
            const response = await this.s3Client.send(command);
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
            metadata.status = 'completed';
            metadata.size = size;
            metadata.uploadedAt = response.LastModified?.toISOString() ?? new Date().toISOString();
            this.uploads.set(uploadId, metadata);
            if (!metadata.size || !metadata.uploadedAt) {
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
        }
        catch (error) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                return {
                    status: 'pending',
                };
            }
            metadata.status = 'failed';
            metadata.error = `S3 error: ${error.message}`;
            this.uploads.set(uploadId, metadata);
            return {
                status: 'failed',
                error: metadata.error,
            };
        }
    }
    async getUploadMetadata(uploadId) {
        const metadata = this.uploads.get(uploadId);
        if (!metadata || metadata.status !== 'completed' || !metadata.size) {
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
        const { GetObjectCommand } = require('@aws-sdk/client-s3');
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
    async deleteUpload(uploadId) {
        const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
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
            this.uploads.delete(uploadId);
            return true;
        }
        catch (error) {
            this.uploads.delete(uploadId);
            return false;
        }
    }
    async cleanupExpired() {
        const now = new Date();
        const expiredUploads = [];
        for (const [uploadId, metadata] of this.uploads.entries()) {
            if (new Date(metadata.expiresAt) < now && metadata.status === 'pending') {
                metadata.status = 'expired';
                expiredUploads.push(uploadId);
            }
        }
        for (const uploadId of expiredUploads) {
            const metadata = this.uploads.get(uploadId);
            if (metadata) {
                metadata.status = 'expired';
                this.uploads.set(uploadId, metadata);
            }
        }
    }
}
//# sourceMappingURL=s3-storage.js.map