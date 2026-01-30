import { Hono } from 'hono';
import type { Context } from 'hono';
import type { IntakeRegistry } from '../core/intake-registry.js';
import type { JSONSchema } from '../types.js';
export interface GetSchemaResponse {
    ok: boolean;
    intakeId: string;
    schema: JSONSchema;
}
export interface IntakeErrorResponse {
    ok: false;
    error: {
        type: 'not_found' | 'internal_error';
        message: string;
    };
}
export declare function createIntakeRouter(registry: IntakeRegistry): Hono;
export declare function createGetSchemaHandler(registry: IntakeRegistry): (c: Context) => Promise<(Response & import("hono").TypedResponse<{
    ok: boolean;
    intakeId: string;
    schema: {
        $schema?: string | undefined;
        $id?: string | undefined;
        title?: string | undefined;
        description?: string | undefined;
        type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null" | undefined;
        properties?: {
            [x: string]: any;
        } | undefined;
        required?: string[] | undefined;
        items?: any | undefined;
        enum?: import("hono/utils/types").JSONValue[] | undefined;
        const?: import("hono/utils/types").JSONValue | undefined;
        format?: string | undefined;
        pattern?: string | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        minimum?: number | undefined;
        maximum?: number | undefined;
        additionalProperties?: boolean | any | undefined;
        $ref?: string | undefined;
        $defs?: {
            [x: string]: any;
        } | undefined;
        allOf?: any[] | undefined;
        anyOf?: any[] | undefined;
        oneOf?: any[] | undefined;
        not?: any | undefined;
        maxSize?: number | undefined;
        allowedTypes?: string[] | undefined;
        maxCount?: number | undefined;
    };
}, 200, "json">) | (Response & import("hono").TypedResponse<{
    ok: false;
    error: {
        type: "not_found" | "internal_error";
        message: string;
    };
}, 404, "json">) | (Response & import("hono").TypedResponse<{
    ok: false;
    error: {
        type: "not_found" | "internal_error";
        message: string;
    };
}, 500, "json">)>;
//# sourceMappingURL=intake.d.ts.map