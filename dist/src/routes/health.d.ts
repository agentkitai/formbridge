import { Hono } from 'hono';
export interface HealthCheckResponse {
    ok: boolean;
    timestamp: string;
}
export declare function createHealthRouter(): Hono;
export declare const healthCheckHandler: (c: any) => any;
//# sourceMappingURL=health.d.ts.map