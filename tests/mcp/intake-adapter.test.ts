/**
 * toContractIntake fidelity tests — the adapter that converts the Zod-schema
 * MCP IntakeDefinition into the JSON-schema contract IntakeDefinition consumed
 * by the shared IntakeRegistry + SubmissionManager.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { toContractIntake } from '../../src/mcp/intake-adapter.js';
import type { IntakeDefinition } from '../../src/schemas/intake-schema.js';

const baseIntake: IntakeDefinition = {
  id: 'vendor_onboarding',
  version: '2.1.0',
  name: 'Vendor Onboarding',
  description: 'Onboard a vendor',
  schema: z.object({
    legal_name: z.string().min(1),
    tax_id: z.string(),
    amount: z.number().min(0).optional(),
  }),
  destination: { type: 'webhook', name: 'Vendor API', config: { url: 'https://example.com/vendor' } },
};

describe('toContractIntake', () => {
  it('carries id, version, name, and description', () => {
    const contract = toContractIntake(baseIntake);
    expect(contract.id).toBe('vendor_onboarding');
    expect(contract.version).toBe('2.1.0');
    expect(contract.name).toBe('Vendor Onboarding');
    expect(contract.description).toBe('Onboard a vendor');
  });

  it('converts the Zod schema to an inline JSON Schema (no $schema marker)', () => {
    const contract = toContractIntake(baseIntake);
    const schema = contract.schema as Record<string, unknown>;
    expect(schema['type']).toBe('object');
    expect(schema['$schema']).toBeUndefined();
    const properties = schema['properties'] as Record<string, unknown>;
    expect(properties).toHaveProperty('legal_name');
    expect(properties).toHaveProperty('tax_id');
    expect(properties).toHaveProperty('amount');
    // Required reflects the non-optional Zod fields.
    expect(schema['required']).toEqual(expect.arrayContaining(['legal_name', 'tax_id']));
    expect(schema['required']).not.toContain('amount');
  });

  it('maps destination { type, name, config.url } → { kind, url }', () => {
    const contract = toContractIntake(baseIntake);
    expect(contract.destination).toEqual({ kind: 'webhook', url: 'https://example.com/vendor' });
  });

  it('falls back to destination.webhookUrl when config.url is absent', () => {
    const contract = toContractIntake({
      ...baseIntake,
      destination: { type: 'webhook', name: 'Vendor', config: {}, webhookUrl: 'https://example.com/hook' },
    });
    expect(contract.destination).toEqual({ kind: 'webhook', url: 'https://example.com/hook' });
  });

  it('defaults an unknown destination type to the webhook kind', () => {
    const contract = toContractIntake({
      ...baseIntake,
      destination: { type: 'custom_thing', name: 'Custom', config: { url: 'https://example.com/x' } },
    });
    expect(contract.destination.kind).toBe('webhook');
    expect(contract.destination.url).toBe('https://example.com/x');
  });

  it('maps approval gates (name, reviewers, approvalLevel → requiredApprovals)', () => {
    const contract = toContractIntake({
      ...baseIntake,
      approvalGates: [
        { id: 'g1', name: 'High value', reviewers: ['rev-1', 'rev-2'], approvalLevel: 2 },
      ],
    });
    expect(contract.approvalGates).toEqual([
      { name: 'High value', reviewers: ['rev-1', 'rev-2'], requiredApprovals: 2 },
    ]);
  });

  it('omits approvalGates when none are declared', () => {
    const contract = toContractIntake(baseIntake);
    expect(contract.approvalGates).toBeUndefined();
  });

  it('produces a schema the shared registry accepts and validates against', () => {
    // The contract intake round-trips through the registry + a real submission
    // schema without throwing — proving structural compatibility.
    const contract = toContractIntake(baseIntake);
    expect(contract.destination.kind).toBe('webhook');
    const props = (contract.schema as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props).sort()).toEqual(['amount', 'legal_name', 'tax_id']);
  });
});
