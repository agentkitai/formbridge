export var TransportType;
(function (TransportType) {
    TransportType["STDIO"] = "stdio";
    TransportType["SSE"] = "sse";
})(TransportType || (TransportType = {}));
export var ToolOperation;
(function (ToolOperation) {
    ToolOperation["CREATE"] = "create";
    ToolOperation["SET"] = "set";
    ToolOperation["VALIDATE"] = "validate";
    ToolOperation["SUBMIT"] = "submit";
    ToolOperation["REQUEST_UPLOAD"] = "requestUpload";
    ToolOperation["CONFIRM_UPLOAD"] = "confirmUpload";
})(ToolOperation || (ToolOperation = {}));
export function isStdioTransport(config) {
    return config.type === TransportType.STDIO;
}
export function isSSETransport(config) {
    return config.type === TransportType.SSE;
}
//# sourceMappingURL=mcp-types.js.map