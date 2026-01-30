/**
 * Custom hook for managing form state
 * Handles form data, field updates, and dirty state tracking
 */

import { useState, useCallback, useMemo } from 'react';
import { FormData, FieldPath, UseFormStateReturn } from '../types';
import { getFieldValue, setFieldValue } from '../utils/schemaParser';

/**
 * Hook for managing form data state
 * @param initialData - Initial form data
 * @returns Form state management interface
 */
export function useFormState(initialData: FormData = {}): UseFormStateReturn {
  const [data, setData] = useState<FormData>(initialData);
  const [isDirty, setIsDirty] = useState(false);

  /**
   * Set a single field value
   */
  const setField = useCallback(
    (path: FieldPath, value: unknown) => {
      setData((prevData) => {
        const newData = setFieldValue(prevData, path, value);
        return newData;
      });
      setIsDirty(true);
    },
    []
  );

  /**
   * Set multiple fields at once
   */
  const setFields = useCallback((fields: Partial<FormData>) => {
    setData((prevData) => ({
      ...prevData,
      ...fields,
    }));
    setIsDirty(true);
  }, []);

  /**
   * Get a field value
   */
  const getField = useCallback(
    (path: FieldPath): unknown => {
      return getFieldValue(data, path);
    },
    [data]
  );

  /**
   * Reset form to initial state
   */
  const reset = useCallback(() => {
    setData(initialData);
    setIsDirty(false);
  }, [initialData]);

  return useMemo(
    () => ({
      data,
      setField,
      setFields,
      getField,
      reset,
      isDirty,
    }),
    [data, setField, setFields, getField, reset, isDirty]
  );
}
