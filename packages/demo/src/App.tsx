/**
 * Demo Application - Mixed-Mode Agent-Human Collaboration
 * Demonstrates agent-to-human handoff workflow with FormBridge
 */

import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ResumeFormPage, ReviewerView, ApprovalActions } from '@formbridge/form-renderer';
import type { ReviewSubmission, FieldComment } from '@formbridge/form-renderer';

/**
 * Home page component - Demo landing page
 */
const HomePage: React.FC = () => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [simulationLog, setSimulationLog] = useState<string[]>([]);

  /**
   * Simulates agent workflow: create submission, fill fields, generate resume URL
   */
  const handleSimulateAgent = async () => {
    setIsSimulating(true);
    setResumeUrl(null);
    setSimulationLog([]);

    try {
      // Step 1: Simulate agent creating submission
      setSimulationLog((prev) => [...prev, '✓ Agent: Creating new submission...']);
      await simulateDelay(500);
      const submissionId = `sub_${Date.now()}`;
      setSimulationLog((prev) => [...prev, `✓ Agent: Submission created: ${submissionId}`]);

      // Step 2: Simulate agent filling fields
      await simulateDelay(500);
      setSimulationLog((prev) => [
        ...prev,
        '✓ Agent: Filling known fields (name, address, tax ID)...',
      ]);
      await simulateDelay(500);
      setSimulationLog((prev) => [
        ...prev,
        '  - Set field "companyName" = "Acme Corp"',
        '  - Set field "address" = "123 Main St, San Francisco, CA"',
        '  - Set field "taxId" = "12-3456789"',
      ]);

      // Step 3: Simulate generating resume URL
      await simulateDelay(500);
      setSimulationLog((prev) => [...prev, '✓ Agent: Generating handoff URL...']);
      await simulateDelay(500);
      const resumeToken = `rtok_${Date.now()}`;
      const generatedUrl = `${window.location.origin}/resume?token=${resumeToken}`;
      setResumeUrl(generatedUrl);
      setSimulationLog((prev) => [
        ...prev,
        '✓ Agent: Resume URL generated successfully!',
        '✓ Agent: Handoff complete. Ready for human to complete form.',
      ]);
    } catch (error) {
      setSimulationLog((prev) => [
        ...prev,
        `✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ]);
    } finally {
      setIsSimulating(false);
    }
  };

  /**
   * Helper function to simulate async delays
   */
  const simulateDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  return (
    <div className="demo-home">
      <header className="demo-header">
        <h1>FormBridge Demo</h1>
        <p className="demo-subtitle">Mixed-Mode Agent-Human Collaboration</p>
      </header>

      <main className="demo-content">
        <section className="demo-section">
          <h2>Agent-to-Human Handoff Workflow</h2>
          <p>
            This demo showcases how an AI agent can start a form submission, fill the fields it knows,
            and generate a shareable resume URL for a human to complete the remaining fields.
          </p>
          <ul>
            <li><strong>String fields</strong> with various formats (email, URL, tel)</li>
            <li><strong>Number fields</strong> (integer and decimal) with min/max constraints</li>
            <li><strong>Boolean fields</strong> (checkboxes)</li>
            <li><strong>Enum fields</strong> as select dropdowns and radio buttons</li>
            <li><strong>Nested object fields</strong> (Address section)</li>
            <li><strong>Array fields</strong> for repeatable data (Certifications, Service Categories)</li>
            <li><strong>File upload fields</strong> with drag-and-drop support and constraints</li>
          </ul>
        </section>

        <section className="demo-section demo-simulation">
          <h3>Try It Out</h3>
          <p>Click the button below to simulate an agent starting a form submission:</p>
          <button
            className="demo-button demo-button-primary"
            onClick={handleSimulateAgent}
            disabled={isSimulating}
            aria-label="Simulate agent workflow"
          >
            {isSimulating ? 'Simulating Agent...' : '🤖 Simulate Agent'}
          </button>

          {simulationLog.length > 0 && (
            <div className="demo-simulation-log" role="log" aria-live="polite">
              <h4>Simulation Log:</h4>
              <pre className="demo-log-output">
                {simulationLog.map((log, index) => (
                  <div key={index}>{log}</div>
                ))}
              </pre>
            </div>
          )}

          {resumeUrl && (
            <div className="demo-resume-url" role="alert" aria-live="polite">
              <h4>Resume URL Generated:</h4>
              <p className="demo-url-description">
                Share this URL with a human to complete the form:
              </p>
              <div className="demo-url-box">
                <code className="demo-url-code">{resumeUrl}</code>
                <Link to={resumeUrl.replace(window.location.origin, '')} className="demo-button">
                  Open Resume Form →
                </Link>
              </div>
            </div>
          )}
        </section>

        <section className="demo-section">
          <h3>Quick Links</h3>
          <nav className="demo-nav">
            <Link to="/resume?token=rtok_demo" className="demo-link">
              View Resume Form (Demo Token)
            </Link>
            <Link to="/reviewer" className="demo-link">
              View Reviewer / Approval Workflow
            </Link>
          </nav>
        </section>

        <section className="demo-section">
          <h3>How It Works</h3>
          <ol className="demo-steps">
            <li>
              <strong>Agent Creates Submission:</strong> The agent calls the MCP createSubmission tool
              to initialize a new form submission.
            </li>
            <li>
              <strong>Agent Fills Fields:</strong> The agent fills fields it knows (name, address, tax ID)
              using the setFields tool.
            </li>
            <li>
              <strong>Agent Generates Resume URL:</strong> The agent calls handoffToHuman to get a
              shareable resume URL.
            </li>
            <li>
              <strong>Human Opens URL:</strong> The human opens the resume URL and sees a pre-filled
              form with agent-filled fields visually distinguished.
            </li>
            <li>
              <strong>Human Completes Form:</strong> The human fills remaining fields (uploads,
              signatures) and submits.
            </li>
            <li>
              <strong>Approval Workflow (Optional):</strong> If the intake requires approval, the
              submission transitions to needs_review state. Designated reviewers can then approve,
              reject, or request changes via the reviewer UI.
            </li>
          </ol>
        </section>
      </main>

      <footer className="demo-footer">
        <p>Built with FormBridge - Enable agent-human collaboration on forms</p>
      </footer>
    </div>
  );
};

/**
 * ReviewerPage component - Demo reviewer view for approval workflow
 */
const ReviewerPage: React.FC = () => {
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Mock submission data for demo purposes
  const mockSubmission: ReviewSubmission = {
    id: 'sub_demo_approval',
    intakeId: 'vendor-onboarding',
    state: 'needs_review',
    resumeToken: 'rtok_demo_review',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fields: {
      companyName: 'Acme Corp',
      address: '123 Main St, San Francisco, CA',
      taxId: '12-3456789',
      contactEmail: 'contact@acme.example.com',
      contactPhone: '+1-555-0100',
    },
    fieldAttribution: {
      companyName: { kind: 'agent', id: 'agent_gpt4', name: 'GPT-4 Agent' },
      address: { kind: 'agent', id: 'agent_gpt4', name: 'GPT-4 Agent' },
      taxId: { kind: 'agent', id: 'agent_gpt4', name: 'GPT-4 Agent' },
      contactEmail: { kind: 'human', id: 'user_123', name: 'John Doe' },
      contactPhone: { kind: 'human', id: 'user_123', name: 'John Doe' },
    },
    createdBy: { kind: 'agent', id: 'agent_gpt4', name: 'GPT-4 Agent' },
    updatedBy: { kind: 'human', id: 'user_123', name: 'John Doe' },
  };

  // Mock schema for demo purposes
  const mockSchema = {
    type: 'object' as const,
    properties: {
      companyName: { type: 'string', title: 'Company Name' },
      address: { type: 'string', title: 'Business Address' },
      taxId: { type: 'string', title: 'Tax ID (EIN)' },
      contactEmail: { type: 'string', title: 'Contact Email', format: 'email' },
      contactPhone: { type: 'string', title: 'Contact Phone' },
    },
    required: ['companyName', 'address', 'taxId'],
  };

  // Mock reviewer actor
  const mockReviewer = {
    kind: 'human' as const,
    id: 'reviewer_finance',
    name: 'Finance Team Reviewer',
  };

  /**
   * Handle approval action
   */
  const handleApprove = async (data: {
    submissionId: string;
    resumeToken: string;
    actor: { kind: string; id: string; name?: string };
    comment?: string;
  }) => {
    setIsProcessing(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setApprovalStatus('✅ Submission approved successfully!');
    setIsProcessing(false);
  };

  /**
   * Handle reject action
   */
  const handleReject = async (data: {
    submissionId: string;
    resumeToken: string;
    actor: { kind: string; id: string; name?: string };
    reason: string;
    comment?: string;
  }) => {
    setIsProcessing(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setApprovalStatus(`❌ Submission rejected. Reason: ${data.reason}`);
    setIsProcessing(false);
  };

  /**
   * Handle request changes action
   */
  const handleRequestChanges = async (data: {
    submissionId: string;
    resumeToken: string;
    actor: { kind: string; id: string; name?: string };
    fieldComments: FieldComment[];
    comment?: string;
  }) => {
    setIsProcessing(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setApprovalStatus(`🔄 Changes requested${data.comment ? `: ${data.comment}` : ''}`);
    setIsProcessing(false);
  };

  return (
    <div className="demo-home">
      <header className="demo-header">
        <h1>FormBridge Demo - Reviewer View</h1>
        <p className="demo-subtitle">Approval Workflow</p>
      </header>

      <main className="demo-content">
        <section className="demo-section">
          <h2>Approval Gate Workflow</h2>
          <p>
            This page demonstrates the approval workflow where reviewers can examine submissions
            that require human approval before being accepted into the system.
          </p>
          <p>
            <Link to="/" className="demo-link">← Back to Home</Link>
          </p>
        </section>

        {approvalStatus && (
          <section className="demo-section">
            <div className="demo-simulation-log" role="alert" aria-live="polite">
              <h4>Approval Status:</h4>
              <p>{approvalStatus}</p>
            </div>
          </section>
        )}

        <section className="demo-section">
          <ReviewerView
            submission={mockSubmission}
            schema={mockSchema}
            reviewer={mockReviewer}
            approvalActions={
              <ApprovalActions
                submissionId={mockSubmission.id}
                resumeToken={mockSubmission.resumeToken}
                reviewer={mockReviewer}
                onApprove={handleApprove}
                onReject={handleReject}
                onRequestChanges={handleRequestChanges}
                loading={isProcessing}
              />
            }
          />
        </section>

        <section className="demo-section">
          <h3>Approval Workflow Steps</h3>
          <ol className="demo-steps">
            <li>
              <strong>Submission Requires Approval:</strong> When a submission is created on an
              intake with approval_required: true, it transitions to needs_review state instead of
              accepted.
            </li>
            <li>
              <strong>Reviewers Are Notified:</strong> Designated reviewers receive notifications
              (webhook, email) that a submission needs their attention.
            </li>
            <li>
              <strong>Reviewer Examines Submission:</strong> The reviewer sees all form fields
              with attribution badges showing which actor filled each field (agent, human, system).
            </li>
            <li>
              <strong>Reviewer Takes Action:</strong> The reviewer can:
              <ul>
                <li><strong>Approve:</strong> Accept the submission (transitions to approved → forwarded)</li>
                <li><strong>Reject:</strong> Reject with a required reason (transitions to rejected → draft)</li>
                <li><strong>Request Changes:</strong> Send back for corrections with field-level comments</li>
              </ul>
            </li>
            <li>
              <strong>Actions Are Recorded:</strong> All approval/rejection events are recorded in
              the submission event stream for audit trails.
            </li>
          </ol>
        </section>
      </main>

      <footer className="demo-footer">
        <p>Built with FormBridge - Enable agent-human collaboration on forms</p>
      </footer>
    </div>
  );
};

/**
 * App component with routing
 */
export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Home page */}
        <Route path="/" element={<HomePage />} />

        {/* Resume form page - accepts ?token=rtok_xxx query param */}
        <Route path="/resume" element={<ResumeFormPage />} />

        {/* Reviewer page - demonstrates approval workflow */}
        <Route path="/reviewer" element={<ReviewerPage />} />
      </Routes>
    </BrowserRouter>
  );
};

App.displayName = 'App';

export default App;
