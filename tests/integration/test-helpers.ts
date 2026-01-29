/**
 * Test helpers for integration testing
 *
 * Provides utilities to invoke MCP protocol handlers in tests
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

/**
 * Invokes the tools/list handler on an MCP Server
 */
export async function listTools(server: Server): Promise<{ tools: any[] }> {
  // Access the request handler through the server object
  // The Server class extends Protocol which has a protected _requestHandlers Map
  const serverAny = server as any;

  // Try to find the handler through various possible property names
  const requestHandlers =
    serverAny._requestHandlers ||
    serverAny.requestHandlers ||
    serverAny['_requestHandlers'] ||
    new Map();

  console.log('Available handler keys:', Array.from(requestHandlers.keys()));

  const listHandler = requestHandlers.get('tools/list') ||
                     requestHandlers.get((ListToolsRequestSchema.shape as any).method?.value);

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

/**
 * Invokes the tools/call handler on an MCP Server
 */
export async function callTool(
  server: Server,
  toolName: string,
  args: Record<string, unknown>
): Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}> {
  const serverAny = server as any;

  const requestHandlers =
    serverAny._requestHandlers ||
    serverAny.requestHandlers ||
    serverAny['_requestHandlers'] ||
    new Map();

  const callHandler = requestHandlers.get('tools/call') ||
                     requestHandlers.get((CallToolRequestSchema.shape as any).method?.value);

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

/**
 * Parses MCP tool response content as JSON
 */
export function parseToolResponse(response: {
  content: Array<{ type: string; text: string }>;
}): any {
  if (!response.content || response.content.length === 0) {
    throw new Error('Empty response content');
  }

  const firstContent = response.content[0];
  if (!firstContent) {
    throw new Error('No content in response');
  }
  return JSON.parse(firstContent.text);
}
