import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Lock, ShieldCheck, TrendingUp } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useAuth } from '../auth/AuthProvider';
import './AdminPage.css';

type AdminWindow = 7 | 30;

interface AdminMetricsSummary {
  activeDevices: number;
  activeSignedInAccounts: number;
  premiumSubscriptions: number;
  storageBytes: number;
  signups: number;
  upgrades: number;
  cancellations: number;
  cloudSaves: number;
  cloudLoads: number;
}

interface AdminDailyMetric extends AdminMetricsSummary {
  date: string;
}

interface AdminMetricsResponse {
  metricsEnabled: boolean;
  window: AdminWindow;
  summary: AdminMetricsSummary;
  dailyMetrics: AdminDailyMetric[];
}

const DEFAULT_SUMMARY: AdminMetricsSummary = {
  activeDevices: 0,
  activeSignedInAccounts: 0,
  premiumSubscriptions: 0,
  storageBytes: 0,
  signups: 0,
  upgrades: 0,
  cancellations: 0,
  cloudSaves: 0,
  cloudLoads: 0,
};

/** Formats aggregate byte counts into compact admin-friendly storage labels. */
const formatBytes = (value: number): string => {
  if (value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

/** Formats one admin day key into a compact month/day label. */
const formatDayLabel = (value: string): string => {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** Shared compact admin summary tile. */
const AdminSummaryTile: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="admin-summary-tile">
    <p>{label}</p>
    <strong>{value}</strong>
  </div>
);

/** Empty/blocked state shell used for hidden admin access states. */
const AdminStateCard: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}> = ({ title, description, actionLabel, actionHref }) => (
  <div className="admin-page-shell">
    <Card className="admin-surface-card">
      <CardHeader className="admin-card-header">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {actionLabel && actionHref ? (
        <CardContent className="admin-card-content">
          <Button asChild variant="outline">
            <Link to={actionHref}>{actionLabel}</Link>
          </Button>
        </CardContent>
      ) : null}
    </Card>
  </div>
);

/** Lightweight trend rows for the admin window. */
const AdminTrendRows: React.FC<{ dailyMetrics: AdminDailyMetric[] }> = ({ dailyMetrics }) => {
  const peakCloudSaves = Math.max(...dailyMetrics.map((metric) => metric.cloudSaves), 1);

  return (
    <div className="admin-trend-list">
      {dailyMetrics.map((metric) => (
        <div key={metric.date} className="admin-trend-row">
          <div className="admin-trend-labels">
            <strong>{formatDayLabel(metric.date)}</strong>
            <span>{metric.cloudSaves} cloud saves</span>
          </div>
          <div className="admin-trend-bar">
            <div
              className="admin-trend-fill"
              style={{ width: `${Math.max((metric.cloudSaves / peakCloudSaves) * 100, metric.cloudSaves ? 12 : 0)}%` }}
            />
          </div>
          <span className="admin-trend-value">{metric.activeSignedInAccounts} accounts</span>
        </div>
      ))}
    </div>
  );
};

/** Hidden admin dashboard for aggregate-only hosted product health metrics. */
const AdminPage: React.FC = () => {
  const { hostedAuthEnabled, status, user } = useAuth();
  const [windowSize, setWindowSize] = useState<AdminWindow>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metricsResponse, setMetricsResponse] = useState<AdminMetricsResponse | null>(null);

  useEffect(() => {
    if (!hostedAuthEnabled || status !== 'signed_in' || !user) {
      setLoading(false);
      setMetricsResponse(null);
      return;
    }

    let isActive = true;
    setLoading(true);
    setError(null);

    const loadAdminMetrics = async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/admin/metrics?window=${windowSize}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = (await response.json().catch(() => ({}))) as Partial<AdminMetricsResponse> & { error?: string };

        if (!response.ok) {
          throw new Error(typeof data.error === 'string' ? data.error : 'Unable to load admin metrics right now.');
        }

        if (!isActive) {
          return;
        }

        setMetricsResponse({
          metricsEnabled: Boolean(data.metricsEnabled),
          window: data.window === 30 ? 30 : 7,
          summary: data.summary ? { ...DEFAULT_SUMMARY, ...data.summary } : DEFAULT_SUMMARY,
          dailyMetrics: Array.isArray(data.dailyMetrics) ? (data.dailyMetrics as AdminDailyMetric[]) : [],
        });
        setLoading(false);
      } catch (nextError) {
        if (!isActive) {
          return;
        }

        setMetricsResponse(null);
        setError(nextError instanceof Error ? nextError.message : 'Unable to load admin metrics right now.');
        setLoading(false);
      }
    };

    loadAdminMetrics().catch(() => undefined);

    return function cleanupAdminMetricsLoad() {
      isActive = false;
    };
  }, [hostedAuthEnabled, status, user, windowSize]);

  const summary = useMemo(() => metricsResponse?.summary ?? DEFAULT_SUMMARY, [metricsResponse]);

  if (!hostedAuthEnabled) {
    return (
      <AdminStateCard
        title="Admin metrics unavailable"
        description="This deployment is running in local-only mode, so the private hosted admin dashboard is unavailable here."
        actionLabel="Back to Home"
        actionHref="/"
      />
    );
  }

  if (status !== 'signed_in' || !user) {
    return (
      <AdminStateCard
        title="Sign in to continue"
        description="The private admin dashboard is only available to signed-in allowlisted Firebase accounts."
        actionLabel="Open Account"
        actionHref="/account"
      />
    );
  }

  return (
    <div className="admin-page-shell">
      <section className="admin-hero">
        <div className="admin-pill">
          <Lock className="h-4 w-4" />
          Private Admin
        </div>
        <div className="admin-hero-copy">
          <div>
            <h1>Hosted metrics</h1>
            <p>Aggregate-only product health for beta operations. No user drill-down and no forecast payload content.</p>
          </div>
          <div className="admin-hero-actions">
            <Badge variant="outline">Window: {windowSize} days</Badge>
            <Button variant={windowSize === 7 ? 'default' : 'outline'} onClick={() => setWindowSize(7)}>
              Last 7 days
            </Button>
            <Button variant={windowSize === 30 ? 'default' : 'outline'} onClick={() => setWindowSize(30)}>
              Last 30 days
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <Card className="admin-surface-card">
          <CardContent className="admin-card-content">
            <p className="admin-error">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="admin-summary-grid">
        <AdminSummaryTile label="Active devices" value={loading ? 'Loading...' : `${summary.activeDevices}`} />
        <AdminSummaryTile
          label="Active signed-in accounts"
          value={loading ? 'Loading...' : `${summary.activeSignedInAccounts}`}
        />
        <AdminSummaryTile
          label="Premium subscriptions"
          value={loading ? 'Loading...' : `${summary.premiumSubscriptions}`}
        />
        <AdminSummaryTile label="Storage footprint" value={loading ? 'Loading...' : formatBytes(summary.storageBytes)} />
      </div>

      <div className="admin-content-grid">
        <Card className="admin-surface-card">
          <CardHeader className="admin-card-header">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Window totals
            </CardTitle>
            <CardDescription>
              Aggregate product actions across the selected {windowSize}-day window.
            </CardDescription>
          </CardHeader>
          <CardContent className="admin-card-content">
            <div className="admin-summary-grid admin-summary-grid-compact">
              <AdminSummaryTile label="Signups" value={`${summary.signups}`} />
              <AdminSummaryTile label="Upgrades" value={`${summary.upgrades}`} />
              <AdminSummaryTile label="Cancellations" value={`${summary.cancellations}`} />
              <AdminSummaryTile label="Cloud saves" value={`${summary.cloudSaves}`} />
              <AdminSummaryTile label="Cloud loads" value={`${summary.cloudLoads}`} />
            </div>
          </CardContent>
        </Card>

        <Card className="admin-surface-card">
          <CardHeader className="admin-card-header">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Daily trend
            </CardTitle>
            <CardDescription>
              Cloud-save volume and signed-in account activity for the selected window.
            </CardDescription>
          </CardHeader>
          <CardContent className="admin-card-content">
            {loading ? (
              <p className="admin-muted-copy">Loading daily metrics...</p>
            ) : metricsResponse?.dailyMetrics.length ? (
              <AdminTrendRows dailyMetrics={metricsResponse.dailyMetrics} />
            ) : (
              <p className="admin-muted-copy">No daily metrics have been recorded yet for this window.</p>
            )}
          </CardContent>
        </Card>

        <Card className="admin-surface-card">
          <CardHeader className="admin-card-header">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Privacy notes
            </CardTitle>
            <CardDescription>
              The admin dashboard intentionally stays aggregate-only for beta operations.
            </CardDescription>
          </CardHeader>
          <CardContent className="admin-card-content">
            <ul className="admin-note-list">
              <li>No raw IP analytics are stored for product metrics.</li>
              <li>No forecast payload contents are exposed in this dashboard.</li>
              <li>Unique device/activity counts rely on short-lived dedupe records only.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminPage;
export { AdminPage };
