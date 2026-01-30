/**
 * Validator Test with Event Emission
 * Tests that validation.passed events are emitted correctly
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { Validator } from '../../src/validation/validator';
import type { IntakeEvent, Actor, SubmissionState } from '../../src/types/intake-contract';

// Mock event emitter
class InMemoryEventEmitter {
  public events: IntakeEvent[] = [];

  async emit(event: IntakeEvent): Promise<void> {
    this.events.push(event);
  }
}

describe('Validator with Event Emission', () => {
  let validator: Validator;
  let eventEmitter: InMemoryEventEmitter;

  const agentActor: Actor = {
    kind: 'agent',
    id: 'agent-test-001',
    name: 'Test Agent',
  };

  const submissionId = 'sub_test_123';
  const state: SubmissionState = 'in_progress';

  beforeEach(() => {
    eventEmitter = new InMemoryEventEmitter();
    validator = new Validator(eventEmitter);
  });

  describe('validateSubmission', () => {
    it('should emit validation.passed event on successful validation', async () => {
      const schema = z.object({
        name: z.string().min(1),
        email: z.string().email(),
        age: z.number().min(18),
      });

      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        age: 25,
      };

      const result = await validator.validateSubmission(
        schema,
        data,
        submissionId,
        agentActor,
        state
      );

      // Verify validation succeeded
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(data);
      }

      // Verify event was emitted
      expect(eventEmitter.events).toHaveLength(1);

      const event = eventEmitter.events[0];
      expect(event.type).toBe('validation.passed');
      expect(event.submissionId).toBe(submissionId);
      expect(event.actor).toEqual(agentActor);
      expect(event.state).toBe(state);
      expect(event.eventId).toMatch(/^evt_/);
      expect(event.ts).toBeDefined();
      expect(event.payload).toEqual({ data });
    });

    it('should not emit event on validation failure', async () => {
      const schema = z.object({
        email: z.string().email(),
      });

      const invalidData = {
        email: 'not-an-email',
      };

      const result = await validator.validateSubmission(
        schema,
        invalidData,
        submissionId,
        agentActor,
        state
      );

      // Verify validation failed
      expect(result.success).toBe(false);

      // Verify no event was emitted
      expect(eventEmitter.events).toHaveLength(0);
    });
  });

  describe('validateSubmissionOrThrow', () => {
    it('should emit validation.passed event on successful validation', async () => {
      const schema = z.object({
        name: z.string(),
      });

      const data = { name: 'Test' };

      const result = await validator.validateSubmissionOrThrow(
        schema,
        data,
        submissionId,
        agentActor,
        state
      );

      // Verify data returned
      expect(result).toEqual(data);

      // Verify event was emitted
      expect(eventEmitter.events).toHaveLength(1);
      const event = eventEmitter.events[0];
      expect(event.type).toBe('validation.passed');
      expect(event.payload).toEqual({ data });
    });

    it('should throw and not emit event on validation failure', async () => {
      const schema = z.object({
        age: z.number().min(18),
      });

      const invalidData = { age: 10 };

      await expect(
        validator.validateSubmissionOrThrow(
          schema,
          invalidData,
          submissionId,
          agentActor,
          state
        )
      ).rejects.toThrow();

      // Verify no event was emitted
      expect(eventEmitter.events).toHaveLength(0);
    });
  });

  describe('validatePartialSubmission', () => {
    it('should emit validation.passed event on successful partial validation', async () => {
      const schema = z.object({
        name: z.string(),
        email: z.string().email(),
        age: z.number(),
      });

      const partialData = { name: 'John' };

      const result = await validator.validatePartialSubmission(
        schema,
        partialData,
        submissionId,
        agentActor,
        state
      );

      // Verify validation succeeded
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(partialData);
      }

      // Verify event was emitted
      expect(eventEmitter.events).toHaveLength(1);
      const event = eventEmitter.events[0];
      expect(event.type).toBe('validation.passed');
      expect(event.payload).toEqual({ data: partialData });
    });

    it('should not emit event on partial validation failure', async () => {
      const schema = z.object({
        email: z.string().email(),
      });

      const invalidData = { email: 'not-an-email' };

      const result = await validator.validatePartialSubmission(
        schema,
        invalidData,
        submissionId,
        agentActor,
        state
      );

      // Verify validation failed
      expect(result.success).toBe(false);

      // Verify no event was emitted
      expect(eventEmitter.events).toHaveLength(0);
    });
  });
});
