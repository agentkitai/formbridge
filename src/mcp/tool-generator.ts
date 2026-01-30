/**
 * MCP Tool Generator - Registers MCP tools for FormBridge
 * Provides handoffToHuman tool for agent-to-human collaboration
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SubmissionManager } from "../core/submission-manager.js";
import type { Actor } from "../types/intake-contract.js";

/**
 * Register all MCP tools for FormBridge
 */
export function registerTools(
  server: McpServer,
  submissionManager: SubmissionManager
): void {
  /**
   * handoffToHuman - Generate a resume URL for agent-to-human collaboration
   *
   * Allows an agent to hand off a partially completed submission to a human
   * by generating a shareable resume URL with the resumeToken embedded.
   */
  server.tool(
    "handoffToHuman",
    "Generate a shareable resume URL for agent-to-human handoff. Returns a URL that a human can open to complete the submission.",
    {
      submissionId: z.string().describe("The submission ID to generate a handoff URL for"),
      actor: z.object({
        kind: z.enum(["agent", "human", "system"]).describe("Type of actor requesting the handoff"),
        id: z.string().describe("Unique identifier for the actor"),
        name: z.string().optional().describe("Display name of the actor"),
        metadata: z.record(z.unknown()).optional().describe("Additional actor metadata"),
      }).optional().describe("Actor requesting the handoff (defaults to system actor)"),
    },
    async ({ submissionId, actor }) => {
      try {
        // Default to system actor if not provided
        const handoffActor: Actor = actor || {
          kind: "system",
          id: "mcp-server",
          name: "MCP Server",
        };

        // Generate the handoff URL
        const resumeUrl = await submissionManager.generateHandoffUrl(
          submissionId,
          handoffActor
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: true,
                submissionId,
                resumeUrl,
                message: "Handoff URL generated successfully. Share this URL with a human to complete the submission.",
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                submissionId,
                error: errorMessage,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/**
 * Create and configure an MCP server with FormBridge tools
 */
export function createMcpServer(
  submissionManager: SubmissionManager,
  options?: {
    name?: string;
    version?: string;
  }
): McpServer {
  const server = new McpServer({
    name: options?.name || "@formbridge/mcp-server",
    version: options?.version || "0.1.0",
  });

  registerTools(server, submissionManager);

  return server;
}
