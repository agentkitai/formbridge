/**
 * CORS Middleware
 *
 * Provides configurable Cross-Origin Resource Sharing (CORS) middleware
 * for the FormBridge API server. Enables cross-origin form submissions
 * from web browsers while maintaining security through origin validation.
 *
 * Supports:
 * - Configurable allowed origins (wildcard, string, array, or function)
 * - Preflight request handling (OPTIONS)
 * - Customizable allowed methods and headers
 * - Credentials support
 * - Max age configuration for preflight caching
 *
 * Per spec requirement: "CORS headers are configurable for cross-origin form submissions"
 */

import type { Context, MiddlewareHandler } from 'hono';
import { cors as honoCors } from 'hono/cors';

/**
 * CORS configuration options
 */
export interface CorsOptions {
  /**
   * Allowed origins for CORS requests
   *
   * - `*` (string): Allow all origins (Access-Control-Allow-Origin: *)
   * - `string`: Single origin (e.g., "https://example.com")
   * - `string[]`: Multiple specific origins
   * - `(origin: string) => boolean`: Custom validation function
   *
   * @default "*"
   */
  origin?:
    | string
    | string[]
    | ((origin: string, c: Context) => boolean | string);

  /**
   * Allowed HTTP methods for CORS requests
   *
   * @default ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
   */
  allowMethods?: string[];

  /**
   * Allowed request headers
   *
   * @default ["Content-Type", "Authorization", "X-Idempotency-Key"]
   */
  allowHeaders?: string[];

  /**
   * Headers exposed to the client
   *
   * @default ["Content-Type", "X-Request-Id"]
   */
  exposeHeaders?: string[];

  /**
   * Whether to allow credentials (cookies, authorization headers)
   *
   * Note: Cannot be used with origin = "*"
   *
   * @default false
   */
  credentials?: boolean;

  /**
   * Maximum time (in seconds) that preflight results can be cached
   *
   * @default 86400 (24 hours)
   */
  maxAge?: number;
}

/**
 * CORS middleware factory
 *
 * Creates a Hono middleware that adds CORS headers to responses and handles
 * preflight OPTIONS requests. Uses Hono's built-in CORS middleware with
 * sensible defaults for the FormBridge API.
 *
 * Usage:
 * ```typescript
 * const app = new Hono();
 *
 * // Allow all origins (development)
 * app.use('*', createCorsMiddleware());
 *
 * // Allow specific origins (production)
 * app.use('*', createCorsMiddleware({
 *   origin: ['https://app.example.com', 'https://admin.example.com'],
 *   credentials: true
 * }));
 *
 * // Custom origin validation
 * app.use('*', createCorsMiddleware({
 *   origin: (origin) => origin.endsWith('.example.com')
 * }));
 * ```
 *
 * @param options - CORS configuration options
 * @returns Hono middleware handler
 */
export function createCorsMiddleware(options?: CorsOptions): MiddlewareHandler {
  const {
    origin = '*',
    allowMethods = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders = ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
    exposeHeaders = ['Content-Type', 'X-Request-Id'],
    credentials = false,
    maxAge = 86400, // 24 hours
  } = options ?? {};

  // Use Hono's built-in CORS middleware with our configuration
  return honoCors({
    origin,
    allowMethods,
    allowHeaders,
    exposeHeaders,
    credentials,
    maxAge,
  });
}

/**
 * Preset: Development CORS (allow all origins)
 *
 * Permissive CORS configuration for local development and testing.
 * Allows all origins with all standard methods and headers.
 *
 * ⚠️ Do NOT use in production
 *
 * @returns Hono middleware handler
 */
export function createDevCorsMiddleware(): MiddlewareHandler {
  return createCorsMiddleware({
    origin: '*',
    credentials: false,
  });
}

/**
 * Preset: Production CORS (strict origin validation)
 *
 * Strict CORS configuration for production environments.
 * Requires explicit list of allowed origins.
 *
 * @param allowedOrigins - Array of allowed origin URLs
 * @param options - Additional CORS options
 * @returns Hono middleware handler
 */
export function createProductionCorsMiddleware(
  allowedOrigins: string[],
  options?: Omit<CorsOptions, 'origin'>
): MiddlewareHandler {
  if (!allowedOrigins || allowedOrigins.length === 0) {
    throw new Error(
      'Production CORS requires at least one allowed origin. Use createDevCorsMiddleware() for unrestricted access.'
    );
  }

  return createCorsMiddleware({
    origin: allowedOrigins,
    credentials: true, // Production typically needs credentials
    ...options,
  });
}

/**
 * Preset: Subdomain CORS (allow all subdomains of a domain)
 *
 * CORS configuration that allows all subdomains of a given domain.
 * Useful for multi-tenant applications or microservices.
 *
 * Example: allowSubdomainsOf("example.com") allows:
 * - https://app.example.com
 * - https://admin.example.com
 * - https://api.example.com
 *
 * But rejects:
 * - https://example.com (no subdomain)
 * - https://evil.com
 * - https://example.com.evil.com
 *
 * @param domain - Base domain (without protocol or subdomain)
 * @param options - Additional CORS options
 * @returns Hono middleware handler
 */
export function createSubdomainCorsMiddleware(
  domain: string,
  options?: Omit<CorsOptions, 'origin'>
): MiddlewareHandler {
  const validateOrigin = (origin: string): boolean => {
    try {
      const url = new URL(origin);
      const hostname = url.hostname;

      // Must be a subdomain (has at least one dot before the domain)
      // and must end with the specified domain
      const pattern = new RegExp(`^[a-z0-9-]+\\.${domain.replace(/\./g, '\\.')}$`, 'i');
      return pattern.test(hostname);
    } catch {
      return false;
    }
  };

  return createCorsMiddleware({
    origin: validateOrigin,
    ...options,
  });
}
