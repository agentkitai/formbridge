import { zodToJsonSchema } from 'zod-to-json-schema';
export function convertZodToJsonSchema(zodSchema, options = {}) {
    const { name, description, target = 'jsonSchema2019-09', includeSchemaProperty = true, markAllPropertiesAsOptional = false, removeAdditionalProperties = false } = options;
    let jsonSchema = zodToJsonSchema(zodSchema, {
        name,
        target,
        $refStrategy: 'none',
        errorMessages: false
    });
    if (name && '$ref' in jsonSchema && 'definitions' in jsonSchema) {
        const schemaWithRefs = jsonSchema;
        const refName = schemaWithRefs.$ref.replace('#/definitions/', '');
        if (schemaWithRefs.definitions[refName]) {
            jsonSchema = schemaWithRefs.definitions[refName];
            jsonSchema.title = name;
        }
    }
    if (name && !jsonSchema.title) {
        jsonSchema.title = name;
    }
    if (description) {
        jsonSchema.description = description;
    }
    if (includeSchemaProperty) {
        jsonSchema.$schema = 'https://json-schema.org/draft/2020-12/schema';
    }
    else {
        delete jsonSchema.$schema;
    }
    if (markAllPropertiesAsOptional && jsonSchema.required) {
        delete jsonSchema.required;
    }
    if (removeAdditionalProperties && 'additionalProperties' in jsonSchema) {
        jsonSchema.additionalProperties = true;
    }
    return jsonSchema;
}
export function isJsonSchema(obj) {
    if (!obj || typeof obj !== 'object') {
        return false;
    }
    const schema = obj;
    return (typeof schema.type === 'string' ||
        typeof schema.properties === 'object' ||
        Array.isArray(schema.anyOf) ||
        Array.isArray(schema.allOf) ||
        Array.isArray(schema.oneOf));
}
export function extractRequiredFields(schema) {
    return schema.required || [];
}
export function extractPropertyNames(schema) {
    if (!schema.properties) {
        return [];
    }
    return Object.keys(schema.properties);
}
export function getFieldDescription(schema, fieldName) {
    if (!schema.properties || !schema.properties[fieldName]) {
        return undefined;
    }
    return schema.properties[fieldName].description;
}
export function extractFieldDescriptions(schema) {
    if (!schema.properties) {
        return {};
    }
    const descriptions = {};
    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
        if (fieldSchema.description) {
            descriptions[fieldName] = fieldSchema.description;
        }
    }
    return descriptions;
}
export function isFieldRequired(schema, fieldName) {
    return extractRequiredFields(schema).includes(fieldName);
}
//# sourceMappingURL=json-schema-converter.js.map