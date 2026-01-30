import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { ServerResponse, IncomingMessage } from 'node:http';
export { SSEServerTransport };
export interface SSETransportOptions {
    allowedHosts?: string[];
    allowedOrigins?: string[];
    enableDnsRebindingProtection?: boolean;
    onError?: (error: Error) => void;
    onClose?: () => void;
    onMessage?: (message: any, extra?: any) => void;
}
export declare function createSSETransport(endpoint: string, res: ServerResponse, options?: SSETransportOptions): SSEServerTransport;
export declare function isSSEServerTransport(transport: unknown): transport is SSEServerTransport;
export declare function createConfiguredSSETransport(endpoint: string, res: ServerResponse, options?: SSETransportOptions): SSEServerTransport;
export declare function handleSSEConnection(endpoint: string, res: ServerResponse, options?: SSETransportOptions): Promise<SSEServerTransport>;
export declare function handleSSEMessage(transport: SSEServerTransport, req: IncomingMessage, res: ServerResponse, parsedBody?: unknown): Promise<void>;
//# sourceMappingURL=sse.d.ts.map