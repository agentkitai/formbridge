/**
 * Tests for FormBridge API Client
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FormBridgeApiClient, createApiClient, defaultApiClient } from '../client';
import type { Actor } from '../../types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('FormBridgeApiClient', () => {
  let client: FormBridgeApiClient;
  const testActor: Actor = {
    kind: 'human',
    id: 'user-123',
    name: 'John Doe',
  };

  beforeEach(() => {
    // Reset mocks before each test
    mockFetch.mockClear();
    client = new FormBridgeApiClient({
      endpoint: 'http://localhost:3000',
    });
  });

  describe('constructor', () => {
    it('should use default endpoint if not provided', () => {
      const defaultClient = new FormBridgeApiClient();
      expect(defaultClient).toBeDefined();
    });

    it('should use custom endpoint if provided', () => {
      const customClient = new FormBridgeApiClient({
        endpoint: 'https://api.example.com',
      });
      expect(customClient).toBeDefined();
    });

    it('should merge custom headers with default headers', () => {
      const customClient = new FormBridgeApiClient({
        headers: { 'X-Custom-Header': 'value' },
      });
      expect(customClient).toBeDefined();
    });
  });

  describe('emitHandoffResumed', () => {
    it('should emit HANDOFF_RESUMED event successfully', async () => {
      const mockResponse = {
        ok: true,
        eventId: 'evt_123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.emitHandoffResumed('rtok_abc123', testActor);

      expect(result.ok).toBe(true);
      expect(result.eventId).toBe('evt_123');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/submissions/resume/rtok_abc123/resumed',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ actor: testActor }),
        })
      );
    });

    it('should handle 404 error when submission not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Submission not found' }),
      });

      const result = await client.emitHandoffResumed('rtok_invalid', testActor);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Submission not found');
      expect(result.eventId).toBeUndefined();
    });

    it('should handle 403 error when access denied', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: 'Access denied' }),
      });

      const result = await client.emitHandoffResumed('rtok_used', testActor);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Access denied');
    });

    it('should handle 500 server error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Server error' }),
      });

      const result = await client.emitHandoffResumed('rtok_abc123', testActor);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Server error');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await client.emitHandoffResumed('rtok_abc123', testActor);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle non-Error exceptions', async () => {
      mockFetch.mockRejectedValueOnce('Unknown error');

      const result = await client.emitHandoffResumed('rtok_abc123', testActor);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Unknown error occurred');
    });

    it('should handle JSON parse errors in error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const result = await client.emitHandoffResumed('rtok_abc123', testActor);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('HTTP 400');
    });

    it('should URL encode resume token', async () => {
      const mockResponse = {
        ok: true,
        eventId: 'evt_123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      await client.emitHandoffResumed('rtok_with/special?chars', testActor);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('rtok_with%2Fspecial%3Fchars'),
        expect.any(Object)
      );
    });

    it('should work with agent actor', async () => {
      const agentActor: Actor = {
        kind: 'agent',
        id: 'agent-456',
        name: 'AI Assistant',
      };

      const mockResponse = {
        ok: true,
        eventId: 'evt_456',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.emitHandoffResumed('rtok_abc123', agentActor);

      expect(result.ok).toBe(true);
      expect(result.eventId).toBe('evt_456');
    });
  });

  describe('getSubmissionByResumeToken', () => {
    it('should fetch submission successfully', async () => {
      const mockSubmission = {
        id: 'sub_123',
        resumeToken: 'rtok_abc123',
        fields: { name: 'Test' },
        fieldAttribution: {},
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSubmission,
      });

      const result = await client.getSubmissionByResumeToken('rtok_abc123');

      expect(result).toEqual(mockSubmission);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/submissions/resume/rtok_abc123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should throw error when submission not found (404)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Not found' }),
      });

      await expect(
        client.getSubmissionByResumeToken('rtok_invalid')
      ).rejects.toThrow('Submission not found');
    });

    it('should throw error when access denied (403)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: 'Forbidden' }),
      });

      await expect(
        client.getSubmissionByResumeToken('rtok_used')
      ).rejects.toThrow('Access denied');
    });

    it('should throw error for other HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Server error' }),
      });

      await expect(
        client.getSubmissionByResumeToken('rtok_abc123')
      ).rejects.toThrow('Failed to fetch submission: 500');
    });

    it('should propagate network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await expect(
        client.getSubmissionByResumeToken('rtok_abc123')
      ).rejects.toThrow('Network failure');
    });
  });

  describe('createApiClient', () => {
    it('should create a new client instance', () => {
      const client = createApiClient({
        endpoint: 'https://api.example.com',
      });

      expect(client).toBeInstanceOf(FormBridgeApiClient);
    });

    it('should create client with default options', () => {
      const client = createApiClient();

      expect(client).toBeInstanceOf(FormBridgeApiClient);
    });
  });

  describe('defaultApiClient', () => {
    it('should be a FormBridgeApiClient instance', () => {
      expect(defaultApiClient).toBeInstanceOf(FormBridgeApiClient);
    });

    it('should be usable for API calls', async () => {
      const mockResponse = {
        ok: true,
        eventId: 'evt_default',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await defaultApiClient.emitHandoffResumed('rtok_test', testActor);

      expect(result.ok).toBe(true);
      expect(result.eventId).toBe('evt_default');
    });
  });

  describe('approve', () => {
    it('should approve submission successfully', async () => {
      const mockResponse = {
        ok: true,
        submissionId: 'sub_123',
        state: 'approved',
        resumeToken: 'rtok_abc123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.approve('sub_123', 'rtok_abc123', testActor, 'Looks good!');

      expect(result.ok).toBe(true);
      expect(result.submissionId).toBe('sub_123');
      expect(result.state).toBe('approved');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/submissions/sub_123/approve',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ resumeToken: 'rtok_abc123', actor: testActor, comment: 'Looks good!' }),
        })
      );
    });

    it('should approve submission without comment', async () => {
      const mockResponse = {
        ok: true,
        submissionId: 'sub_123',
        state: 'approved',
        resumeToken: 'rtok_abc123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.approve('sub_123', 'rtok_abc123', testActor);

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ resumeToken: 'rtok_abc123', actor: testActor, comment: undefined }),
        })
      );
    });

    it('should handle 404 error when submission not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Submission not found' }),
      });

      const result = await client.approve('sub_invalid', 'rtok_abc123', testActor);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Submission not found');
    });

    it('should handle 403 error when access denied', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: 'Access denied' }),
      });

      const result = await client.approve('sub_123', 'rtok_invalid', testActor);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Access denied');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await client.approve('sub_123', 'rtok_abc123', testActor);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should URL encode submission ID', async () => {
      const mockResponse = {
        ok: true,
        submissionId: 'sub/123',
        state: 'approved',
        resumeToken: 'rtok_abc123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      await client.approve('sub/with/special?chars', 'rtok_abc123', testActor);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sub%2Fwith%2Fspecial%3Fchars'),
        expect.any(Object)
      );
    });
  });

  describe('reject', () => {
    it('should reject submission successfully', async () => {
      const mockResponse = {
        ok: true,
        submissionId: 'sub_123',
        state: 'rejected',
        resumeToken: 'rtok_abc123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.reject('sub_123', 'rtok_abc123', testActor, 'Missing required documents');

      expect(result.ok).toBe(true);
      expect(result.submissionId).toBe('sub_123');
      expect(result.state).toBe('rejected');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/submissions/sub_123/reject',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            resumeToken: 'rtok_abc123',
            actor: testActor,
            reason: 'Missing required documents',
            comment: undefined
          }),
        })
      );
    });

    it('should reject submission with comment', async () => {
      const mockResponse = {
        ok: true,
        submissionId: 'sub_123',
        state: 'rejected',
        resumeToken: 'rtok_abc123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.reject('sub_123', 'rtok_abc123', testActor, 'Invalid data', 'Please review and resubmit');

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            resumeToken: 'rtok_abc123',
            actor: testActor,
            reason: 'Invalid data',
            comment: 'Please review and resubmit'
          }),
        })
      );
    });

    it('should handle 404 error when submission not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Submission not found' }),
      });

      const result = await client.reject('sub_invalid', 'rtok_abc123', testActor, 'Reason');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Submission not found');
    });

    it('should handle 409 error for invalid state', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        json: async () => ({ error: 'Submission is not in needs_review state' }),
      });

      const result = await client.reject('sub_123', 'rtok_abc123', testActor, 'Reason');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Submission is not in needs_review state');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const result = await client.reject('sub_123', 'rtok_abc123', testActor, 'Reason');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Network failure');
    });

    it('should handle non-Error exceptions', async () => {
      mockFetch.mockRejectedValueOnce('Unknown error');

      const result = await client.reject('sub_123', 'rtok_abc123', testActor, 'Reason');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Unknown error occurred');
    });
  });

  describe('requestChanges', () => {
    it('should request changes successfully', async () => {
      const fieldComments = [
        { fieldPath: 'vendorName', comment: 'Please provide full legal name' },
        { fieldPath: 'email', comment: 'Invalid email format', suggestedValue: 'user@example.com' },
      ];

      const mockResponse = {
        ok: true,
        submissionId: 'sub_123',
        state: 'draft',
        resumeToken: 'rtok_abc123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.requestChanges('sub_123', 'rtok_abc123', testActor, fieldComments);

      expect(result.ok).toBe(true);
      expect(result.submissionId).toBe('sub_123');
      expect(result.state).toBe('draft');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/submissions/sub_123/request-changes',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            resumeToken: 'rtok_abc123',
            actor: testActor,
            fieldComments,
            comment: undefined
          }),
        })
      );
    });

    it('should request changes with overall comment', async () => {
      const fieldComments = [
        { fieldPath: 'vendorName', comment: 'Please provide full legal name' },
      ];

      const mockResponse = {
        ok: true,
        submissionId: 'sub_123',
        state: 'draft',
        resumeToken: 'rtok_abc123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.requestChanges('sub_123', 'rtok_abc123', testActor, fieldComments, 'Please address all comments');

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            resumeToken: 'rtok_abc123',
            actor: testActor,
            fieldComments,
            comment: 'Please address all comments'
          }),
        })
      );
    });

    it('should handle empty field comments array', async () => {
      const mockResponse = {
        ok: true,
        submissionId: 'sub_123',
        state: 'draft',
        resumeToken: 'rtok_abc123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const result = await client.requestChanges('sub_123', 'rtok_abc123', testActor, []);

      expect(result.ok).toBe(true);
    });

    it('should handle 404 error when submission not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'Submission not found' }),
      });

      const result = await client.requestChanges('sub_invalid', 'rtok_abc123', testActor, []);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Submission not found');
    });

    it('should handle 403 error when access denied', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: 'Invalid resume token' }),
      });

      const result = await client.requestChanges('sub_123', 'rtok_invalid', testActor, []);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Invalid resume token');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection timeout'));

      const result = await client.requestChanges('sub_123', 'rtok_abc123', testActor, []);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Connection timeout');
    });

    it('should handle JSON parse errors in error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const result = await client.requestChanges('sub_123', 'rtok_abc123', testActor, []);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('HTTP 400');
    });

    it('should URL encode submission ID', async () => {
      const mockResponse = {
        ok: true,
        submissionId: 'sub/123',
        state: 'draft',
        resumeToken: 'rtok_abc123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      await client.requestChanges('sub/with/special?chars', 'rtok_abc123', testActor, []);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sub%2Fwith%2Fspecial%3Fchars'),
        expect.any(Object)
      );
    });
  });
});
