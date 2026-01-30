/**
 * Validator - JSON Schema validation with structured error reporting
 *
 * Implements:
 * - JSON Schema validation using Ajv
 * - Conversion of Ajv errors to structured FieldError[] per §3
 * - Determination of state transitions based on validation results
 * - Generation of NextAction[] suggestions for the caller
 *
 * Based on INTAKE_CONTRACT_SPEC.md v0.1.0-draft §3
 */

import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type {
  JSONSchema,
  FieldError,
  NextAction,
  FieldErrorCode,
} from '../types.js';

/**
 * Validation result containing errors and suggested next actions.
 */
export interface ValidationResult {
  /** Is the data valid according to the schema? */
  valid: boolean;
  /** Array of field-level validation errors */
  errors: FieldError[];
  /** Suggested next actions for the caller */
  nextActions: NextAction[];
  /** List of missing required fields */
  missingFields: string[];
  /** List of fields with invalid values */
  invalidFields: string[];
}

/**
 * Configuration options for the Validator.
 */
export interface ValidatorConfig {
  /** Enable strict mode (default: true) */
  strict?: boolean;
  /** Allow additional properties not in schema (default: false) */
  allowAdditionalProperties?: boolean;
  /** Enable all format validators (default: true) */
  enableFormats?: boolean;
}

/**
 * Validator class for JSON Schema validation with structured error reporting.
 *
 * Responsibilities:
 * - Validate submission data against intake schema
 * - Convert validation errors to structured FieldError format
 * - Generate actionable NextAction suggestions
 * - Track missing and invalid fields
 *
 * See §3 for error schema specification.
 */
export class Validator {
  private readonly ajv: Ajv;
  private readonly compiledSchemas: Map<string, ValidateFunction> = new Map();

  constructor(config: ValidatorConfig = {}) {
    this.ajv = new Ajv({
      strict: config.strict ?? true,
      allErrors: true, // Collect all errors, not just the first
      verbose: true, // Include schema and data in errors
      discriminator: true, // Support discriminator keyword
      allowUnionTypes: true, // Allow union types in schema
    });

    // Add format validators (email, uri, date-time, etc.)
    if (config.enableFormats ?? true) {
      addFormats(this.ajv);
    }

    // Configure additional properties handling
    if (config.allowAdditionalProperties !== undefined) {
      this.ajv.opts.strictSchema = !config.allowAdditionalProperties;
    }
  }

  /**
   * Validates data against a JSON Schema.
   *
   * @param data - The data to validate
   * @param schema - The JSON Schema to validate against
   * @returns ValidationResult with errors and next actions
   */
  validate(data: Record<string, unknown>, schema: JSONSchema): ValidationResult {
    // Get or compile the validation function
    const validate = this.getCompiledSchema(schema);

    // Run validation
    const valid = validate(data) as boolean;

    if (valid) {
      // No errors - all fields valid
      return {
        valid: true,
        errors: [],
        nextActions: [],
        missingFields: [],
        invalidFields: [],
      };
    }

    // Convert Ajv errors to our structured format
    const ajvErrors = validate.errors ?? [];
    const { errors, missingFields, invalidFields } = this.convertAjvErrors(ajvErrors, schema);
    const nextActions = this.generateNextActions(errors, schema);

    return {
      valid: false,
      errors,
      nextActions,
      missingFields,
      invalidFields,
    };
  }

  /**
   * Validates only required fields (partial validation).
   * Useful for checking if submission is ready for submission.
   *
   * @param data - The data to validate
   * @param schema - The JSON Schema to validate against
   * @returns ValidationResult focusing on required fields
   */
  validateRequired(data: Record<string, unknown>, schema: JSONSchema): ValidationResult {
    const missingFields: string[] = [];
    const errors: FieldError[] = [];

    // Check required fields at root level
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

    const nextActions = this.generateNextActions(errors, schema);

    return {
      valid: missingFields.length === 0,
      errors,
      nextActions,
      missingFields,
      invalidFields: [],
    };
  }

  /**
   * Gets or compiles a validation function for a schema.
   * Caches compiled schemas for performance.
   */
  private getCompiledSchema(schema: JSONSchema): ValidateFunction {
    // Create a stable key for the schema
    const schemaKey = this.getSchemaKey(schema);

    let validate = this.compiledSchemas.get(schemaKey);
    if (!validate) {
      validate = this.ajv.compile(schema);
      this.compiledSchemas.set(schemaKey, validate);
    }

    return validate;
  }

  /**
   * Creates a stable cache key for a schema.
   */
  private getSchemaKey(schema: JSONSchema): string {
    // Use $id if available, otherwise hash the schema
    if (schema.$id) {
      return schema.$id;
    }
    // Simple stable stringification for caching
    return JSON.stringify(schema);
  }

  /**
   * Converts Ajv ErrorObject[] to our structured FieldError[] format.
   * Implements §3 error schema specification.
   *
   * @param ajvErrors - Raw Ajv validation errors
   * @param schema - The schema being validated against
   * @returns Structured errors, missing fields, and invalid fields
   */
  private convertAjvErrors(
    ajvErrors: ErrorObject[],
    schema: JSONSchema
  ): { errors: FieldError[]; missingFields: string[]; invalidFields: string[] } {
    const errors: FieldError[] = [];
    const missingFields: string[] = [];
    const invalidFields: string[] = [];

    for (const ajvError of ajvErrors) {
      const fieldError = this.convertSingleAjvError(ajvError, schema);
      errors.push(fieldError);

      // Track missing vs invalid fields
      if (fieldError.code === 'required') {
        missingFields.push(fieldError.path);
      } else {
        invalidFields.push(fieldError.path);
      }
    }

    return { errors, missingFields, invalidFields };
  }

  /**
   * Converts a single Ajv error to our FieldError format.
   */
  private convertSingleAjvError(error: ErrorObject, schema: JSONSchema): FieldError {
    // Extract field path (remove leading slash)
    const path = error.instancePath ? error.instancePath.slice(1).replace(/\//g, '.') : '';

    // Determine error code and message based on Ajv error keyword
    const { code, message, expected, received } = this.mapAjvErrorToFieldError(error);

    return {
      path: path || this.extractFieldFromError(error),
      code,
      message,
      expected,
      received,
    };
  }

  /**
   * Maps Ajv error keywords to our FieldErrorCode taxonomy.
   */
  private mapAjvErrorToFieldError(error: ErrorObject): {
    code: FieldErrorCode;
    message: string;
    expected?: unknown;
    received?: unknown;
  } {
    const keyword = error.keyword;
    const params = error.params as any;
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

  /**
   * Extracts field name from Ajv error when instancePath is empty.
   */
  private extractFieldFromError(error: ErrorObject): string {
    if (error.keyword === 'required' && error.params) {
      const params = error.params as any;
      return params.missingProperty || '';
    }
    return '';
  }

  /**
   * Generates NextAction[] suggestions based on validation errors.
   * Implements §3 NextAction specification.
   *
   * @param errors - Validation errors
   * @param schema - The schema being validated against
   * @returns Array of suggested next actions
   */
  private generateNextActions(errors: FieldError[], schema: JSONSchema): NextAction[] {
    const nextActions: NextAction[] = [];
    const processedFields = new Set<string>();

    for (const error of errors) {
      // Avoid duplicate actions for the same field
      if (processedFields.has(error.path)) {
        continue;
      }
      processedFields.add(error.path);

      // Determine the appropriate action based on error code
      const action = this.determineAction(error, schema);
      if (action) {
        nextActions.push(action);
      }
    }

    return nextActions;
  }

  /**
   * Determines the appropriate NextAction for a field error.
   */
  private determineAction(error: FieldError, schema: JSONSchema): NextAction | null {
    const fieldSchema = this.getFieldSchema(error.path, schema);

    // Check if this is a file field
    if (fieldSchema?.format === 'uri' || fieldSchema?.contentMediaType) {
      // File upload field
      return {
        action: 'request_upload',
        field: error.path,
        hint: `Upload a file for '${error.path}'`,
        accept: fieldSchema.contentMediaType ? [fieldSchema.contentMediaType] : undefined,
        maxBytes: fieldSchema.maxLength,
      };
    }

    // Default: collect the field value
    let hint = `Please provide a value for '${error.path}'`;

    // Add more specific hints based on error type
    if (error.code === 'invalid_type' && error.expected) {
      hint = `Please provide a ${error.expected} value for '${error.path}'`;
    } else if (error.code === 'invalid_format' && typeof error.expected === 'string') {
      hint = `Please provide a value matching ${error.expected} for '${error.path}'`;
    } else if (error.code === 'invalid_value' && Array.isArray(error.expected)) {
      hint = `Please select one of: ${error.expected.join(', ')} for '${error.path}'`;
    }

    return {
      action: 'collect_field',
      field: error.path,
      hint,
    };
  }

  /**
   * Gets the schema for a specific field path.
   *
   * @param path - Dot-notation field path (e.g., "contact.email")
   * @param schema - The root schema
   * @returns The field schema or undefined
   */
  private getFieldSchema(path: string, schema: JSONSchema): JSONSchema | undefined {
    if (!path) {
      return schema;
    }

    const parts = path.split('.');
    let currentSchema: JSONSchema | undefined = schema;

    for (const part of parts) {
      if (!currentSchema?.properties) {
        return undefined;
      }
      currentSchema = currentSchema.properties[part];
    }

    return currentSchema;
  }
}
