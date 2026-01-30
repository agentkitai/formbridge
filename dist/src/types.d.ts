import type { Actor, SubmissionState, IntakeEvent } from "./types/intake-contract";
export type { Actor, SubmissionState, IntakeEvent, IntakeEventType, FieldError, NextAction, IntakeError, IntakeDefinition, ApprovalGate, Destination, } from "./types/intake-contract";
export interface JSONSchema {
    $schema?: string;
    $id?: string;
    title?: string;
    description?: string;
    type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
    properties?: Record<string, JSONSchema>;
    required?: string[];
    items?: JSONSchema;
    enum?: unknown[];
    const?: unknown;
    format?: string;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    additionalProperties?: boolean | JSONSchema;
    $ref?: string;
    $defs?: Record<string, JSONSchema>;
    allOf?: JSONSchema[];
    anyOf?: JSONSchema[];
    oneOf?: JSONSchema[];
    not?: JSONSchema;
    maxSize?: number;
    allowedTypes?: string[];
    maxCount?: number;
}
export type FieldErrorCode = 'required' | 'invalid_type' | 'invalid_format' | 'invalid_value' | 'too_long' | 'too_short' | 'file_required' | 'file_too_large' | 'file_wrong_type' | 'custom';
export interface FieldAttribution {
    [fieldPath: string]: Actor;
}
export interface Submission {
    id: string;
    intakeId: string;
    state: SubmissionState;
    resumeToken: string;
    createdAt: string;
    updatedAt: string;
    expiresAt?: string;
    fields: Record<string, unknown>;
    fieldAttribution: FieldAttribution;
    createdBy: Actor;
    updatedBy: Actor;
    idempotencyKey?: string;
    events: IntakeEvent[];
    ttlMs?: number;
}
export interface SubmissionEntry {
    submission: Submission;
    resumeToken: string;
}
//# sourceMappingURL=types.d.ts.map