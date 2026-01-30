import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { IntakeDefinition } from '../schemas/intake-schema.js';
import type { MCPServerConfig } from '../types/mcp-types.js';
export declare class FormBridgeMCPServer {
    private server;
    private config;
    private intakes;
    private tools;
    private store;
    private storageBackend?;
    constructor(config: MCPServerConfig);
    registerIntake(intake: IntakeDefinition): void;
    registerIntakes(intakes: IntakeDefinition[]): void;
    start(): Promise<void>;
    private createTransport;
    private registerHandlers;
    private handleToolCall;
    private handleCreate;
    private handleSet;
    private handleValidate;
    private handleSubmit;
    private handleRequestUpload;
    private handleConfirmUpload;
    getServer(): Server;
    getIntakes(): IntakeDefinition[];
}
//# sourceMappingURL=server.d.ts.map