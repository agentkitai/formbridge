/**
 * FormBridge Admin Dashboard Entry Point
 *
 * Wires BrowserRouter + page components with the typed API client.
 */

import { createElement, useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
  useNavigate,
  useParams,
  useLocation,
} from 'react-router-dom';

import { FormBridgeApiClient } from './api/client.js';
import type {
  AnalyticsSummary,
  VolumeDataPoint,
  SubmissionSummary,
  SubmissionDetail,
  ApprovalRecord,
  DeliveryRecord,
  IntakeSummary,
} from './api/client.js';

import { Layout } from './components/Layout.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { IntakeListPage } from './pages/IntakeListPage.js';
import { SubmissionBrowserPage } from './pages/SubmissionBrowserPage.js';
import { SubmissionDetailPage } from './pages/SubmissionDetailPage.js';
import { ApprovalQueuePage } from './pages/ApprovalQueuePage.js';
import { AnalyticsDashboardPage } from './pages/AnalyticsDashboardPage.js';
import { WebhookMonitorPage } from './pages/WebhookMonitorPage.js';

// API client — uses Vite proxy (relative URLs)
const client = new FormBridgeApiClient({ baseUrl: '' });

// ---------------------------------------------------------------------------
// Page wrapper components — fetch data and pass to presentational page components
// ---------------------------------------------------------------------------

function DashboardWrapper() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    client
      .getAnalyticsSummary()
      .then(setSummary)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return createElement(DashboardPage, { summary, loading, error });
}

function IntakeListWrapper() {
  const [intakes, setIntakes] = useState<IntakeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const navigate = useNavigate();

  useEffect(() => {
    client
      .listIntakes()
      .then(setIntakes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return createElement(IntakeListPage, {
    intakes,
    loading,
    error,
    onSelectIntake: (intakeId: string) => navigate(`/submissions?intake=${intakeId}`),
  });
}

function SubmissionBrowserWrapper() {
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stateFilter, setStateFilter] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    // List submissions for the first available intake (simplified — ideally intake comes from route/query)
    client
      .listIntakes()
      .then((intakes) => {
        if (intakes.length === 0) return { data: [], total: 0, page: 1, pageSize: 20, hasMore: false };
        return client.listSubmissions(intakes[0].intakeId, {
          page,
          pageSize: 20,
          state: stateFilter || undefined,
        });
      })
      .then((res) => {
        setSubmissions(res.data);
        setTotal(res.total);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, stateFilter]);

  return createElement(SubmissionBrowserPage, {
    submissions,
    loading,
    error,
    total,
    page,
    pageSize: 20,
    stateFilter,
    onPageChange: setPage,
    onStateFilterChange: setStateFilter,
    onSelectSubmission: (sid: string) => navigate(`/submissions/${sid}`),
  });
}

function SubmissionDetailWrapper() {
  const { id } = useParams<{ id: string }>();
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    // We need intakeId — fetch from submissions list or just try all intakes
    client
      .listIntakes()
      .then(async (intakes) => {
        for (const intake of intakes) {
          try {
            const sub = await client.getSubmission(intake.intakeId, id);
            setSubmission(sub);
            return;
          } catch {
            // Try next intake
          }
        }
        setError('Submission not found');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  return createElement(SubmissionDetailPage, {
    submission,
    loading,
    error,
    onBack: () => navigate('/submissions'),
    onApprove: submission
      ? () => {
          client
            .approveSubmission(submission.intakeId, submission.id)
            .then(() => navigate('/submissions'))
            .catch((e) => setError(e.message));
        }
      : undefined,
    onReject: submission
      ? () => {
          client
            .rejectSubmission(submission.intakeId, submission.id, 'Rejected by admin')
            .then(() => navigate('/submissions'))
            .catch((e) => setError(e.message));
        }
      : undefined,
  });
}

function ApprovalQueueWrapper() {
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const navigate = useNavigate();

  useEffect(() => {
    client
      .listPendingApprovals()
      .then(setApprovals)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return createElement(ApprovalQueuePage, {
    approvals,
    loading,
    error,
    onSelectSubmission: (intakeId: string, submissionId: string) =>
      navigate(`/submissions/${submissionId}`),
  });
}

function AnalyticsDashboardWrapper() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [volumeData, setVolumeData] = useState<VolumeDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    Promise.all([client.getAnalyticsSummary(), client.getVolumeData(30)])
      .then(([s, v]) => {
        setSummary(s);
        setVolumeData(v);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return createElement(AnalyticsDashboardPage, { summary, volumeData, loading, error });
}

function WebhookMonitorWrapper() {
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    // Aggregate deliveries from all known submissions is complex.
    // For now, show empty and let user navigate from submission detail.
    setLoading(false);
  }, []);

  const handleRetry = useCallback((deliveryId: string) => {
    client.retryDelivery(deliveryId).catch((e) => setError(e.message));
  }, []);

  return createElement(WebhookMonitorPage, { deliveries, loading, error, onRetry: handleRetry });
}

// ---------------------------------------------------------------------------
// Shell — Layout + Router
// ---------------------------------------------------------------------------

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();

  const routes = createElement(
    Routes,
    null,
    createElement(Route, { path: '/', element: createElement(DashboardWrapper) }),
    createElement(Route, { path: '/intakes', element: createElement(IntakeListWrapper) }),
    createElement(Route, { path: '/submissions', element: createElement(SubmissionBrowserWrapper) }),
    createElement(Route, { path: '/submissions/:id', element: createElement(SubmissionDetailWrapper) }),
    createElement(Route, { path: '/approvals', element: createElement(ApprovalQueueWrapper) }),
    createElement(Route, { path: '/analytics', element: createElement(AnalyticsDashboardWrapper) }),
    createElement(Route, { path: '/webhooks', element: createElement(WebhookMonitorWrapper) }),
  );

  return createElement(
    Layout,
    {
      currentPath: location.pathname,
      onNavigate: (path: string) => navigate(path),
      children: routes,
    },
  );
}

function App() {
  return createElement(BrowserRouter, null, createElement(AppShell));
}

// Mount the app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(createElement(App));
} else {
  console.error('Root container not found');
}
