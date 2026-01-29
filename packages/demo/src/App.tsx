import React, { useState } from 'react';
import { FormBridgeForm } from '@formbridge/react-form-renderer';
import { vendorOnboardingSchema } from './schemas/vendorOnboarding';

/**
 * Demo application component
 * Showcases the FormBridge React Form Renderer with a comprehensive vendor onboarding form
 */
const App: React.FC = () => {
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mock endpoint for demo purposes
  // In a real application, this would be your actual FormBridge API endpoint
  const endpoint = 'https://api.formbridge.example.com';

  const handleSuccess = (data: unknown, id: string) => {
    console.log('Form submitted successfully!', { data, submissionId: id });
    setSubmissionId(id);
    setError(null);
  };

  const handleError = (err: Error) => {
    console.error('Form submission failed:', err);
    setError(err.message);
    setSubmissionId(null);
  };

  const handleChange = (data: unknown) => {
    console.log('Form data changed:', data);
    // Clear previous submission state when form is edited
    if (submissionId) {
      setSubmissionId(null);
    }
    if (error) {
      setError(null);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>FormBridge React Form Renderer</h1>
        <p className="subtitle">Demo Application - Vendor Onboarding</p>
      </header>

      <main className="app-main">
        <div className="demo-info">
          <h2>About This Demo</h2>
          <p>
            This form demonstrates all field types supported by the FormBridge React Form Renderer:
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
          <p className="note">
            <strong>Note:</strong> This is a demo environment. The API endpoint is mocked and submissions
            will not be saved to a real backend. Check the browser console to see form data changes.
          </p>
        </div>

        <div className="form-container">
          <FormBridgeForm
            schema={vendorOnboardingSchema}
            endpoint={endpoint}
            onSuccess={handleSuccess}
            onError={handleError}
            onChange={handleChange}
            validateOnBlur={true}
            validateOnChange={false}
            submitText="Submit Vendor Application"
            showRequiredIndicator={true}
            className="vendor-onboarding-form"
            uiHints={{
              fieldHints: {
                description: {
                  widget: 'textarea',
                },
                documents: {
                  widget: 'file',
                },
                companySize: {
                  widget: 'radio',
                },
              },
            }}
          />
        </div>

        {submissionId && (
          <div className="success-message" role="alert" aria-live="polite">
            <h3>✓ Submission Successful!</h3>
            <p>
              Your vendor application has been submitted successfully.
              Submission ID: <code>{submissionId}</code>
            </p>
          </div>
        )}

        {error && (
          <div className="error-message" role="alert" aria-live="assertive">
            <h3>⚠ Submission Failed</h3>
            <p>{error}</p>
            <p className="hint">
              This is expected in demo mode since there's no real backend.
              The form still demonstrates all features including validation.
            </p>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>
          FormBridge React Form Renderer v0.1.0 |{' '}
          <a
            href="https://github.com/formbridge/formbridge"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
};

export default App;
