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
        query: {},
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
        query: {},
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
        query: {},
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

    it('should filter events by type', async () => {
      // Create a submission with multiple events
      const createResponse = await manager.createSubmission({
        intakeId: 'intake_test',
        actor: agentActor,
        initialFields: {
          name: 'Test',
        },
      });

      const submissionId = createResponse.submissionId;

      // Add more events (field.updated)
      await manager.setFields({
        submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          email: 'test@example.com',
        },
      });

      // Mock request with type filter
      const req = {
        params: { id: submissionId },
        query: { type: 'field.updated' },
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

      expect(responseStatus).toBe(200);
      expect(responseData.events).toBeDefined();
      expect(Array.isArray(responseData.events)).toBe(true);

      // All events should be of type 'field.updated'
      responseData.events.forEach((event: IntakeEvent) => {
        expect(event.type).toBe('field.updated');
      });
    });

    it('should filter events by multiple types (comma-separated)', async () => {
      // Create a submission
      const createResponse = await manager.createSubmission({
        intakeId: 'intake_test',
        actor: agentActor,
        initialFields: {
          name: 'Test',
        },
      });

      const submissionId = createResponse.submissionId;

      // Add field update
      await manager.setFields({
        submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          email: 'test@example.com',
        },
      });

      // Mock request with multiple type filters
      const req = {
        params: { id: submissionId },
        query: { type: 'submission.created,field.updated' },
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

      expect(responseStatus).toBe(200);
      expect(responseData.events).toBeDefined();
      expect(Array.isArray(responseData.events)).toBe(true);
      expect(responseData.events.length).toBeGreaterThan(0);

      // All events should be either 'submission.created' or 'field.updated'
      responseData.events.forEach((event: IntakeEvent) => {
        expect(['submission.created', 'field.updated']).toContain(event.type);
      });
    });

    it('should filter events by actorKind', async () => {
      const humanActor: Actor = {
        kind: 'human',
        id: 'user-123',
        name: 'Human User',
      };

      // Create submission with agent actor
      const createResponse = await manager.createSubmission({
        intakeId: 'intake_test',
        actor: agentActor,
        initialFields: {
          name: 'Test',
        },
      });

      const submissionId = createResponse.submissionId;

      // Add field update with human actor
      await manager.setFields({
        submissionId,
        resumeToken: createResponse.resumeToken,
        actor: humanActor,
        fields: {
          email: 'test@example.com',
        },
      });

      // Filter by agent actor
      const req = {
        params: { id: submissionId },
        query: { actorKind: 'agent' },
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

      expect(responseStatus).toBe(200);
      expect(responseData.events).toBeDefined();

      // All events should have actor.kind === 'agent'
      responseData.events.forEach((event: IntakeEvent) => {
        expect(event.actor.kind).toBe('agent');
      });
    });

    it('should filter events by time range', async () => {
      // Create a submission
      const createResponse = await manager.createSubmission({
        intakeId: 'intake_test',
        actor: agentActor,
        initialFields: {
          name: 'Test',
        },
      });

      const submissionId = createResponse.submissionId;

      // Get the current timestamp
      const now = new Date().toISOString();

      // Add another event after recording timestamp
      await manager.setFields({
        submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          email: 'test@example.com',
        },
      });

      // Filter events after 'now'
      const req = {
        params: { id: submissionId },
        query: { since: now },
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

      expect(responseStatus).toBe(200);
      expect(responseData.events).toBeDefined();

      // All returned events should be after 'now'
      responseData.events.forEach((event: IntakeEvent) => {
        expect(new Date(event.ts).getTime()).toBeGreaterThanOrEqual(new Date(now).getTime());
      });
    });

    it('should combine multiple filters', async () => {
      // Create a submission
      const createResponse = await manager.createSubmission({
        intakeId: 'intake_test',
        actor: agentActor,
        initialFields: {
          name: 'Test',
        },
      });

      const submissionId = createResponse.submissionId;

      // Add multiple events
      await manager.setFields({
        submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          email: 'test@example.com',
        },
      });

      // Filter by type AND actorKind
      const req = {
        params: { id: submissionId },
        query: {
          type: 'field.updated',
          actorKind: 'agent',
        },
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

      expect(responseStatus).toBe(200);
      expect(responseData.events).toBeDefined();

      // All events should match both filters
      responseData.events.forEach((event: IntakeEvent) => {
        expect(event.type).toBe('field.updated');
        expect(event.actor.kind).toBe('agent');
      });
    });
  });
});
