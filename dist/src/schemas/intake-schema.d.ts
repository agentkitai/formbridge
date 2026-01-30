import type { z } from 'zod';
export interface ApprovalGate {
    id: string;
    name: string;
    description?: string;
    condition?: string;
    triggerFields?: string[];
    required?: boolean;
}
export interface Destination {
    type: string;
    name: string;
    config: Record<string, unknown>;
    webhookUrl?: string;
    auth?: {
        type: string;
        credentials: Record<string, string>;
    };
    retry?: {
        maxAttempts?: number;
        delayMs?: number;
        backoffMultiplier?: number;
    };
}
export interface IntakeDefinition {
    id: string;
    version: string;
    name: string;
    description?: string;
    schema: z.ZodType<any>;
    approvalGates?: ApprovalGate[];
    destination: Destination;
    metadata?: Record<string, unknown>;
    errorMessages?: Record<string, string>;
    fieldHints?: Record<string, {
        label?: string;
        placeholder?: string;
        helpText?: string;
        order?: number;
        hidden?: boolean;
    }>;
}
export declare function isIntakeDefinition(obj: unknown): obj is IntakeDefinition;
export interface IntakeDefinitionValidation {
    valid: boolean;
    errors?: string[];
}
export declare function validateIntakeDefinition(definition: Partial<IntakeDefinition>): IntakeDefinitionValidation;
//# sourceMappingURL=intake-schema.d.ts.map