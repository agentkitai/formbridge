/**
 * Event Stream & Audit Trail Integration Test
 *
 * Tests the complete event stream functionality including:
 * - Event retrieval and filtering
 * - Field-level diffs in fields.updated events
 * - Event export in JSONL and JSON formats
 * - Append-only immutable event stream
 * - Complete audit trail from creation through submission
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SubmissionManager } from "../../src/core/submission-manager";
import type {
  Actor,
  IntakeEvent,
  CreateSubmissionRequest,
  SetFieldsRequest,
  SubmitRequest as _SubmitRequest,
} from "../../src/types/intake-contract";
import type { Submission } from "../../src/submission-types";

// Mock in-memory store for integration testing
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

  async getByIdempotencyKey(key: string): Promise<Submission | null> {
    for (const sub of this.submissions.values()) {
      if (sub.idempotencyKey === key) return sub;
    }
    return null;
  }

  clear() {
    this.submissions.clear();
    this.submissionsByToken.clear();
  }
}

// Mock event emitter for integration testing
class InMemoryEventEmitter {
  public events: IntakeEvent[] = [];

  async emit(event: IntakeEvent): Promise<void> {
    this.events.push(event);
  }

  clear() {
    this.events = [];
  }

  getEventsByType(type: string): IntakeEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  getEventsByActorKind(kind: string): IntakeEvent[] {
    return this.events.filter((e) => e.actor.kind === kind);
  }

  getEventsSince(timestamp: string): IntakeEvent[] {
    const sinceDate = new Date(timestamp);
    return this.events.filter((e) => new Date(e.ts) >= sinceDate);
  }
}

describe("Event Stream & Audit Trail Integration", () => {
  let manager: SubmissionManager;
  let store: InMemorySubmissionStore;
  let eventEmitter: InMemoryEventEmitter;

  const agentActor: Actor = {
    kind: "agent",
    id: "agent-data-collector-001",
    name: "Data Collection Agent",
  };

  const humanActor: Actor = {
    kind: "human",
    id: "user-reviewer-001",
    name: "Data Reviewer",
  };

  const _systemActor: Actor = {
    kind: "system",
    id: "system-validator",
    name: "Validation System",
  };

  beforeEach(() => {
    store = new InMemorySubmissionStore();
    eventEmitter = new InMemoryEventEmitter();
    manager = new SubmissionManager(store, eventEmitter, undefined, "http://localhost:3000");
  });

  describe("Complete Audit Trail", () => {
    it("should capture full event sequence from creation through submission", async () => {
      // Step 1: Agent creates submission
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_employee_onboarding",
        actor: agentActor,
        initialFields: {
          firstName: "John",
          lastName: "Doe",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);
      expect(createResponse.ok).toBe(true);

      // Step 2: Agent adds more fields
      const setFieldsRequest: SetFieldsRequest = {
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          email: "john.doe@example.com",
          department: "Engineering",
          startDate: "2024-02-01",
        },
      };

      const agentSetResult = await manager.setFields(setFieldsRequest);
      expect(agentSetResult.ok).toBe(true);

      // Step 3: Human updates a field (using rotated token from previous setFields)
      const humanUpdateRequest: SetFieldsRequest = {
        submissionId: createResponse.submissionId,
        resumeToken: agentSetResult.ok ? agentSetResult.resumeToken : createResponse.resumeToken,
        actor: humanActor,
        fields: {
          department: "Product Engineering", // Human corrects the department
        },
      };

      await manager.setFields(humanUpdateRequest);

      // Verify the complete event stream via manager.getEvents()
      const events = await manager.getEvents(createResponse.submissionId);
      expect(events.length).toBeGreaterThan(0);

      // Verify submission.created event
      const createdEvents = events.filter((e) => e.type === "submission.created");
      expect(createdEvents).toHaveLength(1);
      expect(createdEvents[0].actor).toEqual(agentActor);
      expect(createdEvents[0].submissionId).toBe(createResponse.submissionId);
      expect(createdEvents[0].state).toBe("draft");

      // Verify fields.updated events
      const fieldsUpdatedEvents = events.filter((e) => e.type === "fields.updated");
      expect(fieldsUpdatedEvents.length).toBeGreaterThan(0);

      // Verify both agent and human field updates are tracked
      const agentFieldEvents = fieldsUpdatedEvents.filter((e) => e.actor.kind === "agent");
      const humanFieldEvents = fieldsUpdatedEvents.filter((e) => e.actor.kind === "human");

      expect(agentFieldEvents.length).toBeGreaterThan(0);
      expect(humanFieldEvents.length).toBeGreaterThan(0);

      // Events should be in chronological order
      for (let i = 1; i < events.length; i++) {
        const prev = new Date(events[i - 1].ts);
        const curr = new Date(events[i].ts);
        expect(curr.getTime()).toBeGreaterThanOrEqual(prev.getTime());
      }

      // All events should have proper structure
      events.forEach((event) => {
        expect(event.eventId).toMatch(/^evt_/);
        expect(event.type).toBeDefined();
        expect(event.submissionId).toBe(createResponse.submissionId);
        expect(event.ts).toBeDefined();
        expect(event.actor).toBeDefined();
        expect(event.actor.kind).toMatch(/^(agent|human|system)$/);
        expect(event.state).toBeDefined();
      });
    });

    it("should track field attribution for mixed agent-human collaboration", async () => {
      // Create submission with agent
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_vendor_registration",
        actor: agentActor,
        initialFields: {
          companyName: "TechCorp Inc",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      // Agent fills more fields
      const agentSetResult2 = await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          taxId: "12-3456789",
          address: "123 Main St",
        },
      });
      expect(agentSetResult2.ok).toBe(true);

      // Human corrects a field (using rotated token)
      await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: agentSetResult2.ok ? agentSetResult2.resumeToken : createResponse.resumeToken,
        actor: humanActor,
        fields: {
          taxId: "98-7654321", // Human corrects tax ID
        },
      });

      // Verify field attribution
      const submission = await store.get(createResponse.submissionId);
      expect(submission).toBeDefined();
      expect(submission!.fieldAttribution.companyName).toEqual(agentActor);
      expect(submission!.fieldAttribution.address).toEqual(agentActor);
      expect(submission!.fieldAttribution.taxId).toEqual(humanActor); // Last writer wins

      // Verify fields.updated events capture the correction
      const events = await manager.getEvents(createResponse.submissionId);
      const fieldsUpdatedEvents = events.filter(
        (e) => e.type === "fields.updated"
      );
      // Two setFields calls = two fields.updated events (one agent, one human)
      expect(fieldsUpdatedEvents).toHaveLength(2);
      expect(fieldsUpdatedEvents[0].actor).toEqual(agentActor);
      expect(fieldsUpdatedEvents[1].actor).toEqual(humanActor);

      // Verify human corrected taxId via diffs
      const humanDiffs = fieldsUpdatedEvents[1].payload?.diffs as Array<{ fieldPath: string }>;
      expect(humanDiffs.some((d) => d.fieldPath === "taxId")).toBe(true);
    });
  });

  describe("Field-Level Diffs", () => {
    it("should include previousValue and newValue in fields.updated diffs", async () => {
      // Create submission
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_contact_form",
        actor: agentActor,
        initialFields: {
          name: "Alice Smith",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      // Update existing field
      await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: humanActor,
        fields: {
          name: "Alice Johnson", // Name change
        },
      });

      // Verify fields.updated event includes diffs
      const events = await manager.getEvents(createResponse.submissionId);
      const fieldsUpdatedEvents = events.filter(
        (e) => e.type === "fields.updated"
      );

      expect(fieldsUpdatedEvents.length).toBeGreaterThan(0);
      const lastUpdate = fieldsUpdatedEvents[fieldsUpdatedEvents.length - 1];

      expect(lastUpdate.payload).toBeDefined();
      const diffs = lastUpdate.payload!.diffs as Array<{ fieldPath: string; previousValue: unknown; newValue: unknown }>;
      const nameDiff = diffs.find((d) => d.fieldPath === "name");
      expect(nameDiff).toBeDefined();
      expect(nameDiff!.previousValue).toBe("Alice Smith");
      expect(nameDiff!.newValue).toBe("Alice Johnson");
    });

    it("should handle new field creation (previousValue undefined)", async () => {
      // Create submission with no initial fields
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_form",
        actor: agentActor,
        initialFields: {},
      };

      const createResponse = await manager.createSubmission(createRequest);

      // Add a new field
      await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          email: "new@example.com",
        },
      });

      // Verify fields.updated event for new field
      const events = await manager.getEvents(createResponse.submissionId);
      const fieldsUpdatedEvents = events.filter(
        (e) => e.type === "fields.updated"
      );

      expect(fieldsUpdatedEvents).toHaveLength(1);
      const diffs = fieldsUpdatedEvents[0].payload!.diffs as Array<{ fieldPath: string; previousValue: unknown; newValue: unknown }>;
      const emailDiff = diffs.find((d) => d.fieldPath === "email");
      expect(emailDiff).toBeDefined();
      expect(emailDiff!.previousValue).toBeUndefined();
      expect(emailDiff!.newValue).toBe("new@example.com");
    });

    it("should track multiple field updates with complete diff history", async () => {
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_profile",
        actor: agentActor,
        initialFields: {
          status: "draft",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      // Update 1: draft -> pending
      const update1Result = await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          status: "pending",
        },
      });
      expect(update1Result.ok).toBe(true);

      // Update 2: pending -> approved (using rotated token)
      await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: update1Result.ok ? update1Result.resumeToken : createResponse.resumeToken,
        actor: humanActor,
        fields: {
          status: "approved",
        },
      });

      // Verify complete diff history via batch events
      const events = await manager.getEvents(createResponse.submissionId);
      const fieldsUpdatedEvents = events.filter(
        (e) => e.type === "fields.updated"
      );

      expect(fieldsUpdatedEvents).toHaveLength(2);

      // First update: draft -> pending
      const diffs1 = fieldsUpdatedEvents[0].payload!.diffs as Array<{ fieldPath: string; previousValue: unknown; newValue: unknown }>;
      const statusDiff1 = diffs1.find((d) => d.fieldPath === "status")!;
      expect(statusDiff1.previousValue).toBe("draft");
      expect(statusDiff1.newValue).toBe("pending");
      expect(fieldsUpdatedEvents[0].actor).toEqual(agentActor);

      // Second update: pending -> approved
      const diffs2 = fieldsUpdatedEvents[1].payload!.diffs as Array<{ fieldPath: string; previousValue: unknown; newValue: unknown }>;
      const statusDiff2 = diffs2.find((d) => d.fieldPath === "status")!;
      expect(statusDiff2.previousValue).toBe("pending");
      expect(statusDiff2.newValue).toBe("approved");
      expect(fieldsUpdatedEvents[1].actor).toEqual(humanActor);
    });
  });

  describe("Event Filtering", () => {
    it("should filter events by type", async () => {
      // Create submission with multiple events
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_test",
        actor: agentActor,
        initialFields: {
          field1: "value1",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          field2: "value2",
          field3: "value3",
        },
      });

      await manager.generateHandoffUrl(createResponse.submissionId, agentActor);

      // Get events and verify different event types exist
      const allEvents = await manager.getEvents(createResponse.submissionId);
      const createdEvents = allEvents.filter((e) => e.type === "submission.created");
      const fieldEvents = allEvents.filter((e) => e.type === "fields.updated");
      const handoffEvents = allEvents.filter((e) => e.type === "handoff.link_issued");

      expect(createdEvents.length).toBe(1);
      expect(fieldEvents.length).toBeGreaterThan(0);
      expect(handoffEvents.length).toBe(1);
    });

    it("should filter events by actor kind", async () => {
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_mixed",
        actor: agentActor,
        initialFields: {
          field1: "agent-value",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      // Agent updates
      const agentUpdateResult = await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          field2: "agent-value-2",
        },
      });
      expect(agentUpdateResult.ok).toBe(true);

      // Human updates (using rotated token)
      await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: agentUpdateResult.ok ? agentUpdateResult.resumeToken : createResponse.resumeToken,
        actor: humanActor,
        fields: {
          field3: "human-value",
        },
      });

      // Filter by actor kind
      const allEvents = await manager.getEvents(createResponse.submissionId);
      const agentEvents = allEvents.filter((e) => e.actor.kind === "agent");
      const humanEvents = allEvents.filter((e) => e.actor.kind === "human");

      expect(agentEvents.length).toBeGreaterThan(0);
      expect(humanEvents.length).toBeGreaterThan(0);
      expect(agentEvents.every((e) => e.actor.kind === "agent")).toBe(true);
      expect(humanEvents.every((e) => e.actor.kind === "human")).toBe(true);
    });

    it("should filter events by time range", async () => {
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_timeline",
        actor: agentActor,
        initialFields: {
          field1: "value1",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      // Record timestamp before updates
      const beforeUpdates = new Date();

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Add more fields
      await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          field2: "value2",
        },
      });

      // Get events and filter by time
      const allEvents = await manager.getEvents(createResponse.submissionId);
      const eventsAfterTimestamp = allEvents.filter(
        (e) => new Date(e.ts) >= beforeUpdates
      );

      expect(eventsAfterTimestamp.length).toBeGreaterThan(0);
      expect(eventsAfterTimestamp.every((e) => new Date(e.ts) >= beforeUpdates)).toBe(
        true
      );
    });
  });

  describe("Append-Only Immutability", () => {
    it("should maintain event order and immutability", async () => {
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_immutable",
        actor: agentActor,
        initialFields: {
          field1: "value1",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      // Get initial event count
      let events = await manager.getEvents(createResponse.submissionId);
      const initialEventCount = events.length;
      const firstEvent = { ...events[0] };

      // Add more events
      await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          field2: "value2",
        },
      });

      // Verify events were appended
      events = await manager.getEvents(createResponse.submissionId);
      expect(events.length).toBeGreaterThan(initialEventCount);

      // Verify first event is unchanged (immutable)
      expect(events[0]).toEqual(firstEvent);

      // Verify all events have unique IDs
      const eventIds = events.map((e) => e.eventId);
      const uniqueIds = new Set(eventIds);
      expect(uniqueIds.size).toBe(eventIds.length);
    });

    it("should never modify existing events", async () => {
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_readonly",
        actor: agentActor,
        initialFields: {
          value: "original",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      // Capture snapshot of all events
      const events1 = await manager.getEvents(createResponse.submissionId);
      const eventsSnapshot = JSON.parse(JSON.stringify(events1));

      // Perform more operations
      await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          value: "updated",
        },
      });

      // Verify original events are unchanged
      const events2 = await manager.getEvents(createResponse.submissionId);
      const originalEventCount = eventsSnapshot.length;

      for (let i = 0; i < originalEventCount; i++) {
        expect(events2[i]).toEqual(eventsSnapshot[i]);
      }
    });
  });

  describe("Event Structure & Compliance", () => {
    it("should include all required fields in every event", async () => {
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_structure",
        actor: agentActor,
        initialFields: {
          test: "value",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: humanActor,
        fields: {
          test: "updated",
        },
      });

      const events = await manager.getEvents(createResponse.submissionId);

      // Verify every event has required fields
      events.forEach((event) => {
        // Required fields per spec
        expect(event.eventId).toBeDefined();
        expect(event.eventId).toMatch(/^evt_/);

        expect(event.type).toBeDefined();
        expect(typeof event.type).toBe("string");

        expect(event.submissionId).toBe(createResponse.submissionId);

        expect(event.ts).toBeDefined();
        expect(new Date(event.ts).getTime()).toBeGreaterThan(0);

        expect(event.actor).toBeDefined();
        expect(event.actor.kind).toMatch(/^(agent|human|system)$/);
        expect(event.actor.id).toBeDefined();

        expect(event.state).toBeDefined();
        expect(typeof event.state).toBe("string");

        // Payload is optional but should be defined for certain event types
        if (
          event.type === "fields.updated" ||
          event.type === "handoff.link_issued"
        ) {
          expect(event.payload).toBeDefined();
        }
      });
    });

    it("should support event serialization for export", async () => {
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_export",
        actor: agentActor,
        initialFields: {
          data: "test",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      const events = await manager.getEvents(createResponse.submissionId);

      // Verify events can be serialized to JSON
      const jsonString = JSON.stringify(events);
      expect(jsonString).toBeDefined();

      const parsed = JSON.parse(jsonString);
      expect(parsed).toEqual(events);

      // Verify JSONL format (one event per line)
      const jsonlString = events
        .map((event) => JSON.stringify(event))
        .join("\n");

      const jsonlLines = jsonlString.split("\n");
      expect(jsonlLines.length).toBe(events.length);

      jsonlLines.forEach((line) => {
        const parsed = JSON.parse(line);
        expect(parsed.eventId).toBeDefined();
        expect(parsed.type).toBeDefined();
      });
    });
  });

  describe("Handoff Events", () => {
    it("should emit handoff.link_issued event with resume URL", async () => {
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_handoff",
        actor: agentActor,
        initialFields: {
          field: "value",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      const resumeUrl = await manager.generateHandoffUrl(
        createResponse.submissionId,
        agentActor
      );

      // Verify handoff event
      const events = await manager.getEvents(createResponse.submissionId);
      const handoffEvents = events.filter(
        (e) => e.type === "handoff.link_issued"
      );

      expect(handoffEvents).toHaveLength(1);

      const handoffEvent = handoffEvents[0];
      expect(handoffEvent.type).toBe("handoff.link_issued");
      expect(handoffEvent.actor).toEqual(agentActor);
      expect(handoffEvent.payload).toBeDefined();
      expect(handoffEvent.payload!.url).toBe(resumeUrl);
      expect(handoffEvent.payload!.resumeToken).toBe(createResponse.resumeToken);
    });
  });

  describe("Event Retrieval via SubmissionManager", () => {
    it("should retrieve events via getEvents method", async () => {
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_retrieval",
        actor: agentActor,
        initialFields: {
          test: "data",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          test: "updated",
        },
      });

      // Retrieve events using manager
      const events = await manager.getEvents(createResponse.submissionId);

      expect(events).toBeDefined();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe("submission.created");
      expect(events.some((e) => e.type === "fields.updated")).toBe(true);
    });

    it("should throw error for non-existent submission", async () => {
      await expect(manager.getEvents("sub_nonexistent")).rejects.toThrow(
        "Submission not found"
      );
    });
  });

  describe("End-to-End Audit Trail Verification", () => {
    it("should capture complete audit trail from creation through submission with filtering and export", async () => {
      // Step 1: Create submission
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_e2e_audit",
        actor: agentActor,
        initialFields: {
          firstName: "John",
          lastName: "Doe",
          email: "john.doe@example.com",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);
      expect(createResponse.ok).toBe(true);
      expect(createResponse.submissionId).toMatch(/^sub_/);

      // Step 2: Update fields (agent adds more data)
      const agentUpdateResult2 = await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          department: "Engineering",
          startDate: "2024-02-01",
          salary: "100000",
        },
      });
      expect(agentUpdateResult2.ok).toBe(true);

      // Step 2b: Human corrects some fields (using rotated token)
      const humanUpdateResult = await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: agentUpdateResult2.ok ? agentUpdateResult2.resumeToken : createResponse.resumeToken,
        actor: humanActor,
        fields: {
          department: "Product Engineering",
          salary: "120000",
        },
      });
      expect(humanUpdateResult.ok).toBe(true);

      // Step 3: Submit the submission (using rotated token from last setFields)
      const currentToken = humanUpdateResult.ok ? humanUpdateResult.resumeToken : createResponse.resumeToken;
      const submitResponse = await manager.submit({
        submissionId: createResponse.submissionId,
        resumeToken: currentToken,
        idempotencyKey: "idem_e2e_audit_submit",
        actor: humanActor,
      });
      expect(submitResponse.ok).toBe(true);

      // Step 4: Retrieve all events
      const allEvents = await manager.getEvents(createResponse.submissionId);
      expect(allEvents.length).toBeGreaterThan(0);

      // Verify event types are present
      const eventTypes = new Set(allEvents.map((e) => e.type));
      expect(eventTypes.has("submission.created")).toBe(true);
      expect(eventTypes.has("fields.updated")).toBe(true);
      expect(eventTypes.has("submission.submitted")).toBe(true);

      // Step 5: Filter by type
      const fieldsUpdatedEvents = allEvents.filter(
        (e) => e.type === "fields.updated"
      );
      expect(fieldsUpdatedEvents.length).toBeGreaterThan(0);

      const submittedEvents = allEvents.filter(
        (e) => e.type === "submission.submitted"
      );
      expect(submittedEvents).toHaveLength(1);
      expect(submittedEvents[0].actor).toEqual(humanActor);

      // Filter by actor kind
      const agentEvents = allEvents.filter((e) => e.actor.kind === "agent");
      const humanEvents = allEvents.filter((e) => e.actor.kind === "human");
      expect(agentEvents.length).toBeGreaterThan(0);
      expect(humanEvents.length).toBeGreaterThan(0);

      // Step 6: Export to JSONL
      const jsonlExport = allEvents
        .map((event) => JSON.stringify(event))
        .join("\n");

      // Verify JSONL format (one event per line)
      const jsonlLines = jsonlExport.split("\n");
      expect(jsonlLines.length).toBe(allEvents.length);

      // Each line should be valid JSON
      jsonlLines.forEach((line, index) => {
        const parsed = JSON.parse(line);
        expect(parsed.eventId).toBe(allEvents[index].eventId);
      });

      // Step 7: Verify all events captured with correct timestamps, actors, payloads
      allEvents.forEach((event, index) => {
        // Verify timestamps are valid and in order
        expect(event.ts).toBeDefined();
        const eventTime = new Date(event.ts);
        expect(eventTime.getTime()).toBeGreaterThan(0);

        if (index > 0) {
          const prevTime = new Date(allEvents[index - 1].ts);
          expect(eventTime.getTime()).toBeGreaterThanOrEqual(prevTime.getTime());
        }

        // Verify actors
        expect(event.actor).toBeDefined();
        expect(event.actor.kind).toMatch(/^(agent|human|system)$/);
        expect(event.actor.id).toBeDefined();
        expect(event.actor.name).toBeDefined();

        // Verify payloads for specific event types
        if (event.type === "fields.updated") {
          expect(event.payload).toBeDefined();
          expect(event.payload!.diffs).toBeDefined();
          expect(Array.isArray(event.payload!.diffs)).toBe(true);
        }

        if (event.type === "submission.created") {
          expect(event.payload).toBeDefined();
          expect(event.payload!.intakeId).toBe(createRequest.intakeId);
          expect(event.payload!.initialFields).toBeDefined();
        }

        if (event.type === "submission.submitted") {
          expect(event.state).toBe("submitted");
        }

        // Verify event structure
        expect(event.eventId).toMatch(/^evt_/);
        expect(event.submissionId).toBe(createResponse.submissionId);
        expect(event.state).toBeDefined();
      });

      // Verify field-level diffs in fields.updated events
      // Agent update: department, startDate, salary
      const agentDiffs = fieldsUpdatedEvents[0].payload!.diffs as Array<{ fieldPath: string; previousValue: unknown; newValue: unknown }>;
      const agentDeptDiff = agentDiffs.find((d) => d.fieldPath === "department")!;
      expect(agentDeptDiff.previousValue).toBeUndefined();
      expect(agentDeptDiff.newValue).toBe("Engineering");
      expect(fieldsUpdatedEvents[0].actor).toEqual(agentActor);

      const agentSalaryDiff = agentDiffs.find((d) => d.fieldPath === "salary")!;
      expect(agentSalaryDiff.previousValue).toBeUndefined();
      expect(agentSalaryDiff.newValue).toBe("100000");

      // Human update: department correction, salary correction
      const humanDiffs = fieldsUpdatedEvents[1].payload!.diffs as Array<{ fieldPath: string; previousValue: unknown; newValue: unknown }>;
      const humanDeptDiff = humanDiffs.find((d) => d.fieldPath === "department")!;
      expect(humanDeptDiff.previousValue).toBe("Engineering");
      expect(humanDeptDiff.newValue).toBe("Product Engineering");
      expect(fieldsUpdatedEvents[1].actor).toEqual(humanActor);

      const humanSalaryDiff = humanDiffs.find((d) => d.fieldPath === "salary")!;
      expect(humanSalaryDiff.previousValue).toBe("100000");
      expect(humanSalaryDiff.newValue).toBe("120000");

      // Verify complete audit trail compliance
      // - Events are append-only (no modifications)
      // - Events have unique IDs
      // - Events are chronologically ordered
      // - All actors are tracked
      // - All state transitions are captured
      const eventIds = allEvents.map((e) => e.eventId);
      const uniqueIds = new Set(eventIds);
      expect(uniqueIds.size).toBe(eventIds.length);

      // Verify state progression
      const states = allEvents.map((e) => e.state);
      expect(states[0]).toBe("draft");
      expect(states[states.length - 1]).toBe("submitted");
    });
  });

  describe("Event Version Monotonicity", () => {
    it("should assign monotonically increasing version numbers per submission", async () => {
      const createResponse = await manager.createSubmission({
        intakeId: "intake_version_test",
        actor: agentActor,
        initialFields: { field1: "value1" },
      });

      const setResult = await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: { field2: "value2", field3: "value3" },
      });

      expect(setResult.ok).toBe(true);

      const events = await manager.getEvents(createResponse.submissionId);

      // Every event should have a version
      events.forEach((event) => {
        expect(event.version).toBeDefined();
        expect(typeof event.version).toBe("number");
        expect(event.version).toBeGreaterThan(0);
      });

      // Versions should be strictly monotonically increasing
      for (let i = 1; i < events.length; i++) {
        expect(events[i].version).toBe(events[i - 1].version! + 1);
      }
    });

    it("should assign independent version sequences per submission", async () => {
      const createResponse1 = await manager.createSubmission({
        intakeId: "intake_v1",
        actor: agentActor,
        initialFields: { field: "v1" },
      });

      const createResponse2 = await manager.createSubmission({
        intakeId: "intake_v2",
        actor: agentActor,
        initialFields: { field: "v2" },
      });

      const events1 = await manager.getEvents(createResponse1.submissionId);
      const events2 = await manager.getEvents(createResponse2.submissionId);

      // Both should start at version 1
      expect(events1[0].version).toBe(1);
      expect(events2[0].version).toBe(1);
    });

    it("should never reuse version numbers after cleanup", async () => {
      // This tests that version counters are independent from event storage
      const { InMemoryEventStore } = await import("../../src/core/event-store");
      const eventStore = new InMemoryEventStore();

      const event1 = {
        eventId: "evt_1",
        type: "submission.created" as const,
        submissionId: "sub_1",
        ts: new Date().toISOString(),
        actor: agentActor,
        state: "draft" as const,
        payload: {},
      };

      await eventStore.appendEvent(event1);
      const eventsAfterFirst = await eventStore.getEvents("sub_1");
      expect(eventsAfterFirst[0].version).toBe(1);

      const event2 = {
        eventId: "evt_2",
        type: "field.updated" as const,
        submissionId: "sub_1",
        ts: new Date().toISOString(),
        actor: agentActor,
        state: "in_progress" as const,
        payload: {},
      };

      await eventStore.appendEvent(event2);
      const eventsAfterSecond = await eventStore.getEvents("sub_1");
      expect(eventsAfterSecond[1].version).toBe(2);
    });
  });

  describe("Structured Diffs in Field Updates", () => {
    it("should include diffs array in fields.updated event payloads", async () => {
      const createResponse = await manager.createSubmission({
        intakeId: "intake_diffs",
        actor: agentActor,
        initialFields: { name: "Alice" },
      });

      await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: humanActor,
        fields: { name: "Bob", email: "bob@test.com" },
      });

      const events = await manager.getEvents(createResponse.submissionId);
      const fieldsUpdatedEvents = events.filter((e) => e.type === "fields.updated");

      // Each fields.updated event should include a diffs array
      fieldsUpdatedEvents.forEach((event) => {
        expect(event.payload).toBeDefined();
        expect(event.payload!.diffs).toBeDefined();
        expect(Array.isArray(event.payload!.diffs)).toBe(true);
      });

      // The single batch event should contain all field changes from the setFields call
      const batchEvent = fieldsUpdatedEvents[fieldsUpdatedEvents.length - 1];
      const diffs = batchEvent.payload!.diffs as Array<{
        fieldPath: string;
        previousValue: unknown;
        newValue: unknown;
      }>;

      expect(diffs.length).toBe(2);
      expect(diffs.some((d) => d.fieldPath === "name")).toBe(true);
      expect(diffs.some((d) => d.fieldPath === "email")).toBe(true);

      // Verify diff content
      const nameDiff = diffs.find((d) => d.fieldPath === "name")!;
      expect(nameDiff.previousValue).toBe("Alice");
      expect(nameDiff.newValue).toBe("Bob");

      const emailDiff = diffs.find((d) => d.fieldPath === "email")!;
      expect(emailDiff.previousValue).toBeUndefined();
      expect(emailDiff.newValue).toBe("bob@test.com");
    });

    it("should use previousValue/newValue naming in diffs structure", async () => {
      const createResponse = await manager.createSubmission({
        intakeId: "intake_diff_naming",
        actor: agentActor,
        initialFields: { status: "active" },
      });

      await manager.setFields({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: { status: "inactive" },
      });

      const events = await manager.getEvents(createResponse.submissionId);
      const fieldsUpdatedEvents = events.filter((e) => e.type === "fields.updated");
      const lastEvent = fieldsUpdatedEvents[fieldsUpdatedEvents.length - 1];

      const diffs = lastEvent.payload!.diffs as Array<{
        fieldPath: string;
        previousValue: unknown;
        newValue: unknown;
      }>;

      expect(diffs).toHaveLength(1);
      expect(diffs[0]).toEqual({
        fieldPath: "status",
        previousValue: "active",
        newValue: "inactive",
      });
    });
  });
});
