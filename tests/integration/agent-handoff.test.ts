/**
 * Agent-to-Human Handoff Integration Test
 *
 * Tests the complete workflow of an agent creating a submission,
 * filling fields, and handing off to a human via MCP tools.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SubmissionManager } from "../../src/core/submission-manager";
import { createMcpServer, registerTools } from "../../src/mcp/tool-generator";
import type {
  Actor,
  IntakeEvent,
  CreateSubmissionRequest,
  SetFieldsRequest,
} from "../../src/types/intake-contract";
import type { Submission } from "../../src/types";

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
}

describe("Agent-to-Human Handoff Integration", () => {
  let manager: SubmissionManager;
  let store: InMemorySubmissionStore;
  let eventEmitter: InMemoryEventEmitter;
  let mcpServer: ReturnType<typeof createMcpServer>;

  const agentActor: Actor = {
    kind: "agent",
    id: "agent-onboarding-001",
    name: "Vendor Onboarding Agent",
  };

  const humanActor: Actor = {
    kind: "human",
    id: "user-vendor-manager",
    name: "Vendor Manager",
  };

  beforeEach(() => {
    store = new InMemorySubmissionStore();
    eventEmitter = new InMemoryEventEmitter();
    manager = new SubmissionManager(store, eventEmitter, "http://localhost:3000");
    mcpServer = createMcpServer(manager);
  });

  describe("Complete Agent Handoff Workflow", () => {
    it("should allow agent to create submission, fill fields, and generate resume URL", async () => {
      // Step 1: Agent creates submission via MCP
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_vendor_onboarding",
        actor: agentActor,
        initialFields: {
          companyName: "Acme Corp",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      // Verify submission was created
      expect(createResponse.ok).toBe(true);
      expect(createResponse.submissionId).toMatch(/^sub_/);
      expect(createResponse.resumeToken).toMatch(/^rtok_/);
      expect(createResponse.state).toBe("draft");

      // Verify submission.created event was emitted
      const createdEvents = eventEmitter.getEventsByType("submission.created");
      expect(createdEvents).toHaveLength(1);
      expect(createdEvents[0].actor).toEqual(agentActor);

      // Step 2: Agent fills additional fields with vendor data
      const setFieldsRequest: SetFieldsRequest = {
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          address: "123 Main St, San Francisco, CA 94105",
          taxId: "12-3456789",
          businessType: "LLC",
          contactEmail: "contact@acme.com",
          phoneNumber: "+1-555-0100",
        },
      };

      const setFieldsResponse = await manager.setFields(setFieldsRequest);

      // Verify fields were set successfully
      expect(setFieldsResponse.ok).toBe(true);
      expect(setFieldsResponse.state).toBe("in_progress");

      // Verify field.updated events were emitted for each field
      const fieldUpdatedEvents = eventEmitter.getEventsByType("field.updated");
      expect(fieldUpdatedEvents).toHaveLength(5); // 5 fields updated
      expect(fieldUpdatedEvents.every((e) => e.actor === agentActor)).toBe(true);

      // Verify field attribution was recorded
      const submission = await store.get(createResponse.submissionId);
      expect(submission).toBeDefined();
      expect(submission!.fieldAttribution.companyName).toEqual(agentActor);
      expect(submission!.fieldAttribution.address).toEqual(agentActor);
      expect(submission!.fieldAttribution.taxId).toEqual(agentActor);
      expect(submission!.fieldAttribution.businessType).toEqual(agentActor);
      expect(submission!.fieldAttribution.contactEmail).toEqual(agentActor);
      expect(submission!.fieldAttribution.phoneNumber).toEqual(agentActor);

      // Step 3: Agent calls handoffToHuman and receives resume URL
      eventEmitter.clear(); // Clear previous events to isolate handoff event

      const resumeUrl = await manager.generateHandoffUrl(
        createResponse.submissionId,
        agentActor
      );

      // Verify resume URL format
      expect(resumeUrl).toBeDefined();
      expect(resumeUrl).toContain("/resume?token=");
      expect(resumeUrl).toContain(createResponse.resumeToken);
      expect(resumeUrl).toMatch(/^http:\/\/localhost:3000\/resume\?token=rtok_/);

      // Step 4: Verify HANDOFF_LINK_ISSUED event was emitted
      const handoffEvents = eventEmitter.getEventsByType("handoff.link_issued");
      expect(handoffEvents).toHaveLength(1);

      const handoffEvent = handoffEvents[0];
      expect(handoffEvent.type).toBe("handoff.link_issued");
      expect(handoffEvent.submissionId).toBe(createResponse.submissionId);
      expect(handoffEvent.actor).toEqual(agentActor);
      expect(handoffEvent.state).toBe("in_progress");
      expect(handoffEvent.payload?.url).toBe(resumeUrl);
      expect(handoffEvent.payload?.resumeToken).toBe(createResponse.resumeToken);
      expect(handoffEvent.eventId).toMatch(/^evt_/);
      expect(handoffEvent.ts).toBeDefined();

      // Step 5: Verify resume URL contains valid resumeToken
      const urlParams = new URL(resumeUrl);
      const tokenFromUrl = urlParams.searchParams.get("token");
      expect(tokenFromUrl).toBe(createResponse.resumeToken);

      // Verify we can retrieve the submission using the resume token
      const submissionByToken = await store.getByResumeToken(createResponse.resumeToken);
      expect(submissionByToken).toBeDefined();
      expect(submissionByToken!.id).toBe(createResponse.submissionId);
      expect(submissionByToken!.fields.companyName).toBe("Acme Corp");
      expect(submissionByToken!.fields.taxId).toBe("12-3456789");
    });

    it("should persist handoff event in submission's event history", async () => {
      // Create submission
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_vendor_onboarding",
        actor: agentActor,
        initialFields: {
          companyName: "Test Corp",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      // Generate handoff URL
      await manager.generateHandoffUrl(createResponse.submissionId, agentActor);

      // Verify event was added to submission's event history
      const submission = await store.get(createResponse.submissionId);
      expect(submission).toBeDefined();
      expect(submission!.events).toBeDefined();

      const handoffEvent = submission!.events.find(
        (e) => e.type === "handoff.link_issued"
      );
      expect(handoffEvent).toBeDefined();
      expect(handoffEvent!.actor).toEqual(agentActor);
      expect(handoffEvent!.payload?.url).toContain("/resume?token=");
      expect(handoffEvent!.payload?.resumeToken).toBe(createResponse.resumeToken);
    });

    it("should support multiple handoff URL generations for the same submission", async () => {
      // Create submission
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_vendor_onboarding",
        actor: agentActor,
        initialFields: {
          companyName: "Multi Handoff Corp",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      // Generate first handoff URL
      const resumeUrl1 = await manager.generateHandoffUrl(
        createResponse.submissionId,
        agentActor
      );

      // Generate second handoff URL (e.g., agent needs to share with another human)
      const resumeUrl2 = await manager.generateHandoffUrl(
        createResponse.submissionId,
        agentActor
      );

      // Both URLs should be identical (same resume token)
      expect(resumeUrl1).toBe(resumeUrl2);

      // Verify multiple handoff events were recorded
      const submission = await store.get(createResponse.submissionId);
      const handoffEvents = submission!.events.filter(
        (e) => e.type === "handoff.link_issued"
      );
      expect(handoffEvents).toHaveLength(2);
    });

    it("should handle errors gracefully when submission not found", async () => {
      // Attempt to generate handoff URL for non-existent submission
      await expect(
        manager.generateHandoffUrl("sub_nonexistent", agentActor)
      ).rejects.toThrow("Submission not found: sub_nonexistent");

      // Verify no handoff events were emitted
      const handoffEvents = eventEmitter.getEventsByType("handoff.link_issued");
      expect(handoffEvents).toHaveLength(0);
    });
  });

  describe("MCP Tool Integration", () => {
    it("should expose handoffToHuman tool via MCP server", async () => {
      // Create submission
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_vendor_onboarding",
        actor: agentActor,
        initialFields: {
          companyName: "MCP Test Corp",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);
      eventEmitter.clear();

      // Call handoffToHuman tool via MCP server
      const toolHandler = (mcpServer as any).requestHandlers?.tools?.call;
      expect(toolHandler).toBeDefined();

      const result = await toolHandler({
        name: "handoffToHuman",
        arguments: {
          submissionId: createResponse.submissionId,
          actor: agentActor,
        },
      });

      // Verify tool response
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.ok).toBe(true);
      expect(responseData.submissionId).toBe(createResponse.submissionId);
      expect(responseData.resumeUrl).toContain("/resume?token=");
      expect(responseData.resumeUrl).toContain(createResponse.resumeToken);
      expect(responseData.message).toContain("Share this URL");

      // Verify HANDOFF_LINK_ISSUED event was emitted
      const handoffEvents = eventEmitter.getEventsByType("handoff.link_issued");
      expect(handoffEvents).toHaveLength(1);
      expect(handoffEvents[0].payload?.url).toBe(responseData.resumeUrl);
    });

    it("should use default system actor when actor not provided to MCP tool", async () => {
      // Create submission
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_vendor_onboarding",
        actor: agentActor,
        initialFields: {
          companyName: "System Actor Test Corp",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);
      eventEmitter.clear();

      // Call handoffToHuman tool without providing actor
      const toolHandler = (mcpServer as any).requestHandlers?.tools?.call;
      const result = await toolHandler({
        name: "handoffToHuman",
        arguments: {
          submissionId: createResponse.submissionId,
          // No actor provided
        },
      });

      // Verify tool response
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.ok).toBe(true);

      // Verify system actor was used for handoff event
      const handoffEvents = eventEmitter.getEventsByType("handoff.link_issued");
      expect(handoffEvents).toHaveLength(1);
      expect(handoffEvents[0].actor).toEqual({
        kind: "system",
        id: "mcp-server",
        name: "MCP Server",
      });
    });

    it("should return error response when submission not found via MCP tool", async () => {
      const toolHandler = (mcpServer as any).requestHandlers?.tools?.call;

      const result = await toolHandler({
        name: "handoffToHuman",
        arguments: {
          submissionId: "sub_nonexistent",
          actor: agentActor,
        },
      });

      // Verify error response
      expect(result.content).toBeDefined();
      expect(result.isError).toBe(true);

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.ok).toBe(false);
      expect(responseData.error).toContain("Submission not found");
      expect(responseData.submissionId).toBe("sub_nonexistent");
    });
  });

  describe("End-to-End Vendor Onboarding Scenario", () => {
    it("should complete full agent-to-human handoff workflow for vendor onboarding", async () => {
      // Scenario: Agent gathers basic vendor information, then hands off to human
      // for document uploads (W9, insurance certificates)

      // Step 1: Agent creates submission
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_vendor_onboarding",
        actor: agentActor,
        initialFields: {
          companyName: "Global Widgets Inc",
        },
      };

      const createResponse = await manager.createSubmission(createRequest);

      // Step 2: Agent fills known fields through conversation
      const agentFields: SetFieldsRequest = {
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          address: "456 Tech Blvd, Austin, TX 78701",
          taxId: "98-7654321",
          businessType: "Corporation",
          contactEmail: "procurement@globalwidgets.com",
          phoneNumber: "+1-555-0200",
          yearFounded: 2010,
          numberOfEmployees: 150,
        },
      };

      await manager.setFields(agentFields);

      // Step 3: Agent recognizes need for document uploads and generates handoff URL
      eventEmitter.clear();
      const resumeUrl = await manager.generateHandoffUrl(
        createResponse.submissionId,
        agentActor
      );

      // Verify agent-filled fields
      const submissionBeforeHuman = await store.get(createResponse.submissionId);
      expect(submissionBeforeHuman!.fields.companyName).toBe("Global Widgets Inc");
      expect(submissionBeforeHuman!.fields.taxId).toBe("98-7654321");

      // Verify all agent-filled fields have correct attribution
      expect(submissionBeforeHuman!.fieldAttribution.companyName).toEqual(agentActor);
      expect(submissionBeforeHuman!.fieldAttribution.address).toEqual(agentActor);
      expect(submissionBeforeHuman!.fieldAttribution.taxId).toEqual(agentActor);

      // Step 4: Human opens resume URL (simulated by extracting token)
      const urlParams = new URL(resumeUrl);
      const resumeToken = urlParams.searchParams.get("token");
      expect(resumeToken).toBe(createResponse.resumeToken);

      // Step 5: Human completes remaining fields (document uploads)
      const humanFields: SetFieldsRequest = {
        submissionId: createResponse.submissionId,
        resumeToken: resumeToken!,
        actor: humanActor,
        fields: {
          w9Document: "file://uploads/w9-global-widgets.pdf",
          insuranceCertificate: "file://uploads/insurance-global-widgets.pdf",
          bankingInfo: "file://uploads/banking-global-widgets.pdf",
          authorizerSignature: "data:image/png;base64,iVBORw0KGgoAAAANS...",
        },
      };

      await manager.setFields(humanFields);

      // Step 6: Verify final submission state
      const finalSubmission = await store.get(createResponse.submissionId);

      // Verify all fields are present
      expect(Object.keys(finalSubmission!.fields)).toHaveLength(12); // 8 agent + 4 human

      // Verify agent-filled fields still have agent attribution
      expect(finalSubmission!.fieldAttribution.companyName).toEqual(agentActor);
      expect(finalSubmission!.fieldAttribution.taxId).toEqual(agentActor);
      expect(finalSubmission!.fieldAttribution.address).toEqual(agentActor);

      // Verify human-filled fields have human attribution
      expect(finalSubmission!.fieldAttribution.w9Document).toEqual(humanActor);
      expect(finalSubmission!.fieldAttribution.insuranceCertificate).toEqual(humanActor);
      expect(finalSubmission!.fieldAttribution.authorizerSignature).toEqual(humanActor);

      // Verify updatedBy reflects most recent actor (human)
      expect(finalSubmission!.updatedBy).toEqual(humanActor);
      expect(finalSubmission!.createdBy).toEqual(agentActor);

      // Verify complete event history
      const allEvents = finalSubmission!.events;
      expect(allEvents.some((e) => e.type === "submission.created")).toBe(true);
      expect(allEvents.some((e) => e.type === "field.updated")).toBe(true);
      expect(allEvents.some((e) => e.type === "handoff.link_issued")).toBe(true);

      // Verify handoff event has correct payload
      const handoffEvent = allEvents.find((e) => e.type === "handoff.link_issued");
      expect(handoffEvent?.payload?.url).toBe(resumeUrl);
      expect(handoffEvent?.payload?.resumeToken).toBe(createResponse.resumeToken);
      expect(handoffEvent?.actor).toEqual(agentActor);
    });
  });

  describe("Resume URL Validation", () => {
    it("should generate resume URLs with correct format", async () => {
      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_test",
        actor: agentActor,
      };

      const createResponse = await manager.createSubmission(createRequest);
      const resumeUrl = await manager.generateHandoffUrl(
        createResponse.submissionId,
        agentActor
      );

      // Verify URL structure
      const url = new URL(resumeUrl);
      expect(url.protocol).toBe("http:");
      expect(url.hostname).toBe("localhost");
      expect(url.port).toBe("3000");
      expect(url.pathname).toBe("/resume");
      expect(url.searchParams.get("token")).toBe(createResponse.resumeToken);
      expect(url.searchParams.get("token")).toMatch(/^rtok_/);
    });

    it("should use custom base URL when provided to SubmissionManager", async () => {
      const customManager = new SubmissionManager(
        store,
        eventEmitter,
        "https://forms.example.com"
      );

      const createRequest: CreateSubmissionRequest = {
        intakeId: "intake_test",
        actor: agentActor,
      };

      const createResponse = await customManager.createSubmission(createRequest);
      const resumeUrl = await customManager.generateHandoffUrl(
        createResponse.submissionId,
        agentActor
      );

      expect(resumeUrl).toMatch(/^https:\/\/forms\.example\.com\/resume\?token=rtok_/);

      const url = new URL(resumeUrl);
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe("forms.example.com");
      expect(url.pathname).toBe("/resume");
    });
  });
});
