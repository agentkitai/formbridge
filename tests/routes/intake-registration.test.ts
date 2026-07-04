/**
 * Tests for runtime intake-registration routes (POST/PUT/GET /intakes).
 *
 * Exercised end-to-end through the app factory so the tests cover the full
 * wiring: auth middleware + permission gates + the SAME IntakeRegistry the
 * submission routes read from. The key property under test is that an intake
 * registered at runtime via POST /intakes is immediately usable by
 * POST /intake/:intakeId/submissions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createFormBridgeAppWithIntakes } from '../../src/app.js';
import type { AuthConfig } from '../../src/auth/middleware.js';
import { InMemoryApiKeyStore } from '../../src/auth/api-key-auth.js';
import { RateLimiter } from '../../src/auth/rate-limiter.js';
import type { IntakeDefinition } from '../../src/submission-types.js';

// Intake registered at startup — proves the startup path keeps working and that
// GET /intakes/:id can read a startup-registered intake.
const SEED_INTAKE: IntakeDefinition = {
  id: 'seed-intake',
  version: '1.0.0',
  name: 'Seed Intake',
  description: 'Registered at startup',
  schema: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
  destination: { kind: 'webhook', url: 'https://example.com/seed' },
};

// Intake registered at RUNTIME via POST /intakes. Includes a destination header
// (a webhook auth secret) to prove response redaction.
const RUNTIME_INTAKE = {
  id: 'runtime-intake',
  version: '1.0.0',
  name: 'Runtime Intake',
  description: 'Registered at runtime',
  schema: {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email' },
      count: { type: 'number' },
    },
    required: ['email'],
  },
  destination: {
    kind: 'webhook',
    url: 'https://example.com/runtime',
    headers: { Authorization: 'Bearer super-secret-token' },
  },
};

type App = ReturnType<typeof createFormBridgeAppWithIntakes>;

function req(
  app: App,
  method: string,
  path: string,
  opts?: { body?: unknown; headers?: Record<string, string> }
) {
  const init: RequestInit = { method, headers: { ...opts?.headers } };
  if (opts?.body !== undefined) {
    init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  return app.request(path, init);
}

function createTestApp() {
  return createFormBridgeAppWithIntakes([SEED_INTAKE], { auth: { enabled: false } });
}

// =============================================================================
// § Runtime registration → immediately usable by the submission route
// =============================================================================

describe('POST /intakes — runtime registration is live in the shared registry', () => {
  let app: App;
  beforeEach(() => {
    app = createTestApp();
  });

  it('an intake is NOT submittable before it is registered', async () => {
    const res = await req(app, 'POST', '/intake/runtime-intake/submissions', {
      body: { actor: { kind: 'system', id: 'agent-1', name: 'Agent' } },
    });
    expect(res.status).toBe(404);
  });

  it('registers a JSON-Schema intake (201) then creates a submission against it (201)', async () => {
    const regRes = await req(app, 'POST', '/intakes', { body: RUNTIME_INTAKE });
    expect(regRes.status).toBe(201);
    const regBody = (await regRes.json()) as {
      ok: boolean;
      intakeId: string;
      intake: { destination: Record<string, unknown> };
    };
    expect(regBody.ok).toBe(true);
    expect(regBody.intakeId).toBe('runtime-intake');
    // Redaction: webhook auth headers must NOT be echoed back.
    expect(regBody.intake.destination).not.toHaveProperty('headers');
    expect(regBody.intake.destination.url).toBe('https://example.com/runtime');

    // The runtime intake is now live in the SAME registry the submission route reads.
    const subRes = await req(app, 'POST', '/intake/runtime-intake/submissions', {
      body: {
        actor: { kind: 'agent', id: 'agent-1', name: 'Agent' },
        initialFields: { email: 'vendor@example.com' },
      },
    });
    expect(subRes.status).toBe(201);
    const subBody = (await subRes.json()) as { ok: boolean; submissionId: string };
    expect(subBody.ok).toBe(true);
    expect(subBody.submissionId).toBeTruthy();
  });

  it('rejects a submission whose initial fields violate the runtime schema (400)', async () => {
    await req(app, 'POST', '/intakes', { body: RUNTIME_INTAKE });
    const subRes = await req(app, 'POST', '/intake/runtime-intake/submissions', {
      body: {
        actor: { kind: 'agent', id: 'agent-1' },
        initialFields: { count: 'not-a-number' },
      },
    });
    expect(subRes.status).toBe(400);
  });
});

// =============================================================================
// § Validation — 400 on invalid/malformed definitions
// =============================================================================

describe('POST /intakes — validation', () => {
  let app: App;
  beforeEach(() => {
    app = createTestApp();
  });

  it('rejects a missing schema (400)', async () => {
    const { schema: _schema, ...noSchema } = RUNTIME_INTAKE;
    const res = await req(app, 'POST', '/intakes', { body: noSchema });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: { type: string } };
    expect(body.ok).toBe(false);
    expect(body.error.type).toBe('validation_error');
  });

  it('rejects a missing id (400)', async () => {
    const { id: _id, ...noId } = RUNTIME_INTAKE;
    const res = await req(app, 'POST', '/intakes', { body: noId });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed schema — no type/$ref/properties (400)', async () => {
    const res = await req(app, 'POST', '/intakes', {
      body: { ...RUNTIME_INTAKE, schema: { minLength: 3 } },
    });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed destination (400)', async () => {
    const res = await req(app, 'POST', '/intakes', {
      body: { ...RUNTIME_INTAKE, destination: { kind: 'webhook' } },
    });
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON (400)', async () => {
    const res = await req(app, 'POST', '/intakes', {
      headers: { 'Content-Type': 'application/json' },
      body: '{ not valid json ',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a non-object body (400)', async () => {
    const res = await req(app, 'POST', '/intakes', { body: [1, 2, 3] });
    expect(res.status).toBe(400);
  });
});

// =============================================================================
// § Duplicate / update semantics — POST is create-only (409), PUT upserts
// =============================================================================

describe('Duplicate / update semantics', () => {
  let app: App;
  beforeEach(() => {
    app = createTestApp();
  });

  it('POST twice with the same id → 409 conflict', async () => {
    const first = await req(app, 'POST', '/intakes', { body: RUNTIME_INTAKE });
    expect(first.status).toBe(201);

    const second = await req(app, 'POST', '/intakes', { body: RUNTIME_INTAKE });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { ok: boolean; error: { type: string } };
    expect(body.ok).toBe(false);
    expect(body.error.type).toBe('conflict');
  });

  it('PUT replaces an existing intake in place → 200 and reflects the update', async () => {
    await req(app, 'POST', '/intakes', { body: RUNTIME_INTAKE });

    const putRes = await req(app, 'PUT', '/intakes/runtime-intake', {
      body: { ...RUNTIME_INTAKE, name: 'Renamed Runtime Intake', version: '2.0.0' },
    });
    expect(putRes.status).toBe(200);
    const body = (await putRes.json()) as { intake: { name: string; version: string } };
    expect(body.intake.name).toBe('Renamed Runtime Intake');
    expect(body.intake.version).toBe('2.0.0');

    const getRes = await req(app, 'GET', '/intakes/runtime-intake');
    const getBody = (await getRes.json()) as { intake: { name: string } };
    expect(getBody.intake.name).toBe('Renamed Runtime Intake');
  });

  it('PUT creates when the intake does not yet exist → 201', async () => {
    const res = await req(app, 'PUT', '/intakes/created-via-put', {
      body: { ...RUNTIME_INTAKE, id: 'created-via-put' },
    });
    expect(res.status).toBe(201);
    // And it is immediately usable.
    const subRes = await req(app, 'POST', '/intake/created-via-put/submissions', {
      body: { actor: { kind: 'system', id: 's' }, initialFields: { email: 'x@y.com' } },
    });
    expect(subRes.status).toBe(201);
  });

  it('PUT with a body id that disagrees with the URL id → 400', async () => {
    const res = await req(app, 'PUT', '/intakes/runtime-intake', {
      body: { ...RUNTIME_INTAKE, id: 'different-id' },
    });
    expect(res.status).toBe(400);
  });

  it('PUT with an invalid definition leaves any existing intake intact', async () => {
    await req(app, 'POST', '/intakes', { body: RUNTIME_INTAKE });
    // Invalid update (no valid schema) must be rejected...
    const bad = await req(app, 'PUT', '/intakes/runtime-intake', {
      body: { ...RUNTIME_INTAKE, schema: { minLength: 1 } },
    });
    expect(bad.status).toBe(400);
    // ...and the original definition is still there and usable.
    const getRes = await req(app, 'GET', '/intakes/runtime-intake');
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as { intake: { version: string } };
    expect(getBody.intake.version).toBe('1.0.0');
  });
});

// =============================================================================
// § GET /intakes/:id
// =============================================================================

describe('GET /intakes/:id', () => {
  let app: App;
  beforeEach(() => {
    app = createTestApp();
  });

  it('returns a startup-registered intake (200)', async () => {
    const res = await req(app, 'GET', '/intakes/seed-intake');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; intakeId: string };
    expect(body.ok).toBe(true);
    expect(body.intakeId).toBe('seed-intake');
  });

  it('returns 404 for an unknown intake', async () => {
    const res = await req(app, 'GET', '/intakes/nope');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; error: { type: string } };
    expect(body.error.type).toBe('not_found');
  });

  it('redacts destination.headers on read', async () => {
    await req(app, 'POST', '/intakes', { body: RUNTIME_INTAKE });
    const res = await req(app, 'GET', '/intakes/runtime-intake');
    const body = (await res.json()) as { intake: { destination: Record<string, unknown> } };
    expect(body.intake.destination).not.toHaveProperty('headers');
  });
});

// =============================================================================
// § Auth — write routes require intake:write, reads require intake:read
// =============================================================================

function createAuthEnabledApp() {
  const apiKeyStore = new InMemoryApiKeyStore();
  const adminResult = apiKeyStore.create({
    name: 'admin-key',
    tenantId: 'tenant-1',
    operations: ['admin'],
  });
  const viewerResult = apiKeyStore.create({
    name: 'viewer-key',
    tenantId: 'tenant-1',
    operations: ['read'],
  });

  const config: AuthConfig = {
    enabled: true,
    apiKeyStore,
    rateLimiter: new RateLimiter({ maxRequests: 1000, windowMs: 60000 }),
    defaultRole: 'viewer',
  };

  return {
    app: createFormBridgeAppWithIntakes([SEED_INTAKE], { auth: config }),
    adminKey: adminResult.rawKey,
    viewerKey: viewerResult.rawKey,
  };
}

describe('Auth on /intakes', () => {
  it('POST /intakes without auth → 401', async () => {
    const { app } = createAuthEnabledApp();
    const res = await req(app, 'POST', '/intakes', { body: RUNTIME_INTAKE });
    expect(res.status).toBe(401);
  });

  it('POST /intakes with viewer key (no intake:write) → 403', async () => {
    const { app, viewerKey } = createAuthEnabledApp();
    const res = await req(app, 'POST', '/intakes', {
      headers: { Authorization: `Bearer ${viewerKey}` },
      body: RUNTIME_INTAKE,
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { type: string } };
    expect(body.error.type).toBe('forbidden');
  });

  it('POST /intakes with admin key (intake:write) → 201', async () => {
    const { app, adminKey } = createAuthEnabledApp();
    const res = await req(app, 'POST', '/intakes', {
      headers: { Authorization: `Bearer ${adminKey}` },
      body: RUNTIME_INTAKE,
    });
    expect(res.status).toBe(201);
  });

  it('PUT /intakes/:id with viewer key → 403; with admin key → 200/201', async () => {
    const { app, adminKey, viewerKey } = createAuthEnabledApp();
    const viewerRes = await req(app, 'PUT', '/intakes/runtime-intake', {
      headers: { Authorization: `Bearer ${viewerKey}` },
      body: RUNTIME_INTAKE,
    });
    expect(viewerRes.status).toBe(403);

    const adminRes = await req(app, 'PUT', '/intakes/runtime-intake', {
      headers: { Authorization: `Bearer ${adminKey}` },
      body: RUNTIME_INTAKE,
    });
    expect([200, 201]).toContain(adminRes.status);
  });

  it('GET /intakes/:id with viewer key (intake:read) → 200', async () => {
    const { app, viewerKey } = createAuthEnabledApp();
    const res = await req(app, 'GET', '/intakes/seed-intake', {
      headers: { Authorization: `Bearer ${viewerKey}` },
    });
    expect(res.status).toBe(200);
  });

  it('GET /intakes/:id without auth → 401', async () => {
    const { app } = createAuthEnabledApp();
    const res = await req(app, 'GET', '/intakes/seed-intake');
    expect(res.status).toBe(401);
  });
});
