import type { IntakeDefinition, JSONSchema } from '../types.js';
export interface IntakeRegistryConfig {
    validateOnRegister?: boolean;
    allowOverwrite?: boolean;
}
export declare class IntakeNotFoundError extends Error {
    constructor(intakeId: string);
}
export declare class IntakeDuplicateError extends Error {
    constructor(intakeId: string);
}
export declare class IntakeValidationError extends Error {
    constructor(intakeId: string, reason: string);
}
export declare class IntakeRegistry {
    private readonly intakes;
    private readonly config;
    constructor(config?: IntakeRegistryConfig);
    registerIntake(intake: IntakeDefinition): void;
    getIntake(intakeId: string): IntakeDefinition;
    hasIntake(intakeId: string): boolean;
    listIntakeIds(): string[];
    listIntakes(): IntakeDefinition[];
    unregisterIntake(intakeId: string): boolean;
    getSchema(intakeId: string): JSONSchema;
    clear(): void;
    count(): number;
    private validateIntakeDefinition;
    private validateSchema;
    private validateDestination;
    private validateApprovalGates;
    private validateUIHints;
}
//# sourceMappingURL=intake-registry.d.ts.map