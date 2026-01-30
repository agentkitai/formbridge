import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { convertZodToJsonSchema } from "../schemas/json-schema-converter.js";
export function registerTools(server, submissionManager) {
    server.tool("handoffToHuman", "Generate a shareable resume URL for agent-to-human handoff. Returns a URL that a human can open to complete the submission.", {
        submissionId: z.string().describe("The submission ID to generate a handoff URL for"),
        actor: z.object({
            kind: z.enum(["agent", "human", "system"]).describe("Type of actor requesting the handoff"),
            id: z.string().describe("Unique identifier for the actor"),
            name: z.string().optional().describe("Display name of the actor"),
            metadata: z.record(z.unknown()).optional().describe("Additional actor metadata"),
        }).optional().describe("Actor requesting the handoff (defaults to system actor)"),
    }, async ({ submissionId, actor }) => {
        try {
            const handoffActor = actor || {
                kind: "system",
                id: "mcp-server",
                name: "MCP Server",
            };
            const resumeUrl = await submissionManager.generateHandoffUrl(submissionId, handoffActor);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            ok: true,
                            submissionId,
                            resumeUrl,
                            message: "Handoff URL generated successfully. Share this URL with a human to complete the submission.",
                        }, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            ok: false,
                            submissionId,
                            error: errorMessage,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    });
    server.tool("requestUpload", "Request a signed URL to upload a file for a submission. Provide file metadata (field name, filename, MIME type, size) and receive a signed URL with upload constraints.", {
        submissionId: z.string().describe("The submission ID to upload a file for"),
        resumeToken: z.string().describe("Resume token from previous create or set call"),
        field: z.string().describe("Dot-path to the file field (e.g., 'documents.w9_form')"),
        filename: z.string().describe("Name of the file to upload"),
        mimeType: z.string().describe("MIME type of the file (e.g., 'application/pdf', 'image/jpeg')"),
        sizeBytes: z.number().describe("Size of the file in bytes"),
        intakeId: z.string().describe("The intake definition ID for schema validation"),
        actor: z.object({
            kind: z.enum(["agent", "human", "system"]).describe("Type of actor"),
            id: z.string().describe("Unique identifier for the actor"),
            name: z.string().optional().describe("Display name of the actor"),
            metadata: z.record(z.unknown()).optional().describe("Additional actor metadata"),
        }).optional().describe("Actor requesting the upload (defaults to system actor)"),
    }, async ({ submissionId, resumeToken, field, filename, mimeType, sizeBytes, intakeId, actor }) => {
        try {
            const uploadActor = actor || {
                kind: "system",
                id: "mcp-server",
                name: "MCP Server",
            };
            const intakeDefinition = {
                id: intakeId,
                version: "1.0.0",
                name: intakeId,
                schema: {},
                destination: { kind: "webhook" },
            };
            const result = await submissionManager.requestUpload({
                submissionId,
                resumeToken,
                field,
                filename,
                mimeType,
                sizeBytes,
                actor: uploadActor,
            }, intakeDefinition);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            ok: false,
                            submissionId,
                            error: errorMessage,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    });
    server.tool("confirmUpload", "Confirm completion of a file upload. Call this after successfully uploading a file to the signed URL received from requestUpload. The system will verify the upload and update the submission status.", {
        submissionId: z.string().describe("The submission ID"),
        resumeToken: z.string().describe("Resume token from previous requestUpload call"),
        uploadId: z.string().describe("Upload ID returned from requestUpload"),
        actor: z.object({
            kind: z.enum(["agent", "human", "system"]).describe("Type of actor"),
            id: z.string().describe("Unique identifier for the actor"),
            name: z.string().optional().describe("Display name of the actor"),
            metadata: z.record(z.unknown()).optional().describe("Additional actor metadata"),
        }).optional().describe("Actor confirming the upload (defaults to system actor)"),
    }, async ({ submissionId, resumeToken, uploadId, actor }) => {
        try {
            const confirmActor = actor || {
                kind: "system",
                id: "mcp-server",
                name: "MCP Server",
            };
            const result = await submissionManager.confirmUpload({
                submissionId,
                resumeToken,
                uploadId,
                actor: confirmActor,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            ok: false,
                            submissionId,
                            error: errorMessage,
                        }, null, 2),
                    },
                ],
                isError: true,
            };
        }
    });
}
export function createMcpServer(submissionManager, options) {
    const server = new McpServer({
        name: options?.name || "@formbridge/mcp-server",
        version: options?.version || "0.1.0",
    });
    registerTools(server, submissionManager);
    return server;
}
export function generateToolsFromIntake(intake, options = {}) {
    const { includeOptionalFields = true, includeConstraints = true, maxFieldsInDescription = 10 } = options;
    const jsonSchema = convertZodToJsonSchema(intake.schema, {
        name: intake.name,
        description: intake.description,
        includeSchemaProperty: false
    });
    const fieldDescriptions = extractFieldDescriptions(jsonSchema);
    const requiredFields = jsonSchema.required || [];
    const allFields = Object.keys(jsonSchema.properties || {});
    const toolPrefix = intake.id;
    const create = generateCreateTool(toolPrefix, intake.name, intake.description, jsonSchema, fieldDescriptions, requiredFields, allFields, { includeOptionalFields, includeConstraints, maxFieldsInDescription });
    const set = generateSetTool(toolPrefix, intake.name, intake.description, jsonSchema, fieldDescriptions, allFields, { includeOptionalFields, includeConstraints, maxFieldsInDescription });
    const validate = generateValidateTool(toolPrefix, intake.name, intake.description);
    const submit = generateSubmitTool(toolPrefix, intake.name, intake.description, requiredFields);
    const requestUpload = generateRequestUploadTool(toolPrefix, intake.name, intake.description);
    const confirmUpload = generateConfirmUploadTool(toolPrefix, intake.name, intake.description);
    return { create, set, validate, submit, requestUpload, confirmUpload };
}
function generateCreateTool(toolPrefix, intakeName, intakeDescription, jsonSchema, fieldDescriptions, requiredFields, allFields, options) {
    const toolName = `${toolPrefix}_create`;
    const description = generateToolDescription('create', intakeName, intakeDescription, fieldDescriptions, requiredFields, allFields, options);
    const inputSchema = {
        type: 'object',
        properties: {
            data: {
                type: 'object',
                description: 'Initial submission data (all fields optional)',
                properties: jsonSchema.properties || {},
                additionalProperties: false
            },
            idempotencyKey: {
                type: 'string',
                description: 'Optional idempotency key for safe retries'
            }
        },
        additionalProperties: false
    };
    return {
        name: toolName,
        description,
        inputSchema
    };
}
function generateSetTool(toolPrefix, intakeName, intakeDescription, jsonSchema, fieldDescriptions, allFields, options) {
    const toolName = `${toolPrefix}_set`;
    const description = generateToolDescription('set', intakeName, intakeDescription, fieldDescriptions, [], allFields, options);
    const inputSchema = {
        type: 'object',
        properties: {
            resumeToken: {
                type: 'string',
                description: 'Resume token from previous create or set call'
            },
            data: {
                type: 'object',
                description: 'Field values to set or update',
                properties: jsonSchema.properties || {},
                additionalProperties: false
            }
        },
        required: ['resumeToken', 'data'],
        additionalProperties: false
    };
    return {
        name: toolName,
        description,
        inputSchema
    };
}
function generateValidateTool(toolPrefix, intakeName, intakeDescription) {
    const toolName = `${toolPrefix}_validate`;
    const baseDescription = intakeDescription || intakeName;
    const description = `Validate the current state of ${baseDescription} without submitting. Returns validation errors if any fields are missing or invalid, or confirms the submission is ready to submit.`;
    const inputSchema = {
        type: 'object',
        properties: {
            resumeToken: {
                type: 'string',
                description: 'Resume token from previous create or set call'
            }
        },
        required: ['resumeToken'],
        additionalProperties: false
    };
    return {
        name: toolName,
        description,
        inputSchema
    };
}
function generateSubmitTool(toolPrefix, intakeName, intakeDescription, requiredFields) {
    const toolName = `${toolPrefix}_submit`;
    const baseDescription = intakeDescription || intakeName;
    const requiredFieldsList = requiredFields.length > 0
        ? ` Required fields: ${requiredFields.join(', ')}.`
        : '';
    const description = `Submit the completed ${baseDescription}.${requiredFieldsList} Returns success confirmation or validation errors if the submission is incomplete.`;
    const inputSchema = {
        type: 'object',
        properties: {
            resumeToken: {
                type: 'string',
                description: 'Resume token from previous create or set call'
            }
        },
        required: ['resumeToken'],
        additionalProperties: false
    };
    return {
        name: toolName,
        description,
        inputSchema
    };
}
function generateRequestUploadTool(toolPrefix, intakeName, intakeDescription) {
    const toolName = `${toolPrefix}_requestUpload`;
    const baseDescription = intakeDescription || intakeName;
    const description = `Request a signed URL to upload a file for ${baseDescription}. Provide file metadata (field name, filename, MIME type, size) and receive a signed URL with upload constraints. Use this before uploading files to the submission.`;
    const inputSchema = {
        type: 'object',
        properties: {
            resumeToken: {
                type: 'string',
                description: 'Resume token from previous create or set call'
            },
            field: {
                type: 'string',
                description: 'Dot-path to the file field (e.g., "documents.w9_form")'
            },
            filename: {
                type: 'string',
                description: 'Name of the file to upload'
            },
            mimeType: {
                type: 'string',
                description: 'MIME type of the file (e.g., "application/pdf", "image/jpeg")'
            },
            sizeBytes: {
                type: 'number',
                description: 'Size of the file in bytes'
            }
        },
        required: ['resumeToken', 'field', 'filename', 'mimeType', 'sizeBytes'],
        additionalProperties: false
    };
    return {
        name: toolName,
        description,
        inputSchema
    };
}
function generateConfirmUploadTool(toolPrefix, intakeName, intakeDescription) {
    const toolName = `${toolPrefix}_confirmUpload`;
    const baseDescription = intakeDescription || intakeName;
    const description = `Confirm completion of a file upload for ${baseDescription}. Call this after successfully uploading a file to the signed URL received from requestUpload. The system will verify the upload and update the submission status.`;
    const inputSchema = {
        type: 'object',
        properties: {
            resumeToken: {
                type: 'string',
                description: 'Resume token from previous create or set call'
            },
            uploadId: {
                type: 'string',
                description: 'Upload ID returned from requestUpload'
            }
        },
        required: ['resumeToken', 'uploadId'],
        additionalProperties: false
    };
    return {
        name: toolName,
        description,
        inputSchema
    };
}
function generateToolDescription(operation, intakeName, intakeDescription, fieldDescriptions, requiredFields, allFields, options) {
    const baseDescription = intakeDescription || intakeName;
    const operationVerb = operation === 'create' ? 'Create' : 'Update';
    let description = `${operationVerb} a ${baseDescription} submission.`;
    const fieldsToDescribe = options.includeOptionalFields
        ? allFields
        : requiredFields;
    if (fieldsToDescribe.length > 0) {
        const maxFields = Math.min(fieldsToDescribe.length, options.maxFieldsInDescription);
        const displayFields = fieldsToDescribe.slice(0, maxFields);
        description += ' Fields:';
        for (const field of displayFields) {
            const isRequired = requiredFields.includes(field);
            const fieldDesc = fieldDescriptions[field];
            const requiredLabel = isRequired ? ' (required)' : '';
            if (fieldDesc) {
                description += ` ${field}${requiredLabel} - ${fieldDesc};`;
            }
            else {
                description += ` ${field}${requiredLabel};`;
            }
        }
        if (fieldsToDescribe.length > maxFields) {
            const remaining = fieldsToDescribe.length - maxFields;
            description += ` and ${remaining} more field${remaining === 1 ? '' : 's'}.`;
        }
    }
    return description;
}
function extractFieldDescriptions(jsonSchema) {
    const descriptions = {};
    if (!jsonSchema.properties) {
        return descriptions;
    }
    for (const [fieldName, fieldSchema] of Object.entries(jsonSchema.properties)) {
        if (fieldSchema.description) {
            descriptions[fieldName] = fieldSchema.description;
        }
    }
    return descriptions;
}
export function generateToolName(intakeId, operation) {
    return `${intakeId}_${operation}`;
}
export function parseToolName(toolName) {
    const lastUnderscoreIndex = toolName.lastIndexOf('_');
    if (lastUnderscoreIndex === -1) {
        return null;
    }
    const intakeId = toolName.substring(0, lastUnderscoreIndex);
    const operation = toolName.substring(lastUnderscoreIndex + 1);
    const validOperations = ['create', 'set', 'validate', 'submit', 'requestUpload', 'confirmUpload'];
    if (!validOperations.includes(operation)) {
        return null;
    }
    return { intakeId, operation };
}
//# sourceMappingURL=tool-generator.js.map