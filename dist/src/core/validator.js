import Ajv, {} from 'ajv';
import addFormats from 'ajv-formats';
export class Validator {
    ajv;
    compiledSchemas = new Map();
    constructor(config = {}) {
        this.ajv = new Ajv({
            strict: config.strict ?? true,
            allErrors: true,
            verbose: true,
            discriminator: true,
            allowUnionTypes: true,
        });
        if (config.enableFormats ?? true) {
            addFormats(this.ajv);
        }
        if (config.allowAdditionalProperties !== undefined) {
            this.ajv.opts.strictSchema = !config.allowAdditionalProperties;
        }
    }
    validate(data, schema, uploads) {
        const validate = this.getCompiledSchema(schema);
        const valid = validate(data);
        const ajvErrors = validate.errors ?? [];
        const { errors, missingFields, invalidFields } = this.convertAjvErrors(ajvErrors, schema);
        if (uploads) {
            const uploadErrors = this.validateUploads(data, schema, uploads);
            errors.push(...uploadErrors.errors);
            missingFields.push(...uploadErrors.missingFields);
            invalidFields.push(...uploadErrors.invalidFields);
        }
        if (valid && errors.length === 0) {
            return {
                valid: true,
                errors: [],
                nextActions: [],
                missingFields: [],
                invalidFields: [],
            };
        }
        const nextActions = this.generateNextActions(errors, schema);
        return {
            valid: false,
            errors,
            nextActions,
            missingFields,
            invalidFields,
        };
    }
    validateRequired(data, schema, uploads) {
        const missingFields = [];
        const errors = [];
        if (schema.required && Array.isArray(schema.required)) {
            for (const field of schema.required) {
                const value = data[field];
                const isPresent = value !== undefined && value !== null && value !== '';
                if (!isPresent) {
                    missingFields.push(field);
                    errors.push({
                        path: field,
                        code: 'required',
                        message: `Field '${field}' is required`,
                        expected: 'a value',
                        received: value,
                    });
                }
            }
        }
        if (uploads) {
            const uploadErrors = this.validateUploads(data, schema, uploads);
            errors.push(...uploadErrors.errors);
            missingFields.push(...uploadErrors.missingFields);
        }
        const nextActions = this.generateNextActions(errors, schema);
        return {
            valid: missingFields.length === 0,
            errors,
            nextActions,
            missingFields,
            invalidFields: [],
        };
    }
    validateUploads(_data, schema, uploads) {
        const errors = [];
        const missingFields = [];
        const invalidFields = [];
        const fileFields = this.getFileFields(schema);
        for (const fieldPath of fileFields) {
            const fieldSchema = this.getFieldSchema(fieldPath, schema);
            const isRequired = schema.required?.includes(fieldPath) ?? false;
            const fieldUploads = Object.values(uploads).filter((u) => u.field === fieldPath);
            if (fieldUploads.length === 0) {
                if (isRequired) {
                    missingFields.push(fieldPath);
                    errors.push({
                        path: fieldPath,
                        code: 'file_required',
                        message: `File upload required for '${fieldPath}'`,
                        expected: 'a completed file upload',
                        received: undefined,
                    });
                }
                continue;
            }
            for (const upload of fieldUploads) {
                if (upload.status === 'pending') {
                    if (isRequired) {
                        missingFields.push(fieldPath);
                        errors.push({
                            path: fieldPath,
                            code: 'file_required',
                            message: `File upload for '${fieldPath}' is still pending`,
                            expected: 'a completed file upload',
                            received: 'pending upload',
                        });
                    }
                }
                else if (upload.status === 'failed') {
                    invalidFields.push(fieldPath);
                    errors.push({
                        path: fieldPath,
                        code: 'file_required',
                        message: `File upload for '${fieldPath}' failed`,
                        expected: 'a completed file upload',
                        received: 'failed upload',
                    });
                }
                else if (upload.status === 'completed') {
                    if (fieldSchema) {
                        const constraintErrors = this.validateFileConstraints(fieldPath, upload, fieldSchema);
                        errors.push(...constraintErrors);
                        if (constraintErrors.length > 0) {
                            invalidFields.push(fieldPath);
                        }
                    }
                }
            }
        }
        return { errors, missingFields, invalidFields };
    }
    getFileFields(schema) {
        const fileFields = [];
        if (!schema.properties) {
            return fileFields;
        }
        for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
            if (fieldSchema && typeof fieldSchema === 'object') {
                if (fieldSchema.format === 'binary') {
                    fileFields.push(fieldName);
                }
            }
        }
        return fileFields;
    }
    validateFileConstraints(fieldPath, upload, fieldSchema) {
        const errors = [];
        if (fieldSchema.maxSize && upload.sizeBytes > fieldSchema.maxSize) {
            errors.push({
                path: fieldPath,
                code: 'file_too_large',
                message: `File '${upload.filename}' is too large (maximum: ${fieldSchema.maxSize} bytes)`,
                expected: `<= ${fieldSchema.maxSize} bytes`,
                received: `${upload.sizeBytes} bytes`,
            });
        }
        if (fieldSchema.allowedTypes && Array.isArray(fieldSchema.allowedTypes)) {
            if (!fieldSchema.allowedTypes.includes(upload.mimeType)) {
                errors.push({
                    path: fieldPath,
                    code: 'file_wrong_type',
                    message: `File '${upload.filename}' has invalid type (allowed: ${fieldSchema.allowedTypes.join(', ')})`,
                    expected: fieldSchema.allowedTypes,
                    received: upload.mimeType,
                });
            }
        }
        return errors;
    }
    getCompiledSchema(schema) {
        const schemaKey = this.getSchemaKey(schema);
        let validate = this.compiledSchemas.get(schemaKey);
        if (!validate) {
            validate = this.ajv.compile(schema);
            this.compiledSchemas.set(schemaKey, validate);
        }
        return validate;
    }
    getSchemaKey(schema) {
        if (schema.$id) {
            return schema.$id;
        }
        return JSON.stringify(schema);
    }
    convertAjvErrors(ajvErrors, schema) {
        const errors = [];
        const missingFields = [];
        const invalidFields = [];
        for (const ajvError of ajvErrors) {
            const fieldError = this.convertSingleAjvError(ajvError, schema);
            errors.push(fieldError);
            if (fieldError.code === 'required') {
                missingFields.push(fieldError.path);
            }
            else {
                invalidFields.push(fieldError.path);
            }
        }
        return { errors, missingFields, invalidFields };
    }
    convertSingleAjvError(error, _schema) {
        const path = error.instancePath ? error.instancePath.slice(1).replace(/\//g, '.') : '';
        const { code, message, expected, received } = this.mapAjvErrorToFieldError(error);
        return {
            path: path || this.extractFieldFromError(error),
            code,
            message,
            expected,
            received,
        };
    }
    mapAjvErrorToFieldError(error) {
        const keyword = error.keyword;
        const params = error.params;
        const message = error.message ?? 'Validation failed';
        switch (keyword) {
            case 'required':
                return {
                    code: 'required',
                    message: `Field '${params.missingProperty}' is required`,
                    expected: 'a value',
                    received: undefined,
                };
            case 'type':
                return {
                    code: 'invalid_type',
                    message: `Expected type '${params.type}', but received '${typeof error.data}'`,
                    expected: params.type,
                    received: typeof error.data,
                };
            case 'format':
                return {
                    code: 'invalid_format',
                    message: `Value does not match format '${params.format}'`,
                    expected: `format: ${params.format}`,
                    received: error.data,
                };
            case 'pattern':
                return {
                    code: 'invalid_format',
                    message: `Value does not match the required pattern`,
                    expected: `pattern: ${params.pattern}`,
                    received: error.data,
                };
            case 'minLength':
                return {
                    code: 'too_short',
                    message: `Value is too short (minimum length: ${params.limit})`,
                    expected: `at least ${params.limit} characters`,
                    received: `${error.data?.length ?? 0} characters`,
                };
            case 'maxLength':
                return {
                    code: 'too_long',
                    message: `Value is too long (maximum length: ${params.limit})`,
                    expected: `at most ${params.limit} characters`,
                    received: `${error.data?.length ?? 0} characters`,
                };
            case 'minimum':
            case 'exclusiveMinimum':
                return {
                    code: 'invalid_value',
                    message: `Value is too small (minimum: ${params.limit})`,
                    expected: `>= ${params.limit}`,
                    received: error.data,
                };
            case 'maximum':
            case 'exclusiveMaximum':
                return {
                    code: 'invalid_value',
                    message: `Value is too large (maximum: ${params.limit})`,
                    expected: `<= ${params.limit}`,
                    received: error.data,
                };
            case 'enum':
                return {
                    code: 'invalid_value',
                    message: `Value must be one of: ${params.allowedValues.join(', ')}`,
                    expected: params.allowedValues,
                    received: error.data,
                };
            case 'const':
                return {
                    code: 'invalid_value',
                    message: `Value must be exactly: ${params.allowedValue}`,
                    expected: params.allowedValue,
                    received: error.data,
                };
            default:
                return {
                    code: 'custom',
                    message: message,
                    expected: params,
                    received: error.data,
                };
        }
    }
    extractFieldFromError(error) {
        if (error.keyword === 'required' && error.params) {
            const params = error.params;
            return params.missingProperty || '';
        }
        return '';
    }
    generateNextActions(errors, schema) {
        const nextActions = [];
        const processedFields = new Set();
        for (const error of errors) {
            if (processedFields.has(error.path)) {
                continue;
            }
            processedFields.add(error.path);
            const action = this.determineAction(error, schema);
            if (action) {
                nextActions.push(action);
            }
        }
        return nextActions;
    }
    determineAction(error, schema) {
        const fieldSchema = this.getFieldSchema(error.path, schema);
        const isFileField = fieldSchema?.format === 'binary' ||
            error.code === 'file_required' ||
            error.code === 'file_too_large' ||
            error.code === 'file_wrong_type';
        if (isFileField) {
            return {
                action: 'request_upload',
                field: error.path,
                hint: `Upload a file for '${error.path}'`,
                accept: fieldSchema?.allowedTypes,
                maxBytes: fieldSchema?.maxSize,
            };
        }
        let hint = `Please provide a value for '${error.path}'`;
        if (error.code === 'invalid_type' && error.expected) {
            hint = `Please provide a ${error.expected} value for '${error.path}'`;
        }
        else if (error.code === 'invalid_format' && typeof error.expected === 'string') {
            hint = `Please provide a value matching ${error.expected} for '${error.path}'`;
        }
        else if (error.code === 'invalid_value' && Array.isArray(error.expected)) {
            hint = `Please select one of: ${error.expected.join(', ')} for '${error.path}'`;
        }
        return {
            action: 'collect_field',
            field: error.path,
            hint,
        };
    }
    getFieldSchema(path, schema) {
        if (!path) {
            return schema;
        }
        const parts = path.split('.');
        let currentSchema = schema;
        for (const part of parts) {
            if (!currentSchema?.properties) {
                return undefined;
            }
            currentSchema = currentSchema.properties[part];
        }
        return currentSchema;
    }
}
//# sourceMappingURL=validator.js.map