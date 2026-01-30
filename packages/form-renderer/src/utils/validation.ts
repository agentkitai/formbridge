/**
 * Client-side validation utility using AJV
 * Validates form data against IntakeSchema (JSON Schema)
 */

import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { IntakeSchema, FormData, FieldPath } from '../types/schema';
import { FieldError, ValidationResult } from '../types/error';

/**
 * AJV instance with format validation enabled
 */
const ajv = new Ajv({
  allErrors: true, // Collect all errors, not just the first one
  verbose: true, // Include schema and data in errors
  strict: false, // Allow unknown keywords (for UI hints, etc.)
  coerceTypes: false, // Don't coerce types - maintain data integrity
  useDefaults: false, // Don't apply defaults during validation
});

// Add format validators (email, uri, date, etc.)
addFormats(ajv);

/**
 * Cache for compiled validators
 * Key: schema ID or stringified schema
 */
const validatorCache = new Map<string, ValidateFunction>();

/**
 * Get or create a validator for a schema
 * @param schema - The IntakeSchema to validate against
 * @returns Compiled AJV validator
 */
function getValidator(schema: IntakeSchema): ValidateFunction {
  // Use schema.$id as cache key if available, otherwise use stringified schema
  const cacheKey = schema.$id || JSON.stringify(schema);

  let validator = validatorCache.get(cacheKey);
  if (!validator) {
    validator = ajv.compile(schema);
    validatorCache.set(cacheKey, validator);
  }

  return validator;
}

/**
 * Convert AJV error to FieldError format
 * @param error - AJV error object
 * @returns Field error
 */
function convertAjvError(error: ErrorObject): FieldError {
  // Extract field path from instancePath (e.g., "/address/city" -> "address.city")
  const path = error.instancePath
    .replace(/^\//, '') // Remove leading slash
    .replace(/\//g, '.') // Convert slashes to dots
    .replace(/\[(\d+)\]/g, '[$1]'); // Keep array indices as [0], [1], etc.

  // Determine error code based on AJV keyword
  let code: FieldError['code'] = 'invalid_value';
  let message = error.message || 'Invalid value';
  let expected: unknown = undefined;
  let received: unknown = error.data;

  switch (error.keyword) {
    case 'required':
      code = 'required';
      // For required errors, the field path is in params.missingProperty
      const missingField = error.params.missingProperty;
      const fullPath = path ? `${path}.${missingField}` : missingField;
      message = `${formatFieldName(fullPath)} is required`;
      return {
        path: fullPath,
        code,
        message,
        expected: 'value',
        received: undefined,
      };

    case 'type':
      code = 'invalid_type';
      expected = error.params.type;
      message = `${formatFieldName(path)} must be ${expected}`;
      break;

    case 'format':
      code = 'invalid_format';
      expected = error.params.format;
      message = `${formatFieldName(path)} must be a valid ${expected}`;
      break;

    case 'minLength':
      code = 'too_short';
      expected = error.params.limit;
      message = `${formatFieldName(path)} must be at least ${expected} characters`;
      break;

    case 'maxLength':
      code = 'too_long';
      expected = error.params.limit;
      message = `${formatFieldName(path)} must be at most ${expected} characters`;
      break;

    case 'minimum':
      code = 'invalid_value';
      expected = `>= ${error.params.limit}`;
      message = `${formatFieldName(path)} must be at least ${error.params.limit}`;
      break;

    case 'maximum':
      code = 'invalid_value';
      expected = `<= ${error.params.limit}`;
      message = `${formatFieldName(path)} must be at most ${error.params.limit}`;
      break;

    case 'exclusiveMinimum':
      code = 'invalid_value';
      expected = `> ${error.params.limit}`;
      message = `${formatFieldName(path)} must be greater than ${error.params.limit}`;
      break;

    case 'exclusiveMaximum':
      code = 'invalid_value';
      expected = `< ${error.params.limit}`;
      message = `${formatFieldName(path)} must be less than ${error.params.limit}`;
      break;

    case 'multipleOf':
      code = 'invalid_value';
      expected = `multiple of ${error.params.multipleOf}`;
      message = `${formatFieldName(path)} must be a multiple of ${error.params.multipleOf}`;
      break;

    case 'enum':
      code = 'invalid_value';
      expected = error.params.allowedValues;
      message = `${formatFieldName(path)} must be one of: ${error.params.allowedValues.join(', ')}`;
      break;

    case 'pattern':
      code = 'invalid_format';
      expected = error.params.pattern;
      message = `${formatFieldName(path)} format is invalid`;
      break;

    case 'minItems':
      code = 'invalid_value';
      expected = `>= ${error.params.limit} items`;
      message = `${formatFieldName(path)} must have at least ${error.params.limit} items`;
      break;

    case 'maxItems':
      code = 'invalid_value';
      expected = `<= ${error.params.limit} items`;
      message = `${formatFieldName(path)} must have at most ${error.params.limit} items`;
      break;

    case 'uniqueItems':
      code = 'invalid_value';
      message = `${formatFieldName(path)} must have unique items`;
      break;

    default:
      // Use the AJV error message as fallback
      message = error.message
        ? `${formatFieldName(path)} ${error.message}`
        : `${formatFieldName(path)} is invalid`;
  }

  return {
    path: path || 'root',
    code,
    message,
    expected,
    received,
  };
}

/**
 * Format a field path into a human-readable field name
 * @param path - Field path (dot notation)
 * @returns Formatted field name
 */
function formatFieldName(path: FieldPath): string {
  if (!path || path === 'root') {
    return 'This field';
  }

  // Get the last segment of the path
  const segments = path.split('.');
  const lastSegment = segments[segments.length - 1];

  // Remove array indices
  const cleaned = lastSegment.replace(/\[(\d+)\]/g, '');

  // Convert camelCase to spaces
  const withSpaces = cleaned.replace(/([A-Z])/g, ' $1');

  // Convert snake_case to spaces
  const normalized = withSpaces.replace(/_/g, ' ');

  // Capitalize first letter
  const formatted =
    normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();

  return formatted.trim();
}

/**
 * Validate form data against a schema
 * @param schema - The IntakeSchema to validate against
 * @param data - The form data to validate
 * @returns Validation result with errors (if any)
 */
export function validateForm(
  schema: IntakeSchema,
  data: FormData
): ValidationResult {
  const validator = getValidator(schema);
  const valid = validator(data);

  if (valid) {
    return { valid: true };
  }

  // Convert AJV errors to FieldError format
  const errors: FieldError[] = (validator.errors || []).map(convertAjvError);

  return {
    valid: false,
    errors,
  };
}

/**
 * Validate a single field value
 * @param schema - The IntakeSchema
 * @param path - The field path (dot notation)
 * @param value - The field value to validate
 * @param data - The complete form data (for context)
 * @returns Validation result for the field
 */
export function validateField(
  schema: IntakeSchema,
  path: FieldPath,
  value: unknown,
  data: FormData
): ValidationResult {
  // Validate the entire form to get all errors
  const result = validateForm(schema, data);

  if (result.valid) {
    return { valid: true };
  }

  // Filter errors for this specific field
  const fieldErrors = result.errors?.filter((error) => error.path === path);

  if (!fieldErrors || fieldErrors.length === 0) {
    return { valid: true };
  }

  return {
    valid: false,
    errors: fieldErrors,
  };
}

/**
 * Get all validation errors as a map of field path to error message
 * @param errors - Array of field errors
 * @returns Map of field path to error message
 */
export function getErrorMap(
  errors: FieldError[]
): Record<FieldPath, string> {
  const errorMap: Record<FieldPath, string> = {};

  for (const error of errors) {
    // Use the first error message for each field
    if (!errorMap[error.path]) {
      errorMap[error.path] = error.message;
    }
  }

  return errorMap;
}

/**
 * Get error message for a specific field
 * @param errors - Array of field errors
 * @param path - Field path
 * @returns Error message or undefined
 */
export function getFieldError(
  errors: FieldError[] | undefined,
  path: FieldPath
): string | undefined {
  if (!errors) {
    return undefined;
  }

  const fieldError = errors.find((error) => error.path === path);
  return fieldError?.message;
}

/**
 * Check if a field has errors
 * @param errors - Array of field errors
 * @param path - Field path
 * @returns True if field has errors
 */
export function hasFieldError(
  errors: FieldError[] | undefined,
  path: FieldPath
): boolean {
  if (!errors) {
    return false;
  }

  return errors.some((error) => error.path === path);
}

/**
 * Clear the validator cache
 * Useful for testing or when schemas change
 */
export function clearValidatorCache(): void {
  validatorCache.clear();
}

/**
 * Get the number of cached validators
 * Useful for testing
 */
export function getValidatorCacheSize(): number {
  return validatorCache.size;
}
