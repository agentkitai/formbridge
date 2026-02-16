/**
 * Tests for FB-E4: Prometheus Metrics Endpoint
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createFormBridgeAppWithIntakes } from '../src/app.js';
import { metricsRegistry } from '../src/metrics.js';
import type { IntakeDefinition } from '../src/submission-types.js';

const testIntake: IntakeDefinition = {
  id: 'test-intake',
  name: 'Test Intake',
  version: '1.0.0',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
    },
    required: ['name'],
  },
  destination: {
    kind: 'webhook',
    url: 'https://test.example.com/webhook',
  },
};

describe('Prometheus Metrics Endpoint (FB-E4)', () => {
  beforeEach(async () => {
    // Reset all metrics between tests
    metricsRegistry.resetMetrics();
  });

  it('GET /metrics returns Prometheus text format', async () => {
    const app = createFormBridgeAppWithIntakes([testIntake]);
    const res = await app.request('/metrics');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');

    const body = await res.text();
    // Should contain default Node.js metrics
    expect(body).toContain('nodejs_');
    // Should contain FormBridge custom metrics (at least the HELP lines)
    expect(body).toContain('formbridge_submissions_total');
    expect(body).toContain('formbridge_webhook_deliveries_total');
    expect(body).toContain('formbridge_active_submissions');
  });

  it('GET /metrics bypasses auth', async () => {
    const app = createFormBridgeAppWithIntakes([testIntake], {
      auth: {
        enabled: true,
        apiKeys: [{ keyHash: 'somehash', tenantId: 'tenant1', role: 'admin' as const }],
      },
    });
    const res = await app.request('/metrics');
    // Should return 200 even without auth headers
    expect(res.status).toBe(200);
  });

  it('submission creation increments formbridge_submissions_total counter', async () => {
    const app = createFormBridgeAppWithIntakes([testIntake]);

    // Create a submission
    const res = await app.request('/intake/test-intake/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actor: { kind: 'agent', id: 'test-user' } }),
    });
    expect(res.status).toBe(201);

    // Check metrics
    const metricsRes = await app.request('/metrics');
    const body = await metricsRes.text();
    // The counter should have been incremented
    expect(body).toMatch(/formbridge_submissions_total\{.*\} 1/);
  });

  it('/metrics returns valid Prometheus format (each line is comment, metric, or empty)', async () => {
    const app = createFormBridgeAppWithIntakes([testIntake]);
    const res = await app.request('/metrics');
    const body = await res.text();
    const lines = body.split('\n');

    for (const line of lines) {
      if (line === '') continue;
      // Valid Prometheus lines: comments (#), or metric_name{labels} value [timestamp]
      const isComment = line.startsWith('#');
      const isMetric = /^[a-zA-Z_:][a-zA-Z0-9_:]*(\{[^}]*\})?\s+/.test(line);
      expect(isComment || isMetric, `Invalid Prometheus line: ${line}`).toBe(true);
    }
  });
});
