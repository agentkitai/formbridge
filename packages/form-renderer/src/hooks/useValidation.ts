/**
 * Custom hook for managing form validation
 * Handles blur and submit validation with async support
 */

import { useState, useCallback, useMemo } from 'react';
import {
  IntakeSchema,
  FormData,
  FieldPath,
  FormErrors,
  UseValidationReturn,
  ValidationResult,
} from '../types';
import {
  validateForm as validateFormUtil,
  validateField as validateFieldUtil,
  getErrorMap,
  getFieldValue,
} from '../utils';

/**
 * Hook for managing form validation
 * @param schema - The IntakeSchema to validate against
 * @param data - The current form data
 * @returns Validation management interface
 */
export function useValidation(
  schema: IntakeSchema,
  data: FormData
): UseValidationReturn {
  const [errors, setErrors] = useState<FormErrors>({});
  const [isValidating, setIsValidating] = useState(false);

  /**
   * Validate the entire form
   * @returns Validation result
   */
  const validate = useCallback(async (): Promise<ValidationResult> => {
    setIsValidating(true);

    try {
      // Run validation (synchronous, but wrapped in Promise for API consistency)
      const result = validateFormUtil(schema, data);

      if (result.valid) {
        // Clear errors on successful validation
        setErrors({});
      } else {
        // Set errors from validation result
        const errorMap = getErrorMap(result.errors || []);
        setErrors(errorMap);
      }

      return result;
    } finally {
      setIsValidating(false);
    }
  }, [schema, data]);

  /**
   * Validate a single field
   * @param path - The field path to validate
   * @returns Whether the field is valid
   */
  const validateField = useCallback(
    async (path: FieldPath): Promise<boolean> => {
      setIsValidating(true);

      try {
        // Get the field value
        const value = getFieldValue(data, path);

        // Run field validation
        const result = validateFieldUtil(schema, path, value, data);

        if (result.valid) {
          // Clear error for this field
          setErrors((prevErrors) => {
            const newErrors = { ...prevErrors };
            delete newErrors[path];
            return newErrors;
          });
          return true;
        } else {
          // Set error for this field
          const fieldError = result.errors?.[0];
          if (fieldError) {
            setErrors((prevErrors) => ({
              ...prevErrors,
              [path]: fieldError.message,
            }));
          }
          return false;
        }
      } finally {
        setIsValidating(false);
      }
    },
    [schema, data]
  );

  /**
   * Clear all validation errors
   */
  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  /**
   * Clear error for a specific field
   * @param path - The field path
   */
  const clearFieldError = useCallback((path: FieldPath) => {
    setErrors((prevErrors) => {
      const newErrors = { ...prevErrors };
      delete newErrors[path];
      return newErrors;
    });
  }, []);

  /**
   * Set a field error manually
   * @param path - The field path
   * @param message - The error message
   */
  const setFieldError = useCallback((path: FieldPath, message: string) => {
    setErrors((prevErrors) => ({
      ...prevErrors,
      [path]: message,
    }));
  }, []);

  return useMemo(
    () => ({
      errors,
      validate,
      validateField,
      clearErrors,
      clearFieldError,
      setFieldError,
      isValidating,
    }),
    [
      errors,
      validate,
      validateField,
      clearErrors,
      clearFieldError,
      setFieldError,
      isValidating,
    ]
  );
}
