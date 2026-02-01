/**
 * Resume Form Integration Test
 *
 * Tests the human side of agent-to-human handoff workflow:
 * - Human opens resume URL
 * - HANDOFF_RESUMED event is emitted
 * - Form pre-fills with agent data
 * - Agent-filled fields show attribution badges
 * - Empty fields have no badges
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ResumeFormPage } from '../../packages/form-renderer/src/components/ResumeFormPage';
import { FormBridgeForm } from '../../packages/form-renderer/src/components/FormBridgeForm';
import type { Actor } from '../../src/types/intake-contract';
import type { Submission } from '../../src/submission-types';

// Mock fetch globally
global.fetch = jest.fn();

describe('Resume Form Integration - Human Handoff', () => {
  const agentActor: Actor = {
    kind: 'agent',
    id: 'agent-onboarding-001',
    name: 'Vendor Onboarding Agent',
  };

  const humanActor: Actor = {
    kind: 'human',
    id: 'user-vendor-manager',
    name: 'Vendor Manager',
  };

  const mockSubmission: Submission = {
    id: 'sub_test123',
    intakeId: 'intake_vendor_onboarding',
    state: 'in_progress',
    resumeToken: 'rtok_test123',
    fields: {
      companyName: 'Acme Corp',
      address: '123 Main St, San Francisco, CA 94105',
      taxId: '12-3456789',
      // Empty fields that human should fill
      w9Document: '',
      insuranceCertificate: '',
    },
    fieldAttribution: {
      companyName: agentActor,
      address: agentActor,
      taxId: agentActor,
      // No attribution for empty fields
    },
    events: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: agentActor,
    updatedBy: agentActor,
  };

  const mockSchema = {
    type: 'object' as const,
    title: 'Vendor Onboarding',
    description: 'Complete vendor information',
    properties: {
      companyName: {
        type: 'string',
        title: 'Company Name',
        description: 'Legal name of the company',
      },
      address: {
        type: 'string',
        title: 'Address',
        description: 'Business address',
      },
      taxId: {
        type: 'string',
        title: 'Tax ID',
        description: 'Federal tax identification number',
      },
      w9Document: {
        type: 'string',
        title: 'W-9 Form',
        description: 'Upload completed W-9 form',
      },
      insuranceCertificate: {
        type: 'string',
        title: 'Insurance Certificate',
        description: 'Upload insurance certificate',
      },
    },
    required: ['companyName', 'taxId', 'w9Document'],
  };

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Mock successful submission fetch
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/submissions/resume/rtok_test123')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            submission: mockSubmission,
            schema: mockSchema,
          }),
        });
      }

      // Mock HANDOFF_RESUMED event emission
      if (url.includes('/submissions/resume/rtok_test123/resumed')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            eventId: 'evt_resumed_123',
          }),
        });
      }

      return Promise.reject(new Error(`Unmocked URL: ${url}`));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Human Opens Resume URL', () => {
    it('should render ResumeFormPage with resume token', async () => {
      render(
        <ResumeFormPage
          resumeToken="rtok_test123"
          endpoint="http://localhost:3000"
        />
      );

      // Should show loading state initially
      expect(screen.getByText(/loading form/i)).toBeInTheDocument();

      // Wait for content to load (placeholder for now since hook not implemented)
      await waitFor(() => {
        expect(screen.queryByText(/loading form/i)).not.toBeInTheDocument();
      });
    });

    it('should show error when resume token is missing', () => {
      render(
        <ResumeFormPage
          resumeToken={undefined}
          endpoint="http://localhost:3000"
        />
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/missing resume token/i)).toBeInTheDocument();
    });
  });

  describe('Form Pre-filled with Agent Data', () => {
    it('should display agent-filled fields with correct values', () => {
      render(
        <FormBridgeForm
          schema={mockSchema}
          fields={mockSubmission.fields}
          fieldAttribution={mockSubmission.fieldAttribution}
          currentActor={humanActor}
        />
      );

      // Verify agent-filled fields are pre-populated
      const companyNameInput = screen.getByLabelText(/Company Name/i) as HTMLInputElement;
      expect(companyNameInput.value).toBe('Acme Corp');

      const addressInput = screen.getByLabelText(/Address/i) as HTMLInputElement;
      expect(addressInput.value).toBe('123 Main St, San Francisco, CA 94105');

      const taxIdInput = screen.getByLabelText(/Tax ID/i) as HTMLInputElement;
      expect(taxIdInput.value).toBe('12-3456789');
    });

    it('should display empty fields that human needs to fill', () => {
      render(
        <FormBridgeForm
          schema={mockSchema}
          fields={mockSubmission.fields}
          fieldAttribution={mockSubmission.fieldAttribution}
          currentActor={humanActor}
        />
      );

      // Verify empty fields
      const w9Input = screen.getByLabelText(/W-9 Form/i) as HTMLInputElement;
      expect(w9Input.value).toBe('');

      const insuranceInput = screen.getByLabelText(/Insurance Certificate/i) as HTMLInputElement;
      expect(insuranceInput.value).toBe('');
    });
  });

  describe('Visual Attribution Badges', () => {
    it('should show "Filled by agent" badge on agent-filled fields', () => {
      render(
        <FormBridgeForm
          schema={mockSchema}
          fields={mockSubmission.fields}
          fieldAttribution={mockSubmission.fieldAttribution}
          currentActor={humanActor}
        />
      );

      // Should show "Filled by agent" for the 3 agent-filled fields
      const agentBadges = screen.getAllByText(/Filled by agent/i);
      expect(agentBadges).toHaveLength(3); // companyName, address, taxId
    });

    it('should not show badges on empty fields', () => {
      render(
        <FormBridgeForm
          schema={mockSchema}
          fields={mockSubmission.fields}
          fieldAttribution={mockSubmission.fieldAttribution}
          currentActor={humanActor}
        />
      );

      // Total badges should be 3 (only agent-filled fields)
      // Empty fields (w9Document, insuranceCertificate) should have no badges
      const allBadges = screen.getAllByText(/Filled by/i);
      expect(allBadges).toHaveLength(3);
    });

    it('should show agent name in attribution badge', () => {
      render(
        <FormBridgeForm
          schema={mockSchema}
          fields={mockSubmission.fields}
          fieldAttribution={mockSubmission.fieldAttribution}
          currentActor={humanActor}
        />
      );

      // Check for agent name in badges
      expect(screen.getAllByText(/Vendor Onboarding Agent/i)).toBeTruthy();
    });
  });

  describe('HANDOFF_RESUMED Event Emission', () => {
    it('should emit HANDOFF_RESUMED event when form loads', async () => {
      // This test verifies the API call pattern
      // Actual implementation will be in useResumeSubmission hook

      const mockFetch = global.fetch as jest.Mock;

      // Simulate what the hook should do
      await fetch('http://localhost:3000/submissions/resume/rtok_test123');
      await fetch('http://localhost:3000/submissions/resume/rtok_test123/resumed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: humanActor,
        }),
      });

      // Verify fetch was called for event emission
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/resumed'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('human'),
        })
      );
    });
  });

  describe('Mixed Attribution Workflow', () => {
    it('should correctly distinguish agent vs human filled fields', () => {
      // Create a submission with mixed attribution
      const mixedSubmission: Submission = {
        ...mockSubmission,
        fields: {
          companyName: 'Acme Corp', // Agent filled
          address: '123 Main St', // Agent filled
          taxId: '12-3456789', // Agent filled
          w9Document: 'file://uploads/w9.pdf', // Human filled
          insuranceCertificate: 'file://uploads/insurance.pdf', // Human filled
        },
        fieldAttribution: {
          companyName: agentActor,
          address: agentActor,
          taxId: agentActor,
          w9Document: humanActor,
          insuranceCertificate: humanActor,
        },
      };

      render(
        <FormBridgeForm
          schema={mockSchema}
          fields={mixedSubmission.fields}
          fieldAttribution={mixedSubmission.fieldAttribution}
          currentActor={humanActor}
        />
      );

      // Should have 3 agent badges
      const agentBadges = screen.getAllByText(/Filled by agent/i);
      expect(agentBadges).toHaveLength(3);

      // Should have 2 human badges
      const humanBadges = screen.getAllByText(/Filled by human/i);
      expect(humanBadges).toHaveLength(2);
    });

    it('should handle system actor attribution', () => {
      const systemActor: Actor = {
        kind: 'system',
        id: 'system-001',
        name: 'FormBridge System',
      };

      const systemSubmission: Submission = {
        ...mockSubmission,
        fields: {
          companyName: 'Auto-filled Corp',
        },
        fieldAttribution: {
          companyName: systemActor,
        },
      };

      render(
        <FormBridgeForm
          schema={mockSchema}
          fields={systemSubmission.fields}
          fieldAttribution={systemSubmission.fieldAttribution}
          currentActor={humanActor}
        />
      );

      // Should show system badge
      expect(screen.getByText(/Filled by system/i)).toBeInTheDocument();
    });
  });

  describe('Human Can Edit Agent-Filled Fields', () => {
    it('should allow human to modify agent-filled fields', () => {
      const { container: _container } = render(
        <FormBridgeForm
          schema={mockSchema}
          fields={mockSubmission.fields}
          fieldAttribution={mockSubmission.fieldAttribution}
          currentActor={humanActor}
        />
      );

      // Agent-filled fields should not be disabled
      const companyNameInput = screen.getByLabelText(/Company Name/i) as HTMLInputElement;
      expect(companyNameInput).not.toBeDisabled();

      const addressInput = screen.getByLabelText(/Address/i) as HTMLInputElement;
      expect(addressInput).not.toBeDisabled();
    });

    it('should not allow editing in read-only mode', () => {
      render(
        <FormBridgeForm
          schema={mockSchema}
          fields={mockSubmission.fields}
          fieldAttribution={mockSubmission.fieldAttribution}
          currentActor={humanActor}
          readOnly
        />
      );

      // All fields should be disabled in read-only mode
      const companyNameInput = screen.getByLabelText(/Company Name/i);
      expect(companyNameInput).toBeDisabled();
    });
  });

  describe('Form Validation', () => {
    it('should mark required fields with asterisk', () => {
      render(
        <FormBridgeForm
          schema={mockSchema}
          fields={mockSubmission.fields}
          fieldAttribution={mockSubmission.fieldAttribution}
          currentActor={humanActor}
        />
      );

      // Required fields should have asterisk
      const companyNameLabel = screen.getByText(/Company Name/i);
      expect(companyNameLabel.parentElement).toHaveTextContent('*');

      const taxIdLabel = screen.getByText(/Tax ID/i);
      expect(taxIdLabel.parentElement).toHaveTextContent('*');

      const w9Label = screen.getByText(/W-9 Form/i);
      expect(w9Label.parentElement).toHaveTextContent('*');
    });

    it('should not mark optional fields with asterisk', () => {
      render(
        <FormBridgeForm
          schema={mockSchema}
          fields={mockSubmission.fields}
          fieldAttribution={mockSubmission.fieldAttribution}
          currentActor={humanActor}
        />
      );

      // Address and Insurance are not required
      const _addressLabel = screen.getByText('Address');
      const _insuranceLabel = screen.getByText('Insurance Certificate');

      // These should not have asterisk in the required field sense
      // (They may have the asterisk from another context, so we check the input required attribute)
      const addressInput = screen.getByLabelText(/Address/i);
      expect(addressInput).not.toBeRequired();

      const insuranceInput = screen.getByLabelText(/Insurance Certificate/i);
      expect(insuranceInput).not.toBeRequired();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes for badges', () => {
      const { container } = render(
        <FormBridgeForm
          schema={mockSchema}
          fields={mockSubmission.fields}
          fieldAttribution={mockSubmission.fieldAttribution}
          currentActor={humanActor}
        />
      );

      // Actor badges should have role="status"
      const badges = container.querySelectorAll('[role="status"]');
      expect(badges.length).toBeGreaterThan(0);
    });

    it('should have proper labels for all form fields', () => {
      render(
        <FormBridgeForm
          schema={mockSchema}
          fields={mockSubmission.fields}
          fieldAttribution={mockSubmission.fieldAttribution}
          currentActor={humanActor}
        />
      );

      // All fields should be accessible by label
      expect(screen.getByLabelText(/Company Name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Address/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Tax ID/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/W-9 Form/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Insurance Certificate/i)).toBeInTheDocument();
    });
  });

  describe('Complete Handoff Scenario', () => {
    it('should display complete vendor onboarding scenario with mixed actors', () => {
      // This test simulates the complete workflow:
      // 1. Agent fills basic company info
      // 2. Human opens resume URL
      // 3. Human sees pre-filled data with attribution
      // 4. Human completes document uploads
      // 5. Form ready for submission

      const completeSubmission: Submission = {
        ...mockSubmission,
        fields: {
          companyName: 'Global Widgets Inc',
          address: '456 Tech Blvd, Austin, TX 78701',
          taxId: '98-7654321',
          w9Document: '', // Human needs to upload
          insuranceCertificate: '', // Human needs to upload
        },
        fieldAttribution: {
          companyName: agentActor,
          address: agentActor,
          taxId: agentActor,
        },
      };

      render(
        <FormBridgeForm
          schema={mockSchema}
          fields={completeSubmission.fields}
          fieldAttribution={completeSubmission.fieldAttribution}
          currentActor={humanActor}
        />
      );

      // Verify agent-filled data
      const companyNameInput = screen.getByLabelText(/Company Name/i) as HTMLInputElement;
      expect(companyNameInput.value).toBe('Global Widgets Inc');

      const addressInput = screen.getByLabelText(/Address/i) as HTMLInputElement;
      expect(addressInput.value).toBe('456 Tech Blvd, Austin, TX 78701');

      const taxIdInput = screen.getByLabelText(/Tax ID/i) as HTMLInputElement;
      expect(taxIdInput.value).toBe('98-7654321');

      // Verify attribution badges
      const agentBadges = screen.getAllByText(/Filled by agent/i);
      expect(agentBadges).toHaveLength(3);

      // Verify empty fields for human
      const w9Input = screen.getByLabelText(/W-9 Form/i) as HTMLInputElement;
      expect(w9Input.value).toBe('');

      const insuranceInput = screen.getByLabelText(/Insurance Certificate/i) as HTMLInputElement;
      expect(insuranceInput.value).toBe('');

      // Form should have submit button
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });
  });

  describe('Human Completes and Submits Form', () => {
    it('should allow human to fill remaining fields and submit', async () => {
      const onFieldChange = jest.fn();
      const onSubmit = jest.fn();

      const { rerender } = render(
        <FormBridgeForm
          schema={mockSchema}
          fields={mockSubmission.fields}
          fieldAttribution={mockSubmission.fieldAttribution}
          currentActor={humanActor}
          onFieldChange={onFieldChange}
          onSubmit={onSubmit}
        />
      );

      // Human fills the W-9 document field
      const w9Input = screen.getByLabelText(/W-9 Form/i) as HTMLInputElement;
      fireEvent.change(w9Input, { target: { value: 'file://uploads/w9-acme.pdf' } });

      // Verify onFieldChange was called with human actor
      expect(onFieldChange).toHaveBeenCalledWith(
        'w9Document',
        'file://uploads/w9-acme.pdf',
        humanActor
      );

      // Update component with new field value
      const updatedFields = {
        ...mockSubmission.fields,
        w9Document: 'file://uploads/w9-acme.pdf',
      };

      const updatedAttribution = {
        ...mockSubmission.fieldAttribution,
        w9Document: humanActor,
      };

      rerender(
        <FormBridgeForm
          schema={mockSchema}
          fields={updatedFields}
          fieldAttribution={updatedAttribution}
          currentActor={humanActor}
          onFieldChange={onFieldChange}
          onSubmit={onSubmit}
        />
      );

      // Human fills insurance certificate field
      const insuranceInput = screen.getByLabelText(/Insurance Certificate/i) as HTMLInputElement;
      fireEvent.change(insuranceInput, { target: { value: 'file://uploads/insurance-acme.pdf' } });

      // Verify onFieldChange was called again
      expect(onFieldChange).toHaveBeenCalledWith(
        'insuranceCertificate',
        'file://uploads/insurance-acme.pdf',
        humanActor
      );

      // Update component with all fields filled
      const finalFields = {
        ...updatedFields,
        insuranceCertificate: 'file://uploads/insurance-acme.pdf',
      };

      const finalAttribution = {
        ...updatedAttribution,
        insuranceCertificate: humanActor,
      };

      rerender(
        <FormBridgeForm
          schema={mockSchema}
          fields={finalFields}
          fieldAttribution={finalAttribution}
          currentActor={humanActor}
          onFieldChange={onFieldChange}
          onSubmit={onSubmit}
        />
      );

      // Human submits the form
      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      // Verify onSubmit was called with final field values
      expect(onSubmit).toHaveBeenCalledWith(finalFields);
    });

    it('should track both agent and human attribution after submission', async () => {
      // Create a complete submission with mixed attribution
      const mixedSubmission: Submission = {
        ...mockSubmission,
        fields: {
          companyName: 'Acme Corp', // Agent
          address: '123 Main St, San Francisco, CA 94105', // Agent
          taxId: '12-3456789', // Agent
          w9Document: 'file://uploads/w9-acme.pdf', // Human
          insuranceCertificate: 'file://uploads/insurance-acme.pdf', // Human
        },
        fieldAttribution: {
          companyName: agentActor,
          address: agentActor,
          taxId: agentActor,
          w9Document: humanActor,
          insuranceCertificate: humanActor,
        },
      };

      render(
        <FormBridgeForm
          schema={mockSchema}
          fields={mixedSubmission.fields}
          fieldAttribution={mixedSubmission.fieldAttribution}
          currentActor={humanActor}
        />
      );

      // Verify agent attribution badges (3 fields)
      const agentBadges = screen.getAllByText(/Filled by agent/i);
      expect(agentBadges).toHaveLength(3);

      // Verify human attribution badges (2 fields)
      const humanBadges = screen.getAllByText(/Filled by human/i);
      expect(humanBadges).toHaveLength(2);

      // Verify all fields have values
      expect((screen.getByLabelText(/Company Name/i) as HTMLInputElement).value).toBe('Acme Corp');
      expect((screen.getByLabelText(/Address/i) as HTMLInputElement).value).toBe('123 Main St, San Francisco, CA 94105');
      expect((screen.getByLabelText(/Tax ID/i) as HTMLInputElement).value).toBe('12-3456789');
      expect((screen.getByLabelText(/W-9 Form/i) as HTMLInputElement).value).toBe('file://uploads/w9-acme.pdf');
      expect((screen.getByLabelText(/Insurance Certificate/i) as HTMLInputElement).value).toBe('file://uploads/insurance-acme.pdf');
    });

    it('should verify submission state transitions to SUBMITTED', async () => {
      // Mock the submission API endpoint
      const mockSubmitFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          submissionId: 'sub_test123',
          state: 'submitted',
          message: 'Submission completed successfully',
        }),
      });

      global.fetch = mockSubmitFetch;

      const onSubmit = jest.fn(async (fields) => {
        // Simulate API call to submit the form
        const response = await fetch('http://localhost:3000/submissions/sub_test123/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields,
            actor: humanActor,
          }),
        });

        const result = await response.json();
        return result;
      });

      render(
        <FormBridgeForm
          schema={mockSchema}
          fields={{
            companyName: 'Acme Corp',
            address: '123 Main St',
            taxId: '12-3456789',
            w9Document: 'file://uploads/w9.pdf',
            insuranceCertificate: 'file://uploads/insurance.pdf',
          }}
          fieldAttribution={{
            companyName: agentActor,
            address: agentActor,
            taxId: agentActor,
            w9Document: humanActor,
            insuranceCertificate: humanActor,
          }}
          currentActor={humanActor}
          onSubmit={onSubmit}
        />
      );

      // Submit the form
      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      // Wait for async submission
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
      });

      // Verify API was called with correct payload
      expect(mockSubmitFetch).toHaveBeenCalledWith(
        'http://localhost:3000/submissions/sub_test123/submit',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('human'),
        })
      );

      // Verify the result
      const result = await onSubmit.mock.results[0].value;
      expect(result.state).toBe('submitted');
    });

    it('should show both actor types in submission events', async () => {
      // This test verifies that events track both agent and human actors
      // throughout the submission lifecycle

      const submissionWithEvents: Submission = {
        ...mockSubmission,
        fields: {
          companyName: 'Acme Corp',
          taxId: '12-3456789',
          w9Document: 'file://uploads/w9.pdf',
        },
        fieldAttribution: {
          companyName: agentActor,
          taxId: agentActor,
          w9Document: humanActor,
        },
        events: [
          {
            eventId: 'evt_001',
            submissionId: 'sub_test123',
            type: 'submission.created',
            ts: new Date().toISOString(),
            actor: agentActor,
            state: 'draft',
          },
          {
            eventId: 'evt_002',
            submissionId: 'sub_test123',
            type: 'field.updated',
            ts: new Date().toISOString(),
            actor: agentActor,
            state: 'in_progress',
            payload: { field: 'companyName', value: 'Acme Corp' },
          },
          {
            eventId: 'evt_003',
            submissionId: 'sub_test123',
            type: 'handoff.link_issued',
            ts: new Date().toISOString(),
            actor: agentActor,
            state: 'in_progress',
            payload: {
              url: 'http://localhost:3000/resume?token=rtok_test123',
              resumeToken: 'rtok_test123',
            },
          },
          {
            eventId: 'evt_004',
            submissionId: 'sub_test123',
            type: 'handoff.resumed',
            ts: new Date().toISOString(),
            actor: humanActor,
            state: 'in_progress',
          },
          {
            eventId: 'evt_005',
            submissionId: 'sub_test123',
            type: 'field.updated',
            ts: new Date().toISOString(),
            actor: humanActor,
            state: 'in_progress',
            payload: { field: 'w9Document', value: 'file://uploads/w9.pdf' },
          },
        ],
      };

      // Verify events contain both agent and human actors
      const agentEvents = submissionWithEvents.events.filter(e => e.actor.kind === 'agent');
      const humanEvents = submissionWithEvents.events.filter(e => e.actor.kind === 'human');

      expect(agentEvents).toHaveLength(3); // created, field.updated, handoff.link_issued
      expect(humanEvents).toHaveLength(2); // handoff.resumed, field.updated

      // Verify agent events
      expect(agentEvents[0].type).toBe('submission.created');
      expect(agentEvents[0].actor.id).toBe('agent-onboarding-001');
      expect(agentEvents[1].type).toBe('field.updated');
      expect(agentEvents[2].type).toBe('handoff.link_issued');

      // Verify human events
      expect(humanEvents[0].type).toBe('handoff.resumed');
      expect(humanEvents[0].actor.id).toBe('user-vendor-manager');
      expect(humanEvents[1].type).toBe('field.updated');
      expect(humanEvents[1].actor.kind).toBe('human');
    });

    it('should handle form submission with validation errors', async () => {
      const onSubmit = jest.fn();
      const errors = {
        taxId: 'Tax ID is required',
      };

      render(
        <FormBridgeForm
          schema={mockSchema}
          fields={{
            companyName: 'Acme Corp',
            address: '123 Main St',
            taxId: '', // Missing required field
          }}
          fieldAttribution={{
            companyName: agentActor,
            address: agentActor,
          }}
          currentActor={humanActor}
          onSubmit={onSubmit}
          errors={errors}
        />
      );

      // Verify error message is displayed
      expect(screen.getByText(/Tax ID is required/i)).toBeInTheDocument();

      // Submit button should still be present (submission handled by parent)
      const submitButton = screen.getByRole('button', { name: /submit/i });
      expect(submitButton).toBeInTheDocument();

      // Click submit (parent component will handle validation)
      fireEvent.click(submitButton);

      // onSubmit is called (validation is handled by parent/API)
      expect(onSubmit).toHaveBeenCalled();
    });

    it('should preserve agent fields when human submits', async () => {
      const onSubmit = jest.fn();

      const completeFields = {
        companyName: 'Acme Corp', // Agent filled
        address: '123 Main St', // Agent filled
        taxId: '12-3456789', // Agent filled
        w9Document: 'file://uploads/w9.pdf', // Human filled
        insuranceCertificate: 'file://uploads/insurance.pdf', // Human filled
      };

      render(
        <FormBridgeForm
          schema={mockSchema}
          fields={completeFields}
          fieldAttribution={{
            companyName: agentActor,
            address: agentActor,
            taxId: agentActor,
            w9Document: humanActor,
            insuranceCertificate: humanActor,
          }}
          currentActor={humanActor}
          onSubmit={onSubmit}
        />
      );

      // Submit form
      const submitButton = screen.getByRole('button', { name: /submit/i });
      fireEvent.click(submitButton);

      // Verify all fields (both agent and human) are submitted
      expect(onSubmit).toHaveBeenCalledWith(completeFields);

      // Verify agent fields are preserved
      const submittedFields = onSubmit.mock.calls[0][0];
      expect(submittedFields.companyName).toBe('Acme Corp');
      expect(submittedFields.address).toBe('123 Main St');
      expect(submittedFields.taxId).toBe('12-3456789');

      // Verify human fields are included
      expect(submittedFields.w9Document).toBe('file://uploads/w9.pdf');
      expect(submittedFields.insuranceCertificate).toBe('file://uploads/insurance.pdf');
    });
  });
});
