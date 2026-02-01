/**
 * Server-Sent Events (SSE) Transport for MCP Server
 *
 * This module provides SSE transport functionality for remote MCP client integration.
 * SSE transport uses HTTP with Server-Sent Events for server-to-client communication
 * and POST requests for client-to-server communication, making it ideal for remote
 * agent integration and web-based applications.
 *
 * @module mcp/transports/sse
 * @deprecated SSEServerTransport is deprecated in the MCP SDK. Consider using
 * StreamableHTTPServerTransport for new implementations.
 */

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { JSONRPCMessage, MessageExtraInfo } from '@modelcontextprotocol/sdk/types.js';
import type { ServerResponse, IncomingMessage } from 'node:http';

// Re-export SSEServerTransport for convenience
export { SSEServerTransport };

/**
 * Options for configuring SSE transport behavior
 */
export interface SSETransportOptions {
  /**
   * List of allowed host header values for DNS rebinding protection.
   * If not specified, host validation is disabled.
   * @deprecated Use hostHeaderValidation middleware instead
   */
  allowedHosts?: string[];

  /**
   * List of allowed origin header values for DNS rebinding protection.
   * If not specified, origin validation is disabled.
   * @deprecated Use hostHeaderValidation middleware instead
   */
  allowedOrigins?: string[];

  /**
   * Enable DNS rebinding protection (requires allowedHosts and/or allowedOrigins to be configured).
   * Default is false for backwards compatibility.
   * @deprecated Use hostHeaderValidation middleware instead
   */
  enableDnsRebindingProtection?: boolean;

  /**
   * Error handler for transport errors
   */
  onError?: (error: Error) => void;

  /**
   * Close handler for when transport closes
   */
  onClose?: () => void;

  /**
   * Message handler for incoming messages
   */
  onMessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
}

/**
 * Creates a new SSE server transport instance
 *
 * This is a convenience wrapper around the MCP SDK's SSEServerTransport.
 * SSE transport uses HTTP with Server-Sent Events for server-to-client messages
 * and POST requests for client-to-server messages.
 *
 * @param endpoint - The relative or absolute URL where clients should POST messages
 * @param res - The HTTP ServerResponse object for the SSE connection
 * @param options - Optional configuration for security and behavior
 * @returns A configured SSEServerTransport instance
 *
 * @example
 * ```typescript
 * import { createSSETransport } from './transports/sse.js';
 * import { createServer } from 'node:http';
 *
 * const server = createServer((req, res) => {
 *   if (req.url === '/sse') {
 *     const transport = createSSETransport('/message', res);
 *     await transport.start();
 *     await mcpServer.connect(transport);
 *   }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // With DNS rebinding protection
 * const transport = createSSETransport('/message', res, {
 *   allowedHosts: ['localhost', 'example.com'],
 *   allowedOrigins: ['https://example.com'],
 *   enableDnsRebindingProtection: true
 * });
 * ```
 */
export function createSSETransport(
  endpoint: string,
  res: ServerResponse,
  options?: SSETransportOptions
): SSEServerTransport {
  const transport = new SSEServerTransport(endpoint, res, {
    allowedHosts: options?.allowedHosts,
    allowedOrigins: options?.allowedOrigins,
    enableDnsRebindingProtection: options?.enableDnsRebindingProtection,
  });

  if (options?.onError) {
    transport.onerror = options.onError;
  }

  if (options?.onClose) {
    transport.onclose = options.onClose;
  }

  if (options?.onMessage) {
    transport.onmessage = options.onMessage;
  }

  return transport;
}

/**
 * Type guard to check if a transport is a SSEServerTransport
 *
 * @param transport - The transport to check
 * @returns True if the transport is a SSEServerTransport
 *
 * @example
 * ```typescript
 * const transport = createSSETransport('/message', res);
 * if (isSSEServerTransport(transport)) {
 *   console.log('Using SSE transport');
 *   console.log('Session ID:', transport.sessionId);
 * }
 * ```
 */
export function isSSEServerTransport(
  transport: unknown
): transport is SSEServerTransport {
  return transport instanceof SSEServerTransport;
}

/**
 * Creates and configures an SSE transport with event handlers
 *
 * This function provides a more complete setup experience by allowing
 * you to configure error, close, and message handlers at creation time.
 *
 * @param endpoint - The relative or absolute URL where clients should POST messages
 * @param res - The HTTP ServerResponse object for the SSE connection
 * @param options - Transport configuration options with event handlers
 * @returns A configured SSEServerTransport instance with handlers attached
 *
 * @example
 * ```typescript
 * import { createConfiguredSSETransport } from './transports/sse.js';
 * import { createServer } from 'node:http';
 *
 * const server = createServer((req, res) => {
 *   if (req.url === '/sse') {
 *     const transport = createConfiguredSSETransport('/message', res, {
 *       allowedHosts: ['localhost'],
 *       enableDnsRebindingProtection: true,
 *       onError: (error) => {
 *         console.error('SSE Transport error:', error);
 *       },
 *       onClose: () => {
 *         console.log('SSE Transport closed');
 *       },
 *       onMessage: (message) => {
 *         console.log('Received message:', message);
 *       }
 *     });
 *
 *     await transport.start();
 *     await mcpServer.connect(transport);
 *   }
 * });
 * ```
 */
export function createConfiguredSSETransport(
  endpoint: string,
  res: ServerResponse,
  options: SSETransportOptions = {}
): SSEServerTransport {
  return createSSETransport(endpoint, res, options);
}

/**
 * Helper function to handle SSE GET requests for establishing the SSE connection
 *
 * This function creates a transport and starts the SSE stream.
 *
 * @param endpoint - The relative or absolute URL where clients should POST messages
 * @param res - The HTTP ServerResponse object for the SSE connection
 * @param options - Optional transport configuration
 * @returns A configured and started SSEServerTransport instance
 *
 * @example
 * ```typescript
 * import { handleSSEConnection } from './transports/sse.js';
 * import { createServer } from 'node:http';
 *
 * const server = createServer(async (req, res) => {
 *   if (req.url === '/sse' && req.method === 'GET') {
 *     const transport = await handleSSEConnection('/message', res, {
 *       allowedHosts: ['localhost']
 *     });
 *     await mcpServer.connect(transport);
 *   }
 * });
 * ```
 */
export async function handleSSEConnection(
  endpoint: string,
  res: ServerResponse,
  options?: SSETransportOptions
): Promise<SSEServerTransport> {
  const transport = createSSETransport(endpoint, res, options);
  await transport.start();
  return transport;
}

/**
 * Helper function to handle SSE POST requests for incoming messages
 *
 * This function should be called when a POST request is made to the endpoint
 * to send a message from client to server.
 *
 * @param transport - The SSEServerTransport instance handling this session
 * @param req - The incoming HTTP request
 * @param res - The HTTP response object
 * @param parsedBody - Optional pre-parsed request body
 *
 * @example
 * ```typescript
 * import { handleSSEMessage } from './transports/sse.js';
 * import { createServer } from 'node:http';
 *
 * // Store transports by session ID
 * const transports = new Map();
 *
 * const server = createServer(async (req, res) => {
 *   if (req.url === '/message' && req.method === 'POST') {
 *     const sessionId = req.headers['x-session-id'];
 *     const transport = transports.get(sessionId);
 *     if (transport) {
 *       await handleSSEMessage(transport, req, res);
 *     }
 *   }
 * });
 * ```
 */
export async function handleSSEMessage(
  transport: SSEServerTransport,
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody?: unknown
): Promise<void> {
  await transport.handlePostMessage(req, res, parsedBody);
}
