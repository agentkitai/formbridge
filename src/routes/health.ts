/**
 * Health Check Endpoint
 *
 * Provides a simple health check endpoint for monitoring and load balancer probes.
 * Returns basic service status and current timestamp.
 *
 * Endpoint: GET /health
 * Response: { ok: boolean, timestamp: string }
 */

import { Hono } from 'hono';

/**
 * Health check response structure
 */
export interface HealthCheckResponse {
  ok: boolean;
  timestamp: string;
}

/**
 * Creates a Hono router with health check endpoint
 */
export function createHealthRouter(): Hono {
  const router = new Hono();

  /**
   * GET /health - Health check endpoint
   *
   * Returns service status and current timestamp.
   * Always returns 200 OK when the service is running.
   *
   * @returns {HealthCheckResponse} Health status and timestamp
   */
  router.get('/', (c) => {
    const response: HealthCheckResponse = {
      ok: true,
      timestamp: new Date().toISOString(),
    };

    return c.json(response, 200);
  });

  return router;
}

/**
 * Standalone health check handler (for direct mounting)
 */
export const healthCheckHandler = (c: any) => {
  const response: HealthCheckResponse = {
    ok: true,
    timestamp: new Date().toISOString(),
  };

  return c.json(response, 200);
};
