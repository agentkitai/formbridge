import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
export { SSEServerTransport };
export function createSSETransport(endpoint, res, options) {
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
export function isSSEServerTransport(transport) {
    return transport instanceof SSEServerTransport;
}
export function createConfiguredSSETransport(endpoint, res, options = {}) {
    return createSSETransport(endpoint, res, options);
}
export async function handleSSEConnection(endpoint, res, options) {
    const transport = createSSETransport(endpoint, res, options);
    await transport.start();
    return transport;
}
export async function handleSSEMessage(transport, req, res, parsedBody) {
    await transport.handlePostMessage(req, res, parsedBody);
}
//# sourceMappingURL=sse.js.map