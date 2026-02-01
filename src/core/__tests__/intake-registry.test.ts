/**
 * Tests for IntakeRegistry
 *
 * Covers:
 * - Registration (with/without validation, duplicates, overwrite)
 * - Retrieval (getIntake, hasIntake, getSchema, list)
 * - Removal (unregisterIntake, clear)
 * - Validation: required fields, schema structure, destination, approval gates, UI hints
 * - SSRF protection for webhook URLs
 * - Error classes (IntakeNotFoundError, IntakeDuplicateError, IntakeValidationError)
 */

import { describe, it, expect } from 'vitest';
import {
  IntakeRegistry,
  IntakeNotFoundError,
  IntakeDuplicateError,
  IntakeValidationError,
} from '../intake-registry';
import type { IntakeDefinition } from '../../submission-types';

/** Minimal valid intake for tests */
function validIntake(overrides?: Partial<IntakeDefinition>): IntakeDefinition {
  return {
    id: 'test_intake',
    version: '1.0.0',
    name: 'Test Intake',
    schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
    },
    destination: {
      kind: 'webhook',
      url: 'https://example.com/webhook',
    },
    ...overrides,
  } as IntakeDefinition;
}

describe('IntakeRegistry', () => {
  describe('registration', () => {
    it('should register a valid intake', () => {
      const registry = new IntakeRegistry();
      registry.registerIntake(validIntake());
      expect(registry.count()).toBe(1);
    });

    it('should throw IntakeDuplicateError on duplicate registration', () => {
      const registry = new IntakeRegistry();
      registry.registerIntake(validIntake());
      expect(() => registry.registerIntake(validIntake())).toThrow(IntakeDuplicateError);
    });

    it('should allow overwrite when configured', () => {
      const registry = new IntakeRegistry({ allowOverwrite: true });
      registry.registerIntake(validIntake());
      registry.registerIntake(validIntake({ name: 'Updated' }));
      expect(registry.getIntake('test_intake').name).toBe('Updated');
    });

    it('should skip validation when validateOnRegister is false', () => {
      const registry = new IntakeRegistry({ validateOnRegister: false });
      // Missing schema — would normally fail validation
      const intake = { id: 'no-schema', version: '1.0', name: 'Test', destination: { kind: 'webhook' } };
      expect(() => registry.registerIntake(intake as unknown as IntakeDefinition)).not.toThrow();
    });
  });

  describe('retrieval', () => {
    it('should retrieve a registered intake', () => {
      const registry = new IntakeRegistry();
      const intake = validIntake();
      registry.registerIntake(intake);
      expect(registry.getIntake('test_intake')).toBe(intake);
    });

    it('should throw IntakeNotFoundError for unregistered intake', () => {
      const registry = new IntakeRegistry();
      expect(() => registry.getIntake('nonexistent')).toThrow(IntakeNotFoundError);
    });

    it('should check existence with hasIntake', () => {
      const registry = new IntakeRegistry();
      registry.registerIntake(validIntake());
      expect(registry.hasIntake('test_intake')).toBe(true);
      expect(registry.hasIntake('nonexistent')).toBe(false);
    });

    it('should return schema via getSchema', () => {
      const registry = new IntakeRegistry();
      registry.registerIntake(validIntake());
      const schema = registry.getSchema('test_intake');
      expect(schema).toHaveProperty('type', 'object');
    });

    it('should throw IntakeNotFoundError from getSchema for missing intake', () => {
      const registry = new IntakeRegistry();
      expect(() => registry.getSchema('missing')).toThrow(IntakeNotFoundError);
    });

    it('should list all intake IDs', () => {
      const registry = new IntakeRegistry();
      registry.registerIntake(validIntake({ id: 'a' }));
      registry.registerIntake(validIntake({ id: 'b' }));
      expect(registry.listIntakeIds()).toEqual(expect.arrayContaining(['a', 'b']));
    });

    it('should list all intake definitions', () => {
      const registry = new IntakeRegistry();
      registry.registerIntake(validIntake({ id: 'a' }));
      registry.registerIntake(validIntake({ id: 'b' }));
      const intakes = registry.listIntakes();
      expect(intakes).toHaveLength(2);
    });
  });

  describe('removal', () => {
    it('should unregister an existing intake', () => {
      const registry = new IntakeRegistry();
      registry.registerIntake(validIntake());
      expect(registry.unregisterIntake('test_intake')).toBe(true);
      expect(registry.count()).toBe(0);
    });

    it('should return false when unregistering non-existent intake', () => {
      const registry = new IntakeRegistry();
      expect(registry.unregisterIntake('missing')).toBe(false);
    });

    it('should clear all intakes', () => {
      const registry = new IntakeRegistry();
      registry.registerIntake(validIntake({ id: 'a' }));
      registry.registerIntake(validIntake({ id: 'b' }));
      registry.clear();
      expect(registry.count()).toBe(0);
    });
  });

  describe('validation — required fields', () => {
    it('should reject intake without id', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({ id: '' }))
      ).toThrow(IntakeValidationError);
    });

    it('should reject intake without version', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({ version: '' }))
      ).toThrow(IntakeValidationError);
    });

    it('should reject intake without name', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({ name: '' }))
      ).toThrow(IntakeValidationError);
    });

    it('should reject intake without schema', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({ schema: null as unknown }))
      ).toThrow(IntakeValidationError);
    });

    it('should reject intake without destination', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({ destination: null as unknown as IntakeDefinition['destination'] }))
      ).toThrow(IntakeValidationError);
    });
  });

  describe('validation — schema structure', () => {
    it('should accept schema with type', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({ schema: { type: 'object' } }))
      ).not.toThrow();
    });

    it('should accept schema with $ref', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({ schema: { $ref: '#/defs/user' } }))
      ).not.toThrow();
    });

    it('should accept schema with properties', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({ schema: { properties: { x: {} } } }))
      ).not.toThrow();
    });

    it('should reject schema without type, $ref, or properties', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({ schema: { title: 'no-type' } }))
      ).toThrow(IntakeValidationError);
    });

    it('should reject schema with non-object properties', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({ schema: { type: 'object', properties: 'bad' as unknown } }))
      ).toThrow(IntakeValidationError);
    });

    it('should reject schema with non-array required', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({ schema: { type: 'object', required: 'name' as unknown } }))
      ).toThrow(IntakeValidationError);
    });
  });

  describe('validation — destination', () => {
    it('should accept webhook destination with valid URL', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake())
      ).not.toThrow();
    });

    it('should accept callback destination without URL', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          destination: { kind: 'callback' } as IntakeDefinition['destination'],
        }))
      ).not.toThrow();
    });

    it('should accept queue destination', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          destination: { kind: 'queue' } as IntakeDefinition['destination'],
        }))
      ).not.toThrow();
    });

    it('should reject invalid destination kind', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          destination: { kind: 'email' } as unknown as IntakeDefinition['destination'],
        }))
      ).toThrow(IntakeValidationError);
    });

    it('should reject webhook destination without URL', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          destination: { kind: 'webhook' } as IntakeDefinition['destination'],
        }))
      ).toThrow(IntakeValidationError);
    });

    it('should reject webhook destination with invalid URL', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          destination: { kind: 'webhook', url: 'not-a-url' } as IntakeDefinition['destination'],
        }))
      ).toThrow(IntakeValidationError);
    });

    it('should reject private/internal webhook URLs (SSRF)', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          destination: { kind: 'webhook', url: 'http://127.0.0.1/hook' } as IntakeDefinition['destination'],
        }))
      ).toThrow(IntakeValidationError);
    });

    it('should validate retryPolicy maxAttempts', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          destination: {
            kind: 'webhook',
            url: 'https://example.com/hook',
            retryPolicy: { maxAttempts: -1, initialDelayMs: 100, backoffMultiplier: 2 },
          } as IntakeDefinition['destination'],
        }))
      ).toThrow(IntakeValidationError);
    });

    it('should validate retryPolicy initialDelayMs', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          destination: {
            kind: 'webhook',
            url: 'https://example.com/hook',
            retryPolicy: { maxAttempts: 3, initialDelayMs: -1, backoffMultiplier: 2 },
          } as IntakeDefinition['destination'],
        }))
      ).toThrow(IntakeValidationError);
    });

    it('should validate retryPolicy backoffMultiplier >= 1', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          destination: {
            kind: 'webhook',
            url: 'https://example.com/hook',
            retryPolicy: { maxAttempts: 3, initialDelayMs: 100, backoffMultiplier: 0.5 },
          } as IntakeDefinition['destination'],
        }))
      ).toThrow(IntakeValidationError);
    });

    it('should accept valid retryPolicy', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          destination: {
            kind: 'webhook',
            url: 'https://example.com/hook',
            retryPolicy: { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2 },
          } as IntakeDefinition['destination'],
        }))
      ).not.toThrow();
    });
  });

  describe('validation — approval gates', () => {
    it('should accept valid approval gates', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          approvalGates: [
            { name: 'manager', reviewers: { roles: ['manager'] } },
          ],
        } as unknown as Partial<IntakeDefinition>))
      ).not.toThrow();
    });

    it('should reject non-array approval gates', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          approvalGates: 'not-array' as unknown,
        } as unknown as Partial<IntakeDefinition>))
      ).toThrow(IntakeValidationError);
    });

    it('should reject gate without name', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          approvalGates: [{ reviewers: { roles: ['admin'] } }],
        } as unknown as Partial<IntakeDefinition>))
      ).toThrow(IntakeValidationError);
    });

    it('should reject gate without reviewers', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          approvalGates: [{ name: 'gate1' }],
        } as unknown as Partial<IntakeDefinition>))
      ).toThrow(IntakeValidationError);
    });

    it('should reject gate with invalid requiredApprovals', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          approvalGates: [
            { name: 'gate1', reviewers: { roles: ['admin'] }, requiredApprovals: 0 },
          ],
        } as unknown as Partial<IntakeDefinition>))
      ).toThrow(IntakeValidationError);
    });

    it('should accept gate with valid requiredApprovals', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          approvalGates: [
            { name: 'gate1', reviewers: { roles: ['admin'] }, requiredApprovals: 2 },
          ],
        } as unknown as Partial<IntakeDefinition>))
      ).not.toThrow();
    });
  });

  describe('validation — UI hints', () => {
    it('should accept valid uiHints with steps', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          uiHints: {
            steps: [{ id: 'step1', title: 'Step 1', fields: ['name'] }],
          },
        } as unknown as Partial<IntakeDefinition>))
      ).not.toThrow();
    });

    it('should reject non-array steps', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          uiHints: { steps: 'not-array' },
        } as unknown as Partial<IntakeDefinition>))
      ).toThrow(IntakeValidationError);
    });

    it('should reject step without id', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          uiHints: {
            steps: [{ title: 'Step', fields: [] }],
          },
        } as unknown as Partial<IntakeDefinition>))
      ).toThrow(IntakeValidationError);
    });

    it('should reject step without title', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          uiHints: {
            steps: [{ id: 's1', fields: [] }],
          },
        } as unknown as Partial<IntakeDefinition>))
      ).toThrow(IntakeValidationError);
    });

    it('should reject step without fields array', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          uiHints: {
            steps: [{ id: 's1', title: 'Step 1' }],
          },
        } as unknown as Partial<IntakeDefinition>))
      ).toThrow(IntakeValidationError);
    });

    it('should accept valid fieldHints', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          uiHints: {
            fieldHints: { name: { placeholder: 'Enter name' } },
          },
        } as unknown as Partial<IntakeDefinition>))
      ).not.toThrow();
    });

    it('should reject non-object fieldHints', () => {
      const registry = new IntakeRegistry();
      expect(() =>
        registry.registerIntake(validIntake({
          uiHints: { fieldHints: 'bad' },
        } as unknown as Partial<IntakeDefinition>))
      ).toThrow(IntakeValidationError);
    });
  });

  describe('error classes', () => {
    it('IntakeNotFoundError should have correct name and message', () => {
      const err = new IntakeNotFoundError('vendor');
      expect(err.name).toBe('IntakeNotFoundError');
      expect(err.message).toContain('vendor');
      expect(err).toBeInstanceOf(Error);
    });

    it('IntakeDuplicateError should have correct name and message', () => {
      const err = new IntakeDuplicateError('vendor');
      expect(err.name).toBe('IntakeDuplicateError');
      expect(err.message).toContain('vendor');
      expect(err.message).toContain('allowOverwrite');
    });

    it('IntakeValidationError should have correct name and message', () => {
      const err = new IntakeValidationError('vendor', 'missing schema');
      expect(err.name).toBe('IntakeValidationError');
      expect(err.message).toContain('vendor');
      expect(err.message).toContain('missing schema');
    });
  });
});
