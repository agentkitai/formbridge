export function getFieldValue(fields, path) {
    const parts = path.split(".");
    let current = fields;
    for (const part of parts) {
        if (current === null || current === undefined)
            return undefined;
        if (typeof current !== "object")
            return undefined;
        current = current[part];
    }
    return current;
}
export function isCompositeCondition(condition) {
    return "logic" in condition && "conditions" in condition;
}
export function evaluateFieldCondition(condition, fields) {
    const fieldValue = getFieldValue(fields, condition.when);
    switch (condition.operator) {
        case "eq":
            return fieldValue === condition.value;
        case "neq":
            return fieldValue !== condition.value;
        case "in":
            if (!Array.isArray(condition.value))
                return false;
            return condition.value.includes(fieldValue);
        case "notIn":
            if (!Array.isArray(condition.value))
                return true;
            return !condition.value.includes(fieldValue);
        case "gt":
            return typeof fieldValue === "number" && typeof condition.value === "number"
                ? fieldValue > condition.value
                : false;
        case "gte":
            return typeof fieldValue === "number" && typeof condition.value === "number"
                ? fieldValue >= condition.value
                : false;
        case "lt":
            return typeof fieldValue === "number" && typeof condition.value === "number"
                ? fieldValue < condition.value
                : false;
        case "lte":
            return typeof fieldValue === "number" && typeof condition.value === "number"
                ? fieldValue <= condition.value
                : false;
        case "exists":
            return fieldValue !== undefined && fieldValue !== null;
        case "notExists":
            return fieldValue === undefined || fieldValue === null;
        case "matches":
            if (typeof fieldValue !== "string" || typeof condition.value !== "string")
                return false;
            try {
                return new RegExp(condition.value).test(fieldValue);
            }
            catch {
                return false;
            }
        default:
            return false;
    }
}
export function evaluateCompositeCondition(condition, fields) {
    const results = condition.conditions.map((c) => evaluateCondition(c, fields));
    if (condition.logic === "and") {
        return results.every(Boolean);
    }
    return results.some(Boolean);
}
export function evaluateCondition(condition, fields) {
    if (isCompositeCondition(condition)) {
        return evaluateCompositeCondition(condition, fields);
    }
    return evaluateFieldCondition(condition, fields);
}
export function evaluateConditions(conditions, fields, schemaRequired = false) {
    const result = {
        visible: true,
        required: schemaRequired,
        validationEnabled: true,
    };
    if (!conditions || conditions.length === 0) {
        return result;
    }
    const visibilityConditions = conditions.filter((c) => c.effect === "visible");
    const requiredConditions = conditions.filter((c) => c.effect === "required");
    const validationConditions = conditions.filter((c) => c.effect === "validation");
    if (visibilityConditions.length > 0) {
        result.visible = visibilityConditions.every((c) => evaluateCondition(c, fields));
    }
    if (!result.visible) {
        result.required = false;
        result.validationEnabled = false;
        return result;
    }
    if (requiredConditions.length > 0) {
        result.required = requiredConditions.some((c) => evaluateCondition(c, fields));
    }
    if (validationConditions.length > 0) {
        result.validationEnabled = validationConditions.every((c) => evaluateCondition(c, fields));
    }
    return result;
}
export function detectCircularConditions(fieldConditions) {
    const cycles = [];
    const visited = new Set();
    const path = [];
    function extractDependencies(conditions) {
        const deps = [];
        for (const condition of conditions) {
            if (isCompositeCondition(condition)) {
                deps.push(...extractDependencies(condition.conditions));
            }
            else {
                deps.push(condition.when);
            }
        }
        return deps;
    }
    function dfs(field) {
        if (path.includes(field)) {
            const cycleStart = path.indexOf(field);
            cycles.push([...path.slice(cycleStart), field]);
            return;
        }
        if (visited.has(field))
            return;
        path.push(field);
        const conditions = fieldConditions[field];
        if (conditions) {
            const deps = extractDependencies(conditions);
            for (const dep of deps) {
                dfs(dep);
            }
        }
        path.pop();
        visited.add(field);
    }
    for (const field of Object.keys(fieldConditions)) {
        visited.clear();
        dfs(field);
    }
    return cycles;
}
//# sourceMappingURL=condition-evaluator.js.map