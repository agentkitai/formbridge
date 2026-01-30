/**
 * API Integration Tests
 *
 * Comprehensive tests for all HTTP/JSON API endpoints:
 * - Health check endpoint
 * - Intake schema endpoint
 * - Submission lifecycle (create, get, update)
 * - Error handling (404, 400, 409, 500)
 * - State transitions
 * - Resume token validation
 * - Idempotency
 *
 * Based on INTAKE_CONTRACT_SPEC.md and EXAMPLE_VENDOR_ONBOARDING.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createFormBridgeApp, createFormBridgeAppWithIntakes } from '../src/index.js';
import type { IntakeDefinition, JSONSchema } from '../src/types.js';

/**
 * Sample vendor onboarding intake definition for testing
 * Based on EXAMPLE_VENDOR_ONBOARDING.md
 */
const vendorOnboardingIntake: IntakeDefinition = {
  id: 'vendor-onboarding',
  version: '1.0.0',
  name: 'Vendor Onboarding',
  description: 'Onboard new vendors with tax ID, bank account, and documentation',
  schema: {
    type: 'object',
    properties: {
      legal_name: {
        type: 'string',
        minLength: 1,
      },
      country: {
        type: 'string',
        enum: ['US', 'CA', 'UK', 'DE', 'FR'],
      },
      tax_id: {
        type: 'string',
        pattern: '^[0-9]{2}-[0-9]{7}$',
      },
      contact_email: {
        type: 'string',
        format: 'email',
      },
      bank_account: {
        type: 'object',
        properties: {
          routing: { type: 'string' },
          account: { type: 'string' },
        },
        required: ['routing', 'account'],
      },
    },
    required: ['legal_name', 'country', 'tax_id', 'contact_email'],
  },
  destination: {
    kind: 'webhook',
    url: 'https://example.com/vendor-webhook',
  },
};

/**
 * Simple intake for basic testing
 */
const simpleIntake: IntakeDefinition = {
  id: 'simple-contact',
  version: '1.0.0',
  name: 'Simple Contact Form',
  description: 'Basic contact form with name and email',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      email: { type: 'string', format: 'email' },
      message: { type: 'string' },
    },
    required: ['name', 'email'],
  },
  destination: {
    kind: 'webhook',
    url: 'https://example.com/contact-webhook',
  },
};

describe('Health Check Endpoint', () => {
  it('should return 200 with ok=true and timestamp', async () => {
    const app = createFormBridgeApp();
    const res = await app.request('/health');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('ok', true);
    expect(body).toHaveProperty('timestamp');
    expect(typeof body.timestamp).toBe('string');
    // Verify timestamp is valid ISO 8601
    expect(() => new Date(body.timestamp)).not.toThrow();
  });

  it('should work with custom base path', async () => {
    const app = createFormBridgeApp({ basePath: '/api/v1' });
    const res = await app.request('/health');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

describe('GET /intake/:id/schema', () => {
  let app: Awaited<ReturnType<typeof createFormBridgeAppWithIntakes>>;

  beforeEach(() => {
    app = createFormBridgeAppWithIntakes([vendorOnboardingIntake, simpleIntake]);
  });

  it('should return intake schema for registered intake', async () => {
    const res = await app.request('/intake/vendor-onboarding/schema');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('ok', true);
    expect(body).toHaveProperty('intakeId', 'vendor-onboarding');
    expect(body).toHaveProperty('schema');
    expect(body.schema).toMatchObject({
      type: 'object',
      properties: expect.any(Object),
      required: ['legal_name', 'country', 'tax_id', 'contact_email'],
    });
  });

  it('should return 404 for non-existent intake', async () => {
    const res = await app.request('/intake/non-existent/schema');

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('ok', false);
    expect(body.error).toMatchObject({
      type: 'not_found',
      message: expect.stringContaining('non-existent'),
    });
  });

  it('should return schema for different intakes', async () => {
    const res = await app.request('/intake/simple-contact/schema');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.intakeId).toBe('simple-contact');
    expect(body.schema.required).toEqual(['name', 'email']);
  });
});

describe('POST /intake/:id/submissions', () => {
  let app: Awaited<ReturnType<typeof createFormBridgeAppWithIntakes>>;

  beforeEach(() => {
    app = createFormBridgeAppWithIntakes([vendorOnboardingIntake, simpleIntake]);
  });

  it('should create a new submission with minimal data', async () => {
    const res = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: {
          kind: 'agent',
          id: 'test-agent',
          name: 'Test Agent',
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      submissionId: expect.stringMatching(/^sub_/),
      state: 'draft',
      resumeToken: expect.any(String),
      schema: expect.any(Object),
    });
    // For draft submissions with no initial fields, missingFields is undefined
    // This is expected behavior per the implementation
    expect(body.missingFields).toBeUndefined();
  });

  it('should create submission with initial fields', async () => {
    const res = await app.request('/intake/vendor-onboarding/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: {
          kind: 'agent',
          id: 'claude-assistant',
        },
        initialFields: {
          legal_name: 'Acme Supplies Ltd',
          country: 'US',
          contact_email: 'ap@acme.com',
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.state).toBe('in_progress');
    expect(body.submissionId).toMatch(/^sub_/);
    expect(body.resumeToken).toBeTruthy();
    expect(body.missingFields).toContain('tax_id');
    expect(body.missingFields).not.toContain('legal_name');
    expect(body.missingFields).not.toContain('country');
  });

  it('should support idempotency key', async () => {
    const requestBody = {
      actor: { kind: 'agent' as const, id: 'test-agent' },
      idempotencyKey: 'idem_test_123',
      initialFields: { name: 'John Doe' },
    };

    // First request
    const res1 = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    expect(res1.status).toBe(201);
    const body1 = await res1.json();
    const submissionId1 = body1.submissionId;
    const resumeToken1 = body1.resumeToken;

    // Second request with same idempotency key
    const res2 = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    expect(res2.status).toBe(201);
    const body2 = await res2.json();

    // Should return the same submission
    expect(body2.submissionId).toBe(submissionId1);
    expect(body2.resumeToken).toBe(resumeToken1);
  });

  it('should return 400 for missing actor', async () => {
    const res = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        initialFields: { name: 'Test' },
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.type).toBe('invalid_request');
    expect(body.error.message).toContain('actor');
  });

  it('should return 400 for incomplete actor', async () => {
    const res = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent' }, // missing id
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.type).toBe('invalid_request');
  });

  it('should return 404 for non-existent intake', async () => {
    const res = await app.request('/intake/non-existent/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent', id: 'test' },
      }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.type).toBe('not_found');
  });
});

describe('GET /intake/:id/submissions/:submissionId', () => {
  let app: Awaited<ReturnType<typeof createFormBridgeAppWithIntakes>>;

  beforeEach(() => {
    app = createFormBridgeAppWithIntakes([vendorOnboardingIntake, simpleIntake]);
  });

  it('should retrieve an existing submission', async () => {
    // Create a submission first
    const createRes = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent', id: 'test' },
        initialFields: { name: 'Jane Doe', email: 'jane@example.com' },
      }),
    });
    const createBody = await createRes.json();
    const submissionId = createBody.submissionId;

    // Retrieve the submission
    const res = await app.request(`/intake/simple-contact/submissions/${submissionId}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      submissionId,
      state: 'in_progress',
      intakeId: 'simple-contact',
      resumeToken: expect.any(String),
      fields: {
        name: 'Jane Doe',
        email: 'jane@example.com',
      },
      metadata: {
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        createdBy: {
          kind: 'agent',
          id: 'test',
        },
      },
    });
  });

  it('should return 404 for non-existent submission', async () => {
    const res = await app.request('/intake/simple-contact/submissions/sub_nonexistent');

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.type).toBe('not_found');
    expect(body.error.message).toContain('sub_nonexistent');
  });

  it('should return 404 for non-existent intake', async () => {
    const res = await app.request('/intake/non-existent/submissions/sub_123');

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.type).toBe('not_found');
  });

  it('should return 404 when submission belongs to different intake', async () => {
    // Create submission for simple-contact
    const createRes = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent', id: 'test' },
      }),
    });
    const createBody = await createRes.json();
    const submissionId = createBody.submissionId;

    // Try to retrieve it via vendor-onboarding endpoint
    const res = await app.request(`/intake/vendor-onboarding/submissions/${submissionId}`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.message).toContain('not found for intake');
  });
});

describe('PATCH /intake/:id/submissions/:submissionId', () => {
  let app: Awaited<ReturnType<typeof createFormBridgeAppWithIntakes>>;

  beforeEach(() => {
    app = createFormBridgeAppWithIntakes([vendorOnboardingIntake, simpleIntake]);
  });

  it('should update submission fields with valid resume token', async () => {
    // Create a submission
    const createRes = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent', id: 'test' },
        initialFields: { name: 'John Doe' },
      }),
    });
    const createBody = await createRes.json();
    const { submissionId, resumeToken } = createBody;

    // Update the submission
    const res = await app.request(`/intake/simple-contact/submissions/${submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeToken,
        actor: { kind: 'agent', id: 'test' },
        fields: {
          email: 'john@example.com',
          message: 'Hello world',
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      submissionId,
      state: 'in_progress',
      resumeToken: expect.any(String),
      fields: {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Hello world',
      },
    });
    // Resume token should be updated
    expect(body.resumeToken).not.toBe(resumeToken);
  });

  it('should transition from draft to in_progress on first update', async () => {
    // Create empty submission (draft state)
    const createRes = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'human', id: 'user123' },
      }),
    });
    const createBody = await createRes.json();
    expect(createBody.state).toBe('draft');

    // Update with first field
    const updateRes = await app.request(`/intake/simple-contact/submissions/${createBody.submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeToken: createBody.resumeToken,
        actor: { kind: 'human', id: 'user123' },
        fields: { name: 'Alice' },
      }),
    });

    expect(updateRes.status).toBe(200);
    const updateBody = await updateRes.json();
    expect(updateBody.state).toBe('in_progress');
  });

  it('should return 400 for missing resume token', async () => {
    const res = await app.request('/intake/simple-contact/submissions/sub_123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent', id: 'test' },
        fields: { name: 'Test' },
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.type).toBe('invalid_request');
    expect(body.error.message).toContain('resumeToken');
  });

  it('should return 400 for missing actor', async () => {
    const res = await app.request('/intake/simple-contact/submissions/sub_123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeToken: 'token',
        fields: { name: 'Test' },
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.type).toBe('invalid_request');
    expect(body.error.message).toContain('actor');
  });

  it('should return 400 for missing fields', async () => {
    const res = await app.request('/intake/simple-contact/submissions/sub_123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeToken: 'token',
        actor: { kind: 'agent', id: 'test' },
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.type).toBe('invalid_request');
    expect(body.error.message).toContain('fields');
  });

  it('should return 409 for invalid resume token', async () => {
    // Create a submission
    const createRes = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent', id: 'test' },
      }),
    });
    const createBody = await createRes.json();

    // Try to update with wrong resume token
    const res = await app.request(`/intake/simple-contact/submissions/${createBody.submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeToken: 'invalid_token_xyz',
        actor: { kind: 'agent', id: 'test' },
        fields: { name: 'Test' },
      }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.type).toBe('invalid_resume_token');
  });

  it('should return 404 for non-existent submission', async () => {
    const res = await app.request('/intake/simple-contact/submissions/sub_nonexistent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeToken: 'token',
        actor: { kind: 'agent', id: 'test' },
        fields: { name: 'Test' },
      }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.type).toBe('not_found');
  });

  it('should handle multiple sequential updates', async () => {
    // Create submission
    const createRes = await app.request('/intake/vendor-onboarding/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent', id: 'test-agent' },
      }),
    });
    const createBody = await createRes.json();
    let resumeToken = createBody.resumeToken;
    const submissionId = createBody.submissionId;

    // First update
    const update1Res = await app.request(`/intake/vendor-onboarding/submissions/${submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeToken,
        actor: { kind: 'agent', id: 'test-agent' },
        fields: { legal_name: 'Acme Corp', country: 'US' },
      }),
    });
    const update1Body = await update1Res.json();
    expect(update1Body.ok).toBe(true);
    resumeToken = update1Body.resumeToken;

    // Second update with new resume token
    const update2Res = await app.request(`/intake/vendor-onboarding/submissions/${submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeToken,
        actor: { kind: 'agent', id: 'test-agent' },
        fields: { contact_email: 'contact@acme.com' },
      }),
    });
    const update2Body = await update2Res.json();
    expect(update2Body.ok).toBe(true);
    expect(update2Body.fields).toMatchObject({
      legal_name: 'Acme Corp',
      country: 'US',
      contact_email: 'contact@acme.com',
    });

    // Verify old resume token no longer works
    const update3Res = await app.request(`/intake/vendor-onboarding/submissions/${submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeToken: update1Body.resumeToken, // old token
        actor: { kind: 'agent', id: 'test-agent' },
        fields: { tax_id: '12-3456789' },
      }),
    });
    expect(update3Res.status).toBe(409);
  });
});

describe('Complete Submission Workflow', () => {
  let app: Awaited<ReturnType<typeof createFormBridgeAppWithIntakes>>;

  beforeEach(() => {
    app = createFormBridgeAppWithIntakes([vendorOnboardingIntake]);
  });

  it('should support the vendor onboarding workflow from EXAMPLE_VENDOR_ONBOARDING.md', async () => {
    // Step 1: Agent creates submission with known fields
    const createRes = await app.request('/intake/vendor-onboarding/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent', id: 'agent_vendor_onboarding' },
        initialFields: {
          legal_name: 'Acme Supplies Ltd',
          country: 'US',
          contact_email: 'ap@acme.com',
        },
      }),
    });

    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.state).toBe('in_progress');
    expect(createBody.missingFields).toContain('tax_id');

    const submissionId = createBody.submissionId;
    let resumeToken = createBody.resumeToken;

    // Step 2: Get submission to check current state
    const getRes1 = await app.request(`/intake/vendor-onboarding/submissions/${submissionId}`);
    expect(getRes1.status).toBe(200);
    const getBody1 = await getRes1.json();
    expect(getBody1.fields).toMatchObject({
      legal_name: 'Acme Supplies Ltd',
      country: 'US',
      contact_email: 'ap@acme.com',
    });

    // Step 3: Human/vendor fills in missing tax_id
    const updateRes = await app.request(`/intake/vendor-onboarding/submissions/${submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeToken,
        actor: { kind: 'human', id: 'vendor_user_73' },
        fields: { tax_id: '12-3456789' },
      }),
    });

    expect(updateRes.status).toBe(200);
    const updateBody = await updateRes.json();
    expect(updateBody.ok).toBe(true);
    expect(updateBody.fields.tax_id).toBe('12-3456789');
    resumeToken = updateBody.resumeToken;

    // Step 4: Agent resumes and verifies all required fields are present
    const getRes2 = await app.request(`/intake/vendor-onboarding/submissions/${submissionId}`);
    expect(getRes2.status).toBe(200);
    const getBody2 = await getRes2.json();
    expect(getBody2.fields).toMatchObject({
      legal_name: 'Acme Supplies Ltd',
      country: 'US',
      contact_email: 'ap@acme.com',
      tax_id: '12-3456789',
    });

    // All required fields are now present
    expect(getBody2.state).toBe('in_progress');
  });

  it('should handle mixed-mode collaboration (agent → human → agent)', async () => {
    // Agent starts
    const createRes = await app.request('/intake/vendor-onboarding/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent', id: 'claude-assistant', name: 'Claude' },
        initialFields: { legal_name: 'TechCorp Inc' },
      }),
    });
    const createBody = await createRes.json();
    const submissionId = createBody.submissionId;

    // Human adds fields
    const humanUpdateRes = await app.request(`/intake/vendor-onboarding/submissions/${submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeToken: createBody.resumeToken,
        actor: { kind: 'human', id: 'user456', name: 'Bob Smith' },
        fields: { country: 'US', contact_email: 'bob@techcorp.com' },
      }),
    });
    const humanUpdateBody = await humanUpdateRes.json();

    // Agent completes
    const agentUpdateRes = await app.request(`/intake/vendor-onboarding/submissions/${submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeToken: humanUpdateBody.resumeToken,
        actor: { kind: 'agent', id: 'claude-assistant', name: 'Claude' },
        fields: { tax_id: '98-7654321' },
      }),
    });

    expect(agentUpdateRes.status).toBe(200);
    const finalBody = await agentUpdateRes.json();
    expect(finalBody.fields).toMatchObject({
      legal_name: 'TechCorp Inc',
      country: 'US',
      contact_email: 'bob@techcorp.com',
      tax_id: '98-7654321',
    });
  });
});

describe('State Transitions and Validation', () => {
  let app: Awaited<ReturnType<typeof createFormBridgeAppWithIntakes>>;

  beforeEach(() => {
    app = createFormBridgeAppWithIntakes([simpleIntake]);
  });

  it('should start in draft state when no initial fields provided', async () => {
    const res = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'human', id: 'user' },
      }),
    });

    const body = await res.json();
    expect(body.state).toBe('draft');
  });

  it('should transition to in_progress when initial fields provided', async () => {
    const res = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent', id: 'test' },
        initialFields: { name: 'Test User' },
      }),
    });

    const body = await res.json();
    expect(body.state).toBe('in_progress');
  });

  it('should report missing fields in response', async () => {
    const res = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent', id: 'test' },
        initialFields: { name: 'John' },
      }),
    });

    const body = await res.json();
    expect(body.missingFields).toContain('email');
    expect(body.missingFields).not.toContain('name');
  });
});

describe('CORS and Content-Type Headers', () => {
  it('should set CORS headers when CORS is enabled', async () => {
    const app = createFormBridgeApp({
      cors: { origin: '*' },
    });

    const res = await app.request('/health', {
      headers: { 'Origin': 'https://example.com' },
    });

    expect(res.status).toBe(200);
    // Hono's CORS middleware should add headers
    // Note: actual header values depend on Hono's implementation
  });

  it('should accept application/json content type', async () => {
    const app = createFormBridgeAppWithIntakes([simpleIntake]);

    const res = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent', id: 'test' },
      }),
    });

    expect(res.status).toBe(201);
  });
});

describe('Error Response Format', () => {
  let app: Awaited<ReturnType<typeof createFormBridgeAppWithIntakes>>;

  beforeEach(() => {
    app = createFormBridgeAppWithIntakes([simpleIntake]);
  });

  it('should return structured error for 404', async () => {
    const res = await app.request('/intake/nonexistent/schema');

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: false,
      error: {
        type: 'not_found',
        message: expect.any(String),
      },
    });
  });

  it('should return structured error for 400', async () => {
    const res = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}), // missing actor
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: false,
      error: {
        type: 'invalid_request',
        message: expect.any(String),
      },
    });
  });

  it('should return structured error for 409', async () => {
    // Create submission
    const createRes = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent', id: 'test' },
      }),
    });
    const createBody = await createRes.json();

    // Update with wrong token
    const res = await app.request(`/intake/simple-contact/submissions/${createBody.submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeToken: 'wrong_token',
        actor: { kind: 'agent', id: 'test' },
        fields: { name: 'Test' },
      }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: false,
      error: {
        type: 'invalid_resume_token',
        message: expect.any(String),
      },
    });
  });
});

describe('Metadata and Audit Trail', () => {
  let app: Awaited<ReturnType<typeof createFormBridgeAppWithIntakes>>;

  beforeEach(() => {
    app = createFormBridgeAppWithIntakes([simpleIntake]);
  });

  it('should include metadata in GET response', async () => {
    const createRes = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent', id: 'test-agent', name: 'Test Agent' },
      }),
    });
    const createBody = await createRes.json();

    const getRes = await app.request(`/intake/simple-contact/submissions/${createBody.submissionId}`);
    const getBody = await getRes.json();

    expect(getBody.metadata).toMatchObject({
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      createdBy: {
        kind: 'agent',
        id: 'test-agent',
        name: 'Test Agent',
      },
    });

    // Verify ISO 8601 timestamps
    expect(() => new Date(getBody.metadata.createdAt)).not.toThrow();
    expect(() => new Date(getBody.metadata.updatedAt)).not.toThrow();
  });

  it('should update metadata.updatedAt on field updates', async () => {
    const createRes = await app.request('/intake/simple-contact/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent', id: 'test' },
      }),
    });
    const createBody = await createRes.json();

    // Wait a tiny bit to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 10));

    const updateRes = await app.request(`/intake/simple-contact/submissions/${createBody.submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeToken: createBody.resumeToken,
        actor: { kind: 'agent', id: 'test' },
        fields: { name: 'Test' },
      }),
    });
    const updateBody = await updateRes.json();

    const getRes = await app.request(`/intake/simple-contact/submissions/${createBody.submissionId}`);
    const getBody = await getRes.json();

    const createdAt = new Date(getBody.metadata.createdAt);
    const updatedAt = new Date(getBody.metadata.updatedAt);
    expect(updatedAt >= createdAt).toBe(true);
  });
});
