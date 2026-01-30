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
import { convertZodToJsonSchema } from '../schemas/json-schema-converter.js';
import { validateSubmission, validatePartialSubmission } from '../validation/validator.js';
import { mapToIntakeError } from '../validation/error-mapper.js';
import { SubmissionStore } from './submission-store.js';

/**
 * Converts an IntakeError to a plain Record for use as a response object.
 * Avoids the `as unknown as Record<string, unknown>` type erasure pattern.
 */
function toRecord(error: IntakeError): Record<string, unknown> {
  return JSON.parse(JSON.stringify(error));
}

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
  private storageBackend?: typeof this.config.storageBackend;

  /**
   * Creates a new FormBridge MCP server instance
   *
   * @param config - Server configuration including name, version, and transport
   */
  constructor(config: MCPServerConfig) {
    this.config = config;
    this.storageBackend = config.storageBackend;

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
          },
          {
            name: generatedTools.requestUpload.name,
            description: generatedTools.requestUpload.description,
            inputSchema: generatedTools.requestUpload.inputSchema
          },
          {
            name: generatedTools.confirmUpload.name,
            description: generatedTools.confirmUpload.description,
            inputSchema: generatedTools.confirmUpload.inputSchema
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
    let response: SubmissionResponse | Record<string, unknown>;
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
        case 'requestUpload':
          response = await this.handleRequestUpload(intake, args);
          break;
        case 'confirmUpload':
          response = await this.handleConfirmUpload(intake, args);
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
   * Handles the requestUpload operation
   *
   * Requests a signed URL for file upload.
   *
   * @param intake - The intake definition for this submission
   * @param args - Arguments containing resumeToken, field, filename, mimeType, sizeBytes
   * @returns Upload URL information or error
   */
  private async handleRequestUpload(
    intake: IntakeDefinition,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const {
      resumeToken,
      field,
      filename,
      mimeType,
      sizeBytes
    } = args as {
      resumeToken: string;
      field: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
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
      return toRecord(error);
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
      return toRecord(error);
    }

    // Validate field exists in intake schema
    const jsonSchema = convertZodToJsonSchema(intake.schema, {
      name: intake.name,
      includeSchemaProperty: false
    });
    if (!jsonSchema.properties || !(field in jsonSchema.properties)) {
      const error: IntakeError = {
        type: 'invalid',
        message: `Field '${field}' not found in intake schema`,
        fields: [{
          field: field,
          message: `Field '${field}' does not exist in the intake definition`,
          type: 'invalid'
        }],
        nextActions: [{
          type: 'validate',
          description: 'Use a valid field name from the intake schema'
        }],
        timestamp: new Date().toISOString()
      };
      return toRecord(error);
    }

    // Check if storage backend is configured
    if (!this.storageBackend) {
      const error: IntakeError = {
        type: 'invalid',
        message: 'File upload not supported - storage backend not configured',
        fields: [{
          field: field,
          message: 'Storage backend not configured for MCP server',
          type: 'invalid'
        }],
        nextActions: [{
          type: 'validate',
          description: 'Configure storage backend in MCPServerConfig'
        }],
        timestamp: new Date().toISOString()
      };
      return toRecord(error);
    }

    try {
      // Generate signed upload URL via storage backend
      const signedUrl = await this.storageBackend.generateUploadUrl({
        intakeId: intake.id,
        submissionId: entry.submissionId,
        fieldPath: field,
        filename,
        mimeType,
        constraints: {
          maxSize: sizeBytes,
          allowedTypes: [mimeType],
          maxCount: 1,
        }
      });

      // Initialize uploads map if not exists
      if (!entry.uploads) {
        entry.uploads = {};
      }

      // Track upload in submission
      entry.uploads[signedUrl.uploadId] = {
        uploadId: signedUrl.uploadId,
        field,
        filename,
        mimeType,
        sizeBytes,
        status: 'pending',
        url: signedUrl.url,
      };

      // Update submission entry
      this.store.update(resumeToken, { uploads: entry.uploads });

      // Calculate expiration time in milliseconds
      const expiresAt = new Date(signedUrl.expiresAt);
      const now = new Date();
      const expiresInMs = expiresAt.getTime() - now.getTime();

      // Return signed URL info
      return {
        ok: true,
        uploadId: signedUrl.uploadId,
        method: signedUrl.method,
        url: signedUrl.url,
        expiresInMs: Math.max(0, expiresInMs),
        constraints: {
          maxBytes: sizeBytes,
          accept: [mimeType],
        },
      };
    } catch (error) {
      const err: IntakeError = {
        type: 'invalid',
        message: 'Failed to generate upload URL',
        fields: [{
          field: field,
          message: error instanceof Error ? error.message : 'Unknown error',
          type: 'invalid'
        }],
        nextActions: [{
          type: 'validate',
          description: 'Try again or contact support'
        }],
        timestamp: new Date().toISOString()
      };
      return toRecord(err);
    }
  }

  /**
   * Handles the confirmUpload operation
   *
   * Confirms completion of a file upload.
   *
   * @param intake - The intake definition for this submission
   * @param args - Arguments containing resumeToken and uploadId
   * @returns Confirmation status or error
   */
  private async handleConfirmUpload(
    intake: IntakeDefinition,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const { resumeToken, uploadId } = args as {
      resumeToken: string;
      uploadId: string;
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
      return toRecord(error);
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
      return toRecord(error);
    }

    // Check if storage backend is configured
    if (!this.storageBackend) {
      const error: IntakeError = {
        type: 'invalid',
        message: 'File upload not supported - storage backend not configured',
        fields: [{
          field: 'uploadId',
          message: 'Storage backend not configured for MCP server',
          type: 'invalid'
        }],
        nextActions: [{
          type: 'validate',
          description: 'Configure storage backend in MCPServerConfig'
        }],
        timestamp: new Date().toISOString()
      };
      return toRecord(error);
    }

    // Check if upload exists
    if (!entry.uploads || !entry.uploads[uploadId]) {
      const error: IntakeError = {
        type: 'invalid',
        message: 'Upload not found',
        fields: [{
          field: 'uploadId',
          message: `Upload ${uploadId} not found for this submission`,
          type: 'invalid'
        }],
        nextActions: [{
          type: 'validate',
          description: 'Request a new upload'
        }],
        timestamp: new Date().toISOString()
      };
      return toRecord(error);
    }

    try {
      // Verify upload via storage backend
      const uploadStatus = await this.storageBackend.verifyUpload(uploadId);

      // Update upload status
      const upload = entry.uploads[uploadId];
      if (uploadStatus.status === 'completed' && uploadStatus.file) {
        upload.status = 'completed';
        upload.uploadedAt = new Date();

        // Generate download URL
        const downloadUrl = await this.storageBackend.generateDownloadUrl(uploadId);
        if (downloadUrl) {
          upload.downloadUrl = downloadUrl;
        }
      } else if (uploadStatus.status === 'failed') {
        upload.status = 'failed';
        upload.error = uploadStatus.error;
      }

      // Update submission entry
      this.store.update(resumeToken, { uploads: entry.uploads });

      // Return confirmation
      return {
        ok: true,
        submissionId: entry.submissionId,
        uploadId,
        field: upload.field,
        status: upload.status,
        uploadedAt: upload.uploadedAt?.toISOString(),
        downloadUrl: upload.downloadUrl,
      };
    } catch (error) {
      const err: IntakeError = {
        type: 'invalid',
        message: 'Failed to verify upload',
        fields: [{
          field: 'uploadId',
          message: error instanceof Error ? error.message : 'Unknown error',
          type: 'invalid'
        }],
        nextActions: [{
          type: 'validate',
          description: 'Try again or request a new upload'
        }],
        timestamp: new Date().toISOString()
      };
      return toRecord(err);
    }
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
