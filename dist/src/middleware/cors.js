import { cors as honoCors } from 'hono/cors';
export function createCorsMiddleware(options) {
    const { origin = '*', allowMethods = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'], allowHeaders = ['Content-Type', 'Authorization', 'X-Idempotency-Key'], exposeHeaders = ['Content-Type', 'X-Request-Id'], credentials = false, maxAge = 86400, } = options ?? {};
    return honoCors({
        origin,
        allowMethods,
        allowHeaders,
        exposeHeaders,
        credentials,
        maxAge,
    });
}
export function createDevCorsMiddleware() {
    return createCorsMiddleware({
        origin: '*',
        credentials: false,
    });
}
export function createProductionCorsMiddleware(allowedOrigins, options) {
    if (!allowedOrigins || allowedOrigins.length === 0) {
        throw new Error('Production CORS requires at least one allowed origin. Use createDevCorsMiddleware() for unrestricted access.');
    }
    return createCorsMiddleware({
        origin: allowedOrigins,
        credentials: true,
        ...options,
    });
}
export function createSubdomainCorsMiddleware(domain, options) {
    const validateOrigin = (origin) => {
        try {
            const url = new URL(origin);
            const hostname = url.hostname;
            const pattern = new RegExp(`^[a-z0-9-]+\\.${domain.replace(/\./g, '\\.')}$`, 'i');
            return pattern.test(hostname);
        }
        catch {
            return false;
        }
    };
    return createCorsMiddleware({
        origin: validateOrigin,
        ...options,
    });
}
//# sourceMappingURL=cors.js.map