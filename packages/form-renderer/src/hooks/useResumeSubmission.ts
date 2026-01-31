/**
 * useResumeSubmission hook - Fetch submission data by resumeToken
 *
 * This hook handles fetching submission data for the agent-to-human handoff workflow.
 * It fetches pre-filled form data and field attribution from the backend API.
 */

import { useState, useEffect, useRef } from 'react';
import { createApiClient } from '../api/client';

/**
 * Submission data structure
 */
export interface Submission {
  id: string;
  intakeId: string;
  state: string;
  resumeToken: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  fields: Record<string, unknown>;
  fieldAttribution: Record<string, {
    kind: 'agent' | 'human' | 'system';
    id: string;
    name: string;
  }>;
  schema: unknown; // The intake schema from the API
  createdBy?: {
    kind: 'agent' | 'human' | 'system';
    id: string;
    name: string;
  };
  updatedBy?: {
    kind: 'agent' | 'human' | 'system';
    id: string;
    name: string;
  };
  events?: Array<{
    eventId: string;
    type: string;
    timestamp: string;
  }>;
}

/**
 * Hook return type
 */
export interface UseResumeSubmissionReturn {
  /** The submission data, or null if not yet loaded */
  submission: Submission | null;
  /** Loading state */
  loading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Refetch the submission data */
  refetch: () => void;
}

/**
 * Hook options
 */
export interface UseResumeSubmissionOptions {
  /** Resume token to fetch submission for */
  resumeToken: string;
  /** API endpoint base URL */
  endpoint?: string;
  /** Optional callback when submission is loaded */
  onLoad?: (submission: Submission) => void;
  /** Optional callback for errors */
  onError?: (error: Error) => void;
}

/**
 * useResumeSubmission - React hook to fetch submission by resumeToken
 *
 * Fetches submission data from the backend API using the resumeToken from the
 * agent-to-human handoff URL. Returns the submission with pre-filled fields and
 * field attribution for visual distinction in the form.
 *
 * @param options - Hook options including resumeToken and endpoint
 * @returns Submission data, loading state, error, and refetch function
 *
 * @example
 * ```tsx
 * const { submission, loading, error } = useResumeSubmission({
 *   resumeToken: 'rtok_abc123',
 *   endpoint: 'https://api.formbridge.example.com',
 *   onLoad: (submission) => console.log('Loaded:', submission.id),
 * });
 *
 * if (loading) return <div>Loading...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 * if (!submission) return <div>No submission found</div>;
 *
 * return <FormBridgeForm data={submission.fields} />;
 * ```
 */
export function useResumeSubmission(
  options: UseResumeSubmissionOptions
): UseResumeSubmissionReturn {
  const {
    resumeToken,
    endpoint = 'http://localhost:3000',
    onLoad,
    onError,
  } = options;

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refetchCounter, setRefetchCounter] = useState(0);

  // Use refs to hold latest callback values to avoid infinite re-render loops
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const refetch = () => {
    setRefetchCounter(prev => prev + 1);
  };

  useEffect(() => {
    // Reset state when resumeToken changes
    setLoading(true);
    setError(null);
    setSubmission(null);

    // Validate resume token
    if (!resumeToken) {
      const err = new Error('Resume token is required');
      setError(err);
      setLoading(false);
      onErrorRef.current?.(err);
      return;
    }

    // Create abort controller for cleanup
    const abortController = new AbortController();

    // Fetch submission data
    const fetchSubmission = async () => {
      try {
        const url = `${endpoint}/submissions/resume/${encodeURIComponent(resumeToken)}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: abortController.signal,
        });

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Submission not found. The resume link may be invalid or expired.');
          }
          if (response.status === 403) {
            throw new Error('Access denied. This resume link may have already been used.');
          }
          throw new Error(`Failed to fetch submission: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        setSubmission(data);
        setLoading(false);

        // Emit HANDOFF_RESUMED event to notify agent
        try {
          const client = createApiClient({ endpoint });
          await client.emitHandoffResumed(resumeToken, {
            kind: 'human',
            id: 'human-web',
            name: 'Human User',
          });
        } catch (eventError) {
          // Don't fail the whole load if event emission fails
          console.warn('Failed to emit HANDOFF_RESUMED event:', eventError);
        }

        onLoadRef.current?.(data);
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        const error = err instanceof Error
          ? err
          : new Error('An unknown error occurred while fetching submission');

        setError(error);
        setLoading(false);
        onErrorRef.current?.(error);
      }
    };

    fetchSubmission();

    // Cleanup function
    return () => {
      abortController.abort();
    };
  }, [resumeToken, endpoint, refetchCounter]);

  return {
    submission,
    loading,
    error,
    refetch,
  };
}
