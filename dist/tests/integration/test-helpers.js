import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
export async function listTools(server) {
    const serverAny = server;
    const requestHandlers = serverAny._requestHandlers ||
        serverAny.requestHandlers ||
        serverAny['_requestHandlers'] ||
        new Map();
    console.log('Available handler keys:', Array.from(requestHandlers.keys()));
    const listHandler = requestHandlers.get('tools/list') ||
        requestHandlers.get(ListToolsRequestSchema.shape.method?.value);
    if (!listHandler) {
        console.error('RequestHandlers type:', requestHandlers.constructor.name);
        console.error('RequestHandlers size:', requestHandlers.size);
        throw new Error('tools/list handler not found');
    }
    const result = await listHandler({
        method: 'tools/list',
        params: {},
    });
    console.log('listTools result:', JSON.stringify(result, null, 2));
    return result;
}
export async function callTool(server, toolName, args) {
    const serverAny = server;
    const requestHandlers = serverAny._requestHandlers ||
        serverAny.requestHandlers ||
        serverAny['_requestHandlers'] ||
        new Map();
    const callHandler = requestHandlers.get('tools/call') ||
        requestHandlers.get(CallToolRequestSchema.shape.method?.value);
    if (!callHandler) {
        throw new Error('tools/call handler not found');
    }
    return await callHandler({
        method: 'tools/call',
        params: {
            name: toolName,
            arguments: args,
        },
    });
}
export function parseToolResponse(response) {
    if (!response.content || response.content.length === 0) {
        throw new Error('Empty response content');
    }
    const firstContent = response.content[0];
    if (!firstContent) {
        throw new Error('No content in response');
    }
    return JSON.parse(firstContent.text);
}
//# sourceMappingURL=test-helpers.js.map