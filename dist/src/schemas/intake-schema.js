export function isIntakeDefinition(obj) {
    if (!obj || typeof obj !== 'object') {
        return false;
    }
    const def = obj;
    return (typeof def.id === 'string' &&
        typeof def.version === 'string' &&
        typeof def.name === 'string' &&
        def.schema !== undefined &&
        typeof def.schema === 'object' &&
        '_def' in def.schema &&
        def.destination !== undefined &&
        typeof def.destination === 'object');
}
export function validateIntakeDefinition(definition) {
    const errors = [];
    if (!definition.id) {
        errors.push('IntakeDefinition.id is required');
    }
    else if (!/^[a-z][a-z0-9_]*$/.test(definition.id)) {
        errors.push('IntakeDefinition.id must be lowercase with underscores (e.g., "vendor_onboarding")');
    }
    if (!definition.version) {
        errors.push('IntakeDefinition.version is required');
    }
    else if (!/^\d+\.\d+\.\d+(-[a-z0-9]+)?$/.test(definition.version)) {
        errors.push('IntakeDefinition.version must follow semantic versioning (e.g., "1.0.0")');
    }
    if (!definition.name) {
        errors.push('IntakeDefinition.name is required');
    }
    if (!definition.schema) {
        errors.push('IntakeDefinition.schema is required');
    }
    if (!definition.destination) {
        errors.push('IntakeDefinition.destination is required');
    }
    else {
        const dest = definition.destination;
        if (!dest.type) {
            errors.push('IntakeDefinition.destination.type is required');
        }
        if (!dest.name) {
            errors.push('IntakeDefinition.destination.name is required');
        }
        if (!dest.config || typeof dest.config !== 'object') {
            errors.push('IntakeDefinition.destination.config must be an object');
        }
    }
    return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined
    };
}
//# sourceMappingURL=intake-schema.js.map