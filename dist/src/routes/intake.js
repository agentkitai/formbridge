import { Hono } from 'hono';
import { IntakeNotFoundError } from '../core/intake-registry.js';
export function createIntakeRouter(registry) {
    const router = new Hono();
    router.get('/:id/schema', async (c) => {
        const intakeId = c.req.param('id');
        try {
            const schema = registry.getSchema(intakeId);
            const response = {
                ok: true,
                intakeId,
                schema,
            };
            return c.json(response, 200);
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
            const errorResponse = {
                ok: false,
                error: {
                    type: 'internal_error',
                    message: error instanceof Error ? error.message : 'Unknown error occurred',
                },
            };
            return c.json(errorResponse, 500);
        }
    });
    return router;
}
export function createGetSchemaHandler(registry) {
    return async (c) => {
        const intakeId = c.req.param('id');
        try {
            const schema = registry.getSchema(intakeId);
            const response = {
                ok: true,
                intakeId,
                schema,
            };
            return c.json(response, 200);
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
            const errorResponse = {
                ok: false,
                error: {
                    type: 'internal_error',
                    message: error instanceof Error ? error.message : 'Unknown error occurred',
                },
            };
            return c.json(errorResponse, 500);
        }
    };
}
//# sourceMappingURL=intake.js.map