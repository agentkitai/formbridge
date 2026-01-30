import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SubmissionManager } from "../core/submission-manager.js";
import type { IntakeDefinition } from "../types/intake-contract.js";
import type { MCPToolDefinition } from "../types/mcp-types.js";
export interface ToolGenerationOptions {
    includeOptionalFields?: boolean;
    includeConstraints?: boolean;
    maxFieldsInDescription?: number;
}
export declare function registerTools(server: McpServer, submissionManager: SubmissionManager): void;
export declare function createMcpServer(submissionManager: SubmissionManager, options?: {
    name?: string;
    version?: string;
}): McpServer;
export interface GeneratedTools {
    create: MCPToolDefinition;
    set: MCPToolDefinition;
    validate: MCPToolDefinition;
    submit: MCPToolDefinition;
    requestUpload: MCPToolDefinition;
    confirmUpload: MCPToolDefinition;
}
export declare function generateToolsFromIntake(intake: IntakeDefinition, options?: ToolGenerationOptions): GeneratedTools;
export type ToolOperation = 'create' | 'set' | 'validate' | 'submit' | 'requestUpload' | 'confirmUpload';
export declare function generateToolName(intakeId: string, operation: ToolOperation): string;
export declare function parseToolName(toolName: string): {
    intakeId: string;
    operation: ToolOperation;
} | null;
//# sourceMappingURL=tool-generator.d.ts.map