import type { JSONSchema, FieldError, NextAction } from '../types.js';
export interface UploadStatus {
    uploadId: string;
    field: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    status: 'pending' | 'completed' | 'failed';
    url?: string;
    uploadedAt?: string;
}
export interface ValidationResult {
    valid: boolean;
    errors: FieldError[];
    nextActions: NextAction[];
    missingFields: string[];
    invalidFields: string[];
}
export interface ValidatorConfig {
    strict?: boolean;
    allowAdditionalProperties?: boolean;
    enableFormats?: boolean;
}
export declare class Validator {
    private readonly ajv;
    private readonly compiledSchemas;
    constructor(config?: ValidatorConfig);
    validate(data: Record<string, unknown>, schema: JSONSchema, uploads?: Record<string, UploadStatus>): ValidationResult;
    validateRequired(data: Record<string, unknown>, schema: JSONSchema, uploads?: Record<string, UploadStatus>): ValidationResult;
    validateUploads(_data: Record<string, unknown>, schema: JSONSchema, uploads: Record<string, UploadStatus>): {
        errors: FieldError[];
        missingFields: string[];
        invalidFields: string[];
    };
    private getFileFields;
    private validateFileConstraints;
    private getCompiledSchema;
    private getSchemaKey;
    private convertAjvErrors;
    private convertSingleAjvError;
    private mapAjvErrorToFieldError;
    private extractFieldFromError;
    private generateNextActions;
    private determineAction;
    private getFieldSchema;
}
//# sourceMappingURL=validator.d.ts.map