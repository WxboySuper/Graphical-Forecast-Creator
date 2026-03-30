import React, { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Cloud, CloudOff, Download, Edit2, FolderOpen, LoaderCircle, Lock, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { useAuth } from '../auth/AuthProvider';
import { useEntitlement } from '../billing/EntitlementProvider';
import { useCloudCycles } from '../hooks/useCloudCycles';
import { CloudCycleMetadata } from '../types/cloudCycles';
import './CloudLibraryPage.css';

/** Formats cloud-cycle timestamps for the library surface. */
const formatDate = (dateString: string): string =>
  new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Small stat card used in the cloud-library summary row. */
const CloudLibraryStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="cloud-library-stat">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

/** Top hero shared by the signed-in cloud library states. */
const CloudLibraryHero: React.FC<{
  premiumActive: boolean;
  cycleCount: number;
  isExpiredPremium: boolean;
}> = ({ premiumActive, cycleCount, isExpiredPremium }) => (
  <section className="cloud-library-hero">
    <div className="cloud-library-hero-copy">
      <div className="cloud-library-pill">
        <Cloud className="h-4 w-4" />
        Cloud Library
      </div>
      <div className="cloud-library-hero-text">
        <h1>Your saved cloud cycles.</h1>
        <p>Load a hosted package back into the editor, rename it, or clean up old saves without digging through menus.</p>
      </div>
    </div>

    <div className="cloud-library-hero-panel">
      <div className="cloud-library-status-row">
        <Badge variant={premiumActive ? 'success' : 'outline'}>
          {premiumActive ? 'Premium active' : isExpiredPremium ? 'Premium expired' : 'Free plan'}
        </Badge>
        <Badge variant="secondary">{cycleCount} saved</Badge>
      </div>
      <div className="cloud-library-stat-grid">
        <CloudLibraryStat label="Cloud cycles" value={`${cycleCount}`} />
        <CloudLibraryStat label="Writes" value={premiumActive ? 'Enabled' : 'Read-only'} />
      </div>
    </div>
  </section>
);

/** Compact notice shown when premium has lapsed but cloud reads stay available. */
const ExpiredPremiumNotice: React.FC = () => (
  <Card className="cloud-library-notice-card">
    <CardContent className="cloud-library-notice-content">
      <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
      <div>
        <strong>Premium expired</strong>
        <p>
          Your library is still readable, but new saves, renames, and deletes are locked until premium is active again.
        </p>
      </div>
    </CardContent>
  </Card>
);

/** Combined utility card for access details and next actions. */
const CloudLibraryUtilityCard: React.FC<{
  premiumActive: boolean;
  isExpiredPremium: boolean;
}> = ({ premiumActive, isExpiredPremium }) => (
  <Card className="cloud-library-support-card">
    <CardHeader className="cloud-library-section-header">
      <div className="cloud-library-support-title">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <CardTitle>Storage access</CardTitle>
      </div>
      <CardDescription>Hosted saves live here. The forecast editor, discussions, verification, and exports still stay local-first.</CardDescription>
    </CardHeader>
    <CardContent className="cloud-library-support-content">
      <div className="cloud-library-support-grid">
        <CloudLibraryStat label="Mode" value={premiumActive ? 'Full access' : isExpiredPremium ? 'Read-only' : 'Locked'} />
        <CloudLibraryStat label="Library" value={premiumActive ? 'Writable' : 'Readable'} />
      </div>
      <p className="cloud-library-support-copy">
        {premiumActive
          ? 'Save new versions from the toolbar and they will show up here automatically.'
          : isExpiredPremium
            ? 'Your saved cycles are still available to open, but writes stay off until premium is active again.'
            : 'Premium unlocks hosted saves. Until then, your forecast workflow stays local.'}
      </p>
      <div className="cloud-library-divider" />
      <div className="cloud-library-support-actions">
        <Button asChild variant="default">
          <Link to="/forecast">Back to Forecast Editor</Link>
        </Button>
        <Button asChild variant={premiumActive ? 'outline' : 'default'}>
          <Link to="/pricing">{premiumActive ? 'View Pricing' : 'Upgrade to Premium'}</Link>
        </Button>
        {isExpiredPremium ? (
          <p className="cloud-library-side-note">Renew premium to turn cloud writes back on.</p>
        ) : null}
      </div>
    </CardContent>
  </Card>
);

/** Empty library state with cleaner product-facing calls to action. */
const EmptyState: React.FC<{ premiumActive: boolean }> = ({ premiumActive }) => (
  <div className="cloud-library-empty-state">
    <div className="cloud-library-empty-icon">
      <FolderOpen className="h-8 w-8" />
    </div>
    <div className="cloud-library-empty-copy">
      <h2>No cloud cycles saved yet</h2>
      <p>
        {premiumActive
          ? 'Use the cloud save button in the forecast toolbar and your current package will land here.'
          : 'Hosted cloud saves are part of premium. You can still keep working locally and upgrade when you want syncing.'}
      </p>
    </div>
    <div className="cloud-library-empty-actions">
      <Button asChild variant="default">
        <Link to="/forecast">Open Forecast Editor</Link>
      </Button>
      <Button asChild variant={premiumActive ? 'outline' : 'default'}>
        <Link to="/pricing">{premiumActive ? 'View Pricing' : 'See Premium'}</Link>
      </Button>
    </div>
  </div>
);

/** Renaming controls shown in-place for one cloud cycle row. */
const CycleRenameRow: React.FC<{
  newLabel: string;
  isBusy: boolean;
  onLabelChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}> = ({ newLabel, isBusy, onLabelChange, onSave, onCancel }) => (
  <div className="cloud-cycle-rename-row">
    <Input
      value={newLabel}
      onChange={(e) => onLabelChange(e.target.value)}
      placeholder="Cycle name"
      disabled={isBusy}
    />
    <div className="cloud-cycle-inline-actions">
      <Button variant="outline" size="sm" onClick={onCancel} disabled={isBusy}>
        Cancel
      </Button>
      <Button size="sm" onClick={onSave} disabled={isBusy}>
        {isBusy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
        Save
      </Button>
    </div>
  </div>
);

interface CycleItemProps {
  cycle: CloudCycleMetadata;
  canWrite: boolean;
  loading: boolean;
  onLoad: (cycleId: string) => Promise<void>;
  onDelete: (cycleId: string) => Promise<void>;
  onRename: (cycleId: string, newLabel: string) => Promise<void>;
}

/** One cloud cycle row inside the library list. */
const CycleItem: React.FC<CycleItemProps> = ({ cycle, canWrite, loading, onLoad, onDelete, onRename }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isSavingRename, setIsSavingRename] = useState(false);
  const [newLabel, setNewLabel] = useState(cycle.label);

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${cycle.label}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(cycle.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRenameSave = async () => {
    if (!newLabel.trim() || newLabel.trim() === cycle.label) {
      setIsRenaming(false);
      setNewLabel(cycle.label);
      return;
    }

    setIsSavingRename(true);
    try {
      await onRename(cycle.id, newLabel.trim());
    } finally {
      setIsSavingRename(false);
      setIsRenaming(false);
    }
  };

  return (
    <Card className="cloud-library-surface-card cloud-cycle-card">
      <CardContent className="cloud-cycle-card-content">
        <div className="cloud-cycle-main">
          <div className="cloud-cycle-header">
            <div className="cloud-cycle-title-row">
              <h3>{cycle.label}</h3>
              {cycle.isReadOnly ? (
                <Badge variant="outline">
                  <Lock className="mr-1 h-3.5 w-3.5" />
                  Read-only
                </Badge>
              ) : null}
            </div>
            <div className="cloud-cycle-meta">
              <span>Cycle {cycle.cycleDate}</span>
              <span>Updated {formatDate(cycle.updatedAt)}</span>
            </div>
          </div>

          {isRenaming ? (
            <CycleRenameRow
              newLabel={newLabel}
              isBusy={loading || isSavingRename}
              onLabelChange={setNewLabel}
              onSave={handleRenameSave}
              onCancel={() => {
                setIsRenaming(false);
                setNewLabel(cycle.label);
              }}
            />
          ) : null}

          <div className="cloud-cycle-stats">
            <CloudLibraryStat label="Forecast days" value={`${cycle.forecastDays}`} />
            <CloudLibraryStat label="Outlooks" value={`${cycle.totalOutlooks}`} />
            <CloudLibraryStat label="Features" value={`${cycle.totalFeatures}`} />
          </div>
        </div>

        <div className="cloud-cycle-actions">
          <Button variant="outline" onClick={() => onLoad(cycle.id)} disabled={loading || isDeleting || isSavingRename}>
            <Download className="mr-2 h-4 w-4" />
            Load
          </Button>

          {canWrite && !cycle.isReadOnly ? (
            <>
              <Button variant="outline" onClick={() => setIsRenaming(true)} disabled={loading || isDeleting || isSavingRename || isRenaming}>
                <Edit2 className="mr-2 h-4 w-4" />
                Rename
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={loading || isDeleting || isSavingRename}>
                {isDeleting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

/** Sign-in gate shown when a user reaches the cloud page without auth. */
const SignedOutGate: React.FC = () => (
  <div className="cloud-library-center-shell">
    <Card className="cloud-library-surface-card cloud-library-auth-card">
      <CardHeader className="cloud-library-section-header">
        <CardTitle>Sign in to use your cloud library</CardTitle>
        <CardDescription>
          Hosted cycle storage is tied to your account, so you need to sign in before opening cloud saves.
        </CardDescription>
      </CardHeader>
      <CardContent className="cloud-library-support-actions">
        <Button asChild>
          <Link to="/account">Sign In</Link>
        </Button>
      </CardContent>
    </Card>
  </div>
);

/** Production-facing page for loading and managing cloud-hosted cycles. */
const CloudLibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { premiumActive, effectiveSource } = useEntitlement();
  const { cycles, loading, error, loadCycle, deleteCycle, renameCycle, refreshCycles } = useCloudCycles();
  const [message, setMessage] = useState<string | null>(null);

  const canWrite = premiumActive;
  const isExpiredPremium = !premiumActive && effectiveSource === 'stripe';
  const cycleCountLabel = useMemo(() => `${cycles.length} cloud cycle${cycles.length === 1 ? '' : 's'}`, [cycles.length]);

  const handleLoadCycle = useCallback(async (cycleId: string) => {
    setMessage(null);
    const payload = await loadCycle(cycleId);
    if (!payload) {
      return;
    }

    const selectedCycle = cycles.find((cycle) => cycle.id === cycleId);
    sessionStorage.setItem('cloudCyclePayload', JSON.stringify(payload));
    sessionStorage.setItem(
      'cloudCycleMeta',
      JSON.stringify({
        id: cycleId,
        label: selectedCycle?.label ?? 'Cloud Forecast',
      })
    );
    navigate('/forecast');
  }, [cycles, loadCycle, navigate]);

  const handleDeleteCycle = useCallback(async (cycleId: string) => {
    setMessage(null);
    const success = await deleteCycle(cycleId);
    if (success) {
      setMessage('Cloud cycle deleted.');
    }
  }, [deleteCycle]);

  const handleRenameCycle = useCallback(async (cycleId: string, newLabel: string) => {
    setMessage(null);
    const success = await renameCycle(cycleId, newLabel);
    if (success) {
      await refreshCycles();
      setMessage('Cloud cycle renamed.');
    }
  }, [refreshCycles, renameCycle]);

  if (!user) {
    return <SignedOutGate />;
  }

  return (
    <div className="cloud-library-page">
      <div className="cloud-library-shell">
        <CloudLibraryHero premiumActive={premiumActive} cycleCount={cycles.length} isExpiredPremium={isExpiredPremium} />

        {isExpiredPremium ? <ExpiredPremiumNotice /> : null}
        {error || message ? (
          <Card className="cloud-library-surface-card">
            <CardContent className="cloud-library-feedback">
              {error ? <CloudOff className="h-5 w-5 text-destructive shrink-0 mt-0.5" /> : <Cloud className="h-5 w-5 text-primary shrink-0 mt-0.5" />}
              <p>{error ?? message}</p>
            </CardContent>
          </Card>
        ) : null}

        <div className="cloud-library-layout">
          <div className="cloud-library-main">
            <Card className="cloud-library-surface-card">
              <CardHeader className="cloud-library-section-header">
                <CardTitle>Your cloud cycles</CardTitle>
                <CardDescription>Open a saved package, rename it, or clear out older copies.</CardDescription>
              </CardHeader>
              <CardContent className="cloud-library-list-content">
                {loading && cycles.length === 0 ? (
                  <div className="cloud-library-loading">
                    <LoaderCircle className="h-6 w-6 animate-spin" />
                  </div>
                ) : cycles.length === 0 ? (
                  <EmptyState premiumActive={premiumActive} />
                ) : (
                  <>
                    <div className="cloud-library-list-header">
                      <strong>{cycleCountLabel}</strong>
                      {!premiumActive ? <Badge variant="outline">Read-only</Badge> : null}
                    </div>

                    <div className="cloud-library-list">
                      {cycles.map((cycle) => (
                        <CycleItem
                          key={cycle.id}
                          cycle={cycle}
                          canWrite={canWrite}
                          loading={loading}
                          onLoad={handleLoadCycle}
                          onDelete={handleDeleteCycle}
                          onRename={handleRenameCycle}
                        />
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="cloud-library-side">
            <CloudLibraryUtilityCard premiumActive={premiumActive} isExpiredPremium={isExpiredPremium} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CloudLibraryPage;
