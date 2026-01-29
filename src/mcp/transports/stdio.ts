/**
 * Standard I/O (stdio) Transport for MCP Server
 *
 * This module provides stdio transport functionality for local MCP client integration.
 * Stdio transport uses standard input/output streams for communication, making it
 * ideal for CLI tools, local agent integration, and applications like Claude Desktop.
 *
 * @module mcp/transports/stdio
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Readable, Writable } from 'node:stream';

// Re-export StdioServerTransport for convenience
export { StdioServerTransport };

/**
 * Creates a new stdio server transport instance
 *
 * This is a convenience wrapper around the MCP SDK's StdioServerTransport.
 * By default, it uses process.stdin and process.stdout for communication.
 *
 * @param options - Optional configuration for custom streams
 * @param options.stdin - Custom readable stream (defaults to process.stdin)
 * @param options.stdout - Custom writable stream (defaults to process.stdout)
 * @returns A configured StdioServerTransport instance
 *
 * @example
 * ```typescript
 * import { createStdioTransport } from './transports/stdio.js';
 * import { Server } from '@modelcontextprotocol/sdk/server/index.js';
 *
 * const transport = createStdioTransport();
 * const server = new Server({ name: 'my-server', version: '1.0.0' });
 * await server.connect(transport);
 * ```
 *
 * @example
 * ```typescript
 * // With custom streams for testing
 * import { Readable, Writable } from 'node:stream';
 *
 * const mockStdin = new Readable({ read() {} });
 * const mockStdout = new Writable({ write() {} });
 *
 * const transport = createStdioTransport({
 *   stdin: mockStdin,
 *   stdout: mockStdout
 * });
 * ```
 */
export function createStdioTransport(options?: {
  stdin?: Readable;
  stdout?: Writable;
}): StdioServerTransport {
  return new StdioServerTransport(options?.stdin, options?.stdout);
}

/**
 * Type guard to check if a transport is a StdioServerTransport
 *
 * @param transport - The transport to check
 * @returns True if the transport is a StdioServerTransport
 *
 * @example
 * ```typescript
 * const transport = createStdioTransport();
 * if (isStdioServerTransport(transport)) {
 *   console.log('Using stdio transport');
 * }
 * ```
 */
export function isStdioServerTransport(
  transport: unknown
): transport is StdioServerTransport {
  return transport instanceof StdioServerTransport;
}

/**
 * Options for configuring stdio transport behavior
 */
export interface StdioTransportOptions {
  /**
   * Custom readable stream for input (defaults to process.stdin)
   */
  stdin?: Readable;

  /**
   * Custom writable stream for output (defaults to process.stdout)
   */
  stdout?: Writable;

  /**
   * Error handler for transport errors
   */
  onError?: (error: Error) => void;

  /**
   * Close handler for when transport closes
   */
  onClose?: () => void;
}

/**
 * Creates and configures a stdio transport with event handlers
 *
 * This function provides a more complete setup experience by allowing
 * you to configure error and close handlers at creation time.
 *
 * @param options - Transport configuration options
 * @returns A configured StdioServerTransport instance with handlers attached
 *
 * @example
 * ```typescript
 * const transport = createConfiguredStdioTransport({
 *   onError: (error) => {
 *     console.error('Transport error:', error);
 *   },
 *   onClose: () => {
 *     console.log('Transport closed');
 *   }
 * });
 *
 * await server.connect(transport);
 * ```
 */
export function createConfiguredStdioTransport(
  options: StdioTransportOptions = {}
): StdioServerTransport {
  const transport = new StdioServerTransport(options.stdin, options.stdout);

  if (options.onError) {
    transport.onerror = options.onError;
  }

  if (options.onClose) {
    transport.onclose = options.onClose;
  }

  return transport;
}
