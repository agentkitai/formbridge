import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ResumeFormPage } from '../../packages/form-renderer/src/components/ResumeFormPage';
import { FormBridgeForm } from '../../packages/form-renderer/src/components/FormBridgeForm';
global.fetch = jest.fn();
describe('Resume Form Integration - Human Handoff', () => {
    const agentActor = {
        kind: 'agent',
        id: 'agent-onboarding-001',
        name: 'Vendor Onboarding Agent',
    };
    const humanActor = {
        kind: 'human',
        id: 'user-vendor-manager',
        name: 'Vendor Manager',
    };
    const mockSubmission = {
        id: 'sub_test123',
        intakeId: 'intake_vendor_onboarding',
        state: 'in_progress',
        resumeToken: 'rtok_test123',
        fields: {
            companyName: 'Acme Corp',
            address: '123 Main St, San Francisco, CA 94105',
            taxId: '12-3456789',
            w9Document: '',
            insuranceCertificate: '',
        },
        fieldAttribution: {
            companyName: agentActor,
            address: agentActor,
            taxId: agentActor,
        },
        events: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: agentActor,
        updatedBy: agentActor,
    };
    const mockSchema = {
        type: 'object',
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
        jest.clearAllMocks();
        global.fetch.mockImplementation((url) => {
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
            render(<ResumeFormPage resumeToken="rtok_test123" endpoint="http://localhost:3000"/>);
            expect(screen.getByText(/loading form/i)).toBeInTheDocument();
            await waitFor(() => {
                expect(screen.queryByText(/loading form/i)).not.toBeInTheDocument();
            });
        });
        it('should show error when resume token is missing', () => {
            render(<ResumeFormPage resumeToken={undefined} endpoint="http://localhost:3000"/>);
            expect(screen.getByRole('alert')).toBeInTheDocument();
            expect(screen.getByText(/missing resume token/i)).toBeInTheDocument();
        });
    });
    describe('Form Pre-filled with Agent Data', () => {
        it('should display agent-filled fields with correct values', () => {
            render(<FormBridgeForm schema={mockSchema} fields={mockSubmission.fields} fieldAttribution={mockSubmission.fieldAttribution} currentActor={humanActor}/>);
            const companyNameInput = screen.getByLabelText(/Company Name/i);
            expect(companyNameInput.value).toBe('Acme Corp');
            const addressInput = screen.getByLabelText(/Address/i);
            expect(addressInput.value).toBe('123 Main St, San Francisco, CA 94105');
            const taxIdInput = screen.getByLabelText(/Tax ID/i);
            expect(taxIdInput.value).toBe('12-3456789');
        });
        it('should display empty fields that human needs to fill', () => {
            render(<FormBridgeForm schema={mockSchema} fields={mockSubmission.fields} fieldAttribution={mockSubmission.fieldAttribution} currentActor={humanActor}/>);
            const w9Input = screen.getByLabelText(/W-9 Form/i);
            expect(w9Input.value).toBe('');
            const insuranceInput = screen.getByLabelText(/Insurance Certificate/i);
            expect(insuranceInput.value).toBe('');
        });
    });
    describe('Visual Attribution Badges', () => {
        it('should show "Filled by agent" badge on agent-filled fields', () => {
            render(<FormBridgeForm schema={mockSchema} fields={mockSubmission.fields} fieldAttribution={mockSubmission.fieldAttribution} currentActor={humanActor}/>);
            const agentBadges = screen.getAllByText(/Filled by agent/i);
            expect(agentBadges).toHaveLength(3);
        });
        it('should not show badges on empty fields', () => {
            render(<FormBridgeForm schema={mockSchema} fields={mockSubmission.fields} fieldAttribution={mockSubmission.fieldAttribution} currentActor={humanActor}/>);
            const allBadges = screen.getAllByText(/Filled by/i);
            expect(allBadges).toHaveLength(3);
        });
        it('should show agent name in attribution badge', () => {
            render(<FormBridgeForm schema={mockSchema} fields={mockSubmission.fields} fieldAttribution={mockSubmission.fieldAttribution} currentActor={humanActor}/>);
            expect(screen.getAllByText(/Vendor Onboarding Agent/i)).toBeTruthy();
        });
    });
    describe('HANDOFF_RESUMED Event Emission', () => {
        it('should emit HANDOFF_RESUMED event when form loads', async () => {
            const mockFetch = global.fetch;
            await fetch('http://localhost:3000/submissions/resume/rtok_test123');
            await fetch('http://localhost:3000/submissions/resume/rtok_test123/resumed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actor: humanActor,
                }),
            });
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/resumed'), expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('human'),
            }));
        });
    });
    describe('Mixed Attribution Workflow', () => {
        it('should correctly distinguish agent vs human filled fields', () => {
            const mixedSubmission = {
                ...mockSubmission,
                fields: {
                    companyName: 'Acme Corp',
                    address: '123 Main St',
                    taxId: '12-3456789',
                    w9Document: 'file://uploads/w9.pdf',
                    insuranceCertificate: 'file://uploads/insurance.pdf',
                },
                fieldAttribution: {
                    companyName: agentActor,
                    address: agentActor,
                    taxId: agentActor,
                    w9Document: humanActor,
                    insuranceCertificate: humanActor,
                },
            };
            render(<FormBridgeForm schema={mockSchema} fields={mixedSubmission.fields} fieldAttribution={mixedSubmission.fieldAttribution} currentActor={humanActor}/>);
            const agentBadges = screen.getAllByText(/Filled by agent/i);
            expect(agentBadges).toHaveLength(3);
            const humanBadges = screen.getAllByText(/Filled by human/i);
            expect(humanBadges).toHaveLength(2);
        });
        it('should handle system actor attribution', () => {
            const systemActor = {
                kind: 'system',
                id: 'system-001',
                name: 'FormBridge System',
            };
            const systemSubmission = {
                ...mockSubmission,
                fields: {
                    companyName: 'Auto-filled Corp',
                },
                fieldAttribution: {
                    companyName: systemActor,
                },
            };
            render(<FormBridgeForm schema={mockSchema} fields={systemSubmission.fields} fieldAttribution={systemSubmission.fieldAttribution} currentActor={humanActor}/>);
            expect(screen.getByText(/Filled by system/i)).toBeInTheDocument();
        });
    });
    describe('Human Can Edit Agent-Filled Fields', () => {
        it('should allow human to modify agent-filled fields', () => {
            const { container } = render(<FormBridgeForm schema={mockSchema} fields={mockSubmission.fields} fieldAttribution={mockSubmission.fieldAttribution} currentActor={humanActor}/>);
            const companyNameInput = screen.getByLabelText(/Company Name/i);
            expect(companyNameInput).not.toBeDisabled();
            const addressInput = screen.getByLabelText(/Address/i);
            expect(addressInput).not.toBeDisabled();
        });
        it('should not allow editing in read-only mode', () => {
            render(<FormBridgeForm schema={mockSchema} fields={mockSubmission.fields} fieldAttribution={mockSubmission.fieldAttribution} currentActor={humanActor} readOnly/>);
            const companyNameInput = screen.getByLabelText(/Company Name/i);
            expect(companyNameInput).toBeDisabled();
        });
    });
    describe('Form Validation', () => {
        it('should mark required fields with asterisk', () => {
            render(<FormBridgeForm schema={mockSchema} fields={mockSubmission.fields} fieldAttribution={mockSubmission.fieldAttribution} currentActor={humanActor}/>);
            const companyNameLabel = screen.getByText(/Company Name/i);
            expect(companyNameLabel.parentElement).toHaveTextContent('*');
            const taxIdLabel = screen.getByText(/Tax ID/i);
            expect(taxIdLabel.parentElement).toHaveTextContent('*');
            const w9Label = screen.getByText(/W-9 Form/i);
            expect(w9Label.parentElement).toHaveTextContent('*');
        });
        it('should not mark optional fields with asterisk', () => {
            render(<FormBridgeForm schema={mockSchema} fields={mockSubmission.fields} fieldAttribution={mockSubmission.fieldAttribution} currentActor={humanActor}/>);
            const addressLabel = screen.getByText('Address');
            const insuranceLabel = screen.getByText('Insurance Certificate');
            const addressInput = screen.getByLabelText(/Address/i);
            expect(addressInput).not.toBeRequired();
            const insuranceInput = screen.getByLabelText(/Insurance Certificate/i);
            expect(insuranceInput).not.toBeRequired();
        });
    });
    describe('Accessibility', () => {
        it('should have proper ARIA attributes for badges', () => {
            const { container } = render(<FormBridgeForm schema={mockSchema} fields={mockSubmission.fields} fieldAttribution={mockSubmission.fieldAttribution} currentActor={humanActor}/>);
            const badges = container.querySelectorAll('[role="status"]');
            expect(badges.length).toBeGreaterThan(0);
        });
        it('should have proper labels for all form fields', () => {
            render(<FormBridgeForm schema={mockSchema} fields={mockSubmission.fields} fieldAttribution={mockSubmission.fieldAttribution} currentActor={humanActor}/>);
            expect(screen.getByLabelText(/Company Name/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/Address/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/Tax ID/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/W-9 Form/i)).toBeInTheDocument();
            expect(screen.getByLabelText(/Insurance Certificate/i)).toBeInTheDocument();
        });
    });
    describe('Complete Handoff Scenario', () => {
        it('should display complete vendor onboarding scenario with mixed actors', () => {
            const completeSubmission = {
                ...mockSubmission,
                fields: {
                    companyName: 'Global Widgets Inc',
                    address: '456 Tech Blvd, Austin, TX 78701',
                    taxId: '98-7654321',
                    w9Document: '',
                    insuranceCertificate: '',
                },
                fieldAttribution: {
                    companyName: agentActor,
                    address: agentActor,
                    taxId: agentActor,
                },
            };
            render(<FormBridgeForm schema={mockSchema} fields={completeSubmission.fields} fieldAttribution={completeSubmission.fieldAttribution} currentActor={humanActor}/>);
            const companyNameInput = screen.getByLabelText(/Company Name/i);
            expect(companyNameInput.value).toBe('Global Widgets Inc');
            const addressInput = screen.getByLabelText(/Address/i);
            expect(addressInput.value).toBe('456 Tech Blvd, Austin, TX 78701');
            const taxIdInput = screen.getByLabelText(/Tax ID/i);
            expect(taxIdInput.value).toBe('98-7654321');
            const agentBadges = screen.getAllByText(/Filled by agent/i);
            expect(agentBadges).toHaveLength(3);
            const w9Input = screen.getByLabelText(/W-9 Form/i);
            expect(w9Input.value).toBe('');
            const insuranceInput = screen.getByLabelText(/Insurance Certificate/i);
            expect(insuranceInput.value).toBe('');
            expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
        });
    });
    describe('Human Completes and Submits Form', () => {
        it('should allow human to fill remaining fields and submit', async () => {
            const onFieldChange = jest.fn();
            const onSubmit = jest.fn();
            const { rerender } = render(<FormBridgeForm schema={mockSchema} fields={mockSubmission.fields} fieldAttribution={mockSubmission.fieldAttribution} currentActor={humanActor} onFieldChange={onFieldChange} onSubmit={onSubmit}/>);
            const w9Input = screen.getByLabelText(/W-9 Form/i);
            fireEvent.change(w9Input, { target: { value: 'file://uploads/w9-acme.pdf' } });
            expect(onFieldChange).toHaveBeenCalledWith('w9Document', 'file://uploads/w9-acme.pdf', humanActor);
            const updatedFields = {
                ...mockSubmission.fields,
                w9Document: 'file://uploads/w9-acme.pdf',
            };
            const updatedAttribution = {
                ...mockSubmission.fieldAttribution,
                w9Document: humanActor,
            };
            rerender(<FormBridgeForm schema={mockSchema} fields={updatedFields} fieldAttribution={updatedAttribution} currentActor={humanActor} onFieldChange={onFieldChange} onSubmit={onSubmit}/>);
            const insuranceInput = screen.getByLabelText(/Insurance Certificate/i);
            fireEvent.change(insuranceInput, { target: { value: 'file://uploads/insurance-acme.pdf' } });
            expect(onFieldChange).toHaveBeenCalledWith('insuranceCertificate', 'file://uploads/insurance-acme.pdf', humanActor);
            const finalFields = {
                ...updatedFields,
                insuranceCertificate: 'file://uploads/insurance-acme.pdf',
            };
            const finalAttribution = {
                ...updatedAttribution,
                insuranceCertificate: humanActor,
            };
            rerender(<FormBridgeForm schema={mockSchema} fields={finalFields} fieldAttribution={finalAttribution} currentActor={humanActor} onFieldChange={onFieldChange} onSubmit={onSubmit}/>);
            const submitButton = screen.getByRole('button', { name: /submit/i });
            fireEvent.click(submitButton);
            expect(onSubmit).toHaveBeenCalledWith(finalFields);
        });
        it('should track both agent and human attribution after submission', async () => {
            const mixedSubmission = {
                ...mockSubmission,
                fields: {
                    companyName: 'Acme Corp',
                    address: '123 Main St, San Francisco, CA 94105',
                    taxId: '12-3456789',
                    w9Document: 'file://uploads/w9-acme.pdf',
                    insuranceCertificate: 'file://uploads/insurance-acme.pdf',
                },
                fieldAttribution: {
                    companyName: agentActor,
                    address: agentActor,
                    taxId: agentActor,
                    w9Document: humanActor,
                    insuranceCertificate: humanActor,
                },
            };
            render(<FormBridgeForm schema={mockSchema} fields={mixedSubmission.fields} fieldAttribution={mixedSubmission.fieldAttribution} currentActor={humanActor}/>);
            const agentBadges = screen.getAllByText(/Filled by agent/i);
            expect(agentBadges).toHaveLength(3);
            const humanBadges = screen.getAllByText(/Filled by human/i);
            expect(humanBadges).toHaveLength(2);
            expect(screen.getByLabelText(/Company Name/i).value).toBe('Acme Corp');
            expect(screen.getByLabelText(/Address/i).value).toBe('123 Main St, San Francisco, CA 94105');
            expect(screen.getByLabelText(/Tax ID/i).value).toBe('12-3456789');
            expect(screen.getByLabelText(/W-9 Form/i).value).toBe('file://uploads/w9-acme.pdf');
            expect(screen.getByLabelText(/Insurance Certificate/i).value).toBe('file://uploads/insurance-acme.pdf');
        });
        it('should verify submission state transitions to SUBMITTED', async () => {
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
            render(<FormBridgeForm schema={mockSchema} fields={{
                    companyName: 'Acme Corp',
                    address: '123 Main St',
                    taxId: '12-3456789',
                    w9Document: 'file://uploads/w9.pdf',
                    insuranceCertificate: 'file://uploads/insurance.pdf',
                }} fieldAttribution={{
                    companyName: agentActor,
                    address: agentActor,
                    taxId: agentActor,
                    w9Document: humanActor,
                    insuranceCertificate: humanActor,
                }} currentActor={humanActor} onSubmit={onSubmit}/>);
            const submitButton = screen.getByRole('button', { name: /submit/i });
            fireEvent.click(submitButton);
            await waitFor(() => {
                expect(onSubmit).toHaveBeenCalled();
            });
            expect(mockSubmitFetch).toHaveBeenCalledWith('http://localhost:3000/submissions/sub_test123/submit', expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('human'),
            }));
            const result = await onSubmit.mock.results[0].value;
            expect(result.state).toBe('submitted');
        });
        it('should show both actor types in submission events', async () => {
            const submissionWithEvents = {
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
            const agentEvents = submissionWithEvents.events.filter(e => e.actor.kind === 'agent');
            const humanEvents = submissionWithEvents.events.filter(e => e.actor.kind === 'human');
            expect(agentEvents).toHaveLength(3);
            expect(humanEvents).toHaveLength(2);
            expect(agentEvents[0].type).toBe('submission.created');
            expect(agentEvents[0].actor.id).toBe('agent-onboarding-001');
            expect(agentEvents[1].type).toBe('field.updated');
            expect(agentEvents[2].type).toBe('handoff.link_issued');
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
            render(<FormBridgeForm schema={mockSchema} fields={{
                    companyName: 'Acme Corp',
                    address: '123 Main St',
                    taxId: '',
                }} fieldAttribution={{
                    companyName: agentActor,
                    address: agentActor,
                }} currentActor={humanActor} onSubmit={onSubmit} errors={errors}/>);
            expect(screen.getByText(/Tax ID is required/i)).toBeInTheDocument();
            const submitButton = screen.getByRole('button', { name: /submit/i });
            expect(submitButton).toBeInTheDocument();
            fireEvent.click(submitButton);
            expect(onSubmit).toHaveBeenCalled();
        });
        it('should preserve agent fields when human submits', async () => {
            const onSubmit = jest.fn();
            const completeFields = {
                companyName: 'Acme Corp',
                address: '123 Main St',
                taxId: '12-3456789',
                w9Document: 'file://uploads/w9.pdf',
                insuranceCertificate: 'file://uploads/insurance.pdf',
            };
            render(<FormBridgeForm schema={mockSchema} fields={completeFields} fieldAttribution={{
                    companyName: agentActor,
                    address: agentActor,
                    taxId: agentActor,
                    w9Document: humanActor,
                    insuranceCertificate: humanActor,
                }} currentActor={humanActor} onSubmit={onSubmit}/>);
            const submitButton = screen.getByRole('button', { name: /submit/i });
            fireEvent.click(submitButton);
            expect(onSubmit).toHaveBeenCalledWith(completeFields);
            const submittedFields = onSubmit.mock.calls[0][0];
            expect(submittedFields.companyName).toBe('Acme Corp');
            expect(submittedFields.address).toBe('123 Main St');
            expect(submittedFields.taxId).toBe('12-3456789');
            expect(submittedFields.w9Document).toBe('file://uploads/w9.pdf');
            expect(submittedFields.insuranceCertificate).toBe('file://uploads/insurance.pdf');
        });
    });
});
//# sourceMappingURL=resume-form.test.js.map