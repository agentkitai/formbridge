/**
 * ResumeFormPage component - Page for resuming a form submission
 * Accepts resumeToken query param and loads pre-filled submission data
 */

import React, { useEffect, useState } from 'react';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Extract resume token from URL query params if not provided via props
  const resumeToken = resumeTokenProp || (() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || undefined;
  })();

  useEffect(() => {
    // Validate resume token
    if (!resumeToken) {
      const err = new Error('Missing resume token. Please provide a valid resume URL.');
      setError(err);
      setLoading(false);
      onError?.(err);
      return;
    }

    // TODO (subtask-3-2): Fetch submission data using useResumeSubmission hook
    // For now, just simulate loading state
    const timer = setTimeout(() => {
      setLoading(false);
      // Simulate successful load
      onLoad?.('sub_placeholder', resumeToken);
    }, 100);

    return () => clearTimeout(timer);
  }, [resumeToken, endpoint, onLoad, onError]);

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

  // Success state - render form
  // TODO (subtask-3-2): Replace with actual FormBridgeForm once we have submission data
  return (
    <div className={`formbridge-resume-page ${className}`.trim()}>
      <div className="formbridge-resume-page__container">
        <h2 className="formbridge-resume-page__title">Resume Form</h2>
        <p className="formbridge-resume-page__description">
          Resume token: {resumeToken}
        </p>
        {/* TODO (subtask-3-2): Render FormBridgeForm with fetched data */}
        <p className="formbridge-resume-page__placeholder">
          Form will be rendered here once useResumeSubmission hook is implemented.
        </p>
      </div>
    </div>
  );
};

ResumeFormPage.displayName = 'ResumeFormPage';
