import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
export { StdioServerTransport };
export function createStdioTransport(options) {
    return new StdioServerTransport(options?.stdin, options?.stdout);
}
export function isStdioServerTransport(transport) {
    return transport instanceof StdioServerTransport;
}
export function createConfiguredStdioTransport(options = {}) {
    const transport = new StdioServerTransport(options.stdin, options.stdout);
    if (options.onError) {
        transport.onerror = options.onError;
    }
    if (options.onClose) {
        transport.onclose = options.onClose;
    }
    return transport;
}
//# sourceMappingURL=stdio.js.map