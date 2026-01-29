/**
 * Demo Application - Mixed-Mode Agent-Human Collaboration
 * Demonstrates agent-to-human handoff workflow with FormBridge
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ResumeFormPage } from '@formbridge/form-renderer';

/**
 * Home page component - Demo landing page
 */
const HomePage: React.FC = () => {
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
