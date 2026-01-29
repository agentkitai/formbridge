/**
 * FormBridge MCP Server
 *
 * This module implements the MCP server that exposes intake forms as
 * MCP tools. It handles tool registration, tool execution, submission
 * state management, and returns structured Intake Contract responses.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import type { IntakeDefinition } from '../schemas/intake-schema.js';
import type {
  SubmissionResponse,
  SubmissionSuccess,
  IntakeError
} from '../types/intake-contract.js';
import { SubmissionState } from '../types/intake-contract.js';
import type { MCPServerConfig } from '../types/mcp-types.js';
import { generateToolsFromIntake, parseToolName, type GeneratedTools } from './tool-generator.js';
import { validateSubmission, validatePartialSubmission } from '../validation/validator.js';
import { mapToIntakeError } from '../validation/error-mapper.js';
import { SubmissionStore } from './submission-store.js';

/**
 * FormBridge MCP Server
 *
 * Exposes intake forms as MCP tools following the Intake Contract protocol.
 * Each registered intake form generates four tools: create, set, validate, and submit.
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

  /**
   * Creates a new FormBridge MCP server instance
   *
   * @param config - Server configuration including name, version, and transport
   */
  constructor(config: MCPServerConfig) {
    this.config = config;

    // Initialize the MCP SDK server
    this.server = new Server(
      {
        name: config.name,
        version: config.version
      },
      {
        capabilities: {
          tools: {}
        },
        instructions: config.instructions
      }
    );

    // Register request handlers
    this.registerHandlers();
  }

  /**
   * Registers an intake definition and generates its MCP tools
   *
   * @param intake - The intake definition to register
   */
  registerIntake(intake: IntakeDefinition): void {
    // Generate tools for this intake
    const tools = generateToolsFromIntake(intake);

    // Store the intake and tools
    this.intakes.set(intake.id, intake);
    this.tools.set(intake.id, tools);
  }

  /**
   * Registers multiple intake definitions
   *
   * @param intakes - Array of intake definitions to register
   */
  registerIntakes(intakes: IntakeDefinition[]): void {
    for (const intake of intakes) {
      this.registerIntake(intake);
    }
  }

  /**
   * Starts the MCP server with the configured transport
   */
  async start(): Promise<void> {
    const transport = this.createTransport();
    await this.server.connect(transport);
  }

  /**
   * Creates the appropriate transport based on configuration
   */
  private createTransport() {
    const { transport } = this.config;

    switch (transport.type) {
      case 'stdio':
        return new StdioServerTransport();

      default:
        throw new Error(`Unsupported transport type: ${transport.type}`);
    }
  }

  /**
   * Registers MCP protocol request handlers
   */
  private registerHandlers(): void {
    // Handle tools/list - return all registered tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [];

      // Collect all tools from all registered intakes
      for (const generatedTools of this.tools.values()) {
        tools.push(
          {
            name: generatedTools.create.name,
            description: generatedTools.create.description,
            inputSchema: generatedTools.create.inputSchema
          },
          {
            name: generatedTools.set.name,
            description: generatedTools.set.description,
            inputSchema: generatedTools.set.inputSchema
          },
          {
            name: generatedTools.validate.name,
            description: generatedTools.validate.description,
            inputSchema: generatedTools.validate.inputSchema
          },
          {
            name: generatedTools.submit.name,
            description: generatedTools.submit.description,
            inputSchema: generatedTools.submit.inputSchema
          }
        );
      }

      return { tools };
    });

    // Handle tools/call - execute tool operations
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.handleToolCall(request.params.name, request.params.arguments ?? {});
    });
  }

  /**
   * Handles a tool call request by routing it to the appropriate operation handler
   *
   * @param toolName - The name of the MCP tool being called
   * @param args - The arguments passed to the tool
   * @returns MCP tool response with structured Intake Contract data
   */
  private async handleToolCall(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  }> {
    // Parse tool name to extract intake ID and operation
    const parsed = parseToolName(toolName);
    if (!parsed) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Invalid tool name format',
              toolName
            })
          }
        ],
        isError: true
      };
    }

    const { intakeId, operation } = parsed;

    // Get the intake definition
    const intake = this.intakes.get(intakeId);
    if (!intake) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Intake not found',
              intakeId
            })
          }
        ],
        isError: true
      };
    }

    // Execute the appropriate operation
    let response: SubmissionResponse;
    try {
      switch (operation) {
        case 'create':
          response = await this.handleCreate(intake, args);
          break;
        case 'set':
          response = await this.handleSet(intake, args);
          break;
        case 'validate':
          response = await this.handleValidate(intake, args);
          break;
        case 'submit':
          response = await this.handleSubmit(intake, args);
          break;
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
              operation
            })
          }
        ],
        isError: true
      };
    }

    // Return the structured response
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  }

  /**
   * Handles the create operation
   *
   * Creates a new submission session with optional initial data.
   *
   * @param intake - The intake definition for this submission
   * @param args - Arguments containing optional data and idempotencyKey
   * @returns Submission response with new resumeToken or validation errors
   */
  private async handleCreate(
    intake: IntakeDefinition,
    args: Record<string, unknown>
  ): Promise<SubmissionResponse> {
    const { data = {}, idempotencyKey } = args as {
      data?: Record<string, unknown>;
      idempotencyKey?: string;
    };

    // Check for existing submission with same idempotency key
    if (idempotencyKey) {
      const existing = this.store.getByIdempotencyKey(idempotencyKey);
      if (existing) {
        return {
          state: existing.state,
          submissionId: existing.submissionId,
          message: 'Submission already exists (idempotent)',
          resumeToken: existing.resumeToken
        } as SubmissionSuccess & { resumeToken: string };
      }
    }

    // Validate initial data if provided (partial validation)
    if (Object.keys(data).length > 0) {
      const validationResult = validatePartialSubmission(intake.schema, data);
      if (!validationResult.success) {
        const error = mapToIntakeError(validationResult.error, {
          includeTimestamp: true
        });
        return error;
      }
    }

    // Create new submission entry
    const entry = this.store.create(intake.id, data, idempotencyKey);

    return {
      state: entry.state,
      submissionId: entry.submissionId,
      message: 'Submission created successfully',
      resumeToken: entry.resumeToken
    } as SubmissionSuccess & { resumeToken: string };
  }

  /**
   * Handles the set operation
   *
   * Updates field values in an existing submission session.
   *
   * @param intake - The intake definition for this submission
   * @param args - Arguments containing resumeToken and data to update
   * @returns Submission response with updated state or validation errors
   */
  private async handleSet(
    intake: IntakeDefinition,
    args: Record<string, unknown>
  ): Promise<SubmissionResponse> {
    const { resumeToken, data } = args as {
      resumeToken: string;
      data: Record<string, unknown>;
    };

    // Get existing submission
    const entry = this.store.get(resumeToken);
    if (!entry) {
      const error: IntakeError = {
        type: 'invalid',
        message: 'Invalid resume token',
        fields: [{
          field: 'resumeToken',
          message: 'Resume token not found or has expired',
          type: 'invalid'
        }],
        nextActions: [{
          type: 'create',
          description: 'Create a new submission'
        }],
        timestamp: new Date().toISOString()
      };
      return error;
    }

    // Verify intake ID matches
    if (entry.intakeId !== intake.id) {
      const error: IntakeError = {
        type: 'conflict',
        message: 'Resume token belongs to a different intake form',
        fields: [{
          field: 'resumeToken',
          message: `Token is for intake '${entry.intakeId}', not '${intake.id}'`,
          type: 'conflict'
        }],
        nextActions: [{
          type: 'create',
          description: 'Create a new submission for this intake form'
        }],
        timestamp: new Date().toISOString()
      };
      return error;
    }

    // Merge new data with existing data
    const mergedData = { ...entry.data, ...data };

    // Validate merged data (partial validation)
    const validationResult = validatePartialSubmission(intake.schema, mergedData);
    if (!validationResult.success) {
      const error = mapToIntakeError(validationResult.error, {
        resumeToken,
        includeTimestamp: true
      });
      return error;
    }

    // Update submission
    const updated = this.store.update(resumeToken, {
      data: mergedData,
      state: SubmissionState.VALIDATING
    });

    return {
      state: updated!.state,
      submissionId: updated!.submissionId,
      message: 'Submission updated successfully',
      resumeToken
    } as SubmissionSuccess & { resumeToken: string };
  }

  /**
   * Handles the validate operation
   *
   * Validates the current submission state without submitting.
   *
   * @param intake - The intake definition for this submission
   * @param args - Arguments containing resumeToken
   * @returns Validation result with errors or success confirmation
   */
  private async handleValidate(
    intake: IntakeDefinition,
    args: Record<string, unknown>
  ): Promise<SubmissionResponse> {
    const { resumeToken } = args as { resumeToken: string };

    // Get existing submission
    const entry = this.store.get(resumeToken);
    if (!entry) {
      const error: IntakeError = {
        type: 'invalid',
        message: 'Invalid resume token',
        fields: [{
          field: 'resumeToken',
          message: 'Resume token not found or has expired',
          type: 'invalid'
        }],
        nextActions: [{
          type: 'create',
          description: 'Create a new submission'
        }],
        timestamp: new Date().toISOString()
      };
      return error;
    }

    // Verify intake ID matches
    if (entry.intakeId !== intake.id) {
      const error: IntakeError = {
        type: 'conflict',
        message: 'Resume token belongs to a different intake form',
        fields: [{
          field: 'resumeToken',
          message: `Token is for intake '${entry.intakeId}', not '${intake.id}'`,
          type: 'conflict'
        }],
        nextActions: [{
          type: 'create',
          description: 'Create a new submission for this intake form'
        }],
        timestamp: new Date().toISOString()
      };
      return error;
    }

    // Validate complete submission
    const validationResult = validateSubmission(intake.schema, entry.data);
    if (!validationResult.success) {
      const error = mapToIntakeError(validationResult.error, {
        resumeToken,
        includeTimestamp: true
      });

      // Update state to invalid
      this.store.update(resumeToken, { state: SubmissionState.INVALID });

      return error;
    }

    // Update state to valid
    this.store.update(resumeToken, { state: SubmissionState.VALID });

    return {
      state: SubmissionState.VALID,
      submissionId: entry.submissionId,
      message: 'Submission is valid and ready to submit',
      resumeToken
    } as SubmissionSuccess & { resumeToken: string };
  }

  /**
   * Handles the submit operation
   *
   * Finalizes and submits the intake form after validation.
   *
   * @param intake - The intake definition for this submission
   * @param args - Arguments containing resumeToken
   * @returns Submission result with completed state or validation errors
   */
  private async handleSubmit(
    intake: IntakeDefinition,
    args: Record<string, unknown>
  ): Promise<SubmissionResponse> {
    const { resumeToken } = args as { resumeToken: string };

    // Get existing submission
    const entry = this.store.get(resumeToken);
    if (!entry) {
      const error: IntakeError = {
        type: 'invalid',
        message: 'Invalid resume token',
        fields: [{
          field: 'resumeToken',
          message: 'Resume token not found or has expired',
          type: 'invalid'
        }],
        nextActions: [{
          type: 'create',
          description: 'Create a new submission'
        }],
        timestamp: new Date().toISOString()
      };
      return error;
    }

    // Verify intake ID matches
    if (entry.intakeId !== intake.id) {
      const error: IntakeError = {
        type: 'conflict',
        message: 'Resume token belongs to a different intake form',
        fields: [{
          field: 'resumeToken',
          message: `Token is for intake '${entry.intakeId}', not '${intake.id}'`,
          type: 'conflict'
        }],
        nextActions: [{
          type: 'create',
          description: 'Create a new submission for this intake form'
        }],
        timestamp: new Date().toISOString()
      };
      return error;
    }

    // Validate complete submission
    const validationResult = validateSubmission(intake.schema, entry.data);
    if (!validationResult.success) {
      const error = mapToIntakeError(validationResult.error, {
        resumeToken,
        includeTimestamp: true
      });

      // Update state to invalid
      this.store.update(resumeToken, { state: SubmissionState.INVALID });

      return error;
    }

    // Update state to submitting
    this.store.update(resumeToken, { state: SubmissionState.SUBMITTING });

    // TODO: In a real implementation, this would deliver the submission
    // to the configured destination (webhook, database, etc.)
    // For now, we just mark it as completed

    // Update state to completed
    this.store.update(resumeToken, { state: SubmissionState.COMPLETED });

    return {
      state: SubmissionState.COMPLETED,
      submissionId: entry.submissionId,
      message: `Submission completed successfully`,
      data: validationResult.data,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Gets the underlying MCP SDK server instance
   *
   * Useful for advanced use cases that need direct access to the MCP server.
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Gets all registered intake definitions
   */
  getIntakes(): IntakeDefinition[] {
    return Array.from(this.intakes.values());
  }
}
