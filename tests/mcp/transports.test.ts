/**
 * Tests for MCP Transport Modules
 *
 * Tests the stdio and SSE transport implementations including:
 * - Transport creation and initialization
 * - Type guards
 * - Configuration options
 * - Event handlers
 * - Helper functions
 */

import { Readable, Writable } from 'node:stream';
import { ServerResponse } from 'node:http';
import {
  StdioServerTransport,
  createStdioTransport,
  createConfiguredStdioTransport,
  isStdioServerTransport,
} from '../../src/mcp/transports/stdio';
import {
  SSEServerTransport,
  createSSETransport,
  createConfiguredSSETransport,
  isSSEServerTransport,
  handleSSEConnection,
} from '../../src/mcp/transports/sse';

describe('Stdio Transport', () => {
  describe('StdioServerTransport re-export', () => {
    it('should re-export StdioServerTransport from MCP SDK', () => {
      expect(StdioServerTransport).toBeDefined();
      expect(typeof StdioServerTransport).toBe('function');
    });
  });

  describe('createStdioTransport()', () => {
    it('should create transport with default streams', () => {
      const transport = createStdioTransport();

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(StdioServerTransport);
    });

    it('should create transport with custom stdin', () => {
      const mockStdin = new Readable({ read() {} });

      const transport = createStdioTransport({
        stdin: mockStdin,
      });

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(StdioServerTransport);
    });

    it('should create transport with custom stdout', () => {
      const mockStdout = new Writable({ write() {} });

      const transport = createStdioTransport({
        stdout: mockStdout,
      });

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(StdioServerTransport);
    });

    it('should create transport with custom stdin and stdout', () => {
      const mockStdin = new Readable({ read() {} });
      const mockStdout = new Writable({ write() {} });

      const transport = createStdioTransport({
        stdin: mockStdin,
        stdout: mockStdout,
      });

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(StdioServerTransport);
    });

    it('should handle empty options object', () => {
      const transport = createStdioTransport({});

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(StdioServerTransport);
    });
  });

  describe('isStdioServerTransport()', () => {
    it('should return true for StdioServerTransport instance', () => {
      const transport = createStdioTransport();

      expect(isStdioServerTransport(transport)).toBe(true);
    });

    it('should return false for non-transport objects', () => {
      expect(isStdioServerTransport({})).toBe(false);
      expect(isStdioServerTransport(null)).toBe(false);
      expect(isStdioServerTransport(undefined)).toBe(false);
      expect(isStdioServerTransport('string')).toBe(false);
      expect(isStdioServerTransport(123)).toBe(false);
      expect(isStdioServerTransport([])).toBe(false);
    });

    it('should return false for other object types', () => {
      class FakeTransport {}
      const fake = new FakeTransport();

      expect(isStdioServerTransport(fake)).toBe(false);
    });
  });

  describe('createConfiguredStdioTransport()', () => {
    it('should create transport with default options', () => {
      const transport = createConfiguredStdioTransport();

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(StdioServerTransport);
    });

    it('should create transport with onError handler', () => {
      const errorHandler = vi.fn();

      const transport = createConfiguredStdioTransport({
        onError: errorHandler,
      });

      expect(transport).toBeDefined();
      expect(transport.onerror).toBe(errorHandler);
    });

    it('should create transport with onClose handler', () => {
      const closeHandler = vi.fn();

      const transport = createConfiguredStdioTransport({
        onClose: closeHandler,
      });

      expect(transport).toBeDefined();
      expect(transport.onclose).toBe(closeHandler);
    });

    it('should create transport with both handlers', () => {
      const errorHandler = vi.fn();
      const closeHandler = vi.fn();

      const transport = createConfiguredStdioTransport({
        onError: errorHandler,
        onClose: closeHandler,
      });

      expect(transport).toBeDefined();
      expect(transport.onerror).toBe(errorHandler);
      expect(transport.onclose).toBe(closeHandler);
    });

    it('should create transport with custom streams and handlers', () => {
      const mockStdin = new Readable({ read() {} });
      const mockStdout = new Writable({ write() {} });
      const errorHandler = vi.fn();
      const closeHandler = vi.fn();

      const transport = createConfiguredStdioTransport({
        stdin: mockStdin,
        stdout: mockStdout,
        onError: errorHandler,
        onClose: closeHandler,
      });

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(StdioServerTransport);
      expect(transport.onerror).toBe(errorHandler);
      expect(transport.onclose).toBe(closeHandler);
    });

    it('should not set handlers when not provided', () => {
      const transport = createConfiguredStdioTransport({});

      expect(transport).toBeDefined();
      // Handlers should be undefined when not provided
      expect(transport.onerror).toBeUndefined();
      expect(transport.onclose).toBeUndefined();
    });
  });

  describe('transport instance properties', () => {
    it('should have expected MCP transport properties', () => {
      const transport = createStdioTransport();

      // Check for standard transport interface properties
      expect(transport).toHaveProperty('start');
      expect(transport).toHaveProperty('close');
      expect(transport).toHaveProperty('send');

      // Check that these are functions
      expect(typeof transport.start).toBe('function');
      expect(typeof transport.close).toBe('function');
      expect(typeof transport.send).toBe('function');
    });
  });
});

describe('SSE Transport', () => {
  // Helper to create a mock ServerResponse
  function createMockResponse(): ServerResponse {
    const writable = new Writable({ write() {} });
    const res = Object.assign(writable, {
      writeHead: vi.fn(),
      setHeader: vi.fn(),
      end: vi.fn(),
      statusCode: 200,
      headersSent: false,
    }) as unknown as ServerResponse;
    return res;
  }

  describe('SSEServerTransport re-export', () => {
    it('should re-export SSEServerTransport from MCP SDK', () => {
      expect(SSEServerTransport).toBeDefined();
      expect(typeof SSEServerTransport).toBe('function');
    });
  });

  describe('createSSETransport()', () => {
    it('should create transport with basic options', () => {
      const res = createMockResponse();
      const transport = createSSETransport('/message', res);

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(SSEServerTransport);
    });

    it('should create transport with allowedHosts option', () => {
      const res = createMockResponse();
      const transport = createSSETransport('/message', res, {
        allowedHosts: ['localhost', 'example.com'],
      });

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(SSEServerTransport);
    });

    it('should create transport with allowedOrigins option', () => {
      const res = createMockResponse();
      const transport = createSSETransport('/message', res, {
        allowedOrigins: ['https://example.com', 'https://app.example.com'],
      });

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(SSEServerTransport);
    });

    it('should create transport with DNS rebinding protection enabled', () => {
      const res = createMockResponse();
      const transport = createSSETransport('/message', res, {
        allowedHosts: ['localhost'],
        enableDnsRebindingProtection: true,
      });

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(SSEServerTransport);
    });

    it('should create transport with onError handler', () => {
      const res = createMockResponse();
      const errorHandler = vi.fn();

      const transport = createSSETransport('/message', res, {
        onError: errorHandler,
      });

      expect(transport).toBeDefined();
      expect(transport.onerror).toBe(errorHandler);
    });

    it('should create transport with onClose handler', () => {
      const res = createMockResponse();
      const closeHandler = vi.fn();

      const transport = createSSETransport('/message', res, {
        onClose: closeHandler,
      });

      expect(transport).toBeDefined();
      expect(transport.onclose).toBe(closeHandler);
    });

    it('should create transport with onMessage handler', () => {
      const res = createMockResponse();
      const messageHandler = vi.fn();

      const transport = createSSETransport('/message', res, {
        onMessage: messageHandler,
      });

      expect(transport).toBeDefined();
      expect(transport.onmessage).toBe(messageHandler);
    });

    it('should create transport with all handlers', () => {
      const res = createMockResponse();
      const errorHandler = vi.fn();
      const closeHandler = vi.fn();
      const messageHandler = vi.fn();

      const transport = createSSETransport('/message', res, {
        onError: errorHandler,
        onClose: closeHandler,
        onMessage: messageHandler,
      });

      expect(transport).toBeDefined();
      expect(transport.onerror).toBe(errorHandler);
      expect(transport.onclose).toBe(closeHandler);
      expect(transport.onmessage).toBe(messageHandler);
    });

    it('should create transport with empty options', () => {
      const res = createMockResponse();
      const transport = createSSETransport('/message', res, {});

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(SSEServerTransport);
    });

    it('should create transport without options parameter', () => {
      const res = createMockResponse();
      const transport = createSSETransport('/message', res);

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(SSEServerTransport);
    });
  });

  describe('isSSEServerTransport()', () => {
    it('should return true for SSEServerTransport instance', () => {
      const res = createMockResponse();
      const transport = createSSETransport('/message', res);

      expect(isSSEServerTransport(transport)).toBe(true);
    });

    it('should return false for non-transport objects', () => {
      expect(isSSEServerTransport({})).toBe(false);
      expect(isSSEServerTransport(null)).toBe(false);
      expect(isSSEServerTransport(undefined)).toBe(false);
      expect(isSSEServerTransport('string')).toBe(false);
      expect(isSSEServerTransport(123)).toBe(false);
      expect(isSSEServerTransport([])).toBe(false);
    });

    it('should return false for StdioServerTransport', () => {
      const stdioTransport = createStdioTransport();

      expect(isSSEServerTransport(stdioTransport)).toBe(false);
    });

    it('should return false for other object types', () => {
      class FakeTransport {}
      const fake = new FakeTransport();

      expect(isSSEServerTransport(fake)).toBe(false);
    });
  });

  describe('createConfiguredSSETransport()', () => {
    it('should create transport with default options', () => {
      const res = createMockResponse();
      const transport = createConfiguredSSETransport('/message', res);

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(SSEServerTransport);
    });

    it('should create transport with all options', () => {
      const res = createMockResponse();
      const errorHandler = vi.fn();
      const closeHandler = vi.fn();
      const messageHandler = vi.fn();

      const transport = createConfiguredSSETransport('/message', res, {
        allowedHosts: ['localhost'],
        allowedOrigins: ['https://example.com'],
        enableDnsRebindingProtection: true,
        onError: errorHandler,
        onClose: closeHandler,
        onMessage: messageHandler,
      });

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(SSEServerTransport);
      expect(transport.onerror).toBe(errorHandler);
      expect(transport.onclose).toBe(closeHandler);
      expect(transport.onmessage).toBe(messageHandler);
    });

    it('should create transport with empty options', () => {
      const res = createMockResponse();
      const transport = createConfiguredSSETransport('/message', res, {});

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(SSEServerTransport);
    });
  });

  describe('handleSSEConnection()', () => {
    it('should create and start transport', async () => {
      const res = createMockResponse();

      const transport = await handleSSEConnection('/message', res);

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(SSEServerTransport);
    });

    it('should create and start transport with options', async () => {
      const res = createMockResponse();
      const errorHandler = vi.fn();

      const transport = await handleSSEConnection('/message', res, {
        allowedHosts: ['localhost'],
        onError: errorHandler,
      });

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(SSEServerTransport);
      expect(transport.onerror).toBe(errorHandler);
    });

    it('should handle transport start', async () => {
      const res = createMockResponse();

      // Should not throw when starting
      await expect(handleSSEConnection('/message', res)).resolves.toBeDefined();
    });
  });

  describe('transport instance properties', () => {
    it('should have expected MCP transport properties', () => {
      const res = createMockResponse();
      const transport = createSSETransport('/message', res);

      // Check for standard transport interface properties
      expect(transport).toHaveProperty('start');
      expect(transport).toHaveProperty('close');
      expect(transport).toHaveProperty('send');

      // Check that these are functions
      expect(typeof transport.start).toBe('function');
      expect(typeof transport.close).toBe('function');
      expect(typeof transport.send).toBe('function');
    });

    it('should have SSE-specific properties', () => {
      const res = createMockResponse();
      const transport = createSSETransport('/message', res);

      // SSE transport should have these properties
      expect(transport).toHaveProperty('handlePostMessage');
      expect(typeof transport.handlePostMessage).toBe('function');
    });
  });
});

describe('Transport Type Guards - Cross-check', () => {
  it('stdio type guard should not match SSE transport', () => {
    const res = new Writable({ write() {} }) as unknown as ServerResponse;
    const sseTransport = createSSETransport('/message', res);

    expect(isStdioServerTransport(sseTransport)).toBe(false);
  });

  it('SSE type guard should not match stdio transport', () => {
    const stdioTransport = createStdioTransport();

    expect(isSSEServerTransport(stdioTransport)).toBe(false);
  });

  it('should correctly identify transport types', () => {
    const res = new Writable({ write() {} }) as unknown as ServerResponse;

    const stdioTransport = createStdioTransport();
    const sseTransport = createSSETransport('/message', res);

    // Stdio checks
    expect(isStdioServerTransport(stdioTransport)).toBe(true);
    expect(isSSEServerTransport(stdioTransport)).toBe(false);

    // SSE checks
    expect(isSSEServerTransport(sseTransport)).toBe(true);
    expect(isStdioServerTransport(sseTransport)).toBe(false);
  });
});

describe('Transport Options and Configuration', () => {
  describe('stdio transport configuration', () => {
    it('should support custom streams for testing', () => {
      const mockStdin = new Readable({
        read() {
          // Mock implementation
        }
      });
      const mockStdout = new Writable({
        write(chunk, encoding, callback) {
          // Mock implementation
          if (callback) callback();
        }
      });

      const transport = createStdioTransport({
        stdin: mockStdin,
        stdout: mockStdout,
      });

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(StdioServerTransport);
    });

    it('should support error handling configuration', () => {
      let errorCaught = false;
      const errorHandler = (error: Error) => {
        errorCaught = true;
      };

      const transport = createConfiguredStdioTransport({
        onError: errorHandler,
      });

      expect(transport.onerror).toBe(errorHandler);
    });

    it('should support close handling configuration', () => {
      let closeCalled = false;
      const closeHandler = () => {
        closeCalled = true;
      };

      const transport = createConfiguredStdioTransport({
        onClose: closeHandler,
      });

      expect(transport.onclose).toBe(closeHandler);
    });
  });

  describe('SSE transport configuration', () => {
    it('should support DNS rebinding protection configuration', () => {
      const res = new Writable({ write() {} }) as unknown as ServerResponse;

      const transport = createSSETransport('/message', res, {
        allowedHosts: ['localhost', 'example.com'],
        allowedOrigins: ['https://example.com'],
        enableDnsRebindingProtection: true,
      });

      expect(transport).toBeDefined();
      expect(transport).toBeInstanceOf(SSEServerTransport);
    });

    it('should support message handling configuration', () => {
      const res = new Writable({ write() {} }) as unknown as ServerResponse;
      const messageHandler = vi.fn();

      const transport = createSSETransport('/message', res, {
        onMessage: messageHandler,
      });

      expect(transport.onmessage).toBe(messageHandler);
    });

    it('should support complete configuration', () => {
      const res = new Writable({ write() {} }) as unknown as ServerResponse;
      const errorHandler = vi.fn();
      const closeHandler = vi.fn();
      const messageHandler = vi.fn();

      const transport = createSSETransport('/message', res, {
        allowedHosts: ['localhost'],
        allowedOrigins: ['https://example.com'],
        enableDnsRebindingProtection: true,
        onError: errorHandler,
        onClose: closeHandler,
        onMessage: messageHandler,
      });

      expect(transport).toBeDefined();
      expect(transport.onerror).toBe(errorHandler);
      expect(transport.onclose).toBe(closeHandler);
      expect(transport.onmessage).toBe(messageHandler);
    });
  });
});
