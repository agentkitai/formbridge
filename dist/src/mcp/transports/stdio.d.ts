import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Readable, Writable } from 'node:stream';
export { StdioServerTransport };
export declare function createStdioTransport(options?: {
    stdin?: Readable;
    stdout?: Writable;
}): StdioServerTransport;
export declare function isStdioServerTransport(transport: unknown): transport is StdioServerTransport;
export interface StdioTransportOptions {
    stdin?: Readable;
    stdout?: Writable;
    onError?: (error: Error) => void;
    onClose?: () => void;
}
export declare function createConfiguredStdioTransport(options?: StdioTransportOptions): StdioServerTransport;
//# sourceMappingURL=stdio.d.ts.map