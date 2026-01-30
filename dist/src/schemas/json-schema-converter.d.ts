import type { z } from 'zod';
export interface JsonSchema {
    $schema?: string;
    type?: string;
    title?: string;
    description?: string;
    properties?: Record<string, JsonSchema>;
    required?: string[];
    additionalProperties?: boolean | JsonSchema;
    items?: JsonSchema | JsonSchema[];
    enum?: unknown[];
    const?: unknown;
    anyOf?: JsonSchema[];
    allOf?: JsonSchema[];
    oneOf?: JsonSchema[];
    not?: JsonSchema;
    [key: string]: unknown;
}
export interface ConversionOptions {
    name?: string;
    description?: string;
    target?: 'jsonSchema7' | 'jsonSchema2019-09' | 'openApi3';
    includeSchemaProperty?: boolean;
    markAllPropertiesAsOptional?: boolean;
    removeAdditionalProperties?: boolean;
    errorMessages?: Record<string, string>;
}
export declare function convertZodToJsonSchema(zodSchema: z.ZodType<any>, options?: ConversionOptions): JsonSchema;
export declare function isJsonSchema(obj: unknown): obj is JsonSchema;
export declare function extractRequiredFields(schema: JsonSchema): string[];
export declare function extractPropertyNames(schema: JsonSchema): string[];
export declare function getFieldDescription(schema: JsonSchema, fieldName: string): string | undefined;
export declare function extractFieldDescriptions(schema: JsonSchema): Record<string, string>;
export declare function isFieldRequired(schema: JsonSchema, fieldName: string): boolean;
//# sourceMappingURL=json-schema-converter.d.ts.map