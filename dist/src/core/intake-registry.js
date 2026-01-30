export class IntakeNotFoundError extends Error {
    constructor(intakeId) {
        super(`Intake definition not found: ${intakeId}`);
        this.name = 'IntakeNotFoundError';
    }
}
export class IntakeDuplicateError extends Error {
    constructor(intakeId) {
        super(`Intake definition already exists: ${intakeId}. Use allowOverwrite option to replace.`);
        this.name = 'IntakeDuplicateError';
    }
}
export class IntakeValidationError extends Error {
    constructor(intakeId, reason) {
        super(`Invalid intake definition '${intakeId}': ${reason}`);
        this.name = 'IntakeValidationError';
    }
}
export class IntakeRegistry {
    intakes = new Map();
    config;
    constructor(config = {}) {
        this.config = {
            validateOnRegister: config.validateOnRegister ?? true,
            allowOverwrite: config.allowOverwrite ?? false,
        };
    }
    registerIntake(intake) {
        if (this.intakes.has(intake.id) && !this.config.allowOverwrite) {
            throw new IntakeDuplicateError(intake.id);
        }
        if (this.config.validateOnRegister) {
            this.validateIntakeDefinition(intake);
        }
        this.intakes.set(intake.id, intake);
    }
    getIntake(intakeId) {
        const intake = this.intakes.get(intakeId);
        if (!intake) {
            throw new IntakeNotFoundError(intakeId);
        }
        return intake;
    }
    hasIntake(intakeId) {
        return this.intakes.has(intakeId);
    }
    listIntakeIds() {
        return Array.from(this.intakes.keys());
    }
    listIntakes() {
        return Array.from(this.intakes.values());
    }
    unregisterIntake(intakeId) {
        return this.intakes.delete(intakeId);
    }
    getSchema(intakeId) {
        const intake = this.getIntake(intakeId);
        return intake.schema;
    }
    clear() {
        this.intakes.clear();
    }
    count() {
        return this.intakes.size;
    }
    validateIntakeDefinition(intake) {
        if (!intake.id || typeof intake.id !== 'string' || intake.id.trim() === '') {
            throw new IntakeValidationError(intake.id, 'id is required and must be a non-empty string');
        }
        if (!intake.version || typeof intake.version !== 'string') {
            throw new IntakeValidationError(intake.id, 'version is required and must be a string');
        }
        if (!intake.name || typeof intake.name !== 'string') {
            throw new IntakeValidationError(intake.id, 'name is required and must be a string');
        }
        if (!intake.schema || typeof intake.schema !== 'object') {
            throw new IntakeValidationError(intake.id, 'schema is required and must be a JSON Schema object');
        }
        if (!intake.destination || typeof intake.destination !== 'object') {
            throw new IntakeValidationError(intake.id, 'destination is required and must be an object');
        }
        this.validateSchema(intake.id, intake.schema);
        this.validateDestination(intake.id, intake.destination);
        if (intake.approvalGates) {
            this.validateApprovalGates(intake.id, intake.approvalGates);
        }
        if (intake.uiHints) {
            this.validateUIHints(intake.id, intake.uiHints);
        }
    }
    validateSchema(intakeId, schema) {
        if (!schema.type && !schema.$ref && !schema.properties) {
            throw new IntakeValidationError(intakeId, 'schema must have at least one of: type, $ref, or properties');
        }
        if (schema.properties && typeof schema.properties !== 'object') {
            throw new IntakeValidationError(intakeId, 'schema.properties must be an object');
        }
        if (schema.required && !Array.isArray(schema.required)) {
            throw new IntakeValidationError(intakeId, 'schema.required must be an array');
        }
    }
    validateDestination(intakeId, destination) {
        const validKinds = ['webhook', 'callback', 'queue'];
        if (!validKinds.includes(destination.kind)) {
            throw new IntakeValidationError(intakeId, `destination.kind must be one of: ${validKinds.join(', ')}`);
        }
        if (destination.kind === 'webhook') {
            if (!destination.url || typeof destination.url !== 'string') {
                throw new IntakeValidationError(intakeId, 'destination.url is required for webhook destinations');
            }
            try {
                new URL(destination.url);
            }
            catch {
                throw new IntakeValidationError(intakeId, 'destination.url must be a valid URL');
            }
        }
        if (destination.retryPolicy) {
            const policy = destination.retryPolicy;
            if (typeof policy.maxAttempts !== 'number' || policy.maxAttempts < 0) {
                throw new IntakeValidationError(intakeId, 'destination.retryPolicy.maxAttempts must be a non-negative number');
            }
            if (typeof policy.initialDelayMs !== 'number' || policy.initialDelayMs < 0) {
                throw new IntakeValidationError(intakeId, 'destination.retryPolicy.initialDelayMs must be a non-negative number');
            }
            if (typeof policy.backoffMultiplier !== 'number' || policy.backoffMultiplier < 1) {
                throw new IntakeValidationError(intakeId, 'destination.retryPolicy.backoffMultiplier must be >= 1');
            }
        }
    }
    validateApprovalGates(intakeId, approvalGates) {
        if (!Array.isArray(approvalGates)) {
            throw new IntakeValidationError(intakeId, 'approvalGates must be an array');
        }
        for (const gate of approvalGates) {
            if (!gate.name || typeof gate.name !== 'string') {
                throw new IntakeValidationError(intakeId, 'each approvalGate must have a name string');
            }
            if (!gate.reviewers || typeof gate.reviewers !== 'object') {
                throw new IntakeValidationError(intakeId, `approvalGate '${gate.name}' must have a reviewers object`);
            }
            if (gate.requiredApprovals !== undefined) {
                if (typeof gate.requiredApprovals !== 'number' || gate.requiredApprovals < 1) {
                    throw new IntakeValidationError(intakeId, `approvalGate '${gate.name}' requiredApprovals must be a positive number`);
                }
            }
        }
    }
    validateUIHints(intakeId, uiHints) {
        if (typeof uiHints !== 'object') {
            throw new IntakeValidationError(intakeId, 'uiHints must be an object');
        }
        if (uiHints.steps) {
            if (!Array.isArray(uiHints.steps)) {
                throw new IntakeValidationError(intakeId, 'uiHints.steps must be an array');
            }
            for (const step of uiHints.steps) {
                if (!step.id || typeof step.id !== 'string') {
                    throw new IntakeValidationError(intakeId, 'each step must have an id string');
                }
                if (!step.title || typeof step.title !== 'string') {
                    throw new IntakeValidationError(intakeId, 'each step must have a title string');
                }
                if (!Array.isArray(step.fields)) {
                    throw new IntakeValidationError(intakeId, 'each step must have a fields array');
                }
            }
        }
        if (uiHints.fieldHints) {
            if (typeof uiHints.fieldHints !== 'object') {
                throw new IntakeValidationError(intakeId, 'uiHints.fieldHints must be an object');
            }
        }
    }
}
//# sourceMappingURL=intake-registry.js.map