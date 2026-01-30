/**
 * Events Route Test
 * Tests the GET /submissions/:id/events endpoint
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SubmissionManager } from '../src/core/submission-manager';
import type { IntakeEvent, Actor } from '../src/types/intake-contract';
import type { Submission } from '../src/types';
import { createEventRoutes } from '../src/routes/events';

// Mock in-memory store for testing
class InMemorySubmissionStore {
  private submissions = new Map<string, Submission>();
  private submissionsByToken = new Map<string, Submission>();

  async get(submissionId: string): Promise<Submission | null> {
    return this.submissions.get(submissionId) || null;
  }

  async save(submission: Submission): Promise<void> {
    this.submissions.set(submission.id, submission);
    this.submissionsByToken.set(submission.resumeToken, submission);
  }

  async getByResumeToken(resumeToken: string): Promise<Submission | null> {
    return this.submissionsByToken.get(resumeToken) || null;
  }
}

// Mock event emitter
class InMemoryEventEmitter {
  public events: IntakeEvent[] = [];

  async emit(event: IntakeEvent): Promise<void> {
    this.events.push(event);
  }
}

describe('Events Route', () => {
  let manager: SubmissionManager;
  let store: InMemorySubmissionStore;
  let eventEmitter: InMemoryEventEmitter;
  let routes: ReturnType<typeof createEventRoutes>;

  const agentActor: Actor = {
    kind: 'agent',
    id: 'agent-test-001',
    name: 'Test Agent',
  };

  beforeEach(() => {
    store = new InMemorySubmissionStore();
    eventEmitter = new InMemoryEventEmitter();
    manager = new SubmissionManager(store, eventEmitter, 'http://localhost:3000');
    routes = createEventRoutes(manager);
  });

  describe('GET /submissions/:id/events', () => {
    it('should return events for an existing submission', async () => {
      // Create a submission with events
      const createResponse = await manager.createSubmission({
        intakeId: 'intake_test',
        actor: agentActor,
        initialFields: {
          name: 'Test',
        },
      });

      const submissionId = createResponse.submissionId;

      // Add more events by setting fields
      await manager.setFields({
        submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          email: 'test@example.com',
        },
      });

      // Mock Express request/response
      const req = {
        params: { id: submissionId },
      } as any;

      let responseData: any;
      let responseStatus: number = 0;

      const res = {
        status(code: number) {
          responseStatus = code;
          return this;
        },
        json(data: any) {
          responseData = data;
          return this;
        },
      } as any;

      const next = () => {};

      // Call the route handler
      await routes.getEvents(req, res, next);

      // Verify response
      expect(responseStatus).toBe(200);
      expect(responseData).toBeDefined();
      expect(responseData.submissionId).toBe(submissionId);
      expect(responseData.events).toBeDefined();
      expect(Array.isArray(responseData.events)).toBe(true);
      expect(responseData.events.length).toBeGreaterThan(0);

      // Verify event structure
      const firstEvent = responseData.events[0];
      expect(firstEvent).toHaveProperty('eventId');
      expect(firstEvent).toHaveProperty('type');
      expect(firstEvent).toHaveProperty('submissionId');
      expect(firstEvent).toHaveProperty('ts');
      expect(firstEvent).toHaveProperty('actor');
      expect(firstEvent).toHaveProperty('state');
    });

    it('should return 404 for non-existent submission', async () => {
      const req = {
        params: { id: 'sub_nonexistent' },
      } as any;

      let responseData: any;
      let responseStatus: number = 0;

      const res = {
        status(code: number) {
          responseStatus = code;
          return this;
        },
        json(data: any) {
          responseData = data;
          return this;
        },
      } as any;

      const next = () => {};

      await routes.getEvents(req, res, next);

      expect(responseStatus).toBe(404);
      expect(responseData).toBeDefined();
      expect(responseData.error).toBe('Submission not found');
    });

    it('should return 400 if submission ID is missing', async () => {
      const req = {
        params: {},
      } as any;

      let responseData: any;
      let responseStatus: number = 0;

      const res = {
        status(code: number) {
          responseStatus = code;
          return this;
        },
        json(data: any) {
          responseData = data;
          return this;
        },
      } as any;

      const next = () => {};

      await routes.getEvents(req, res, next);

      expect(responseStatus).toBe(400);
      expect(responseData).toBeDefined();
      expect(responseData.error).toBe('Missing submission ID');
    });
  });
});
