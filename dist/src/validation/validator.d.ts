import { z } from 'zod';
import type { IntakeEvent, Actor, SubmissionState } from '../types/intake-contract';
export interface EventEmitter {
    emit(event: IntakeEvent): Promise<void>;
}
export interface ValidationSuccess<T = any> {
    success: true;
    data: T;
}
export interface ValidationFailure {
    success: false;
    error: z.ZodError;
}
export type ValidationResult<T = any> = ValidationSuccess<T> | ValidationFailure;
export declare function validateSubmission<T = any>(schema: z.ZodType<T>, data: unknown): ValidationResult<T>;
export declare function isValidationSuccess<T>(result: ValidationResult<T>): result is ValidationSuccess<T>;
export declare function isValidationFailure<T>(result: ValidationResult<T>): result is ValidationFailure;
export declare function validateSubmissionOrThrow<T = any>(schema: z.ZodType<T>, data: unknown): T;
export declare function validatePartialSubmission<T = any>(schema: z.ZodType<T>, data: unknown): ValidationResult<Partial<T>>;
export declare class Validator {
    private eventEmitter;
    constructor(eventEmitter: EventEmitter);
    protected emitEvent(event: IntakeEvent): Promise<void>;
    validateSubmission<T = any>(schema: z.ZodType<T>, data: unknown, submissionId: string, actor: Actor, state: SubmissionState): Promise<ValidationResult<T>>;
    validateSubmissionOrThrow<T = any>(schema: z.ZodType<T>, data: unknown, submissionId: string, actor: Actor, state: SubmissionState): Promise<T>;
    validatePartialSubmission<T = any>(schema: z.ZodType<T>, data: unknown, submissionId: string, actor: Actor, state: SubmissionState): Promise<ValidationResult<Partial<T>>>;
}
//# sourceMappingURL=validator.d.ts.map