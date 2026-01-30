#!/usr/bin/env node
/**
 * Vendor Onboarding MCP Server
 *
 * This is a complete example of a FormBridge MCP server that exposes the vendor
 * onboarding intake as MCP tools. AI agents can discover and call these tools
 * to submit vendor information with full validation and structured error responses.
 *
 * Usage:
 *   node --loader tsx examples/vendor-onboarding/server.ts
 *   node --loader tsx examples/vendor-onboarding/server.ts --version
 */

import { FormBridgeMCPServer } from '../../src/mcp/server.js';
import { TransportType } from '../../src/types/mcp-types.js';
import { vendorOnboardingIntake } from './schema.js';

/**
 * Handle CLI arguments
 */
function handleCliArgs(): void {
  const args = process.argv.slice(2);

  if (args.includes('--version') || args.includes('-v')) {
    console.log('1.0');
    process.exit(0);
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Vendor Onboarding MCP Server

Usage:
  node --loader tsx examples/vendor-onboarding/server.ts [options]

Options:
  --version, -v    Print version and exit
  --help, -h       Show this help message

Description:
  Starts an MCP server that exposes vendor onboarding as MCP tools.
  The server uses stdio transport for communication with MCP clients.

  Available tools:
    - vendor_onboarding__create: Create a new vendor submission
    - vendor_onboarding__set: Update fields in an existing submission
    - vendor_onboarding__validate: Validate submission data
    - vendor_onboarding__submit: Submit vendor for processing

Example:
  # Start the server
  node --loader tsx examples/vendor-onboarding/server.ts

  # Connect with Claude Desktop or other MCP client
  # The server will communicate via stdio
`);
    process.exit(0);
  }
}

/**
 * Main server setup and startup
 */
async function main(): Promise<void> {
  // Handle CLI arguments first
  handleCliArgs();

  // Create the MCP server instance
  const server = new FormBridgeMCPServer({
    name: 'vendor-onboarding-server',
    version: '1.0.0',
    transport: { type: TransportType.STDIO },
    instructions: 'This server provides vendor onboarding tools for collecting and validating vendor information including banking, tax, and business details.'
  });

  // Register the vendor onboarding intake
  server.registerIntake(vendorOnboardingIntake);

  // Start the server with stdio transport
  await server.start();

  // Log to stderr so it doesn't interfere with stdio protocol
  console.error('Vendor onboarding MCP server started');
  console.error('Registered intake: vendor_onboarding');
  console.error('Available tools: create, set, validate, submit');
  console.error('Ready for MCP client connections via stdio');
}

// Run the server
main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
