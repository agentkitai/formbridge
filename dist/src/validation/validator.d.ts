import { z } from 'zod';
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
//# sourceMappingURL=validator.d.ts.map