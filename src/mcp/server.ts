/**
 * FormBridge MCP Server
 *
 * Thin orchestrator that registers intake forms as MCP tools and
 * routes tool calls to dedicated handler modules.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { IntakeDefinition } from '../schemas/intake-schema.js';
import type { SubmissionResponse } from '../types/intake-contract.js';
import type { MCPServerConfig } from '../types/mcp-tool-definitions.js';
import { generateToolsFromIntake, parseToolName, type GeneratedTools } from './tool-generator.js';
import { SubmissionStore } from './submission-store.js';
import { successResponse, errorResponse, type MCPToolResponse } from './response-builder.js';

// Handler imports
import { handleCreate } from './handlers/create-handler.js';
import { handleSet } from './handlers/set-handler.js';
import { handleValidate } from './handlers/validate-handler.js';
import { handleSubmit } from './handlers/submit-handler.js';
import { handleRequestUpload, handleConfirmUpload } from './handlers/upload-handlers.js';

/**
 * FormBridge MCP Server
 *
 * Exposes intake forms as MCP tools following the Intake Contract protocol.
 * Each registered intake form generates six tools: create, set, validate,
 * submit, requestUpload, and confirmUpload.
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { FormBridgeMCPServer } from '@formbridge/mcp-server-sdk';
 *
 * const vendorIntake: IntakeDefinition = {
 *   id: 'vendor_onboarding',
 *   version: '1.0.0',
 *   name: 'Vendor Onboarding',
 *   schema: z.object({
 *     legal_name: z.string(),
 *     tax_id: z.string()
 *   }),
 *   destination: { type: 'webhook', name: 'Vendor API', config: {} }
 * };
 *
 * const server = new FormBridgeMCPServer({
 *   name: 'vendor-onboarding-server',
 *   version: '1.0.0',
 *   transport: { type: TransportType.STDIO }
 * });
 *
 * server.registerIntake(vendorIntake);
 * await server.start();
 * ```
 */
export class FormBridgeMCPServer {
  private server: Server;
  private config: MCPServerConfig;
  private intakes = new Map<string, IntakeDefinition>();
  private tools = new Map<string, GeneratedTools>();
  private store = new SubmissionStore();
  private storageBackend?: typeof this.config.storageBackend;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.storageBackend = config.storageBackend;

    this.server = new Server(
      { name: config.name, version: config.version },
      { capabilities: { tools: {} }, instructions: config.instructions }
    );

    this.registerHandlers();
  }

  registerIntake(intake: IntakeDefinition): void {
    const tools = generateToolsFromIntake(
      intake as unknown as import('../types/intake-contract.js').IntakeDefinition
    );
    this.intakes.set(intake.id, intake);
    this.tools.set(intake.id, tools);
  }

  registerIntakes(intakes: IntakeDefinition[]): void {
    for (const intake of intakes) {
      this.registerIntake(intake);
    }
  }

  async start(): Promise<void> {
    const transport = this.createTransport();
    await this.server.connect(transport);
  }

  private createTransport() {
    const { transport } = this.config;
    switch (transport.type) {
      case 'stdio':
        return new StdioServerTransport();
      default:
        throw new Error(`Unsupported transport type: ${transport.type}`);
    }
  }

  private registerHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [];
      for (const generatedTools of this.tools.values()) {
        tools.push(
          { name: generatedTools.create.name, description: generatedTools.create.description, inputSchema: generatedTools.create.inputSchema },
          { name: generatedTools.set.name, description: generatedTools.set.description, inputSchema: generatedTools.set.inputSchema },
          { name: generatedTools.validate.name, description: generatedTools.validate.description, inputSchema: generatedTools.validate.inputSchema },
          { name: generatedTools.submit.name, description: generatedTools.submit.description, inputSchema: generatedTools.submit.inputSchema },
          { name: generatedTools.requestUpload.name, description: generatedTools.requestUpload.description, inputSchema: generatedTools.requestUpload.inputSchema },
          { name: generatedTools.confirmUpload.name, description: generatedTools.confirmUpload.description, inputSchema: generatedTools.confirmUpload.inputSchema }
        );
      }
      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.handleToolCall(request.params.name, request.params.arguments ?? {});
    });
  }

  private async handleToolCall(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolResponse> {
    const parsed = parseToolName(toolName);
    if (!parsed) {
      return errorResponse('Invalid tool name format', { toolName });
    }

    const { intakeId, operation } = parsed;
    const intake = this.intakes.get(intakeId);
    if (!intake) {
      return errorResponse('Intake not found', { intakeId });
    }

    try {
      let response: SubmissionResponse | Record<string, unknown>;
      switch (operation) {
        case 'create':
          response = await handleCreate(intake, args, this.store);
          break;
        case 'set':
          response = await handleSet(intake, args, this.store);
          break;
        case 'validate':
          response = await handleValidate(intake, args, this.store);
          break;
        case 'submit':
          response = await handleSubmit(intake, args, this.store);
          break;
        case 'requestUpload':
          response = await handleRequestUpload(intake, args, this.store, this.storageBackend);
          break;
        case 'confirmUpload':
          response = await handleConfirmUpload(intake, args, this.store, this.storageBackend);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
      return successResponse(response);
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        { operation }
      );
    }
  }

  getServer(): Server {
    return this.server;
  }

  getIntakes(): IntakeDefinition[] {
    return Array.from(this.intakes.values());
  }
}
