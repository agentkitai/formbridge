import { Server } from '@modelcontextprotocol/sdk/server/index.js';
export declare function listTools(server: Server): Promise<{
    tools: any[];
}>;
export declare function callTool(server: Server, toolName: string, args: Record<string, unknown>): Promise<{
    content: Array<{
        type: string;
        text: string;
    }>;
    isError?: boolean;
}>;
export declare function parseToolResponse(response: {
    content: Array<{
        type: string;
        text: string;
    }>;
}): any;
//# sourceMappingURL=test-helpers.d.ts.map