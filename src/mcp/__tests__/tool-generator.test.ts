/**
 * Tests for MCP Tool Generator
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools, createMcpServer } from "../tool-generator";
import type { SubmissionManager } from "../../core/submission-manager";
import type { Actor } from "../../types/intake-contract";

describe("MCP Tool Generator", () => {
  let mockSubmissionManager: SubmissionManager;
  let server: McpServer;

  beforeEach(() => {
    // Create mock submission manager
    mockSubmissionManager = {
      generateHandoffUrl: vi.fn(),
    } as any;

    // Create server instance
    server = new McpServer({
      name: "@formbridge/mcp-server-test",
      version: "0.1.0-test",
    });
  });

  describe("registerTools", () => {
    it("should register handoffToHuman tool", () => {
      registerTools(server, mockSubmissionManager);

      // Verify tool is registered by checking server's tool list
      const tools = (server as any).requestHandlers?.tools?.list || [];
      const handoffTool = tools.find((t: any) => t.name === "handoffToHuman");

      expect(handoffTool).toBeDefined();
      expect(handoffTool?.name).toBe("handoffToHuman");
    });

    it("should have correct tool description", () => {
      registerTools(server, mockSubmissionManager);

      const tools = (server as any).requestHandlers?.tools?.list || [];
      const handoffTool = tools.find((t: any) => t.name === "handoffToHuman");

      expect(handoffTool?.description).toContain("resume URL");
      expect(handoffTool?.description).toContain("agent-to-human");
    });
  });

  describe("handoffToHuman tool", () => {
    beforeEach(() => {
      registerTools(server, mockSubmissionManager);
    });

    it("should generate handoff URL successfully", async () => {
      const submissionId = "sub_test123";
      const resumeUrl = "http://localhost:3000/resume?token=rtok_abc123";

      vi.mocked(mockSubmissionManager.generateHandoffUrl).mockResolvedValue(
        resumeUrl
      );

      // Get the tool handler
      const toolHandler = (server as any).requestHandlers?.tools?.call;
      expect(toolHandler).toBeDefined();

      const result = await toolHandler({
        name: "handoffToHuman",
        arguments: { submissionId },
      });

      expect(mockSubmissionManager.generateHandoffUrl).toHaveBeenCalledWith(
        submissionId,
        expect.objectContaining({
          kind: "system",
          id: "mcp-server",
        })
      );

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.ok).toBe(true);
      expect(responseData.submissionId).toBe(submissionId);
      expect(responseData.resumeUrl).toBe(resumeUrl);
    });

    it("should use provided actor when specified", async () => {
      const submissionId = "sub_test456";
      const resumeUrl = "http://localhost:3000/resume?token=rtok_def456";
      const actor: Actor = {
        kind: "agent",
        id: "agent_001",
        name: "Test Agent",
      };

      vi.mocked(mockSubmissionManager.generateHandoffUrl).mockResolvedValue(
        resumeUrl
      );

      const toolHandler = (server as any).requestHandlers?.tools?.call;
      const result = await toolHandler({
        name: "handoffToHuman",
        arguments: { submissionId, actor },
      });

      expect(mockSubmissionManager.generateHandoffUrl).toHaveBeenCalledWith(
        submissionId,
        actor
      );

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.ok).toBe(true);
      expect(responseData.resumeUrl).toBe(resumeUrl);
    });

    it("should handle errors gracefully", async () => {
      const submissionId = "sub_nonexistent";
      const errorMessage = "Submission not found: sub_nonexistent";

      vi.mocked(mockSubmissionManager.generateHandoffUrl).mockRejectedValue(
        new Error(errorMessage)
      );

      const toolHandler = (server as any).requestHandlers?.tools?.call;
      const result = await toolHandler({
        name: "handoffToHuman",
        arguments: { submissionId },
      });

      expect(result.content).toBeDefined();
      expect(result.isError).toBe(true);

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.ok).toBe(false);
      expect(responseData.error).toBe(errorMessage);
    });
  });

  describe("createMcpServer", () => {
    it("should create server with default options", () => {
      const server = createMcpServer(mockSubmissionManager);

      expect(server).toBeDefined();
      expect((server as any).serverInfo?.name).toBe("@formbridge/mcp-server");
      expect((server as any).serverInfo?.version).toBe("0.1.0");
    });

    it("should create server with custom options", () => {
      const server = createMcpServer(mockSubmissionManager, {
        name: "custom-server",
        version: "1.2.3",
      });

      expect(server).toBeDefined();
      expect((server as any).serverInfo?.name).toBe("custom-server");
      expect((server as any).serverInfo?.version).toBe("1.2.3");
    });

    it("should register tools on created server", () => {
      const server = createMcpServer(mockSubmissionManager);

      const tools = (server as any).requestHandlers?.tools?.list || [];
      const handoffTool = tools.find((t: any) => t.name === "handoffToHuman");

      expect(handoffTool).toBeDefined();
    });
  });
});
