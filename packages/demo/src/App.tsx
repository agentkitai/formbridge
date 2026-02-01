/**
 * Demo Application - Mixed-Mode Agent-Human Collaboration
 * Demonstrates agent-to-human handoff workflow with FormBridge
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { ResumeFormPage, ReviewerView, ApprovalActions, createApiClient } from '@formbridge/form-renderer';
import type { ReviewSubmission, FieldComment } from '@formbridge/form-renderer';
import { WizardForm } from '../../form-renderer/src/components/WizardForm';

// ═══════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════
// HomePage — landing page
// ═══════════════════════════════════════════════════════════════
const HomePage: React.FC = () => {
  const [isSimulating, setIsSimulating] = useState(false);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [simulationLog, setSimulationLog] = useState<string[]>([]);

  const handleSimulateAgent = async () => {
    setIsSimulating(true);
    setResumeUrl(null);
    setSimulationLog([]);

    try {
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

      await sleep(300);
      setSimulationLog((prev) => [
        ...prev,
        '✓ Agent: Filled known fields:',
        '  - Set field "legal_name" = "Acme Corp"',
        '  - Set field "country" = "US"',
        '  - Set field "tax_id" = "12-3456789"',
        '  - Set field "contact_email" = "agent@acme.com"',
      ]);

      await sleep(300);
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

  return (
    <div className="demo-home">
      <header className="demo-header">
        <h1>🌉 FormBridge Demo</h1>
        <p className="demo-subtitle">Mixed-Mode Agent-Human Collaboration</p>
      </header>

      <main className="demo-content">
        <section className="demo-section">
          <h2>Agent-to-Human Handoff Workflow</h2>
          <p>
            This demo showcases how an AI agent can start a form submission, fill the fields it knows,
            and generate a shareable resume URL for a human to complete the remaining fields.
          </p>
        </section>

        <section className="demo-section demo-simulation">
          <h3>Quick Demo — Vendor Onboarding</h3>
          <button
            className="demo-button demo-button-primary"
            onClick={handleSimulateAgent}
            disabled={isSimulating}
          >
            {isSimulating ? 'Simulating Agent...' : '🤖 Simulate Agent'}
          </button>

          {simulationLog.length > 0 && (
            <div className="demo-simulation-log" role="log">
              <h4>Simulation Log:</h4>
              <pre className="demo-log-output">
                {simulationLog.map((log, i) => <div key={i}>{log}</div>)}
              </pre>
            </div>
          )}

          {resumeUrl && (
            <div className="demo-resume-url" role="alert">
              <h4>Resume URL Generated:</h4>
              <div className="demo-url-box">
                <code className="demo-url-code">{resumeUrl}</code>
                <Link to={resumeUrl.replace(window.location.origin, '')} className="demo-button">
                  Open Resume Form →
                </Link>
              </div>
            </div>
          )}
        </section>

        <section className="demo-section" style={{ background: 'linear-gradient(135deg, #667eea11, #764ba211)', border: '2px solid #667eea', borderRadius: '12px', padding: '24px' }}>
          <h3>🎬 Full Feature Demo — Insurance Claim</h3>
          <p>
            Walk through a comprehensive demo showcasing <strong>20+ fields</strong>, conditional visibility,
            file uploads, idempotency, approval gates, and a full audit trail.
          </p>
          <Link to="/insurance-demo" className="demo-button demo-button-primary" style={{ display: 'inline-block', marginTop: '12px', fontSize: '1.1em' }}>
            ▶ Launch Full Demo
          </Link>
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
      </main>

      <footer className="demo-footer">
        <p>Built with FormBridge — Enable agent-human collaboration on forms</p>
      </footer>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// InsuranceClaimDemoPage — comprehensive walkthrough
// ═══════════════════════════════════════════════════════════════

type DemoStep = 'intro' | 'agent-sim' | 'idempotency' | 'resume-form' | 'submitted' | 'reviewer' | 'events';

const InsuranceClaimDemoPage: React.FC = () => {
  const [step, setStep] = useState<DemoStep>('intro');
  const [simulationLog, setSimulationLog] = useState<string[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [resumeToken, setResumeToken] = useState<string | null>(null);
  const [intakeId] = useState('insurance-claim');
  const [idempotencyResult, setIdempotencyResult] = useState<string | null>(null);
  const [idempotencyKey] = useState(`demo-idem-${Date.now()}`);

  // ── Agent simulation ──
  const runAgentSimulation = async () => {
    setIsSimulating(true);
    setSimulationLog([]);

    const addLog = (msg: string) => setSimulationLog((p) => [...p, msg]);

    try {
      addLog('🤖 Agent: Initializing insurance claim submission...');
      await sleep(400);

      // Create submission with initial fields
      const initialFields = {
        policy_number: 'POL-2024-78432',
        policyholder_name: 'Sarah Mitchell',
        policyholder_email: 'sarah.mitchell@email.com',
        policyholder_phone: '+1-555-0142',
        policy_type: 'comprehensive',
        incident_date: '2024-12-15',
        incident_time: '14:30',
        incident_location: '1450 Market St & Van Ness Ave, San Francisco, CA',
        incident_description: 'Rear-ended at a red light by another vehicle while stopped at the intersection. The other driver was distracted and failed to brake in time.',
        incident_type: 'collision',
        fault_assessment: 'other_party_at_fault',
        damage_severity: 'moderate',
      };

      addLog('📋 Agent: Creating submission with known policy & incident data...');
      await sleep(300);

      const createRes = await fetch(`/intake/${intakeId}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: { kind: 'agent', id: 'claims-bot', name: 'Claims AI Agent' },
          idempotencyKey,
          initialFields,
        }),
      });
      const createData = await createRes.json();
      if (!createData.ok) throw new Error(createData.error?.message || 'Failed to create');

      setSubmissionId(createData.submissionId);
      setResumeToken(createData.resumeToken);

      addLog(`✅ Submission created: ${createData.submissionId}`);
      addLog(`   State: ${createData.state}`);
      await sleep(200);

      // Log each field set
      const fieldEntries = Object.entries(initialFields);
      for (const [key, value] of fieldEntries) {
        const displayVal = String(value).length > 60 ? String(value).slice(0, 57) + '...' : String(value);
        addLog(`  📝 Set "${key}" = "${displayVal}"`);
        await sleep(80);
      }

      addLog(`\n✅ Agent filled ${fieldEntries.length} fields`);
      addLog(`📎 Resume token: ${createData.resumeToken.slice(0, 20)}...`);
      addLog('🤝 Handoff ready — human can complete remaining fields');

      setStep('agent-sim');
    } catch (err) {
      addLog(`❌ Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setIsSimulating(false);
    }
  };

  // ── Idempotency demo ──
  const runIdempotencyDemo = async () => {
    setIdempotencyResult(null);
    setSimulationLog((p) => [...p, '\n── Idempotency Test ──']);
    setSimulationLog((p) => [...p, `🔁 Replaying same request with idempotencyKey: ${idempotencyKey.slice(0, 20)}...`]);
    await sleep(500);

    const createRes = await fetch(`/intake/${intakeId}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { kind: 'agent', id: 'claims-bot', name: 'Claims AI Agent' },
        idempotencyKey,
        initialFields: { policy_number: 'POL-2024-78432' },
      }),
    });
    const data = await createRes.json();

    if (data.ok && data.submissionId === submissionId) {
      setSimulationLog((p) => [...p, `✅ Same submissionId returned: ${data.submissionId}`]);
      setSimulationLog((p) => [...p, '✅ No duplicate created — idempotency works!']);
      setIdempotencyResult('success');
    } else {
      setSimulationLog((p) => [...p, `⚠️ Got submissionId: ${data.submissionId} (expected ${submissionId})`]);
      setIdempotencyResult('unexpected');
    }
    setStep('idempotency');
  };

  // ── Event stream ──
  const [events, setEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const fetchEvents = async () => {
    if (!submissionId) return;
    setLoadingEvents(true);
    try {
      const res = await fetch(`/submissions/${submissionId}/events`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      console.error('Failed to fetch events', err);
    }
    setLoadingEvents(false);
  };

  // ── Resume form handling ──
  const [formFields, setFormFields] = useState<Record<string, unknown>>({});
  const [formSchema, setFormSchema] = useState<any>(null);
  const [formAttribution, setFormAttribution] = useState<Record<string, any>>({});
  const [formLoading, setFormLoading] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'submitted' | 'needs_review' | 'error'>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [currentResumeToken, setCurrentResumeToken] = useState<string | null>(null);

  const loadResumeForm = async () => {
    if (!resumeToken) return;
    setFormLoading(true);
    try {
      const res = await fetch(`/submissions/resume/${resumeToken}`);
      const data = await res.json();
      setFormFields(data.fields || {});
      setFormSchema(data.schema || null);
      setFormAttribution(data.fieldAttribution || {});
      setCurrentResumeToken(data.resumeToken || resumeToken);
      setStep('resume-form');
    } catch (err) {
      console.error(err);
    }
    setFormLoading(false);
  };

  const handleFieldChange = (path: string, value: unknown) => {
    setFormFields((prev) => ({ ...prev, [path]: value }));
  };

  const handleSubmitForm = async () => {
    if (!submissionId || !currentResumeToken) return;
    setSubmitState('submitting');
    setSubmitError(null);
    const actor = { kind: 'human' as const, id: 'human-web', name: 'Human User' };

    try {
      // PATCH fields
      const patchRes = await fetch(`/intake/${intakeId}/submissions/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeToken: currentResumeToken, actor, fields: formFields }),
      });
      const patchData = await patchRes.json();
      const latestToken = patchData.resumeToken || currentResumeToken;
      setCurrentResumeToken(latestToken);

      // POST submit
      const submitRes = await fetch(`/intake/${intakeId}/submissions/${submissionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeToken: latestToken,
          actor,
          idempotencyKey: `submit-${Date.now()}`,
        }),
      });
      const submitData = await submitRes.json();

      if (submitData.state === 'needs_review' || submitData.error?.type === 'needs_approval') {
        setCurrentResumeToken(submitData.resumeToken || latestToken);
        setSubmitState('needs_review');
        setStep('submitted');
      } else if (submitData.ok) {
        setSubmitState('submitted');
        setStep('submitted');
      } else {
        throw new Error(submitData.error?.message || 'Submit failed');
      }
    } catch (err) {
      setSubmitState('error');
      setSubmitError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  // ── Reviewer ──
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const client = createApiClient({ endpoint: '' });

  const handleApprove = async () => {
    if (!submissionId || !currentResumeToken) return;
    setIsApproving(true);
    const reviewer = { kind: 'human' as const, id: 'claims-adjuster-1', name: 'Claims Adjuster' };
    const result = await client.approve(submissionId, currentResumeToken, reviewer, 'Claim verified and approved for processing');
    setApprovalStatus(result.ok ? '✅ Claim approved!' : `Error: ${result.error}`);
    if (result.resumeToken) setCurrentResumeToken(result.resumeToken);
    setIsApproving(false);
  };

  // ── Render helpers ──
  const renderProgressBar = () => {
    const steps: { key: DemoStep; label: string }[] = [
      { key: 'intro', label: 'Start' },
      { key: 'agent-sim', label: 'Agent Fills' },
      { key: 'idempotency', label: 'Idempotency' },
      { key: 'resume-form', label: 'Human Completes' },
      { key: 'submitted', label: 'Submit → Approval' },
      { key: 'reviewer', label: 'Review' },
      { key: 'events', label: 'Audit Trail' },
    ];
    const currentIdx = steps.findIndex((s) => s.key === step);

    return (
      <div className="demo-progress-bar" style={{ display: 'flex', gap: '4px', margin: '16px 0 24px', flexWrap: 'wrap' }}>
        {steps.map((s, i) => (
          <div
            key={s.key}
            style={{
              flex: 1,
              minWidth: '80px',
              padding: '8px 4px',
              textAlign: 'center',
              borderRadius: '6px',
              fontSize: '0.75em',
              fontWeight: i === currentIdx ? 'bold' : 'normal',
              background: i < currentIdx ? '#22c55e' : i === currentIdx ? '#3b82f6' : '#e5e7eb',
              color: i <= currentIdx ? 'white' : '#6b7280',
              cursor: i <= currentIdx ? 'pointer' : 'default',
              transition: 'all 0.3s',
            }}
            onClick={() => {
              if (i <= currentIdx) setStep(s.key);
            }}
          >
            {s.label}
          </div>
        ))}
      </div>
    );
  };

  const renderEventIcon = (type: string) => {
    if (type.includes('created')) return '🆕';
    if (type.includes('field') || type.includes('updated')) return '📝';
    if (type.includes('submitted')) return '📤';
    if (type.includes('review.requested')) return '🔍';
    if (type.includes('approved')) return '✅';
    if (type.includes('rejected')) return '❌';
    if (type.includes('handoff')) return '🤝';
    return '📌';
  };

  return (
    <div className="demo-home">
      <header className="demo-header">
        <h1>🚗 Insurance Claim Demo</h1>
        <p className="demo-subtitle">Full FormBridge Feature Walkthrough</p>
      </header>

      <main className="demo-content">
        <section className="demo-section">
          <Link to="/" className="demo-link">← Back to Home</Link>
          {renderProgressBar()}
        </section>

        {/* ── INTRO ── */}
        {step === 'intro' && (
          <section className="demo-section">
            <h2>What You'll See</h2>
            <ol className="demo-steps">
              <li><strong>Agent Simulation</strong> — AI agent creates an insurance claim and fills 12 fields</li>
              <li><strong>Idempotency</strong> — Same request replayed returns same submission (no duplicate)</li>
              <li><strong>Human Resumes Form</strong> — Pre-filled fields with conditional visibility & file upload areas</li>
              <li><strong>Submit → Approval Gate</strong> — Submission enters "Needs Review" state</li>
              <li><strong>Reviewer Approves</strong> — Claims adjuster reviews and approves</li>
              <li><strong>Event Stream</strong> — Full audit trail of every action</li>
            </ol>
            <button
              className="demo-button demo-button-primary"
              onClick={runAgentSimulation}
              disabled={isSimulating}
              style={{ fontSize: '1.1em', marginTop: '16px' }}
            >
              {isSimulating ? '⏳ Running Agent...' : '▶ Start Demo'}
            </button>
          </section>
        )}

        {/* ── AGENT SIMULATION ── */}
        {(step === 'agent-sim' || step === 'idempotency') && (
          <section className="demo-section">
            <h2>🤖 Agent Simulation</h2>
            <div className="demo-simulation-log" role="log">
              <pre className="demo-log-output" style={{ maxHeight: '400px', overflow: 'auto' }}>
                {simulationLog.map((log, i) => <div key={i}>{log}</div>)}
              </pre>
            </div>

            {step === 'agent-sim' && (
              <div style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button className="demo-button demo-button-primary" onClick={runIdempotencyDemo}>
                  🔁 Test Idempotency
                </button>
                <button className="demo-button" onClick={loadResumeForm} disabled={formLoading}>
                  {formLoading ? 'Loading...' : '📝 Open Resume Form →'}
                </button>
              </div>
            )}

            {step === 'idempotency' && idempotencyResult && (
              <div style={{
                marginTop: '16px',
                padding: '16px',
                borderRadius: '8px',
                background: idempotencyResult === 'success' ? '#dcfce7' : '#fef3c7',
                border: idempotencyResult === 'success' ? '2px solid #22c55e' : '2px solid #f59e0b',
              }}>
                <h4 style={{ margin: '0 0 8px' }}>
                  {idempotencyResult === 'success' ? '✅ Idempotency Verified!' : '⚠️ Unexpected Result'}
                </h4>
                <p style={{ margin: 0 }}>
                  {idempotencyResult === 'success'
                    ? 'The duplicate request returned the exact same submission ID — no duplicate was created. This is a core FormBridge guarantee.'
                    : 'The response was unexpected. Check the logs above.'}
                </p>
                <button className="demo-button" onClick={loadResumeForm} disabled={formLoading} style={{ marginTop: '12px' }}>
                  {formLoading ? 'Loading...' : '📝 Continue to Resume Form →'}
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── RESUME FORM ── */}
        {step === 'resume-form' && formSchema && (
          <section className="demo-section">
            <h2>📝 Human Completes the Form</h2>
            <p style={{ color: '#6b7280', marginBottom: '16px' }}>
              Fields filled by the agent show a <span style={{ background: '#e0f2fe', padding: '2px 6px', borderRadius: '4px', fontSize: '0.85em' }}>🤖 Agent</span> badge.
              Complete the remaining fields below.
            </p>

            <InsuranceClaimForm
              schema={formSchema}
              fields={formFields}
              fieldAttribution={formAttribution}
              onFieldChange={handleFieldChange}
              onSubmit={handleSubmitForm}
              submitState={submitState}
              submitError={submitError}
            />
          </section>
        )}

        {/* ── SUBMITTED / NEEDS REVIEW ── */}
        {step === 'submitted' && (
          <section className="demo-section">
            <div style={{
              padding: '24px',
              borderRadius: '12px',
              background: submitState === 'needs_review'
                ? 'linear-gradient(135deg, #fef3c7, #fff7ed)'
                : submitState === 'error' ? '#fee2e2' : '#dcfce7',
              border: submitState === 'needs_review' ? '2px solid #f59e0b' : submitState === 'error' ? '2px solid #ef4444' : '2px solid #22c55e',
              textAlign: 'center',
            }}>
              {submitState === 'needs_review' && (
                <>
                  <h2 style={{ margin: '0 0 8px' }}>🔍 Pending Approval</h2>
                  <p>This submission requires review by a claims adjuster before it can be processed.</p>
                  <p style={{ color: '#92400e', fontWeight: 'bold' }}>State: needs_review</p>
                  <button className="demo-button demo-button-primary" onClick={() => setStep('reviewer')} style={{ marginTop: '12px' }}>
                    👤 Go to Reviewer View →
                  </button>
                </>
              )}
              {submitState === 'submitted' && (
                <>
                  <h2 style={{ margin: '0 0 8px' }}>✅ Submitted Successfully</h2>
                  <p>The claim has been submitted for processing.</p>
                </>
              )}
              {submitState === 'error' && (
                <>
                  <h2 style={{ margin: '0 0 8px' }}>❌ Submission Error</h2>
                  <p>{submitError}</p>
                </>
              )}
            </div>
          </section>
        )}

        {/* ── REVIEWER ── */}
        {step === 'reviewer' && (
          <section className="demo-section">
            <h2>👤 Claims Adjuster Review</h2>
            <p>The reviewer sees all fields with attribution badges showing who filled what.</p>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px', marginTop: '16px' }}>
              <h3 style={{ margin: '0 0 16px' }}>Submission: {submissionId?.slice(0, 16)}...</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                {Object.entries(formFields).map(([key, value]) => {
                  if (value === undefined || value === null || value === '' || typeof value === 'object') return null;
                  const attr = formAttribution[key];
                  return (
                    <div key={key} style={{ padding: '8px 12px', background: 'white', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: '0.75em', color: '#6b7280', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{key.replace(/_/g, ' ')}</span>
                        {attr && (
                          <span style={{
                            background: attr.kind === 'agent' ? '#dbeafe' : '#dcfce7',
                            color: attr.kind === 'agent' ? '#1e40af' : '#166534',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontSize: '0.85em',
                          }}>
                            {attr.kind === 'agent' ? '🤖 Agent' : '👤 Human'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontWeight: 'bold', marginTop: '4px' }}>{String(value)}</div>
                    </div>
                  );
                })}
              </div>

              {!approvalStatus ? (
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    className="demo-button demo-button-primary"
                    onClick={handleApprove}
                    disabled={isApproving}
                    style={{ background: '#22c55e' }}
                  >
                    {isApproving ? '⏳ Approving...' : '✅ Approve Claim'}
                  </button>
                </div>
              ) : (
                <div style={{ padding: '16px', background: '#dcfce7', borderRadius: '8px', border: '2px solid #22c55e' }}>
                  <p style={{ margin: 0, fontWeight: 'bold' }}>{approvalStatus}</p>
                  <button
                    className="demo-button"
                    onClick={() => { fetchEvents(); setStep('events'); }}
                    style={{ marginTop: '12px' }}
                  >
                    📊 View Audit Trail →
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── EVENTS / AUDIT TRAIL ── */}
        {step === 'events' && (
          <section className="demo-section">
            <h2>📊 Event Stream — Audit Trail</h2>
            <p style={{ color: '#6b7280' }}>Every action is recorded as an event for complete traceability.</p>

            {!events.length && !loadingEvents && (
              <button className="demo-button demo-button-primary" onClick={fetchEvents}>
                Load Events
              </button>
            )}

            {loadingEvents && <p>Loading events...</p>}

            {events.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                {events.map((evt: any, i: number) => (
                  <div
                    key={evt.eventId || i}
                    style={{
                      display: 'flex',
                      gap: '16px',
                      padding: '14px 16px',
                      borderLeft: '3px solid',
                      borderLeftColor: evt.actor?.kind === 'agent' ? '#3b82f6'
                        : evt.type?.includes('approved') ? '#22c55e'
                        : evt.type?.includes('review') ? '#f59e0b'
                        : '#6b7280',
                      background: i % 2 === 0 ? '#f8fafc' : 'white',
                      marginBottom: '2px',
                      borderRadius: '0 6px 6px 0',
                    }}
                  >
                    <div style={{ fontSize: '1.4em', flexShrink: 0 }}>{renderEventIcon(evt.type)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', fontSize: '0.9em' }}>{evt.type}</div>
                      <div style={{ fontSize: '0.8em', color: '#6b7280', marginTop: '2px' }}>
                        {new Date(evt.ts).toLocaleTimeString()} —{' '}
                        <span style={{
                          background: evt.actor?.kind === 'agent' ? '#dbeafe' : '#dcfce7',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}>
                          {evt.actor?.kind === 'agent' ? '🤖 ' : '👤 '}
                          {evt.actor?.name || evt.actor?.id || evt.actor?.kind}
                        </span>
                        {' → state: '}<strong>{evt.state}</strong>
                      </div>
                      {evt.payload && Object.keys(evt.payload).length > 0 && (
                        <details style={{ marginTop: '4px', fontSize: '0.8em' }}>
                          <summary style={{ cursor: 'pointer', color: '#6b7280' }}>Payload</summary>
                          <pre style={{ background: '#f1f5f9', padding: '8px', borderRadius: '4px', overflow: 'auto', maxHeight: '100px' }}>
                            {JSON.stringify(evt.payload, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {events.length > 0 && (
              <div style={{ marginTop: '16px', padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #22c55e' }}>
                <h4 style={{ margin: '0 0 8px' }}>🎉 Demo Complete!</h4>
                <p style={{ margin: 0 }}>
                  You've seen the full FormBridge workflow: agent creates & fills → idempotency guarantee →
                  human resumes with conditional fields & file uploads → submit triggers approval gate →
                  reviewer approves → complete audit trail.
                </p>
                <Link to="/" className="demo-button" style={{ display: 'inline-block', marginTop: '12px' }}>
                  ← Back to Home
                </Link>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="demo-footer">
        <p>Built with FormBridge — Enable agent-human collaboration on forms</p>
      </footer>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// InsuranceClaimForm — inline form with conditional fields & file upload UI
// ═══════════════════════════════════════════════════════════════

interface InsuranceClaimFormProps {
  schema: any;
  fields: Record<string, unknown>;
  fieldAttribution: Record<string, any>;
  onFieldChange: (path: string, value: unknown) => void;
  onSubmit: () => void;
  submitState: string;
  submitError: string | null;
}

const InsuranceClaimForm: React.FC<InsuranceClaimFormProps> = ({
  schema,
  fields,
  fieldAttribution,
  onFieldChange,
  onSubmit,
  submitState,
  submitError,
}) => {
  const fieldDefs = schema?.properties || {};

  const renderAttrBadge = (path: string) => {
    const attr = fieldAttribution[path];
    if (!attr) return null;
    return (
      <span style={{
        fontSize: '0.7em',
        padding: '2px 8px',
        borderRadius: '4px',
        marginLeft: '8px',
        background: attr.kind === 'agent' ? '#dbeafe' : '#dcfce7',
        color: attr.kind === 'agent' ? '#1e40af' : '#166534',
      }}>
        {attr.kind === 'agent' ? '🤖 Filled by Agent' : '👤 Filled by Human'}
      </span>
    );
  };

  const renderField = (key: string, def: any, prefix = '') => {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = fields[path] ?? (prefix ? (fields[prefix] as any)?.[key] : undefined) ?? '';
    const label = def.description || key.replace(/_/g, ' ');
    const isRequired = schema.required?.includes(key);

    // Conditional visibility
    if (key === 'police_report_number' || key === 'police_department') {
      if (!fields.police_report_filed) return null;
    }
    if (key === 'injury_description' || key === 'medical_treatment_sought') {
      if (!fields.injuries_reported) return null;
    }
    if (key === 'witness_info') {
      if (!fields.has_witnesses) return null;
    }

    // File fields
    if (def.type === 'file') {
      return (
        <div key={path} style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px', fontSize: '0.85em' }}>
            {label} {renderAttrBadge(path)}
          </label>
          <div
            style={{
              border: '2px dashed #94a3b8',
              borderRadius: '8px',
              padding: '24px',
              textAlign: 'center',
              background: '#f8fafc',
              cursor: 'pointer',
            }}
            onClick={() => {/* file upload UI placeholder */}}
          >
            <div style={{ fontSize: '2em', marginBottom: '8px' }}>📁</div>
            <p style={{ margin: '0 0 4px', fontWeight: 'bold' }}>Drag & drop files here</p>
            <p style={{ margin: 0, fontSize: '0.8em', color: '#6b7280' }}>
              or click to browse — {def.allowedTypes?.join(', ')} — max {def.maxCount || 1} file(s)
              {def.maxSize && `, up to ${(def.maxSize / 1048576).toFixed(0)}MB each`}
            </p>
          </div>
        </div>
      );
    }

    // Nested object
    if (def.type === 'object' && def.properties) {
      return (
        <fieldset key={path} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <legend style={{ fontWeight: 'bold', padding: '0 8px' }}>{label}</legend>
          {Object.entries(def.properties).map(([subKey, subDef]: [string, any]) =>
            renderField(subKey, subDef, path)
          )}
        </fieldset>
      );
    }

    // Boolean → checkbox
    if (def.type === 'boolean') {
      return (
        <div key={path} style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            id={`field-${path}`}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onFieldChange(path, e.target.checked)}
            style={{ width: '18px', height: '18px' }}
          />
          <label htmlFor={`field-${path}`} style={{ fontSize: '0.85em' }}>
            {label} {renderAttrBadge(path)}
          </label>
        </div>
      );
    }

    // Enum → select
    if (def.enum) {
      return (
        <div key={path} style={{ marginBottom: '12px' }}>
          <label htmlFor={`field-${path}`} style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '0.85em' }}>
            {label} {isRequired && <span style={{ color: 'red' }}>*</span>} {renderAttrBadge(path)}
          </label>
          <select
            id={`field-${path}`}
            value={String(value)}
            onChange={(e) => onFieldChange(path, e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db' }}
          >
            <option value="">Select...</option>
            {def.enum.map((opt: string) => (
              <option key={opt} value={opt}>{opt.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      );
    }

    // Number / integer
    if (def.type === 'number' || def.type === 'integer') {
      return (
        <div key={path} style={{ marginBottom: '12px' }}>
          <label htmlFor={`field-${path}`} style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '0.85em' }}>
            {label} {isRequired && <span style={{ color: 'red' }}>*</span>} {renderAttrBadge(path)}
          </label>
          <input
            id={`field-${path}`}
            type="number"
            value={value === '' || value === undefined ? '' : Number(value)}
            onChange={(e) => onFieldChange(path, e.target.value ? Number(e.target.value) : '')}
            min={def.minimum}
            max={def.maximum}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box' }}
          />
        </div>
      );
    }

    // String (default)
    const isLong = key.includes('description') || key.includes('notes') || key.includes('info');
    return (
      <div key={path} style={{ marginBottom: '12px' }}>
        <label htmlFor={`field-${path}`} style={{ display: 'block', fontWeight: 'bold', marginBottom: '4px', fontSize: '0.85em' }}>
          {label} {isRequired && <span style={{ color: 'red' }}>*</span>} {renderAttrBadge(path)}
        </label>
        {isLong ? (
          <textarea
            id={`field-${path}`}
            value={String(value)}
            onChange={(e) => onFieldChange(path, e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
        ) : (
          <input
            id={`field-${path}`}
            type={def.format === 'email' ? 'email' : 'text'}
            value={String(value)}
            onChange={(e) => onFieldChange(path, e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #d1d5db', boxSizing: 'border-box' }}
          />
        )}
      </div>
    );
  };

  // Group fields into sections for nicer layout
  const sections = [
    { title: '📋 Policy Information', fields: ['policy_number', 'policyholder_name', 'policyholder_email', 'policyholder_phone', 'policy_type'] },
    { title: '🚨 Incident Details', fields: ['incident_date', 'incident_time', 'incident_location', 'incident_description', 'incident_type', 'fault_assessment'] },
    { title: '🚗 Vehicle Information', fields: ['vehicle'] },
    { title: '💥 Damage Assessment', fields: ['damage_severity', 'damage_areas', 'estimated_repair_cost', 'is_drivable'] },
    { title: '👮 Police Report', fields: ['police_report_filed', 'police_report_number', 'police_department'] },
    { title: '🏥 Injuries', fields: ['injuries_reported', 'injury_description', 'medical_treatment_sought'] },
    { title: '👥 Other Party', fields: ['other_party'] },
    { title: '👁 Witnesses', fields: ['has_witnesses', 'witness_info'] },
    { title: '📁 Documents', fields: ['damage_photos', 'police_report_document'] },
    { title: '📝 Additional', fields: ['additional_notes', 'preferred_repair_shop'] },
  ];

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} noValidate>
      {sections.map((section) => {
        const visibleFields = section.fields.filter((f) => fieldDefs[f]);
        if (visibleFields.length === 0) return null;
        return (
          <div key={section.title} style={{ marginBottom: '24px' }}>
            <h3 style={{ borderBottom: '2px solid #e5e7eb', paddingBottom: '8px', marginBottom: '16px' }}>
              {section.title}
            </h3>
            {visibleFields.map((f) => renderField(f, fieldDefs[f]))}
          </div>
        );
      })}

      {submitError && (
        <div style={{ padding: '12px', background: '#fee2e2', borderRadius: '6px', marginBottom: '12px', color: '#dc2626' }}>
          {submitError}
        </div>
      )}

      <button
        type="submit"
        className="demo-button demo-button-primary"
        disabled={submitState === 'submitting'}
        style={{ fontSize: '1.1em', width: '100%', padding: '12px' }}
      >
        {submitState === 'submitting' ? '⏳ Submitting...' : '📤 Submit Claim for Review'}
      </button>
    </form>
  );
};

// ═══════════════════════════════════════════════════════════════
// ReviewerPage — existing reviewer with real data support
// ═══════════════════════════════════════════════════════════════

const ReviewerPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const resumeToken = searchParams.get('token');

  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [submission, setSubmission] = useState<ReviewSubmission | null>(null);
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [loadingReal, setLoadingReal] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const client = createApiClient({ endpoint: '' });

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
            <Link to="/" className="demo-link">← Back to Home</Link>
          </p>
        </section>

        {loadingReal && <section className="demo-section"><p>Loading submission...</p></section>}
        {loadError && <section className="demo-section"><p>Error: {loadError}. Showing demo data.</p></section>}

        {approvalStatus && (
          <section className="demo-section">
            <div className="demo-simulation-log" role="alert">
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
      </main>

      <footer className="demo-footer">
        <p>Built with FormBridge — Enable agent-human collaboration on forms</p>
      </footer>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// WizardPage — multi-step form demo
// ═══════════════════════════════════════════════════════════════

const WizardPage: React.FC = () => {
  const [formValues, setFormValues] = useState<Record<string, unknown>>({
    legal_name: '', country: '', tax_id: '', contact_email: '', contact_phone: '',
    street: '', city: '', state: '', zip_code: '',
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
    legal_name: 'Legal Name', country: 'Country', tax_id: 'Tax ID',
    contact_email: 'Contact Email', contact_phone: 'Contact Phone',
    street: 'Street Address', city: 'City', state: 'State / Province', zip_code: 'ZIP / Postal Code',
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
        <p>Built with FormBridge — Enable agent-human collaboration on forms</p>
      </footer>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// App — router
// ═══════════════════════════════════════════════════════════════

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/resume" element={<ResumeFormPage endpoint="" />} />
        <Route path="/reviewer" element={<ReviewerPage />} />
        <Route path="/wizard" element={<WizardPage />} />
        <Route path="/insurance-demo" element={<InsuranceClaimDemoPage />} />
      </Routes>
    </BrowserRouter>
  );
};

App.displayName = 'App';

export default App;
