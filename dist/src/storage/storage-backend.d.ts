export interface UploadConstraints {
    maxSize: number;
    allowedTypes: string[];
    maxCount: number;
}
export type UploadMethod = 'PUT' | 'POST';
export interface SignedUploadUrl {
    url: string;
    method: UploadMethod;
    headers?: Record<string, string>;
    expiresAt: string;
    uploadId: string;
    constraints: UploadConstraints;
}
export interface UploadedFile {
    uploadId: string;
    filename: string;
    mimeType: string;
    size: number;
    storageKey: string;
    uploadedAt: string;
}
export type UploadStatus = 'pending' | 'completed' | 'failed' | 'expired';
export interface UploadStatusResult {
    status: UploadStatus;
    file?: UploadedFile;
    error?: string;
}
export interface StorageBackend {
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
//# sourceMappingURL=storage-backend.d.ts.map