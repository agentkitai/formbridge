/**
 * Demo Application - Mixed-Mode Agent-Human Collaboration
 * Demonstrates agent-to-human handoff workflow with FormBridge
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useSearchParams } from 'react-router-dom';
import { ResumeFormPage, ReviewerView, ApprovalActions, createApiClient } from '@formbridge/form-renderer';
import type { ReviewSubmission, FieldComment } from '@formbridge/form-renderer';
import { WizardForm } from '../../form-renderer/src/components/WizardForm';

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
      // Step 1: Create submission via real API
      setSimulationLog((prev) => [...prev, '✓ Agent: Creating new submission...']);
      const createRes = await fetch('/intake/vendor-onboarding/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: { kind: 'agent', id: 'demo-agent' },
          initialFields: {
            legal_name: 'Acme Corp',
            country: 'US',
            tax_id: '12-3456789',
            contact_email: 'agent@acme.com',
          },
        }),
      });
      const createData = await createRes.json();
      if (!createData.ok) throw new Error(createData.error?.message || 'Failed to create submission');
      
      const { submissionId, resumeToken } = createData;
      setSimulationLog((prev) => [...prev, `✓ Agent: Submission created: ${submissionId}`]);

      // Step 2: Show what the agent filled
      await simulateDelay(300);
      setSimulationLog((prev) => [
        ...prev,
        '✓ Agent: Filled known fields:',
        '  - Set field "legal_name" = "Acme Corp"',
        '  - Set field "country" = "US"',
        '  - Set field "tax_id" = "12-3456789"',
        '  - Set field "contact_email" = "agent@acme.com"',
      ]);

      // Step 3: Generate handoff URL with real resume token
      await simulateDelay(300);
      setSimulationLog((prev) => [...prev, '✓ Agent: Generating handoff URL...']);
      const generatedUrl = `${window.location.origin}/resume?token=${resumeToken}`;
      setResumeUrl(generatedUrl);
      setSimulationLog((prev) => [
        ...prev,
        '✓ Agent: Resume URL generated successfully!',
        '✓ Agent: Handoff complete. Human can now complete the remaining fields.',
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
            <Link to="/wizard" className="demo-link">
              Multi-Step Wizard Form
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
 * ReviewerPage component - Reviewer view for approval workflow.
 * Fetches real submission data when ?id=&token= are provided; falls back to mock data for demo mode.
 */
const ReviewerPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const resumeToken = searchParams.get('token');

  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [submission, setSubmission] = useState<ReviewSubmission | null>(null);
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [loadingReal, setLoadingReal] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const client = createApiClient({ endpoint: '' }); // uses Vite proxy

  // Fetch real submission if id + token are provided
  useEffect(() => {
    if (!resumeToken) return;
    setLoadingReal(true);
    client
      .getSubmissionByResumeToken(resumeToken)
      .then((data: Record<string, unknown>) => {
        setSubmission({
          id: data.submissionId as string,
          intakeId: data.intakeId as string,
          state: data.state as string,
          resumeToken: data.resumeToken as string,
          createdAt: (data.metadata as Record<string, string>)?.createdAt ?? new Date().toISOString(),
          updatedAt: (data.metadata as Record<string, string>)?.updatedAt ?? new Date().toISOString(),
          fields: data.fields as Record<string, unknown>,
          fieldAttribution: data.fieldAttribution as Record<string, { kind: string; id: string; name?: string }>,
          createdBy: (data.metadata as Record<string, unknown>)?.createdBy as ReviewSubmission['createdBy'],
        } as ReviewSubmission);
        if (data.schema) setSchema(data.schema as Record<string, unknown>);
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoadingReal(false));
  }, [resumeToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fallback mock data for demo mode (no id/token)
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

  const activeSubmission = submission ?? mockSubmission;
  const activeSchema = (schema ?? mockSchema) as typeof mockSchema;

  const reviewer = {
    kind: 'human' as const,
    id: 'reviewer_finance',
    name: 'Finance Team Reviewer',
  };

  const handleApprove = async (data: {
    submissionId: string;
    resumeToken: string;
    actor: { kind: string; id: string; name?: string };
    comment?: string;
  }) => {
    setIsProcessing(true);
    const result = await client.approve(
      data.submissionId,
      data.resumeToken,
      data.actor as { kind: 'human' | 'agent' | 'system'; id: string; name?: string },
      data.comment
    );
    setApprovalStatus(result.ok ? 'Submission approved successfully!' : `Error: ${result.error}`);
    setIsProcessing(false);
  };

  const handleReject = async (data: {
    submissionId: string;
    resumeToken: string;
    actor: { kind: string; id: string; name?: string };
    reason: string;
    comment?: string;
  }) => {
    setIsProcessing(true);
    const result = await client.reject(
      data.submissionId,
      data.resumeToken,
      data.actor as { kind: 'human' | 'agent' | 'system'; id: string; name?: string },
      data.reason,
      data.comment
    );
    setApprovalStatus(result.ok ? `Submission rejected. Reason: ${data.reason}` : `Error: ${result.error}`);
    setIsProcessing(false);
  };

  const handleRequestChanges = async (data: {
    submissionId: string;
    resumeToken: string;
    actor: { kind: string; id: string; name?: string };
    fieldComments: FieldComment[];
    comment?: string;
  }) => {
    setIsProcessing(true);
    const result = await client.requestChanges(
      data.submissionId,
      data.resumeToken,
      data.actor as { kind: 'human' | 'agent' | 'system'; id: string; name?: string },
      data.fieldComments,
      data.comment
    );
    setApprovalStatus(
      result.ok ? `Changes requested${data.comment ? `: ${data.comment}` : ''}` : `Error: ${result.error}`
    );
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

        {loadingReal && (
          <section className="demo-section"><p>Loading submission...</p></section>
        )}
        {loadError && (
          <section className="demo-section"><p>Error loading submission: {loadError}. Showing demo data.</p></section>
        )}

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
            submission={activeSubmission}
            schema={activeSchema}
            reviewer={reviewer}
            approvalActions={
              <ApprovalActions
                submissionId={activeSubmission.id}
                resumeToken={activeSubmission.resumeToken}
                reviewer={reviewer}
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
                <li><strong>Approve:</strong> Accept the submission (transitions to approved)</li>
                <li><strong>Reject:</strong> Reject with a required reason (transitions to rejected)</li>
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
 * WizardPage component - Multi-step form demo using WizardForm
 */
const WizardPage: React.FC = () => {
  const [formValues, setFormValues] = useState<Record<string, unknown>>({
    legal_name: '',
    country: '',
    tax_id: '',
    contact_email: '',
    contact_phone: '',
    street: '',
    city: '',
    state: '',
    zip_code: '',
  });
  const [completed, setCompleted] = useState(false);

  const steps = [
    { id: 'company', title: 'Company Info', fields: ['legal_name', 'country', 'tax_id'] },
    { id: 'contact', title: 'Contact Details', fields: ['contact_email', 'contact_phone'] },
    { id: 'address', title: 'Address', fields: ['street', 'city', 'state', 'zip_code'] },
  ];

  const fieldSchemas: Record<string, { required?: boolean; type?: string }> = {
    legal_name: { required: true, type: 'string' },
    country: { required: true, type: 'string' },
    tax_id: { required: true, type: 'string' },
    contact_email: { required: true, type: 'string' },
    contact_phone: { required: false, type: 'string' },
    street: { required: true, type: 'string' },
    city: { required: true, type: 'string' },
    state: { required: false, type: 'string' },
    zip_code: { required: true, type: 'string' },
  };

  const fieldLabels: Record<string, string> = {
    legal_name: 'Legal Name',
    country: 'Country',
    tax_id: 'Tax ID',
    contact_email: 'Contact Email',
    contact_phone: 'Contact Phone',
    street: 'Street Address',
    city: 'City',
    state: 'State / Province',
    zip_code: 'ZIP / Postal Code',
  };

  return (
    <div className="demo-home">
      <header className="demo-header">
        <h1>FormBridge Demo - Wizard Form</h1>
        <p className="demo-subtitle">Multi-Step Form</p>
      </header>
      <main className="demo-content">
        <section className="demo-section">
          <p><Link to="/" className="demo-link">← Back to Home</Link></p>
        </section>
        <section className="demo-section">
          {completed ? (
            <div>
              <h3>Form Submitted!</h3>
              <pre>{JSON.stringify(formValues, null, 2)}</pre>
              <button className="demo-button" onClick={() => setCompleted(false)}>Reset</button>
            </div>
          ) : (
            <WizardForm
              steps={steps}
              formValues={formValues}
              fieldSchemas={fieldSchemas}
              onComplete={() => setCompleted(true)}
              renderStep={(step, errors) => (
                <div>
                  <h3>{step.title}</h3>
                  {step.description && <p>{step.description}</p>}
                  {step.fields.map((field) => {
                    const err = errors.find((e) => e.field === field);
                    return (
                      <div key={field} style={{ marginBottom: '12px' }}>
                        <label htmlFor={`wizard-${field}`} style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px' }}>
                          {fieldLabels[field] ?? field}
                          {fieldSchemas[field]?.required && <span style={{ color: 'red' }}> *</span>}
                        </label>
                        <input
                          id={`wizard-${field}`}
                          type="text"
                          value={String(formValues[field] ?? '')}
                          onChange={(e) => setFormValues((prev) => ({ ...prev, [field]: e.target.value }))}
                          style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                        />
                        {err && <span style={{ color: 'red', fontSize: '0.85em' }}>{err.message}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            />
          )}
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

        {/* Resume form page - accepts ?token=rtok_xxx query param.
            endpoint="" works in development because Vite proxies /submissions/* to the backend.
            For standalone deployments, pass the full backend URL, e.g. endpoint="https://api.example.com" */}
        <Route path="/resume" element={<ResumeFormPage endpoint="" />} />

        {/* Reviewer page - demonstrates approval workflow */}
        <Route path="/reviewer" element={<ReviewerPage />} />

        {/* Wizard form - multi-step form demo */}
        <Route path="/wizard" element={<WizardPage />} />
      </Routes>
    </BrowserRouter>
  );
};

App.displayName = 'App';

export default App;
