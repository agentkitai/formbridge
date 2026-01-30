import type { StorageBackend, SignedUploadUrl, UploadConstraints, UploadStatusResult, UploadedFile } from './storage-backend.js';
export interface LocalStorageConfig {
    storageDir: string;
    baseUrl: string;
    signatureSecret?: string;
    defaultExpirationSeconds?: number;
}
export declare class LocalStorageBackend implements StorageBackend {
    private readonly config;
    private readonly uploads;
    constructor(config: LocalStorageConfig);
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
    initialize(): Promise<void>;
    verifySignature(uploadId: string, signature: string, expiresAt: string): boolean;
    getUploadPath(uploadId: string): Promise<string | undefined>;
    markUploadCompleted(uploadId: string, size: number): Promise<void>;
    private generateUploadId;
    private generateStorageKey;
    private generateSignature;
    private persistMetadata;
    private loadMetadata;
}
//# sourceMappingURL=local-storage.d.ts.map