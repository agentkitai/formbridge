/**
 * ResumeFormPage component - Page for resuming a form submission
 * Accepts resumeToken query param and loads pre-filled submission data
 */

import React, { useRef } from 'react';
import { useResumeSubmission } from '../hooks/useResumeSubmission';
import { FormBridgeForm } from './FormBridgeForm';
import type { Submission } from '../hooks/useResumeSubmission';

/**
 * Props for ResumeFormPage component
 */
export interface ResumeFormPageProps {
  /** Resume token from URL query param */
  resumeToken?: string;
  /** Submission endpoint URL */
  endpoint?: string;
  /** Optional callback when form is loaded */
  onLoad?: (submissionId: string, resumeToken: string) => void;
  /** Optional callback for errors */
  onError?: (error: Error) => void;
  /** Custom CSS class */
  className?: string;
}

/**
 * ResumeFormPage - Component for resuming form submissions via resume token
 *
 * This component handles the agent-to-human handoff workflow:
 * 1. Extracts resumeToken from URL query params
 * 2. Fetches submission data (schema + pre-filled fields) via API
 * 3. Renders FormBridgeForm with pre-filled data and actor attribution
 * 4. Emits HANDOFF_RESUMED event when form loads
 *
 * @example
 * ```tsx
 * // URL: http://localhost:3000/resume?token=rtok_abc123
 * <ResumeFormPage
 *   resumeToken="rtok_abc123"
 *   endpoint="https://api.formbridge.example.com"
 *   onLoad={(submissionId, token) => console.log('Form loaded', submissionId)}
 * />
 * ```
 */
export const ResumeFormPage: React.FC<ResumeFormPageProps> = ({
  resumeToken: resumeTokenProp,
  endpoint = 'http://localhost:3000',
  onLoad,
  onError,
  className = '',
}) => {
  // Extract resume token from URL query params if not provided via props
  const resolvedToken = resumeTokenProp || (() => {
    if (typeof window === 'undefined') {
      return '';
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  })();

  // Use refs for callbacks to avoid infinite re-render loops
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const handleLoad = React.useCallback((submission: Submission) => {
    onLoadRef.current?.(submission.id, submission.resumeToken);
  }, []);

  const handleError = React.useCallback((error: Error) => {
    onErrorRef.current?.(error);
  }, []);

  const { submission, loading, error } = useResumeSubmission({
    resumeToken: resolvedToken,
    endpoint,
    onLoad: handleLoad,
    onError: handleError,
  });

  // Error state
  if (error) {
    return (
      <div className={`formbridge-resume-page formbridge-resume-page--error ${className}`.trim()}>
        <div className="formbridge-resume-page__error" role="alert">
          <h2 className="formbridge-resume-page__error-title">Error</h2>
          <p className="formbridge-resume-page__error-message">{error.message}</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className={`formbridge-resume-page formbridge-resume-page--loading ${className}`.trim()}>
        <div className="formbridge-resume-page__loading" role="status" aria-live="polite">
          <p>Loading form...</p>
        </div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className={`formbridge-resume-page formbridge-resume-page--error ${className}`.trim()}>
        <div className="formbridge-resume-page__error" role="alert">
          <h2 className="formbridge-resume-page__error-title">Error</h2>
          <p className="formbridge-resume-page__error-message">No submission data found.</p>
        </div>
      </div>
    );
  }

  // Success state - render form with submission data
  return (
    <div className={`formbridge-resume-page ${className}`.trim()}>
      <div className="formbridge-resume-page__container">
        <h2 className="formbridge-resume-page__title">Resume Form</h2>
        <FormBridgeForm
          schema={{ type: 'object', properties: {} }}
          fields={submission.fields}
          fieldAttribution={submission.fieldAttribution}
          currentActor={{ kind: 'human', id: 'human-web', name: 'Human User' }}
        />
      </div>
    </div>
  );
};

ResumeFormPage.displayName = 'ResumeFormPage';
