import { z } from 'zod';
export function validateSubmission(schema, data) {
    const result = schema.safeParse(data);
    if (result.success) {
        return {
            success: true,
            data: result.data
        };
    }
    return {
        success: false,
        error: result.error
    };
}
export function isValidationSuccess(result) {
    return result.success === true;
}
export function isValidationFailure(result) {
    return result.success === false;
}
export function validateSubmissionOrThrow(schema, data) {
    return schema.parse(data);
}
export function validatePartialSubmission(schema, data) {
    if (schema instanceof z.ZodObject) {
        const partialSchema = schema.partial();
        return validateSubmission(partialSchema, data);
    }
    return validateSubmission(schema, data);
}
//# sourceMappingURL=validator.js.map