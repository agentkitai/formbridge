/**
 * CORS Middleware Test Suite
 *
 * Tests the CORS middleware configuration and behavior, focusing on the
 * uncovered areas from lines ~170-225: preflight handling, multiple allowed
 * origins, and credentials mode.
 *
 * Covers:
 * - Basic CORS configuration and headers
 * - Simple CORS requests with allowed/disallowed origins
 * - Preflight OPTIONS request handling
 * - Multiple allowed origins (array)
 * - Wildcard origin behavior
 * - Credentials mode behavior and validation
 * - Custom headers and methods configuration
 * - Origin validation functions
 * - Preset middleware configurations (dev, production, subdomain)
 * - Error handling for invalid configurations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  createCorsMiddleware,
  createDevCorsMiddleware,
  createProductionCorsMiddleware,
  createSubdomainCorsMiddleware,
  type CorsOptions,
} from '../../src/middleware/cors';

// =============================================================================
// § Test Helpers
// =============================================================================

function createTestApp(corsOptions?: CorsOptions) {
  const app = new Hono();
  app.use('*', createCorsMiddleware(corsOptions));
  
  // Simple test route
  app.get('/test', (c) => c.json({ message: 'ok' }));
  app.post('/test', (c) => c.json({ message: 'created' }));
  app.patch('/test', (c) => c.json({ message: 'updated' }));

  return app;
}

function createRequest(
  method: string = 'GET',
  path: string = '/test',
  headers: Record<string, string> = {}
): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

// =============================================================================
// § Tests
// =============================================================================

describe('CORS Middleware', () => {
  // ===========================================================================
  // Basic CORS Configuration
  // ===========================================================================

  describe('Basic Configuration', () => {
    it('should use default options when none provided', async () => {
      const app = createTestApp();
      const request = createRequest('GET', '/test', {
        'Origin': 'https://example.com',
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      // For simple requests, these headers might not be set
      expect(response.headers.get('Access-Control-Expose-Headers')).toBe('Content-Type,X-Request-Id');
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull(); // Should not be set when false
    });

    it('should apply custom configuration options', async () => {
      const app = createTestApp({
        origin: 'https://trusted.com',
        allowMethods: ['GET', 'POST'],
        allowHeaders: ['Content-Type', 'X-Custom-Header'],
        exposeHeaders: ['X-Custom-Response'],
        credentials: true,
        maxAge: 3600,
      });

      const request = createRequest('GET', '/test', {
        'Origin': 'https://trusted.com',
      });

      const response = await app.request(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://trusted.com');
      expect(response.headers.get('Access-Control-Expose-Headers')).toBe('X-Custom-Response');
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });
  });

  // ===========================================================================
  // Simple CORS Requests
  // ===========================================================================

  describe('Simple CORS Requests', () => {
    it('should allow requests from wildcard origin', async () => {
      const app = createTestApp({ origin: '*' });
      const request = createRequest('GET', '/test', {
        'Origin': 'https://anywhere.com',
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should allow requests from specific allowed origin', async () => {
      const app = createTestApp({ origin: 'https://allowed.com' });
      const request = createRequest('GET', '/test', {
        'Origin': 'https://allowed.com',
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://allowed.com');
    });

    it('should reject requests from disallowed origin', async () => {
      const app = createTestApp({ origin: 'https://allowed.com' });
      const request = createRequest('GET', '/test', {
        'Origin': 'https://forbidden.com',
      });

      const response = await app.request(request);

      // Note: Hono's CORS middleware typically doesn't reject requests,
      // it just doesn't set the CORS headers for disallowed origins
      expect(response.status).toBe(200); // Request still succeeds
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should handle requests without Origin header', async () => {
      const app = createTestApp({ origin: 'https://allowed.com' });
      const request = createRequest('GET', '/test'); // No Origin header

      const response = await app.request(request);

      expect(response.status).toBe(200);
      // Should still process the request normally
    });

    it('should handle POST requests with CORS headers', async () => {
      const app = createTestApp({ origin: 'https://allowed.com' });
      const request = createRequest('POST', '/test', {
        'Origin': 'https://allowed.com',
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://allowed.com');
    });
  });

  // ===========================================================================
  // Multiple Allowed Origins
  // ===========================================================================

  describe('Multiple Allowed Origins', () => {
    it('should allow requests from any origin in the allowed list', async () => {
      const allowedOrigins = ['https://app.example.com', 'https://admin.example.com', 'https://api.example.com'];
      const app = createTestApp({ origin: allowedOrigins });

      // Test each allowed origin
      for (const origin of allowedOrigins) {
        const request = createRequest('GET', '/test', { 'Origin': origin });
        const response = await app.request(request);

        expect(response.status).toBe(200);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      }
    });

    it('should reject requests from origins not in the allowed list', async () => {
      const app = createTestApp({
        origin: ['https://app.example.com', 'https://admin.example.com']
      });

      const request = createRequest('GET', '/test', {
        'Origin': 'https://malicious.com',
      });

      const response = await app.request(request);

      expect(response.status).toBe(200); // Request succeeds
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull(); // But no CORS headers
    });

    it('should handle empty allowed origins array', async () => {
      const app = createTestApp({ origin: [] });
      const request = createRequest('GET', '/test', {
        'Origin': 'https://example.com',
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should be case-sensitive for origin matching', async () => {
      const app = createTestApp({
        origin: ['https://Example.com'] // Capital E
      });

      const request = createRequest('GET', '/test', {
        'Origin': 'https://example.com', // lowercase e
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });

  // ===========================================================================
  // Preflight OPTIONS Requests
  // ===========================================================================

  describe('Preflight OPTIONS Requests', () => {
    it('should handle preflight request for allowed origin', async () => {
      const app = createTestApp({
        origin: 'https://example.com',
        allowMethods: ['GET', 'POST', 'PATCH'],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: 7200,
      });

      const request = createRequest('OPTIONS', '/test', {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization',
      });

      const response = await app.request(request);

      expect(response.status).toBe(204); // Preflight returns 204
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PATCH');
      expect(response.headers.get('Access-Control-Max-Age')).toBe('7200');
    });

    it('should handle preflight request with wildcard origin', async () => {
      const app = createTestApp({
        origin: '*',
        allowMethods: ['GET', 'POST', 'DELETE'],
      });

      const request = createRequest('OPTIONS', '/test', {
        'Origin': 'https://any-origin.com',
        'Access-Control-Request-Method': 'DELETE',
      });

      const response = await app.request(request);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      const allowMethods = response.headers.get('Access-Control-Allow-Methods');
      expect(allowMethods).toContain('GET');
      expect(allowMethods).toContain('POST');
      expect(allowMethods).toContain('DELETE');
    });

    it('should reject preflight request from disallowed origin', async () => {
      const app = createTestApp({
        origin: ['https://allowed.com'],
      });

      const request = createRequest('OPTIONS', '/test', {
        'Origin': 'https://forbidden.com',
        'Access-Control-Request-Method': 'POST',
      });

      const response = await app.request(request);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should handle preflight request with complex headers', async () => {
      const app = createTestApp({
        origin: 'https://example.com',
        allowHeaders: ['Content-Type', 'Authorization', 'X-Custom-Header', 'X-Idempotency-Key'],
      });

      const request = createRequest('OPTIONS', '/test', {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'Content-Type, X-Custom-Header, Authorization',
      });

      const response = await app.request(request);

      expect(response.status).toBe(204);
      const allowHeaders = response.headers.get('Access-Control-Allow-Headers');
      expect(allowHeaders).toContain('Content-Type');
      expect(allowHeaders).toContain('Authorization');
      expect(allowHeaders).toContain('X-Custom-Header');
      expect(allowHeaders).toContain('X-Idempotency-Key');
    });
  });

  // ===========================================================================
  // Credentials Behavior
  // ===========================================================================

  describe('Credentials Mode', () => {
    it('should set credentials header when credentials: true', async () => {
      const app = createTestApp({
        origin: 'https://trusted.com',
        credentials: true,
      });

      const request = createRequest('GET', '/test', {
        'Origin': 'https://trusted.com',
      });

      const response = await app.request(request);

      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://trusted.com');
    });

    it('should not set credentials header when credentials: false', async () => {
      const app = createTestApp({
        origin: 'https://trusted.com',
        credentials: false,
      });

      const request = createRequest('GET', '/test', {
        'Origin': 'https://trusted.com',
      });

      const response = await app.request(request);

      expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    });

    it('should handle credentials with multiple origins', async () => {
      const app = createTestApp({
        origin: ['https://app.example.com', 'https://admin.example.com'],
        credentials: true,
      });

      const request = createRequest('GET', '/test', {
        'Origin': 'https://app.example.com',
      });

      const response = await app.request(request);

      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    });

    it('should handle credentials in preflight requests', async () => {
      const app = createTestApp({
        origin: 'https://example.com',
        credentials: true,
      });

      const request = createRequest('OPTIONS', '/test', {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'POST',
      });

      const response = await app.request(request);

      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });

    // Note: The spec says credentials cannot be used with wildcard origin,
    // but this is typically enforced by the browser, not the server
    it('should allow credentials with wildcard origin (browser will enforce restriction)', async () => {
      const app = createTestApp({
        origin: '*',
        credentials: true,
      });

      const request = createRequest('GET', '/test', {
        'Origin': 'https://example.com',
      });

      const response = await app.request(request);

      // Server sets both headers; browser enforces the restriction
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  // ===========================================================================
  // Custom Origin Validation Function
  // ===========================================================================

  describe('Custom Origin Validation', () => {
    it('should allow origins that pass validation function', async () => {
      const validateOrigin = (origin: string) => origin.endsWith('.example.com');
      const app = createTestApp({ origin: validateOrigin });

      const request = createRequest('GET', '/test', {
        'Origin': 'https://app.example.com',
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    });

    it('should reject origins that fail validation function', async () => {
      const validateOrigin = (origin: string) => origin.endsWith('.example.com');
      const app = createTestApp({ origin: validateOrigin });

      const request = createRequest('GET', '/test', {
        'Origin': 'https://malicious.com',
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should handle validation function that returns false', async () => {
      const validateOrigin = () => false; // Always reject
      const app = createTestApp({ origin: validateOrigin });

      const request = createRequest('GET', '/test', {
        'Origin': 'https://any.com',
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should handle validation function that returns true', async () => {
      const validateOrigin = () => true; // Always allow
      const app = createTestApp({ origin: validateOrigin });

      const request = createRequest('GET', '/test', {
        'Origin': 'https://any.com',
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://any.com');
    });

    it('should handle validation function that returns custom origin string', async () => {
      const validateOrigin = (origin: string) => {
        // Always return a specific origin regardless of input
        return 'https://canonical.example.com';
      };
      const app = createTestApp({ origin: validateOrigin });

      const request = createRequest('GET', '/test', {
        'Origin': 'https://any.com',
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://canonical.example.com');
    });

    it('should pass context to validation function', async () => {
      let capturedContext: any = null;
      const validateOrigin = (origin: string, context: any) => {
        capturedContext = context;
        return true;
      };
      const app = createTestApp({ origin: validateOrigin });

      const request = createRequest('GET', '/test', {
        'Origin': 'https://example.com',
      });

      await app.request(request);

      expect(capturedContext).toBeDefined();
      // Context should be the Hono context object
      expect(typeof capturedContext?.req).toBe('object');
    });
  });

  // ===========================================================================
  // Preset Middleware Configurations
  // ===========================================================================

  describe('Development CORS Preset', () => {
    it('should allow all origins with permissive settings', async () => {
      const app = new Hono();
      app.use('*', createDevCorsMiddleware());
      app.get('/test', (c) => c.json({ message: 'ok' }));

      const request = createRequest('GET', '/test', {
        'Origin': 'https://localhost:3000',
      });

      const response = await app.request(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull(); // Should be false/null
    });

    it('should handle preflight requests in dev mode', async () => {
      const app = new Hono();
      app.use('*', createDevCorsMiddleware());
      app.post('/test', (c) => c.json({ message: 'created' }));

      const request = createRequest('OPTIONS', '/test', {
        'Origin': 'https://localhost:3000',
        'Access-Control-Request-Method': 'POST',
      });

      const response = await app.request(request);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('Production CORS Preset', () => {
    it('should require explicit allowed origins', async () => {
      const allowedOrigins = ['https://app.example.com', 'https://admin.example.com'];
      const app = new Hono();
      app.use('*', createProductionCorsMiddleware(allowedOrigins));
      app.get('/test', (c) => c.json({ message: 'ok' }));

      const request = createRequest('GET', '/test', {
        'Origin': 'https://app.example.com',
      });

      const response = await app.request(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });

    it('should throw error when no origins provided', () => {
      expect(() => createProductionCorsMiddleware([])).toThrow(
        'Production CORS requires at least one allowed origin'
      );
    });

    it('should throw error when null/undefined origins provided', () => {
      expect(() => createProductionCorsMiddleware(null as any)).toThrow(
        'Production CORS requires at least one allowed origin'
      );
    });

    it('should accept additional options', async () => {
      const app = new Hono();
      app.use('*', createProductionCorsMiddleware(['https://app.com'], {
        maxAge: 1800,
        allowMethods: ['GET', 'POST'],
      }));
      app.get('/test', (c) => c.json({ message: 'ok' }));

      const request = createRequest('OPTIONS', '/test', {
        'Origin': 'https://app.com',
        'Access-Control-Request-Method': 'GET',
      });

      const response = await app.request(request);

      const allowMethods = response.headers.get('Access-Control-Allow-Methods');
      expect(allowMethods).toContain('GET');
      expect(allowMethods).toContain('POST');
      expect(response.headers.get('Access-Control-Max-Age')).toBe('1800');
    });
  });

  describe('Subdomain CORS Preset', () => {
    it('should allow subdomains of specified domain', async () => {
      const app = new Hono();
      app.use('*', createSubdomainCorsMiddleware('example.com'));
      app.get('/test', (c) => c.json({ message: 'ok' }));

      const validSubdomains = [
        'https://app.example.com',
        'https://admin.example.com',
        'https://api.example.com',
        'https://staging-app.example.com',
      ];

      for (const origin of validSubdomains) {
        const request = createRequest('GET', '/test', { 'Origin': origin });
        const response = await app.request(request);

        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      }
    });

    it('should reject apex domain (no subdomain)', async () => {
      const app = new Hono();
      app.use('*', createSubdomainCorsMiddleware('example.com'));
      app.get('/test', (c) => c.json({ message: 'ok' }));

      const request = createRequest('GET', '/test', {
        'Origin': 'https://example.com', // No subdomain
      });

      const response = await app.request(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should reject different domains', async () => {
      const app = new Hono();
      app.use('*', createSubdomainCorsMiddleware('example.com'));
      app.get('/test', (c) => c.json({ message: 'ok' }));

      const invalidOrigins = [
        'https://malicious.com',
        'https://example.com.evil.com',
        'https://notexample.com',
      ];

      for (const origin of invalidOrigins) {
        const request = createRequest('GET', '/test', { 'Origin': origin });
        const response = await app.request(request);

        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      }
    });

    it('should handle invalid URLs gracefully', async () => {
      const app = new Hono();
      app.use('*', createSubdomainCorsMiddleware('example.com'));
      app.get('/test', (c) => c.json({ message: 'ok' }));

      const request = createRequest('GET', '/test', {
        'Origin': 'not-a-valid-url',
      });

      const response = await app.request(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should accept additional options', async () => {
      const app = new Hono();
      app.use('*', createSubdomainCorsMiddleware('example.com', {
        credentials: false,
        maxAge: 600,
      }));
      app.get('/test', (c) => c.json({ message: 'ok' }));

      const request = createRequest('OPTIONS', '/test', {
        'Origin': 'https://app.example.com',
        'Access-Control-Request-Method': 'GET',
      });

      const response = await app.request(request);

      expect(response.headers.get('Access-Control-Allow-Credentials')).toBeNull();
      expect(response.headers.get('Access-Control-Max-Age')).toBe('600');
    });

    it('should be case-insensitive for domain matching', async () => {
      const app = new Hono();
      app.use('*', createSubdomainCorsMiddleware('example.com'));
      app.get('/test', (c) => c.json({ message: 'ok' }));

      const request = createRequest('GET', '/test', {
        'Origin': 'https://App.EXAMPLE.com', // Mixed case
      });

      const response = await app.request(request);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://App.EXAMPLE.com');
    });

    it('should handle domains with special regex characters', async () => {
      const app = new Hono();
      app.use('*', createSubdomainCorsMiddleware('test.co.uk')); // Contains dots
      app.get('/test', (c) => c.json({ message: 'ok' }));

      const validRequest = createRequest('GET', '/test', {
        'Origin': 'https://app.test.co.uk',
      });

      const invalidRequest = createRequest('GET', '/test', {
        'Origin': 'https://app.testXco.uk', // Should not match
      });

      const validResponse = await app.request(validRequest);
      const invalidResponse = await app.request(invalidRequest);

      expect(validResponse.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test.co.uk');
      expect(invalidResponse.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });

  // ===========================================================================
  // Edge Cases and Error Handling
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle empty string origin', async () => {
      const app = createTestApp({ origin: 'https://example.com' });
      const request = createRequest('GET', '/test', {
        'Origin': '',
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should handle null values in configuration gracefully', async () => {
      const app = createTestApp({
        origin: 'https://example.com',
        allowMethods: undefined, // Should use defaults
        allowHeaders: null as any,
        maxAge: undefined,
      });

      const request = createRequest('OPTIONS', '/test', {
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'GET',
      });

      const response = await app.request(request);

      expect(response.status).toBe(204);
      // Should fall back to defaults
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeTruthy();
    });

    it('should handle very long origin strings', async () => {
      const longOrigin = 'https://' + 'a'.repeat(1000) + '.example.com';
      const app = createTestApp({ origin: longOrigin });
      
      const request = createRequest('GET', '/test', {
        'Origin': longOrigin,
      });

      const response = await app.request(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(longOrigin);
    });
  });
});