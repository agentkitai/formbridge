/**
 * End-to-End Integration Tests for Approval Workflow
 *
 * Tests the complete approval flow for submissions requiring human review:
 * 1. Agent submits form with approval_required: true
 * 2. Verify submission transitions to needs_review state
 * 3. Verify agent receives needs_approval error
 * 4. Reviewer approves submission
 * 5. Verify submission transitions to approved
 * 6. Verify events are recorded in event stream
 *
 * Validates that the approval workflow works end-to-end across
 * SubmissionManager and ApprovalManager.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SubmissionManager } from '../../src/core/submission-manager';
import { ApprovalManager } from '../../src/core/approval-manager';
import type {
  Actor,
  IntakeEvent,
  CreateSubmissionRequest,
  SetFieldsRequest,
  SubmitRequest,
  IntakeDefinition,
  ApprovalGate,
} from '../../src/types/intake-contract';
import type { Submission } from '../../src/types';

// Mock in-memory store for submissions
class MockSubmissionStore {
  private submissions = new Map<string, Submission>();
  private submissionsByToken = new Map<string, Submission>();

  async get(submissionId: string): Promise<Submission | null> {
    return this.submissions.get(submissionId) || null;
  }

  async save(submission: Submission): Promise<void> {
    this.submissions.set(submission.id, submission);
    this.submissionsByToken.set(submission.resumeToken, submission);
  }

  async getByResumeToken(resumeToken: string): Promise<Submission | null> {
    return this.submissionsByToken.get(resumeToken) || null;
  }

  clear() {
    this.submissions.clear();
    this.submissionsByToken.clear();
  }
}

// Mock event emitter for tracking events
class MockEventEmitter {
  public events: IntakeEvent[] = [];

  async emit(event: IntakeEvent): Promise<void> {
    this.events.push(event);
  }

  clear() {
    this.events = [];
  }

  getEventsByType(type: string): IntakeEvent[] {
    return this.events.filter((e) => e.type === type);
  }
}

// Mock intake registry that stores approval gate configuration
class MockIntakeRegistry {
  private intakes = new Map<string, IntakeDefinition>();

  register(intake: IntakeDefinition) {
    this.intakes.set(intake.id, intake);
  }

  getIntake(intakeId: string): IntakeDefinition {
    const intake = this.intakes.get(intakeId);
    if (!intake) {
      throw new Error(`Intake not found: ${intakeId}`);
    }
    return intake;
  }

  clear() {
    this.intakes.clear();
  }
}

describe('Approval Workflow End-to-End', () => {
  let submissionManager: SubmissionManager;
  let approvalManager: ApprovalManager;
  let store: MockSubmissionStore;
  let eventEmitter: MockEventEmitter;
  let intakeRegistry: MockIntakeRegistry;

  const agentActor: Actor = {
    kind: 'agent',
    id: 'agent-001',
    name: 'Vendor Onboarding Agent',
  };

  const reviewerActor: Actor = {
    kind: 'human',
    id: 'reviewer-001',
    name: 'Jane Reviewer',
  };

  beforeEach(() => {
    store = new MockSubmissionStore();
    eventEmitter = new MockEventEmitter();
    intakeRegistry = new MockIntakeRegistry();

    submissionManager = new SubmissionManager(
      store,
      eventEmitter,
      intakeRegistry
    );

    approvalManager = new ApprovalManager(store, eventEmitter);
  });

  describe('complete approval workflow', () => {
    it('should handle full workflow: submit → needs_review → approved', async () => {
      // Step 1: Register an intake with approval gates
      const approvalGate: ApprovalGate = {
        name: 'compliance_review',
        reviewers: ['reviewer-001', 'reviewer-002'],
        requiredApprovals: 1,
      };

      const intake: IntakeDefinition = {
        id: 'vendor_onboarding',
        version: '1.0.0',
        name: 'Vendor Onboarding',
        description: 'Onboard new vendors with compliance review',
        schema: {},
        approvalGates: [approvalGate],
        destination: {
          kind: 'webhook',
          url: 'https://api.example.com/vendors',
        },
      };

      intakeRegistry.register(intake);

      // Step 2: Agent creates a submission
      const createRequest: CreateSubmissionRequest = {
        intakeId: 'vendor_onboarding',
        actor: agentActor,
        initialFields: {
          companyName: 'Acme Corporation',
          taxId: '12-3456789',
          address: '123 Main St, Springfield, IL',
        },
        idempotencyKey: 'idem_test_123',
      };

      const createResponse = await submissionManager.createSubmission(
        createRequest
      );

      expect(createResponse.ok).toBe(true);
      expect(createResponse.state).toBe('draft');

      const submissionId = createResponse.submissionId;
      const resumeToken = createResponse.resumeToken;

      // Step 3: Agent submits the form
      const submitRequest: SubmitRequest = {
        submissionId,
        resumeToken,
        idempotencyKey: 'idem_submit_456',
        actor: agentActor,
      };

      const submitResponse = await submissionManager.submit(submitRequest);

      // Step 4: Verify submission transitions to needs_review
      expect(submitResponse.ok).toBe(false);
      if (!submitResponse.ok) {
        expect(submitResponse.state).toBe('needs_review');
        expect(submitResponse.error.type).toBe('needs_approval');
        expect(submitResponse.error.message).toContain(
          'requires human review'
        );
        expect(submitResponse.error.retryable).toBe(false);
        expect(submitResponse.error.nextActions).toBeDefined();
        expect(submitResponse.error.nextActions?.[0]).toMatchObject({
          action: 'wait_for_review',
          hint: expect.any(String),
        });
      }

      // Verify submission state in database
      const submission = await store.get(submissionId);
      expect(submission).toBeDefined();
      expect(submission!.state).toBe('needs_review');
      expect(submission!.updatedBy).toEqual(agentActor);

      // Step 5: Verify review.requested event was emitted
      const reviewRequestedEvents =
        eventEmitter.getEventsByType('review.requested');
      expect(reviewRequestedEvents).toHaveLength(1);
      expect(reviewRequestedEvents[0].submissionId).toBe(submissionId);
      expect(reviewRequestedEvents[0].actor).toEqual(agentActor);
      expect(reviewRequestedEvents[0].state).toBe('needs_review');

      // Step 6: Reviewer approves the submission
      const approveResponse = await approvalManager.approve({
        submissionId,
        resumeToken,
        actor: reviewerActor,
        comment: 'All vendor information looks correct. Approved.',
      });

      expect(approveResponse.ok).toBe(true);
      if (approveResponse.ok) {
        expect(approveResponse.submissionId).toBe(submissionId);
        expect(approveResponse.state).toBe('approved');
        expect(approveResponse.resumeToken).toBe(resumeToken);
      }

      // Step 7: Verify submission transitioned to approved state
      const approvedSubmission = await store.get(submissionId);
      expect(approvedSubmission).toBeDefined();
      expect(approvedSubmission!.state).toBe('approved');
      expect(approvedSubmission!.updatedBy).toEqual(reviewerActor);

      // Step 8: Verify review.approved event was emitted
      const reviewApprovedEvents =
        eventEmitter.getEventsByType('review.approved');
      expect(reviewApprovedEvents).toHaveLength(1);
      expect(reviewApprovedEvents[0].submissionId).toBe(submissionId);
      expect(reviewApprovedEvents[0].actor).toEqual(reviewerActor);
      expect(reviewApprovedEvents[0].state).toBe('approved');
      expect(reviewApprovedEvents[0].payload?.comment).toBe(
        'All vendor information looks correct. Approved.'
      );

      // Step 9: Verify all events are in submission event history
      expect(approvedSubmission!.events).toHaveLength(3);
      expect(approvedSubmission!.events[0].type).toBe('submission.created');
      expect(approvedSubmission!.events[1].type).toBe('review.requested');
      expect(approvedSubmission!.events[2].type).toBe('review.approved');
    });

    it('should handle reject workflow: submit → needs_review → rejected', async () => {
      // Setup intake with approval gates
      const intake: IntakeDefinition = {
        id: 'vendor_onboarding',
        version: '1.0.0',
        name: 'Vendor Onboarding',
        schema: {},
        approvalGates: [
          {
            name: 'compliance_review',
            reviewers: ['reviewer-001'],
          },
        ],
        destination: {
          kind: 'webhook',
          url: 'https://api.example.com/vendors',
        },
      };

      intakeRegistry.register(intake);

      // Agent creates and submits
      const createResponse = await submissionManager.createSubmission({
        intakeId: 'vendor_onboarding',
        actor: agentActor,
        initialFields: {
          companyName: 'Test Corp',
          taxId: 'invalid-format',
        },
      });

      const submitResponse = await submissionManager.submit({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        idempotencyKey: 'idem_submit',
        actor: agentActor,
      });

      // Verify needs_review
      expect(submitResponse.ok).toBe(false);
      if (!submitResponse.ok) {
        expect(submitResponse.state).toBe('needs_review');
      }

      // Reviewer rejects
      const rejectResponse = await approvalManager.reject({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: reviewerActor,
        reason: 'Tax ID format is invalid',
        comment: 'Please provide a valid EIN format (XX-XXXXXXX)',
      });

      expect(rejectResponse.ok).toBe(true);
      if (rejectResponse.ok) {
        expect(rejectResponse.state).toBe('rejected');
      }

      // Verify state and events
      const rejectedSubmission = await store.get(
        createResponse.submissionId
      );
      expect(rejectedSubmission!.state).toBe('rejected');
      expect(rejectedSubmission!.updatedBy).toEqual(reviewerActor);

      // Verify review.rejected event was emitted
      const reviewRejectedEvents =
        eventEmitter.getEventsByType('review.rejected');
      expect(reviewRejectedEvents).toHaveLength(1);
      expect(reviewRejectedEvents[0].submissionId).toBe(
        createResponse.submissionId
      );
      expect(reviewRejectedEvents[0].actor).toEqual(reviewerActor);
      expect(reviewRejectedEvents[0].state).toBe('rejected');
      expect(reviewRejectedEvents[0].payload?.reason).toBe(
        'Tax ID format is invalid'
      );
      expect(reviewRejectedEvents[0].payload?.comment).toBe(
        'Please provide a valid EIN format (XX-XXXXXXX)'
      );

      // Verify rejection reason is stored in submission metadata
      const reviewDecisions = (rejectedSubmission as any).reviewDecisions;
      expect(reviewDecisions).toBeDefined();
      expect(reviewDecisions).toHaveLength(1);
      expect(reviewDecisions[0].action).toBe('reject');
      expect(reviewDecisions[0].actor).toEqual(reviewerActor);
      expect(reviewDecisions[0].reason).toBe('Tax ID format is invalid');
      expect(reviewDecisions[0].comment).toBe(
        'Please provide a valid EIN format (XX-XXXXXXX)'
      );
      expect(reviewDecisions[0].timestamp).toBeDefined();

      // Verify all events are in submission event history
      expect(rejectedSubmission!.events).toHaveLength(3);
      expect(rejectedSubmission!.events[0].type).toBe('submission.created');
      expect(rejectedSubmission!.events[1].type).toBe('review.requested');
      expect(rejectedSubmission!.events[2].type).toBe('review.rejected');
    });

    it('should handle request_changes workflow: needs_review → draft', async () => {
      // Setup intake with approval gates
      const intake: IntakeDefinition = {
        id: 'vendor_onboarding',
        version: '1.0.0',
        name: 'Vendor Onboarding',
        schema: {},
        approvalGates: [
          {
            name: 'compliance_review',
            reviewers: ['reviewer-001'],
          },
        ],
        destination: {
          kind: 'webhook',
          url: 'https://api.example.com/vendors',
        },
      };

      intakeRegistry.register(intake);

      // Agent creates and submits
      const createResponse = await submissionManager.createSubmission({
        intakeId: 'vendor_onboarding',
        actor: agentActor,
        initialFields: {
          companyName: 'Test Corp',
          address: 'Incomplete address',
        },
      });

      await submissionManager.submit({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        idempotencyKey: 'idem_submit',
        actor: agentActor,
      });

      // Reviewer requests changes
      const requestChangesResponse = await approvalManager.requestChanges({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: reviewerActor,
        fieldComments: [
          {
            fieldPath: 'address',
            comment: 'Please provide a complete address with city and state',
            suggestedValue: '123 Main St, Springfield, IL 62701',
          },
          {
            fieldPath: 'taxId',
            comment: 'Tax ID is missing',
          },
        ],
        comment: 'Please complete the missing information',
      });

      expect(requestChangesResponse.ok).toBe(true);
      if (requestChangesResponse.ok) {
        expect(requestChangesResponse.state).toBe('draft');
      }

      // Verify submission transitioned back to draft
      const draftSubmission = await store.get(createResponse.submissionId);
      expect(draftSubmission!.state).toBe('draft');

      // Verify field.updated event was emitted (used for request_changes)
      const fieldUpdatedEvents = eventEmitter.getEventsByType('field.updated');
      expect(fieldUpdatedEvents.length).toBeGreaterThan(0);

      // Find the request_changes event
      const requestChangesEvent = fieldUpdatedEvents.find(
        (e) => e.payload?.action === 'request_changes'
      );
      expect(requestChangesEvent).toBeDefined();
      expect(requestChangesEvent?.payload?.fieldComments).toHaveLength(2);
    });

    it('should work with agent setting additional fields before submit', async () => {
      // Setup
      const intake: IntakeDefinition = {
        id: 'vendor_onboarding',
        version: '1.0.0',
        name: 'Vendor Onboarding',
        schema: {},
        approvalGates: [
          {
            name: 'compliance_review',
            reviewers: ['reviewer-001'],
          },
        ],
        destination: {
          kind: 'webhook',
          url: 'https://api.example.com/vendors',
        },
      };

      intakeRegistry.register(intake);

      // Agent creates submission
      const createResponse = await submissionManager.createSubmission({
        intakeId: 'vendor_onboarding',
        actor: agentActor,
        initialFields: {
          companyName: 'Acme Corp',
        },
      });

      // Agent sets additional fields
      const setFieldsRequest: SetFieldsRequest = {
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: agentActor,
        fields: {
          taxId: '12-3456789',
          email: 'contact@acme.com',
          phone: '555-0100',
        },
      };

      const setFieldsResponse =
        await submissionManager.setFields(setFieldsRequest);
      expect(setFieldsResponse.ok).toBe(true);

      // Agent submits
      const submitResponse = await submissionManager.submit({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        idempotencyKey: 'idem_submit',
        actor: agentActor,
      });

      // Verify needs_review
      expect(submitResponse.ok).toBe(false);
      if (!submitResponse.ok) {
        expect(submitResponse.state).toBe('needs_review');
      }

      // Verify all fields are present
      const submission = await store.get(createResponse.submissionId);
      expect(submission!.fields).toEqual({
        companyName: 'Acme Corp',
        taxId: '12-3456789',
        email: 'contact@acme.com',
        phone: '555-0100',
      });

      // Verify field attribution tracks the agent
      expect(submission!.fieldAttribution['companyName']).toEqual(agentActor);
      expect(submission!.fieldAttribution['taxId']).toEqual(agentActor);
      expect(submission!.fieldAttribution['email']).toEqual(agentActor);
      expect(submission!.fieldAttribution['phone']).toEqual(agentActor);
    });

    it('should not require approval when no approval gates configured', async () => {
      // Setup intake WITHOUT approval gates
      const intake: IntakeDefinition = {
        id: 'simple_form',
        version: '1.0.0',
        name: 'Simple Form',
        schema: {},
        destination: {
          kind: 'webhook',
          url: 'https://api.example.com/simple',
        },
      };

      intakeRegistry.register(intake);

      // Agent creates and submits
      const createResponse = await submissionManager.createSubmission({
        intakeId: 'simple_form',
        actor: agentActor,
        initialFields: {
          field1: 'value1',
        },
      });

      const submitResponse = await submissionManager.submit({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        idempotencyKey: 'idem_submit',
        actor: agentActor,
      });

      // Should succeed and transition to submitted (not needs_review)
      expect(submitResponse.ok).toBe(true);
      if (submitResponse.ok) {
        expect(submitResponse.state).toBe('submitted');
      }

      // Verify no review.requested event
      const reviewRequestedEvents =
        eventEmitter.getEventsByType('review.requested');
      expect(reviewRequestedEvents).toHaveLength(0);

      // Verify submission.submitted event
      const submittedEvents = eventEmitter.getEventsByType(
        'submission.submitted'
      );
      expect(submittedEvents).toHaveLength(1);
    });

    it('should prevent approval when submission is not in needs_review state', async () => {
      // Create a submission in draft state (not needs_review)
      const createResponse = await submissionManager.createSubmission({
        intakeId: 'test_intake',
        actor: agentActor,
      });

      // Try to approve (should fail)
      const approveResponse = await approvalManager.approve({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: reviewerActor,
      });

      expect(approveResponse.ok).toBe(false);
      if (!approveResponse.ok) {
        expect(approveResponse.error.type).toBe('conflict');
        expect(approveResponse.error.message).toContain('Cannot approve');
      }
    });

    it('should record review decisions in submission metadata', async () => {
      // Setup
      const intake: IntakeDefinition = {
        id: 'vendor_onboarding',
        version: '1.0.0',
        name: 'Vendor Onboarding',
        schema: {},
        approvalGates: [
          {
            name: 'compliance_review',
            reviewers: ['reviewer-001'],
          },
        ],
        destination: {
          kind: 'webhook',
          url: 'https://api.example.com/vendors',
        },
      };

      intakeRegistry.register(intake);

      // Create and submit
      const createResponse = await submissionManager.createSubmission({
        intakeId: 'vendor_onboarding',
        actor: agentActor,
        initialFields: { companyName: 'Test' },
      });

      await submissionManager.submit({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        idempotencyKey: 'idem_submit',
        actor: agentActor,
      });

      // Approve
      await approvalManager.approve({
        submissionId: createResponse.submissionId,
        resumeToken: createResponse.resumeToken,
        actor: reviewerActor,
        comment: 'Looks good',
      });

      // Verify review decision is stored
      const submission = await store.get(createResponse.submissionId);
      const reviewDecisions = (submission as any).reviewDecisions;

      expect(reviewDecisions).toBeDefined();
      expect(reviewDecisions).toHaveLength(1);
      expect(reviewDecisions[0].action).toBe('approve');
      expect(reviewDecisions[0].actor).toEqual(reviewerActor);
      expect(reviewDecisions[0].comment).toBe('Looks good');
      expect(reviewDecisions[0].timestamp).toBeDefined();
    });
  });
});
