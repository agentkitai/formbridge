/**
 * Demo Application - Mixed-Mode Agent-Human Collaboration
 * Demonstrates agent-to-human handoff workflow with FormBridge
 */

import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ResumeFormPage } from '@formbridge/form-renderer';

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
      </Routes>
    </BrowserRouter>
  );
};

App.displayName = 'App';

export default App;
