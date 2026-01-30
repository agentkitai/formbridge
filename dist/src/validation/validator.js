import { z } from 'zod';
import { randomUUID } from 'crypto';
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
export class Validator {
    eventEmitter;
    constructor(eventEmitter) {
        this.eventEmitter = eventEmitter;
    }
    async emitEvent(event) {
        await this.eventEmitter.emit(event);
    }
    async validateSubmission(schema, data, submissionId, actor, state) {
        const result = validateSubmission(schema, data);
        if (result.success) {
            const event = {
                eventId: `evt_${randomUUID()}`,
                type: 'validation.passed',
                submissionId,
                ts: new Date().toISOString(),
                actor,
                state,
                payload: {
                    data: result.data,
                },
            };
            await this.emitEvent(event);
        }
        else {
            const event = {
                eventId: `evt_${randomUUID()}`,
                type: 'validation.failed',
                submissionId,
                ts: new Date().toISOString(),
                actor,
                state,
                payload: {
                    errors: result.error.errors,
                },
            };
            await this.emitEvent(event);
        }
        return result;
    }
    async validateSubmissionOrThrow(schema, data, submissionId, actor, state) {
        const result = validateSubmission(schema, data);
        if (result.success) {
            const event = {
                eventId: `evt_${randomUUID()}`,
                type: 'validation.passed',
                submissionId,
                ts: new Date().toISOString(),
                actor,
                state,
                payload: {
                    data: result.data,
                },
            };
            await this.emitEvent(event);
            return result.data;
        }
        const event = {
            eventId: `evt_${randomUUID()}`,
            type: 'validation.failed',
            submissionId,
            ts: new Date().toISOString(),
            actor,
            state,
            payload: {
                errors: result.error.errors,
            },
        };
        await this.emitEvent(event);
        throw result.error;
    }
    async validatePartialSubmission(schema, data, submissionId, actor, state) {
        const result = validatePartialSubmission(schema, data);
        if (result.success) {
            const event = {
                eventId: `evt_${randomUUID()}`,
                type: 'validation.passed',
                submissionId,
                ts: new Date().toISOString(),
                actor,
                state,
                payload: {
                    data: result.data,
                },
            };
            await this.emitEvent(event);
        }
        else {
            const event = {
                eventId: `evt_${randomUUID()}`,
                type: 'validation.failed',
                submissionId,
                ts: new Date().toISOString(),
                actor,
                state,
                payload: {
                    errors: result.error.errors,
                },
            };
            await this.emitEvent(event);
        }
        return result;
    }
}
//# sourceMappingURL=validator.js.map