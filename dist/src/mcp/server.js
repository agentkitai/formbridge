import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { SubmissionState } from '../types/intake-contract.js';
import { generateToolsFromIntake, parseToolName } from './tool-generator.js';
import { convertZodToJsonSchema } from '../schemas/json-schema-converter.js';
import { validateSubmission, validatePartialSubmission } from '../validation/validator.js';
import { mapToIntakeError } from '../validation/error-mapper.js';
import { SubmissionStore } from './submission-store.js';
function toRecord(error) {
    return JSON.parse(JSON.stringify(error));
}
export class FormBridgeMCPServer {
    server;
    config;
    intakes = new Map();
    tools = new Map();
    store = new SubmissionStore();
    storageBackend;
    constructor(config) {
        this.config = config;
        this.storageBackend = config.storageBackend;
        this.server = new Server({
            name: config.name,
            version: config.version
        }, {
            capabilities: {
                tools: {}
            },
            instructions: config.instructions
        });
        this.registerHandlers();
    }
    registerIntake(intake) {
        const tools = generateToolsFromIntake(intake);
        this.intakes.set(intake.id, intake);
        this.tools.set(intake.id, tools);
    }
    registerIntakes(intakes) {
        for (const intake of intakes) {
            this.registerIntake(intake);
        }
    }
    async start() {
        const transport = this.createTransport();
        await this.server.connect(transport);
    }
    createTransport() {
        const { transport } = this.config;
        switch (transport.type) {
            case 'stdio':
                return new StdioServerTransport();
            default:
                throw new Error(`Unsupported transport type: ${transport.type}`);
        }
    }
    registerHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            const tools = [];
            for (const generatedTools of this.tools.values()) {
                tools.push({
                    name: generatedTools.create.name,
                    description: generatedTools.create.description,
                    inputSchema: generatedTools.create.inputSchema
                }, {
                    name: generatedTools.set.name,
                    description: generatedTools.set.description,
                    inputSchema: generatedTools.set.inputSchema
                }, {
                    name: generatedTools.validate.name,
                    description: generatedTools.validate.description,
                    inputSchema: generatedTools.validate.inputSchema
                }, {
                    name: generatedTools.submit.name,
                    description: generatedTools.submit.description,
                    inputSchema: generatedTools.submit.inputSchema
                }, {
                    name: generatedTools.requestUpload.name,
                    description: generatedTools.requestUpload.description,
                    inputSchema: generatedTools.requestUpload.inputSchema
                }, {
                    name: generatedTools.confirmUpload.name,
                    description: generatedTools.confirmUpload.description,
                    inputSchema: generatedTools.confirmUpload.inputSchema
                });
            }
            return { tools };
        });
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            return this.handleToolCall(request.params.name, request.params.arguments ?? {});
        });
    }
    async handleToolCall(toolName, args) {
        const parsed = parseToolName(toolName);
        if (!parsed) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: 'Invalid tool name format',
                            toolName
                        })
                    }
                ],
                isError: true
            };
        }
        const { intakeId, operation } = parsed;
        const intake = this.intakes.get(intakeId);
        if (!intake) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: 'Intake not found',
                            intakeId
                        })
                    }
                ],
                isError: true
            };
        }
        let response;
        try {
            switch (operation) {
                case 'create':
                    response = await this.handleCreate(intake, args);
                    break;
                case 'set':
                    response = await this.handleSet(intake, args);
                    break;
                case 'validate':
                    response = await this.handleValidate(intake, args);
                    break;
                case 'submit':
                    response = await this.handleSubmit(intake, args);
                    break;
                case 'requestUpload':
                    response = await this.handleRequestUpload(intake, args);
                    break;
                case 'confirmUpload':
                    response = await this.handleConfirmUpload(intake, args);
                    break;
                default:
                    throw new Error(`Unknown operation: ${operation}`);
            }
        }
        catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            error: error instanceof Error ? error.message : 'Unknown error',
                            operation
                        })
                    }
                ],
                isError: true
            };
        }
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(response, null, 2)
                }
            ]
        };
    }
    async handleCreate(intake, args) {
        const { data = {}, idempotencyKey } = args;
        if (idempotencyKey) {
            const existing = this.store.getByIdempotencyKey(idempotencyKey);
            if (existing) {
                return {
                    state: existing.state,
                    submissionId: existing.submissionId,
                    message: 'Submission already exists (idempotent)',
                    resumeToken: existing.resumeToken
                };
            }
        }
        if (Object.keys(data).length > 0) {
            const validationResult = validatePartialSubmission(intake.schema, data);
            if (!validationResult.success) {
                const error = mapToIntakeError(validationResult.error, {
                    includeTimestamp: true
                });
                return error;
            }
        }
        const entry = this.store.create(intake.id, data, idempotencyKey);
        return {
            state: entry.state,
            submissionId: entry.submissionId,
            message: 'Submission created successfully',
            resumeToken: entry.resumeToken
        };
    }
    async handleSet(intake, args) {
        const { resumeToken, data } = args;
        const entry = this.store.get(resumeToken);
        if (!entry) {
            const error = {
                type: 'invalid',
                message: 'Invalid resume token',
                fields: [{
                        field: 'resumeToken',
                        message: 'Resume token not found or has expired',
                        type: 'invalid'
                    }],
                nextActions: [{
                        type: 'create',
                        description: 'Create a new submission'
                    }],
                timestamp: new Date().toISOString()
            };
            return error;
        }
        if (entry.intakeId !== intake.id) {
            const error = {
                type: 'conflict',
                message: 'Resume token belongs to a different intake form',
                fields: [{
                        field: 'resumeToken',
                        message: `Token is for intake '${entry.intakeId}', not '${intake.id}'`,
                        type: 'conflict'
                    }],
                nextActions: [{
                        type: 'create',
                        description: 'Create a new submission for this intake form'
                    }],
                timestamp: new Date().toISOString()
            };
            return error;
        }
        const mergedData = { ...entry.data, ...data };
        const validationResult = validatePartialSubmission(intake.schema, mergedData);
        if (!validationResult.success) {
            const error = mapToIntakeError(validationResult.error, {
                resumeToken,
                includeTimestamp: true
            });
            return error;
        }
        const updated = this.store.update(resumeToken, {
            data: mergedData,
            state: SubmissionState.VALIDATING
        });
        return {
            state: updated.state,
            submissionId: updated.submissionId,
            message: 'Submission updated successfully',
            resumeToken
        };
    }
    async handleValidate(intake, args) {
        const { resumeToken } = args;
        const entry = this.store.get(resumeToken);
        if (!entry) {
            const error = {
                type: 'invalid',
                message: 'Invalid resume token',
                fields: [{
                        field: 'resumeToken',
                        message: 'Resume token not found or has expired',
                        type: 'invalid'
                    }],
                nextActions: [{
                        type: 'create',
                        description: 'Create a new submission'
                    }],
                timestamp: new Date().toISOString()
            };
            return error;
        }
        if (entry.intakeId !== intake.id) {
            const error = {
                type: 'conflict',
                message: 'Resume token belongs to a different intake form',
                fields: [{
                        field: 'resumeToken',
                        message: `Token is for intake '${entry.intakeId}', not '${intake.id}'`,
                        type: 'conflict'
                    }],
                nextActions: [{
                        type: 'create',
                        description: 'Create a new submission for this intake form'
                    }],
                timestamp: new Date().toISOString()
            };
            return error;
        }
        const validationResult = validateSubmission(intake.schema, entry.data);
        if (!validationResult.success) {
            const error = mapToIntakeError(validationResult.error, {
                resumeToken,
                includeTimestamp: true
            });
            this.store.update(resumeToken, { state: SubmissionState.INVALID });
            return error;
        }
        this.store.update(resumeToken, { state: SubmissionState.VALID });
        return {
            state: SubmissionState.VALID,
            submissionId: entry.submissionId,
            message: 'Submission is valid and ready to submit',
            resumeToken
        };
    }
    async handleSubmit(intake, args) {
        const { resumeToken } = args;
        const entry = this.store.get(resumeToken);
        if (!entry) {
            const error = {
                type: 'invalid',
                message: 'Invalid resume token',
                fields: [{
                        field: 'resumeToken',
                        message: 'Resume token not found or has expired',
                        type: 'invalid'
                    }],
                nextActions: [{
                        type: 'create',
                        description: 'Create a new submission'
                    }],
                timestamp: new Date().toISOString()
            };
            return error;
        }
        if (entry.intakeId !== intake.id) {
            const error = {
                type: 'conflict',
                message: 'Resume token belongs to a different intake form',
                fields: [{
                        field: 'resumeToken',
                        message: `Token is for intake '${entry.intakeId}', not '${intake.id}'`,
                        type: 'conflict'
                    }],
                nextActions: [{
                        type: 'create',
                        description: 'Create a new submission for this intake form'
                    }],
                timestamp: new Date().toISOString()
            };
            return error;
        }
        const validationResult = validateSubmission(intake.schema, entry.data);
        if (!validationResult.success) {
            const error = mapToIntakeError(validationResult.error, {
                resumeToken,
                includeTimestamp: true
            });
            this.store.update(resumeToken, { state: SubmissionState.INVALID });
            return error;
        }
        this.store.update(resumeToken, { state: SubmissionState.SUBMITTING });
        this.store.update(resumeToken, { state: SubmissionState.COMPLETED });
        return {
            state: SubmissionState.COMPLETED,
            submissionId: entry.submissionId,
            message: `Submission completed successfully`,
            data: validationResult.data,
            timestamp: new Date().toISOString()
        };
    }
    async handleRequestUpload(intake, args) {
        const { resumeToken, field, filename, mimeType, sizeBytes } = args;
        const entry = this.store.get(resumeToken);
        if (!entry) {
            const error = {
                type: 'invalid',
                message: 'Invalid resume token',
                fields: [{
                        field: 'resumeToken',
                        message: 'Resume token not found or has expired',
                        type: 'invalid'
                    }],
                nextActions: [{
                        type: 'create',
                        description: 'Create a new submission'
                    }],
                timestamp: new Date().toISOString()
            };
            return toRecord(error);
        }
        if (entry.intakeId !== intake.id) {
            const error = {
                type: 'conflict',
                message: 'Resume token belongs to a different intake form',
                fields: [{
                        field: 'resumeToken',
                        message: `Token is for intake '${entry.intakeId}', not '${intake.id}'`,
                        type: 'conflict'
                    }],
                nextActions: [{
                        type: 'create',
                        description: 'Create a new submission for this intake form'
                    }],
                timestamp: new Date().toISOString()
            };
            return toRecord(error);
        }
        const jsonSchema = convertZodToJsonSchema(intake.schema, {
            name: intake.name,
            includeSchemaProperty: false
        });
        if (!jsonSchema.properties || !(field in jsonSchema.properties)) {
            const error = {
                type: 'invalid',
                message: `Field '${field}' not found in intake schema`,
                fields: [{
                        field: field,
                        message: `Field '${field}' does not exist in the intake definition`,
                        type: 'invalid'
                    }],
                nextActions: [{
                        type: 'validate',
                        description: 'Use a valid field name from the intake schema'
                    }],
                timestamp: new Date().toISOString()
            };
            return toRecord(error);
        }
        if (!this.storageBackend) {
            const error = {
                type: 'invalid',
                message: 'File upload not supported - storage backend not configured',
                fields: [{
                        field: field,
                        message: 'Storage backend not configured for MCP server',
                        type: 'invalid'
                    }],
                nextActions: [{
                        type: 'validate',
                        description: 'Configure storage backend in MCPServerConfig'
                    }],
                timestamp: new Date().toISOString()
            };
            return toRecord(error);
        }
        try {
            const signedUrl = await this.storageBackend.generateUploadUrl({
                intakeId: intake.id,
                submissionId: entry.submissionId,
                fieldPath: field,
                filename,
                mimeType,
                constraints: {
                    maxSize: sizeBytes,
                    allowedTypes: [mimeType],
                    maxCount: 1,
                }
            });
            if (!entry.uploads) {
                entry.uploads = {};
            }
            entry.uploads[signedUrl.uploadId] = {
                uploadId: signedUrl.uploadId,
                field,
                filename,
                mimeType,
                sizeBytes,
                status: 'pending',
                url: signedUrl.url,
            };
            this.store.update(resumeToken, { uploads: entry.uploads });
            const expiresAt = new Date(signedUrl.expiresAt);
            const now = new Date();
            const expiresInMs = expiresAt.getTime() - now.getTime();
            return {
                ok: true,
                uploadId: signedUrl.uploadId,
                method: signedUrl.method,
                url: signedUrl.url,
                expiresInMs: Math.max(0, expiresInMs),
                constraints: {
                    maxBytes: sizeBytes,
                    accept: [mimeType],
                },
            };
        }
        catch (error) {
            const err = {
                type: 'invalid',
                message: 'Failed to generate upload URL',
                fields: [{
                        field: field,
                        message: error instanceof Error ? error.message : 'Unknown error',
                        type: 'invalid'
                    }],
                nextActions: [{
                        type: 'validate',
                        description: 'Try again or contact support'
                    }],
                timestamp: new Date().toISOString()
            };
            return toRecord(err);
        }
    }
    async handleConfirmUpload(intake, args) {
        const { resumeToken, uploadId } = args;
        const entry = this.store.get(resumeToken);
        if (!entry) {
            const error = {
                type: 'invalid',
                message: 'Invalid resume token',
                fields: [{
                        field: 'resumeToken',
                        message: 'Resume token not found or has expired',
                        type: 'invalid'
                    }],
                nextActions: [{
                        type: 'create',
                        description: 'Create a new submission'
                    }],
                timestamp: new Date().toISOString()
            };
            return toRecord(error);
        }
        if (entry.intakeId !== intake.id) {
            const error = {
                type: 'conflict',
                message: 'Resume token belongs to a different intake form',
                fields: [{
                        field: 'resumeToken',
                        message: `Token is for intake '${entry.intakeId}', not '${intake.id}'`,
                        type: 'conflict'
                    }],
                nextActions: [{
                        type: 'create',
                        description: 'Create a new submission for this intake form'
                    }],
                timestamp: new Date().toISOString()
            };
            return toRecord(error);
        }
        if (!this.storageBackend) {
            const error = {
                type: 'invalid',
                message: 'File upload not supported - storage backend not configured',
                fields: [{
                        field: 'uploadId',
                        message: 'Storage backend not configured for MCP server',
                        type: 'invalid'
                    }],
                nextActions: [{
                        type: 'validate',
                        description: 'Configure storage backend in MCPServerConfig'
                    }],
                timestamp: new Date().toISOString()
            };
            return toRecord(error);
        }
        if (!entry.uploads || !entry.uploads[uploadId]) {
            const error = {
                type: 'invalid',
                message: 'Upload not found',
                fields: [{
                        field: 'uploadId',
                        message: `Upload ${uploadId} not found for this submission`,
                        type: 'invalid'
                    }],
                nextActions: [{
                        type: 'validate',
                        description: 'Request a new upload'
                    }],
                timestamp: new Date().toISOString()
            };
            return toRecord(error);
        }
        try {
            const uploadStatus = await this.storageBackend.verifyUpload(uploadId);
            const upload = entry.uploads[uploadId];
            if (uploadStatus.status === 'completed' && uploadStatus.file) {
                upload.status = 'completed';
                upload.uploadedAt = new Date();
                const downloadUrl = await this.storageBackend.generateDownloadUrl(uploadId);
                if (downloadUrl) {
                    upload.downloadUrl = downloadUrl;
                }
            }
            else if (uploadStatus.status === 'failed') {
                upload.status = 'failed';
                upload.error = uploadStatus.error;
            }
            this.store.update(resumeToken, { uploads: entry.uploads });
            return {
                ok: true,
                submissionId: entry.submissionId,
                uploadId,
                field: upload.field,
                status: upload.status,
                uploadedAt: upload.uploadedAt?.toISOString(),
                downloadUrl: upload.downloadUrl,
            };
        }
        catch (error) {
            const err = {
                type: 'invalid',
                message: 'Failed to verify upload',
                fields: [{
                        field: 'uploadId',
                        message: error instanceof Error ? error.message : 'Unknown error',
                        type: 'invalid'
                    }],
                nextActions: [{
                        type: 'validate',
                        description: 'Try again or request a new upload'
                    }],
                timestamp: new Date().toISOString()
            };
            return toRecord(err);
        }
    }
    getServer() {
        return this.server;
    }
    getIntakes() {
        return Array.from(this.intakes.values());
    }
}
//# sourceMappingURL=server.js.map