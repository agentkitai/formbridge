/**
 * SubmissionManager tests - verify field-level actor attribution
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SubmissionManager } from "../submission-manager";
import type {
  Actor,
  IntakeEvent,
  CreateSubmissionRequest,
  SetFieldsRequest,
} from "../../types/intake-contract";
import type { Submission } from "../../types";

// Mock in-memory store
class MockSubmissionStore {
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

  clear() {
    this.submissions.clear();
    this.submissionsByToken.clear();
  }
}

// Mock event emitter
class MockEventEmitter {
  public events: IntakeEvent[] = [];

  async emit(event: IntakeEvent): Promise<void> {
    this.events.push(event);
  }

  clear() {
    this.events = [];
  }
}

describe("SubmissionManager", () => {
  let manager: SubmissionManager;
  let store: MockSubmissionStore;
  let eventEmitter: MockEventEmitter;

  const agentActor: Actor = {
    kind: "agent",
    id: "agent-001",
    name: "Onboarding Agent",
  };

  const humanActor: Actor = {
    kind: "human",
    id: "user-123",
    name: "John Doe",
  };

  beforeEach(() => {
    store = new MockSubmissionStore();
    eventEmitter = new MockEventEmitter();
    manager = new SubmissionManager(store, eventEmitter);
  });

  describe("createSubmission", () => {
    it("should create a submission with initial fields and attribution", async () => {
      const request: CreateSubmissionRequest = {
        intakeId: "intake_vendor_onboarding",
        actor: agentActor,
        initialFields: {
          companyName: "Acme Corp",
          taxId: "12-3456789",
        },
      };

      const response = await manager.createSubmission(request);

      expect(response.ok).toBe(true);
      expect(response.submissionId).toMatch(/^sub_/);
      expect(response.resumeToken).toMatch(/^rtok_/);
      expect(response.state).toBe("draft");

      // Verify submission was saved with field attribution
      const submission = await store.get(response.submissionId);
      expect(submission).toBeDefined();
      expect(submission!.fields.companyName).toBe("Acme Corp");
      expect(submission!.fields.taxId).toBe("12-3456789");

      // Verify actor attribution was recorded
      expect(submission!.fieldAttribution.companyName).toEqual(agentActor);
      expect(submission!.fieldAttribution.taxId).toEqual(agentActor);

      // Verify created event was emitted
      expect(eventEmitter.events).toHaveLength(1);
      expect(eventEmitter.events[0].type).toBe("submission.created");
      expect(eventEmitter.events[0].actor).toEqual(agentActor);
    });

    it("should create a submission without initial fields", async () => {
      const request: CreateSubmissionRequest = {
        intakeId: "intake_vendor_onboarding",
        actor: humanActor,
      };

      const response = await manager.createSubmission(request);

      expect(response.ok).toBe(true);

      const submission = await store.get(response.submissionId);
      expect(submission!.fields).toEqual({});
      expect(submission!.fieldAttribution).toEqual({});
    });
  });

  describe("setFields", () => {
    it("should set fields and record actor attribution", async () => {
      // Create submission as agent
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_vendor_onboarding",
        actor: agentActor,
        initialFields: {
          companyName: "Acme Corp",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);
      eventEmitter.clear();

      // Set additional fields as human
      const setFieldsRequest: SetFieldsRequest = {
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: humanActor,
        fields: {
          contactEmail: "contact@acme.com",
          phoneNumber: "+1-555-0100",
        },
      };

      const response = await manager.setFields(setFieldsRequest);

      expect(response.ok).toBe(true);
      expect(response.state).toBe("in_progress");

      // Verify fields were updated
      const submission = await store.get(createResponse.submissionId);
      expect(submission!.fields.companyName).toBe("Acme Corp");
      expect(submission!.fields.contactEmail).toBe("contact@acme.com");
      expect(submission!.fields.phoneNumber).toBe("+1-555-0100");

      // Verify actor attribution - agent filled companyName, human filled others
      expect(submission!.fieldAttribution.companyName).toEqual(agentActor);
      expect(submission!.fieldAttribution.contactEmail).toEqual(humanActor);
      expect(submission!.fieldAttribution.phoneNumber).toEqual(humanActor);

      // Verify updatedBy reflects most recent actor
      expect(submission!.updatedBy).toEqual(humanActor);

      // Verify field.updated events were emitted
      expect(eventEmitter.events).toHaveLength(2);
      expect(eventEmitter.events[0].type).toBe("field.updated");
      expect(eventEmitter.events[0].payload?.fieldPath).toBe("contactEmail");
      expect(eventEmitter.events[1].type).toBe("field.updated");
      expect(eventEmitter.events[1].payload?.fieldPath).toBe("phoneNumber");
    });

    it("should allow agent to overwrite human fields", async () => {
      // Create submission and set field as human
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_vendor_onboarding",
        actor: humanActor,
        initialFields: {
          companyName: "Original Name",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      // Agent overwrites the field
      const setFieldsRequest: SetFieldsRequest = {
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          companyName: "Corrected Name",
        },
      };

      await manager.setFields(setFieldsRequest);

      // Verify field was updated and attribution changed to agent
      const submission = await store.get(createResponse.submissionId);
      expect(submission!.fields.companyName).toBe("Corrected Name");
      expect(submission!.fieldAttribution.companyName).toEqual(agentActor);
    });

    it("should transition from draft to in_progress on first setFields", async () => {
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_vendor_onboarding",
        actor: agentActor,
      };

      const createResponse = await manager.createSubmission(createRequest);
      let submission = await store.get(createResponse.submissionId);
      expect(submission!.state).toBe("draft");

      // Set fields
      const setFieldsRequest: SetFieldsRequest = {
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          companyName: "Acme Corp",
        },
      };

      await manager.setFields(setFieldsRequest);

      // Verify state transitioned
      submission = await store.get(createResponse.submissionId);
      expect(submission!.state).toBe("in_progress");
    });

    it("should reject expired submissions", async () => {
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_vendor_onboarding",
        actor: agentActor,
        ttlMs: -1000, // Already expired
      };

      const createResponse = await manager.createSubmission(createRequest);

      const setFieldsRequest: SetFieldsRequest = {
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          companyName: "Acme Corp",
        },
      };

      const response = await manager.setFields(setFieldsRequest);

      expect(response.ok).toBe(false);
      if (!response.ok) {
        expect(response.error.type).toBe("expired");
        expect(response.state).toBe("expired");
      }
    });

    it("should reject invalid resume token", async () => {
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_vendor_onboarding",
        actor: agentActor,
      };

      const createResponse = await manager.createSubmission(createRequest);

      const setFieldsRequest: SetFieldsRequest = {
        submissionId: createResponse.submissionId,
        resumeToken: "rtok_invalid",
        actor: agentActor,
        fields: {
          companyName: "Acme Corp",
        },
      };

      await expect(manager.setFields(setFieldsRequest)).rejects.toThrow(
        "Invalid resume token"
      );
    });
  });

  describe("generateHandoffUrl", () => {
    it("should generate a resume URL with the submission's resume token", async () => {
      // Create a submission
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_vendor_onboarding",
        actor: agentActor,
        initialFields: {
          companyName: "Acme Corp",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);
      eventEmitter.clear();

      // Generate handoff URL
      const handoffUrl = await manager.generateHandoffUrl(
        createResponse.submissionId,
        agentActor
      );

      // Verify URL format
      expect(handoffUrl).toContain("/resume?token=");
      expect(handoffUrl).toContain(createResponse.resumeToken);
      expect(handoffUrl).toMatch(/^http:\/\/localhost:3000\/resume\?token=rtok_/);

      // Verify handoff.link_issued event was emitted
      expect(eventEmitter.events).toHaveLength(1);
      expect(eventEmitter.events[0].type).toBe("handoff.link_issued");
      expect(eventEmitter.events[0].actor).toEqual(agentActor);
      expect(eventEmitter.events[0].payload?.url).toBe(handoffUrl);
      expect(eventEmitter.events[0].payload?.resumeToken).toBe(
        createResponse.resumeToken
      );
    });

    it("should throw error for non-existent submission", async () => {
      await expect(
        manager.generateHandoffUrl("sub_nonexistent", agentActor)
      ).rejects.toThrow("Submission not found");
    });

    it("should use custom base URL when provided", async () => {
      const customManager = new SubmissionManager(
        store,
        eventEmitter,
        "https://forms.example.com"
      );

      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_vendor_onboarding",
        actor: agentActor,
        initialFields: {
          companyName: "Acme Corp",
        },
      };

      const createResponse = await customManager.createSubmission(createRequest);
      const handoffUrl = await customManager.generateHandoffUrl(
        createResponse.submissionId,
        agentActor
      );

      expect(handoffUrl).toMatch(/^https:\/\/forms\.example\.com\/resume\?token=rtok_/);
    });
  });

  describe("mixed-mode agent-human collaboration", () => {
    it("should track field attribution in a typical handoff workflow", async () => {
      // Step 1: Agent creates submission and fills known fields
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_vendor_onboarding",
        actor: agentActor,
        initialFields: {
          companyName: "Acme Corp",
          taxId: "12-3456789",
          address: "123 Main St",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      // Step 2: Agent sets additional fields
      const agentFields: SetFieldsRequest = {
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          businessType: "LLC",
          yearFounded: 2015,
        },
      };

      await manager.setFields(agentFields);

      // Step 3: Human opens resume URL and completes remaining fields
      const humanFields: SetFieldsRequest = {
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: humanActor,
        fields: {
          w9Document: "file://uploads/w9.pdf",
          insuranceCertificate: "file://uploads/insurance.pdf",
          authorizerSignature: "data:image/png;base64,...",
        },
      };

      await manager.setFields(humanFields);

      // Verify complete field attribution
      const submission = await store.get(createResponse.submissionId);

      // Agent-filled fields
      expect(submission!.fieldAttribution.companyName).toEqual(agentActor);
      expect(submission!.fieldAttribution.taxId).toEqual(agentActor);
      expect(submission!.fieldAttribution.address).toEqual(agentActor);
      expect(submission!.fieldAttribution.businessType).toEqual(agentActor);
      expect(submission!.fieldAttribution.yearFounded).toEqual(agentActor);

      // Human-filled fields
      expect(submission!.fieldAttribution.w9Document).toEqual(humanActor);
      expect(submission!.fieldAttribution.insuranceCertificate).toEqual(
        humanActor
      );
      expect(submission!.fieldAttribution.authorizerSignature).toEqual(
        humanActor
      );

      // Verify all fields are present
      expect(Object.keys(submission!.fields)).toHaveLength(8);
      expect(Object.keys(submission!.fieldAttribution)).toHaveLength(8);

      // Verify updatedBy reflects most recent actor (human)
      expect(submission!.updatedBy).toEqual(humanActor);
      expect(submission!.createdBy).toEqual(agentActor);
    });
  });
});
