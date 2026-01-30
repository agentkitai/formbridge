import { Hono } from 'hono';
import { IntakeNotFoundError } from '../core/intake-registry.js';
export function createUploadRouter(registry, submissionManager) {
    const router = new Hono();
    router.post('/:id/submissions/:sid/uploads', async (c) => {
        const intakeId = c.req.param('id');
        const submissionId = c.req.param('sid');
        try {
            const body = await c.req.json();
            if (!body.resumeToken) {
                const errorResponse = {
                    ok: false,
                    error: {
                        type: 'invalid_request',
                        message: 'Missing required field: resumeToken',
                    },
                };
                return c.json(errorResponse, 400);
            }
            if (!body.actor || !body.actor.kind || !body.actor.id) {
                const errorResponse = {
                    ok: false,
                    error: {
                        type: 'invalid_request',
                        message: 'Missing required field: actor (with kind and id)',
                    },
                };
                return c.json(errorResponse, 400);
            }
            if (!body.field || !body.filename || !body.mimeType || typeof body.sizeBytes !== 'number') {
                const errorResponse = {
                    ok: false,
                    error: {
                        type: 'invalid_request',
                        message: 'Missing required fields: field, filename, mimeType, sizeBytes',
                    },
                };
                return c.json(errorResponse, 400);
            }
            if (!Number.isFinite(body.sizeBytes) || body.sizeBytes <= 0 || !Number.isInteger(body.sizeBytes)) {
                const errorResponse = {
                    ok: false,
                    error: {
                        type: 'invalid_request',
                        message: 'sizeBytes must be a positive integer',
                    },
                };
                return c.json(errorResponse, 400);
            }
            const intakeDefinition = registry.getIntake(intakeId);
            const input = {
                submissionId,
                resumeToken: body.resumeToken,
                field: body.field,
                filename: body.filename,
                mimeType: body.mimeType,
                sizeBytes: body.sizeBytes,
                actor: body.actor,
            };
            const result = await submissionManager.requestUpload(input, intakeDefinition);
            return c.json(result, 201);
        }
        catch (error) {
            if (error instanceof IntakeNotFoundError) {
                const errorResponse = {
                    ok: false,
                    error: {
                        type: 'not_found',
                        message: `Intake definition '${intakeId}' not found`,
                    },
                };
                return c.json(errorResponse, 404);
            }
            if (error instanceof Error && error.message.includes('Invalid resume token')) {
                const errorResponse = {
                    ok: false,
                    error: {
                        type: 'invalid_resume_token',
                        message: 'Invalid or expired resume token',
                    },
                };
                return c.json(errorResponse, 409);
            }
            if (error instanceof Error && error.message.includes('not found')) {
                const errorResponse = {
                    ok: false,
                    error: {
                        type: 'not_found',
                        message: 'Submission or resource not found',
                    },
                };
                return c.json(errorResponse, 404);
            }
            if (error instanceof Error && error.message.includes('Storage backend')) {
                const errorResponse = {
                    ok: false,
                    error: {
                        type: 'storage_error',
                        message: 'Storage backend error',
                    },
                };
                return c.json(errorResponse, 500);
            }
            const errorResponse = {
                ok: false,
                error: {
                    type: 'internal_error',
                    message: 'An internal error occurred',
                },
            };
            return c.json(errorResponse, 500);
        }
    });
    router.post('/:id/submissions/:sid/uploads/:uploadId/confirm', async (c) => {
        const intakeId = c.req.param('id');
        const submissionId = c.req.param('sid');
        const uploadId = c.req.param('uploadId');
        try {
            const body = await c.req.json();
            if (!body.resumeToken) {
                const errorResponse = {
                    ok: false,
                    error: {
                        type: 'invalid_request',
                        message: 'Missing required field: resumeToken',
                    },
                };
                return c.json(errorResponse, 400);
            }
            if (!body.actor || !body.actor.kind || !body.actor.id) {
                const errorResponse = {
                    ok: false,
                    error: {
                        type: 'invalid_request',
                        message: 'Missing required field: actor (with kind and id)',
                    },
                };
                return c.json(errorResponse, 400);
            }
            registry.getIntake(intakeId);
            const input = {
                submissionId,
                resumeToken: body.resumeToken,
                uploadId,
                actor: body.actor,
            };
            const result = await submissionManager.confirmUpload(input);
            return c.json(result, 200);
        }
        catch (error) {
            if (error instanceof IntakeNotFoundError) {
                const errorResponse = {
                    ok: false,
                    error: {
                        type: 'not_found',
                        message: `Intake definition '${intakeId}' not found`,
                    },
                };
                return c.json(errorResponse, 404);
            }
            if (error instanceof Error && error.message.includes('Invalid resume token')) {
                const errorResponse = {
                    ok: false,
                    error: {
                        type: 'invalid_resume_token',
                        message: 'Invalid or expired resume token',
                    },
                };
                return c.json(errorResponse, 409);
            }
            if (error instanceof Error && error.message.includes('not found')) {
                const errorResponse = {
                    ok: false,
                    error: {
                        type: 'not_found',
                        message: 'Submission or resource not found',
                    },
                };
                return c.json(errorResponse, 404);
            }
            if (error instanceof Error && error.message.includes('verification failed')) {
                const errorResponse = {
                    ok: false,
                    error: {
                        type: 'storage_error',
                        message: 'Upload verification failed',
                    },
                };
                return c.json(errorResponse, 400);
            }
            if (error instanceof Error && error.message.includes('Storage backend')) {
                const errorResponse = {
                    ok: false,
                    error: {
                        type: 'storage_error',
                        message: 'Storage backend error',
                    },
                };
                return c.json(errorResponse, 500);
            }
            const errorResponse = {
                ok: false,
                error: {
                    type: 'internal_error',
                    message: 'An internal error occurred',
                },
            };
            return c.json(errorResponse, 500);
        }
    });
    return router;
}
//# sourceMappingURL=uploads.js.map