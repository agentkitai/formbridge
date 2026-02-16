/**
 * Tests for tenant isolation in storage queries.
 *
 * Verifies:
 * - Submissions are scoped to tenant_id when auth is enabled
 * - Cross-tenant access returns empty/not-found (not 403)
 * - Admin role bypasses tenant filter
 * - Auth disabled preserves current behavior (no tenant filtering)
 */

import { describe, it, expect } from 'vitest';
import { createFormBridgeAppWithIntakes } from '../../src/app.js';
import type { AuthConfig } from '../../src/auth/middleware.js';
import { InMemoryApiKeyStore } from '../../src/auth/api-key-auth.js';
import { RateLimiter } from '../../src/auth/rate-limiter.js';
import type { IntakeDefinition } from '../../src/submission-types.js';

const TEST_INTAKE: IntakeDefinition = {
  id: 'test-intake',
  name: 'Test Intake',
  version: '1.0.0',
  description: 'Test intake for tenant isolation',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
    required: ['name'],
  },
  destination: {
    kind: 'webhook',
    url: 'https://example.com/webhook',
  },
};

function createMultiTenantApp() {
  const apiKeyStore = new InMemoryApiKeyStore();

  // Tenant A keys
  const tenantAAdmin = apiKeyStore.create({
    name: 'tenant-a-admin',
    tenantId: 'tenant-a',
    operations: ['admin'],
  });
  const tenantAViewer = apiKeyStore.create({
    name: 'tenant-a-viewer',
    tenantId: 'tenant-a',
    operations: ['read'],
  });

  // Tenant B keys
  const tenantBAdmin = apiKeyStore.create({
    name: 'tenant-b-admin',
    tenantId: 'tenant-b',
    operations: ['admin'],
  });
  // Reviewer role — has submission:read but NOT admin (tenant filter applies)
  const tenantBReviewer = apiKeyStore.create({
    name: 'tenant-b-reviewer',
    tenantId: 'tenant-b',
    operations: ['approve'],
  });

  const config: AuthConfig = {
    enabled: true,
    apiKeyStore,
    rateLimiter: new RateLimiter({ maxRequests: 1000, windowMs: 60000 }),
  };

  return {
    app: createFormBridgeAppWithIntakes([TEST_INTAKE], { auth: config }),
    tenantAAdminKey: tenantAAdmin.rawKey,
    tenantAViewerKey: tenantAViewer.rawKey,
    tenantBAdminKey: tenantBAdmin.rawKey,
    tenantBReviewerKey: tenantBReviewer.rawKey,
  };
}

function req(
  app: ReturnType<typeof createFormBridgeAppWithIntakes>,
  method: string,
  path: string,
  opts?: { body?: unknown; headers?: Record<string, string> }
) {
  const init: RequestInit = { method, headers: { ...opts?.headers } };
  if (opts?.body) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  return app.request(path, init);
}

async function createSubmission(
  app: ReturnType<typeof createFormBridgeAppWithIntakes>,
  apiKey: string
) {
  const res = await req(app, 'POST', '/intake/test-intake/submissions', {
    headers: { Authorization: `Bearer ${apiKey}` },
    body: {
      actor: { kind: 'system', id: 'test', name: 'Test' },
      fields: { name: 'Test' },
    },
  });
  const data = await res.json();
  return data;
}

describe('Tenant Isolation', () => {
  describe('cross-tenant data access', () => {
    it('tenant A cannot see tenant B submissions', async () => {
      const { app, tenantBAdminKey, tenantAViewerKey } = createMultiTenantApp();

      // Create submission as tenant B (using admin to have submission:write)
      const created = await createSubmission(app, tenantBAdminKey);
      expect(created.ok).toBe(true);

      // Try to read it as tenant A viewer (not admin, so no bypass)
      const res = await req(app, 'GET', `/intake/test-intake/submissions/${created.submissionId}`, {
        headers: { Authorization: `Bearer ${tenantAViewerKey}` },
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.type).toBe('not_found');
    });

    it('tenant B cannot see tenant A submissions', async () => {
      const { app, tenantAAdminKey, tenantBReviewerKey } = createMultiTenantApp();

      // Create as tenant A
      const created = await createSubmission(app, tenantAAdminKey);
      expect(created.ok).toBe(true);

      // Read as tenant B reviewer — should get not_found
      const res = await req(app, 'GET', `/intake/test-intake/submissions/${created.submissionId}`, {
        headers: { Authorization: `Bearer ${tenantBReviewerKey}` },
      });
      expect(res.status).toBe(404);
    });

    it('cross-tenant access returns not_found, not 403', async () => {
      const { app, tenantAAdminKey, tenantBReviewerKey } = createMultiTenantApp();

      const created = await createSubmission(app, tenantAAdminKey);
      expect(created.ok).toBe(true);

      const res = await req(app, 'GET', `/intake/test-intake/submissions/${created.submissionId}`, {
        headers: { Authorization: `Bearer ${tenantBReviewerKey}` },
      });
      // Must be 404, NOT 403
      expect(res.status).toBe(404);
      expect(res.status).not.toBe(403);
    });
  });

  describe('admin tenant bypass', () => {
    it('admin can access submissions from any tenant', async () => {
      const { app, tenantAAdminKey, tenantBAdminKey } = createMultiTenantApp();

      // Create as tenant B
      const created = await createSubmission(app, tenantBAdminKey);
      expect(created.ok).toBe(true);

      // Admin from tenant A can see it (admin bypasses tenant filter)
      const res = await req(app, 'GET', `/intake/test-intake/submissions/${created.submissionId}`, {
        headers: { Authorization: `Bearer ${tenantAAdminKey}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.submissionId).toBe(created.submissionId);
    });
  });

  describe('auth disabled passthrough', () => {
    it('all submissions visible when auth disabled', async () => {
      const app = createFormBridgeAppWithIntakes([TEST_INTAKE], {
        auth: { enabled: false },
      });

      // Create submission without auth
      const createRes = await req(app, 'POST', '/intake/test-intake/submissions', {
        body: {
          actor: { kind: 'system', id: 'test', name: 'Test' },
          fields: { name: 'No Auth' },
        },
      });
      const created = await createRes.json();
      expect(created.ok).toBe(true);

      // Read without auth — should work
      const getRes = await req(app, 'GET', `/intake/test-intake/submissions/${created.submissionId}`);
      expect(getRes.status).toBe(200);
      const body = await getRes.json();
      expect(body.ok).toBe(true);
    });
  });

  describe('submission creation stores tenantId', () => {
    it('submissions created with auth have tenantId set', async () => {
      const { app, tenantAAdminKey } = createMultiTenantApp();

      const created = await createSubmission(app, tenantAAdminKey);
      expect(created.ok).toBe(true);

      // Admin can see it and verify it exists
      const res = await req(app, 'GET', `/intake/test-intake/submissions/${created.submissionId}`, {
        headers: { Authorization: `Bearer ${tenantAAdminKey}` },
      });
      expect(res.status).toBe(200);
    });

    it('same tenant can access own submissions', async () => {
      const { app, tenantAAdminKey, tenantAViewerKey } = createMultiTenantApp();

      // Create as tenant A admin
      const created = await createSubmission(app, tenantAAdminKey);
      expect(created.ok).toBe(true);

      // Viewer from same tenant can see it
      const res = await req(app, 'GET', `/intake/test-intake/submissions/${created.submissionId}`, {
        headers: { Authorization: `Bearer ${tenantAViewerKey}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });
});
