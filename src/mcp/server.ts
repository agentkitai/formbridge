/**
 * FormBridge MCP Server
 *
 * Thin transport over the ONE shared submission lifecycle. Each registered
 * intake form is exposed as a set of MCP tools; tool calls are routed to
 * dedicated handler modules that delegate to the shared SubmissionManager /
 * ApprovalManager (the same services the HTTP transport uses). There is no
 * MCP-only data store — MCP and HTTP drive one audited lifecycle.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { IntakeDefinition } from '../schemas/intake-schema.js';
import type { IntakeDefinition as ContractIntakeDefinition } from '../types/intake-contract.js';
import type { MCPServerConfig } from '../types/mcp-tool-definitions.js';
import type { SubmissionManager } from '../core/submission-manager.js';
import type { WebhookManager } from '../core/webhook-manager.js';
import type { ExpiryScheduler } from '../core/expiry-scheduler.js';
import type { StorageBackend } from '../storage/storage-backend.js';
import type { FormBridgeStorage } from '../storage/storage-interface.js';
import { IntakeRegistry } from '../core/intake-registry.js';
import { Validator } from '../core/validator.js';
import { createSubmissionServices } from '../app.js';
import { generateToolsFromIntake, parseToolName, type GeneratedTools } from './tool-generator.js';
import { toContractIntake } from './intake-adapter.js';
import {
  successResponse,
  errorResponse,
  type MCPToolResponse,
  type MCPHandlerServices,
} from './response-builder.js';

// Handler imports
import { handleCreate } from './handlers/create-handler.js';
import { handleSet } from './handlers/set-handler.js';
import { handleValidate } from './handlers/validate-handler.js';
import { handleSubmit } from './handlers/submit-handler.js';
import { handleRequestUpload, handleConfirmUpload } from './handlers/upload-handlers.js';
import {
  handleGet,
  handleHandoff,
  handleFinalize,
} from './handlers/lifecycle-handlers.js';

/**
 * Optional shared services injected into the MCP server so it becomes a
 * transport over an existing lifecycle (e.g. mounted alongside the HTTP app on
 * a shared durable backend). When omitted, the server builds the full lifecycle
 * itself via createSubmissionServices() on first use.
 */
export interface FormBridgeMCPServices {
  manager: SubmissionManager;
  registry: IntakeRegistry;
  storage?: FormBridgeStorage;
}

/** Resolved services the handlers run against. */
interface ResolvedServices {
  manager: SubmissionManager;
  registry: IntakeRegistry;
  storageBackend?: StorageBackend;
  /**
   * Schedulers this server started on the STANDALONE path. Undefined when
   * services are injected — the injecting owner manages their lifecycle.
   * Stopped by close().
   */
  webhookManager?: WebhookManager;
  expiryScheduler?: ExpiryScheduler;
}

/**
 * FormBridge MCP Server
 *
 * Exposes intake forms as MCP tools backed by the shared submission lifecycle.
 * Each registered intake generates the create/set/validate/submit/requestUpload/
 * confirmUpload surface plus get/handoff/finalize. Approval (approve/reject) is
 * deliberately NOT exposed over MCP — see the note on lifecycle-handlers.ts.
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { FormBridgeMCPServer } from '@agentkitai/formbridge-mcp-server';
 *
 * const server = new FormBridgeMCPServer({
 *   name: 'vendor-onboarding-server',
 *   version: '1.0.0',
 *   transport: { type: 'stdio' },
 * });
 * server.registerIntake(vendorIntake);
 * await server.start(); // builds the full durable lifecycle if configured
 * ```
 */
export class FormBridgeMCPServer {
  private server: Server;
  private config: MCPServerConfig;
  private intakes = new Map<string, IntakeDefinition>();
  private contractIntakes = new Map<string, ContractIntakeDefinition>();
  private tools = new Map<string, GeneratedTools>();

  private injected?: FormBridgeMCPServices;
  private resolved?: ResolvedServices;
  private resolving?: Promise<ResolvedServices>;

  /**
   * Shared JSON-schema validator handed to the field-mutating handlers so MCP
   * create/set validate against the intake schema exactly as the HTTP route
   * does (same config). Stateless across intakes; caches compiled schemas.
   */
  private validator = new Validator({ strict: false, allowAdditionalProperties: true });

  constructor(config: MCPServerConfig, services?: FormBridgeMCPServices) {
    this.config = config;
    this.injected = services;

    this.server = new Server(
      { name: config.name, version: config.version },
      { capabilities: { tools: {} }, instructions: config.instructions }
    );

    this.registerHandlers();
  }

  registerIntake(intake: IntakeDefinition): void {
    const contract = toContractIntake(intake);
    const tools = generateToolsFromIntake(intake as unknown as ContractIntakeDefinition);

    this.intakes.set(intake.id, intake);
    this.contractIntakes.set(intake.id, contract);
    this.tools.set(intake.id, tools);

    // If services are already resolved, register into the shared registry so the
    // new intake is immediately usable over both transports.
    if (this.resolved && !this.resolved.registry.hasIntake(contract.id)) {
      this.resolved.registry.registerIntake(contract);
    }
  }

  registerIntakes(intakes: IntakeDefinition[]): void {
    for (const intake of intakes) {
      this.registerIntake(intake);
    }
  }

  async start(): Promise<void> {
    // Build the shared lifecycle up-front so a standalone stdio server is fully
    // wired (durable if FORMBRIDGE_STORAGE is configured) before connecting.
    await this.ensureServices();
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

  /**
   * Resolve the shared services once. Concurrent callers await the same build.
   */
  private async ensureServices(): Promise<ResolvedServices> {
    if (this.resolved) return this.resolved;
    if (!this.resolving) {
      this.resolving = this.buildServices();
    }
    this.resolved = await this.resolving;
    return this.resolved;
  }

  private async buildServices(): Promise<ResolvedServices> {
    if (this.injected) {
      const { manager, registry } = this.injected;
      // Register any accumulated intakes into the injected (shared) registry.
      for (const contract of this.contractIntakes.values()) {
        if (!registry.hasIntake(contract.id)) {
          registry.registerIntake(contract);
        }
      }
      // Injected path: the owner started/owns the schedulers, so we do NOT
      // capture them here (close() must not stop schedulers we don't own).
      return {
        manager,
        registry,
        storageBackend: this.config.storageBackend,
      };
    }

    // Standalone: build a fresh registry and the full lifecycle via the shared
    // factory (env-selected, durable if configured).
    const registry = new IntakeRegistry({ validateOnRegister: true, allowOverwrite: true });
    for (const contract of this.contractIntakes.values()) {
      registry.registerIntake(contract);
    }
    const services = await createSubmissionServices({
      registry,
      storageBackend: this.config.storageBackend,
    });
    // Retain the scheduler handles so close() can stop them — createSubmission
    // Services starts webhook retry + expiry schedulers, and only .unref()
    // otherwise keeps them from blocking process exit.
    return {
      manager: services.manager,
      registry,
      storageBackend: this.config.storageBackend,
      webhookManager: services.webhookManager,
      expiryScheduler: services.expiryScheduler,
    };
  }

  private registerHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = [];
      for (const generated of this.tools.values()) {
        const defs = [
          generated.create,
          generated.set,
          generated.validate,
          generated.submit,
          generated.requestUpload,
          generated.confirmUpload,
          generated.get,
          generated.handoff,
          generated.finalize,
        ];
        for (const def of defs) {
          if (def) {
            tools.push({ name: def.name, description: def.description, inputSchema: def.inputSchema });
          }
        }
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
    const intake = this.contractIntakes.get(intakeId);
    if (!intake) {
      return errorResponse('Intake not found', { intakeId });
    }

    try {
      const services = await this.ensureServices();
      const ctx: MCPHandlerServices = {
        manager: services.manager,
        validator: this.validator,
        storageBackend: services.storageBackend,
      };

      let response: unknown;
      switch (operation) {
        case 'create':
          response = await handleCreate(intake, args, ctx);
          break;
        case 'set':
          response = await handleSet(intake, args, ctx);
          break;
        case 'validate':
          response = await handleValidate(intake, args, ctx);
          break;
        case 'submit':
          response = await handleSubmit(intake, args, ctx);
          break;
        case 'requestUpload':
          response = await handleRequestUpload(intake, args, ctx);
          break;
        case 'confirmUpload':
          response = await handleConfirmUpload(intake, args, ctx);
          break;
        case 'get':
          response = await handleGet(intake, args, ctx);
          break;
        case 'handoff':
          response = await handleHandoff(intake, args, ctx);
          break;
        case 'finalize':
          response = await handleFinalize(intake, args, ctx);
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

  /**
   * Stop the schedulers this server started. Only the STANDALONE path owns
   * schedulers (webhook retry + submission expiry) built via
   * createSubmissionServices; when services are injected the owner manages
   * their lifecycle and this is a no-op for them. Idempotent — the underlying
   * stop methods guard on a null timer, so calling close() repeatedly is safe.
   */
  async close(): Promise<void> {
    const resolved = this.resolved;
    if (!resolved) return;
    resolved.webhookManager?.stopRetryScheduler();
    resolved.expiryScheduler?.stop();
  }
}
