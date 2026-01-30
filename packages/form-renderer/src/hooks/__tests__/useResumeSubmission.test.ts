/**
 * Tests for useResumeSubmission hook
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useResumeSubmission } from '../useResumeSubmission';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('useResumeSubmission', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should fetch submission data successfully', async () => {
    const mockSubmission = {
      id: 'sub_test123',
      intakeId: 'intake_123',
      state: 'draft',
      resumeToken: 'rtok_abc123',
      createdAt: '2026-01-29T00:00:00Z',
      updatedAt: '2026-01-29T00:00:00Z',
      fields: {
        companyName: 'Acme Corp',
        email: 'contact@acme.com',
      },
      fieldAttribution: {
        companyName: {
          kind: 'agent',
          id: 'agent_123',
          name: 'AI Assistant',
        },
      },
      createdBy: {
        kind: 'agent',
        id: 'agent_123',
        name: 'AI Assistant',
      },
      updatedBy: {
        kind: 'agent',
        id: 'agent_123',
        name: 'AI Assistant',
      },
      events: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockSubmission,
    });

    const { result } = renderHook(() =>
      useResumeSubmission({
        resumeToken: 'rtok_abc123',
        endpoint: 'http://localhost:3000',
      })
    );

    // Initially loading
    expect(result.current.loading).toBe(true);
    expect(result.current.submission).toBeNull();
    expect(result.current.error).toBeNull();

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should have submission data
    expect(result.current.submission).toEqual(mockSubmission);
    expect(result.current.error).toBeNull();

    // Verify fetch was called correctly
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/submissions/resume/rtok_abc123',
      expect.objectContaining({
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );
  });

  it('should handle 404 not found error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'Not found' }),
    });

    const onError = jest.fn();

    const { result } = renderHook(() =>
      useResumeSubmission({
        resumeToken: 'rtok_invalid',
        endpoint: 'http://localhost:3000',
        onError,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.submission).toBeNull();
    expect(result.current.error).toBeTruthy();
    expect(result.current.error?.message).toContain('not found');
    expect(onError).toHaveBeenCalled();
  });

  it('should handle 403 forbidden error (link already used)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ error: 'Already used' }),
    });

    const { result } = renderHook(() =>
      useResumeSubmission({
        resumeToken: 'rtok_used',
        endpoint: 'http://localhost:3000',
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error?.message).toContain('Access denied');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() =>
      useResumeSubmission({
        resumeToken: 'rtok_abc123',
        endpoint: 'http://localhost:3000',
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error?.message).toContain('Network error');
  });

  it('should handle missing resume token', async () => {
    const onError = jest.fn();

    const { result } = renderHook(() =>
      useResumeSubmission({
        resumeToken: '',
        endpoint: 'http://localhost:3000',
        onError,
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error?.message).toContain('required');
    expect(result.current.submission).toBeNull();
    expect(onError).toHaveBeenCalled();
  });

  it('should call onLoad callback when submission loads', async () => {
    const mockSubmission = {
      id: 'sub_test123',
      intakeId: 'intake_123',
      state: 'draft',
      resumeToken: 'rtok_abc123',
      createdAt: '2026-01-29T00:00:00Z',
      updatedAt: '2026-01-29T00:00:00Z',
      fields: {},
      fieldAttribution: {},
      createdBy: {
        kind: 'agent' as const,
        id: 'agent_123',
        name: 'AI Assistant',
      },
      updatedBy: {
        kind: 'agent' as const,
        id: 'agent_123',
        name: 'AI Assistant',
      },
      events: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockSubmission,
    });

    const onLoad = jest.fn();

    renderHook(() =>
      useResumeSubmission({
        resumeToken: 'rtok_abc123',
        endpoint: 'http://localhost:3000',
        onLoad,
      })
    );

    await waitFor(() => {
      expect(onLoad).toHaveBeenCalledWith(mockSubmission);
    });
  });

  it('should support refetch functionality', async () => {
    const mockSubmission = {
      id: 'sub_test123',
      intakeId: 'intake_123',
      state: 'draft',
      resumeToken: 'rtok_abc123',
      createdAt: '2026-01-29T00:00:00Z',
      updatedAt: '2026-01-29T00:00:00Z',
      fields: {},
      fieldAttribution: {},
      createdBy: {
        kind: 'agent' as const,
        id: 'agent_123',
        name: 'AI Assistant',
      },
      updatedBy: {
        kind: 'agent' as const,
        id: 'agent_123',
        name: 'AI Assistant',
      },
      events: [],
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockSubmission,
    });

    const { result } = renderHook(() =>
      useResumeSubmission({
        resumeToken: 'rtok_abc123',
        endpoint: 'http://localhost:3000',
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Clear mock and refetch
    mockFetch.mockClear();
    result.current.refetch();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  it('should abort fetch on unmount', async () => {
    const abortSpy = jest.spyOn(AbortController.prototype, 'abort');

    mockFetch.mockImplementation(() =>
      new Promise((resolve) => setTimeout(resolve, 1000))
    );

    const { unmount } = renderHook(() =>
      useResumeSubmission({
        resumeToken: 'rtok_abc123',
        endpoint: 'http://localhost:3000',
      })
    );

    // Unmount before fetch completes
    unmount();

    expect(abortSpy).toHaveBeenCalled();
    abortSpy.mockRestore();
  });

  it('should reset state when resumeToken changes', async () => {
    const mockSubmission1 = {
      id: 'sub_1',
      intakeId: 'intake_123',
      state: 'draft',
      resumeToken: 'rtok_1',
      createdAt: '2026-01-29T00:00:00Z',
      updatedAt: '2026-01-29T00:00:00Z',
      fields: { field1: 'value1' },
      fieldAttribution: {},
      createdBy: { kind: 'agent' as const, id: 'agent_123', name: 'AI' },
      updatedBy: { kind: 'agent' as const, id: 'agent_123', name: 'AI' },
      events: [],
    };

    const mockSubmission2 = {
      ...mockSubmission1,
      id: 'sub_2',
      resumeToken: 'rtok_2',
      fields: { field1: 'value2' },
    };

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockSubmission1 })
      .mockResolvedValueOnce({ ok: true, json: async () => mockSubmission2 });

    const { result, rerender } = renderHook(
      ({ token }) =>
        useResumeSubmission({
          resumeToken: token,
          endpoint: 'http://localhost:3000',
        }),
      { initialProps: { token: 'rtok_1' } }
    );

    await waitFor(() => {
      expect(result.current.submission?.id).toBe('sub_1');
    });

    // Change resume token
    rerender({ token: 'rtok_2' });

    // Should reset to loading state
    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.submission?.id).toBe('sub_2');
    });
  });

  it('should encode resume token in URL', async () => {
    const tokenWithSpecialChars = 'rtok_abc+123/xyz=';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    renderHook(() =>
      useResumeSubmission({
        resumeToken: tokenWithSpecialChars,
        endpoint: 'http://localhost:3000',
      })
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent(tokenWithSpecialChars)),
        expect.any(Object)
      );
    });
  });
});
