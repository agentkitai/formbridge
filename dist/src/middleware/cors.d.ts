import type { Context, MiddlewareHandler } from 'hono';
export interface CorsOptions {
    origin?: string | string[] | ((origin: string, c: Context) => boolean | string);
    allowMethods?: string[];
    allowHeaders?: string[];
    exposeHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
}
export declare function createCorsMiddleware(options?: CorsOptions): MiddlewareHandler;
export declare function createDevCorsMiddleware(): MiddlewareHandler;
export declare function createProductionCorsMiddleware(allowedOrigins: string[], options?: Omit<CorsOptions, 'origin'>): MiddlewareHandler;
export declare function createSubdomainCorsMiddleware(domain: string, options?: Omit<CorsOptions, 'origin'>): MiddlewareHandler;
//# sourceMappingURL=cors.d.ts.map