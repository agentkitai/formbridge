import type { z } from 'zod';
import type { SubmissionResponse } from './intake-contract.js';
import type { StorageBackend } from '../storage/storage-backend.js';
export interface MCPToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        $schema?: string;
        type: 'object';
        properties?: Record<string, object>;
        required?: string[];
        [key: string]: unknown;
    };
    outputSchema?: {
        $schema?: string;
        type: 'object';
        properties?: Record<string, object>;
        required?: string[];
        [key: string]: unknown;
    };
}
export type MCPToolHandler = (args: Record<string, unknown>) => Promise<SubmissionResponse>;
export interface MCPToolRegistration {
    definition: MCPToolDefinition;
    handler: MCPToolHandler;
}
export declare enum TransportType {
    STDIO = "stdio",
    SSE = "sse"
}
export interface BaseTransportConfig {
    type: TransportType;
}
export interface StdioTransportConfig extends BaseTransportConfig {
    type: TransportType.STDIO;
}
export interface SSETransportConfig extends BaseTransportConfig {
    type: TransportType.SSE;
    port: number;
    host?: string;
    cors?: {
        origin?: string | string[];
        methods?: string[];
        headers?: string[];
        credentials?: boolean;
    };
    path?: string;
}
export type TransportConfig = StdioTransportConfig | SSETransportConfig;
export interface MCPServerConfig {
    name: string;
    version: string;
    description?: string;
    instructions?: string;
    transport: TransportConfig;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    storageBackend?: StorageBackend;
}
export interface MCPServerCapabilities {
    tools?: {
        listChanged?: boolean;
    };
    logging?: {
        levels?: Array<'debug' | 'info' | 'warn' | 'error'>;
    };
}
export interface MCPToolCallContext {
    requestId?: string;
    client?: {
        name?: string;
        version?: string;
    };
    sessionId?: string;
    meta?: Record<string, unknown>;
}
export declare enum ToolOperation {
    CREATE = "create",
    SET = "set",
    VALIDATE = "validate",
    SUBMIT = "submit",
    REQUEST_UPLOAD = "requestUpload",
    CONFIRM_UPLOAD = "confirmUpload"
}
export interface ToolNameComponents {
    intakeId: string;
    operation: ToolOperation;
    fullName: string;
}
export declare function isStdioTransport(config: TransportConfig): config is StdioTransportConfig;
export declare function isSSETransport(config: TransportConfig): config is SSETransportConfig;
export type ZodSchemaType<T> = T extends z.ZodType<infer U> ? U : never;
//# sourceMappingURL=mcp-types.d.ts.map