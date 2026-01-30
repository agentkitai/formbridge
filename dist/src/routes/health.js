import { Hono } from 'hono';
export function createHealthRouter() {
    const router = new Hono();
    router.get('/', (c) => {
        const response = {
            ok: true,
            timestamp: new Date().toISOString(),
        };
        return c.json(response, 200);
    });
    return router;
}
export const healthCheckHandler = (c) => {
    const response = {
        ok: true,
        timestamp: new Date().toISOString(),
    };
    return c.json(response, 200);
};
//# sourceMappingURL=health.js.map