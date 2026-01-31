import { type Condition } from "./condition-evaluator.js";
export interface StepDefinition {
    id: string;
    title: string;
    description?: string;
    fields: string[];
    conditions?: Condition[];
}
export interface StepFieldSchema {
    required?: boolean;
    type?: string;
    conditions?: Condition[];
}
export interface StepValidationResult {
    valid: boolean;
    stepId: string;
    errors: StepFieldError[];
}
export interface StepFieldError {
    field: string;
    message: string;
    type: "missing" | "invalid";
}
export declare function validateStep(step: StepDefinition, fields: Record<string, unknown>, fieldSchemas: Record<string, StepFieldSchema>): StepValidationResult;
export declare function isStepVisible(step: StepDefinition, fields: Record<string, unknown>): boolean;
export declare function getVisibleSteps(steps: StepDefinition[], fields: Record<string, unknown>): StepDefinition[];
export declare function getNextStep(steps: StepDefinition[], currentStepId: string, fields: Record<string, unknown>): StepDefinition | null;
export declare function getPreviousStep(steps: StepDefinition[], currentStepId: string, fields: Record<string, unknown>): StepDefinition | null;
//# sourceMappingURL=step-validator.d.ts.map