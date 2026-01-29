/**
 * Custom hook for managing form submission
 * Handles submission flow, loading/error states, and API communication
 */

import { useState, useCallback, useMemo } from 'react';
import {
  IntakeSchema,
  FormData,
  Actor,
  UseFormSubmissionReturn,
  FormSubmissionState,
} from '../types';
import { SubmissionError, IntakeError } from '../types/error';
import { FormBridgeApiClient } from '../api/client';
import { UseValidationReturn } from '../types';

/**
 * Configuration for useFormSubmission hook
 */
export interface UseFormSubmissionConfig {
  /** IntakeSchema to submit against */
  schema: IntakeSchema;
  /** Current form data */
  data: FormData;
  /** Validation hook instance */
  validation: UseValidationReturn;
  /** API client instance */
  apiClient: FormBridgeApiClient;
  /** Intake ID for submission */
  intakeId: string;
  /** Actor identity */
  actor: Actor;
  /** Success callback */
  onSuccess?: (submissionId: string) => void;
  /** Error callback */
  onError?: (error: SubmissionError) => void;
}

/**
 * Hook for managing form submission
 * @param config - Submission configuration
 * @returns Submission management interface
 */
export function useFormSubmission(
  config: UseFormSubmissionConfig
): UseFormSubmissionReturn {
  const { schema, data, validation, apiClient, intakeId, actor, onSuccess, onError } = config;

  const [state, setState] = useState<FormSubmissionState>('idle');
  const [error, setError] = useState<SubmissionError | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  /**
   * Convert IntakeError to SubmissionError
   */
  const convertIntakeError = useCallback((intakeError: IntakeError): SubmissionError => {
    return {
      message: intakeError.error.message || 'Submission failed',
      fieldErrors: intakeError.error.fields,
      retryable: intakeError.error.retryable,
    };
  }, []);

  /**
   * Submit the form
   */
  const submit = useCallback(async (): Promise<void> => {
    try {
      // Clear previous errors
      setError(null);

      // Step 1: Validate form
      setState('validating');
      const validationResult = await validation.validate();

      if (!validationResult.valid) {
        setState('error');
        const validationError: SubmissionError = {
          message: 'Please fix validation errors before submitting',
          fieldErrors: validationResult.errors,
          retryable: true,
        };
        setError(validationError);
        onError?.(validationError);
        return;
      }

      // Step 2: Create submission
      setState('submitting');
      const createResponse = await apiClient.createSubmission({
        intakeId,
        actor,
        initialFields: data,
        idempotencyKey: `submit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      });

      // Handle IntakeError from create
      if ('ok' in createResponse && createResponse.ok === false) {
        const submissionError = convertIntakeError(createResponse);
        setState('error');
        setError(submissionError);
        onError?.(submissionError);
        return;
      }

      const { submissionId: newSubmissionId, resumeToken } = createResponse;
      setSubmissionId(newSubmissionId);

      // Step 3: Submit the submission
      const submitResponse = await apiClient.submit({
        submissionId: newSubmissionId,
        resumeToken,
        idempotencyKey: `finalize_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        actor,
      });

      // Handle IntakeError from submit
      if ('ok' in submitResponse && submitResponse.ok === false) {
        const submissionError = convertIntakeError(submitResponse);
        setState('error');
        setError(submissionError);
        onError?.(submissionError);
        return;
      }

      // Success!
      setState('success');
      onSuccess?.(newSubmissionId);
    } catch (err) {
      // Handle unexpected errors
      const submissionError: SubmissionError = {
        message: err instanceof Error ? err.message : 'An unexpected error occurred',
        retryable: true,
      };
      setState('error');
      setError(submissionError);
      onError?.(submissionError);
    }
  }, [schema, data, validation, apiClient, intakeId, actor, onSuccess, onError, convertIntakeError]);

  /**
   * Reset submission state
   */
  const reset = useCallback(() => {
    setState('idle');
    setError(null);
    setSubmissionId(null);
  }, []);

  // Computed properties
  const isSubmitting = state === 'submitting' || state === 'validating';
  const isSuccess = state === 'success';
  const isError = state === 'error';

  return useMemo(
    () => ({
      submit,
      state,
      error,
      submissionId,
      isSubmitting,
      isSuccess,
      isError,
      reset,
    }),
    [submit, state, error, submissionId, isSubmitting, isSuccess, isError, reset]
  );
}
