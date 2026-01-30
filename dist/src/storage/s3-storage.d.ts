import type { StorageBackend, SignedUploadUrl, UploadConstraints, UploadStatusResult, UploadedFile } from './storage-backend.js';
export interface S3StorageConfig {
    bucketName: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    defaultExpirationSeconds?: number;
    keyPrefix?: string;
    serverSideEncryption?: string;
}
export declare class S3StorageBackend implements StorageBackend {
    private readonly config;
    private readonly uploads;
    private s3Client;
    private getSignedUrl;
    constructor(config: S3StorageConfig);
    private initializeS3Client;
    private generateUploadId;
    private generateStorageKey;
    generateUploadUrl(params: {
        intakeId: string;
        submissionId: string;
        fieldPath: string;
        filename: string;
        mimeType: string;
        constraints: UploadConstraints;
    }): Promise<SignedUploadUrl>;
    verifyUpload(uploadId: string): Promise<UploadStatusResult>;
    getUploadMetadata(uploadId: string): Promise<UploadedFile | undefined>;
    generateDownloadUrl(uploadId: string, expiresInSeconds?: number): Promise<string | undefined>;
    deleteUpload(uploadId: string): Promise<boolean>;
    cleanupExpired(): Promise<void>;
}
//# sourceMappingURL=s3-storage.d.ts.map