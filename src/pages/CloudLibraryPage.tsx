import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertCircle, Cloud, CloudOff, Download, Edit2, LoaderCircle, Lock, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { useAuth } from '../auth/AuthProvider';
import { useEntitlement } from '../billing/EntitlementProvider';
import { PRICING_COPY } from '../billing/pricingCopy';
import { useCloudCycles } from '../hooks/useCloudCycles';
import { CloudCycleMetadata } from '../types/cloudCycles';
import { getBuildTarget } from '../config/buildTarget';
import { getForecastWorkspace } from '../config/forecastWorkspaces';
import { getDefaultForecastWorkspacePath } from '../routing/forecastWorkspaceRoutes';
import {
  filterCloudCyclesByWorkspace,
  getCloudCycleWorkspaceId,
  getCloudCycleWorkspaceLabel,
  getCloudLibraryTabs,
  getCloudLibraryTabLabel,
  getCloudLibraryWorkspacePath,
  getNextCloudLibraryTabId,
  resolveActiveCloudLibraryTab,
  type CloudLibraryTab,
  type CloudLibraryTabId,
} from './cloudLibraryWorkspace';
import { getScopedStorageKey, getStorageScope } from '../utils/storageScope';
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

/** Header block used by the combined cloud-library utility card. */
const CloudLibraryUtilityHeader: React.FC<{ boundaryCopy: string }> = ({ boundaryCopy }) => (
  <CardHeader className="cloud-library-section-header">
    <div className="cloud-library-support-title">
      <ShieldCheck className="h-5 w-5 text-primary" />
      <CardTitle>Storage access</CardTitle>
    </div>
    <CardDescription>{boundaryCopy}</CardDescription>
  </CardHeader>
);

/** Context-sensitive helper copy shown in the right-side utility card. */
const getUtilityCardCopy = (premiumActive: boolean, isExpiredPremium: boolean): string => {
  if (premiumActive) {
    return 'Save new versions from the toolbar and they will show up here automatically.';
  }

  if (isExpiredPremium) {
    return 'Your previously saved cycles remain available to open and export.';
  }

  return 'Your library stays readable locally; signing in restores access to hosted cycles.';
};

/** Support actions rendered in the right-side cloud utility card. */
const CloudLibraryUtilityActions: React.FC<{
  premiumActive: boolean;
  isExpiredPremium: boolean;
}> = ({ premiumActive, isExpiredPremium }) => (
  <div className="cloud-library-support-actions">
    <Button asChild variant="default">
      <Link to={getDefaultForecastWorkspacePath()}>Back to Forecast Editor</Link>
    </Button>
    <Button asChild variant={premiumActive ? 'outline' : 'default'}>
      <Link to="/pricing">{premiumActive ? 'View Pricing' : 'Upgrade to Premium'}</Link>
    </Button>
    {isExpiredPremium ? (
      <p className="cloud-library-side-note">Renew premium to turn cloud writes back on.</p>
    ) : null}
  </div>
);

/** Combined utility card for access details and next actions. */
const CloudLibraryUtilityCard: React.FC<{
  premiumActive: boolean;
  isExpiredPremium: boolean;
}> = ({ premiumActive, isExpiredPremium }) => (
  <Card className="cloud-library-support-card">
    <CloudLibraryUtilityHeader
      boundaryCopy={premiumActive ? PRICING_COPY.premiumAccount : isExpiredPremium ? PRICING_COPY.downgradeSummary : PRICING_COPY.freeAccount}
    />
    <CardContent className="cloud-library-support-content">
      <div className="cloud-library-support-grid">
        <CloudLibraryStat label="Mode" value={premiumActive ? 'Full access' : isExpiredPremium ? 'Read-only' : 'Locked'} />
        <CloudLibraryStat label="Library" value={premiumActive ? 'Writable' : 'Readable'} />
      </div>
      <p className="cloud-library-support-copy">{getUtilityCardCopy(premiumActive, isExpiredPremium)}</p>
      <div className="cloud-library-divider" />
      <CloudLibraryUtilityActions premiumActive={premiumActive} isExpiredPremium={isExpiredPremium} />
    </CardContent>
  </Card>
);

/** Empty library state with cleaner product-facing calls to action. */
const EmptyState: React.FC<{
  premiumActive: boolean;
  workspaceLabel?: string;
  workspacePath: string;
}> = ({ premiumActive, workspaceLabel, workspacePath }) => (
  <div className="cloud-library-empty-state">
    <div className="cloud-library-empty-icon">
      <Cloud className="h-8 w-8" />
    </div>
    <div className="cloud-library-empty-copy">
      <h2>No {workspaceLabel ? `${workspaceLabel} ` : ''}cloud cycles saved yet</h2>
      <p>
        {premiumActive
          ? 'Use the cloud save button in the forecast toolbar and your current package will land here.'
          : 'Hosted cloud saves are part of premium. You can still keep working locally and upgrade when you want syncing.'}
      </p>
    </div>
    <div className="cloud-library-empty-actions">
      <Button asChild variant="default">
        <Link to={workspacePath}>{premiumActive ? 'Start your first forecast' : 'Open Forecast Editor'}</Link>
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
      aria-label="Rename cloud cycle"
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

/** Header block for one saved cloud cycle row. */
const CloudCycleHeader: React.FC<{ cycle: CloudCycleMetadata; showWorkspaceBadge?: boolean }> = ({
  cycle,
  showWorkspaceBadge = false,
}) => (
  <div className="cloud-cycle-header">
    <div className="cloud-cycle-title-row">
      <h3>{cycle.label}</h3>
      {showWorkspaceBadge ? <Badge variant="outline">{getCloudCycleWorkspaceLabel(cycle)}</Badge> : null}
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
);

/** Stats row summarizing forecast density for one saved cloud cycle. */
const CloudCycleStats: React.FC<{ cycle: CloudCycleMetadata }> = ({ cycle }) => (
  <div className="cloud-cycle-stats">
    <CloudLibraryStat label="Forecast days" value={`${cycle.forecastDays}`} />
    <CloudLibraryStat label="Outlooks" value={`${cycle.totalOutlooks}`} />
    <CloudLibraryStat label="Features" value={`${cycle.totalFeatures}`} />
  </div>
);

/** Inline delete confirmation shown instead of a blocking browser confirm dialog. */
const CloudCycleDeletePrompt: React.FC<{
  cycleLabel: string;
  isBusy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ cycleLabel, isBusy, onCancel, onConfirm }) => (
  <div className="cloud-cycle-delete-prompt">
    <p>Delete &quot;{cycleLabel}&quot;? This action cannot be undone.</p>
    <div className="cloud-cycle-inline-actions">
      <Button className="cloud-cycle-button cloud-cycle-button--ghost" variant="outline" size="sm" onClick={onCancel} disabled={isBusy}>
        Keep
      </Button>
      <Button className="cloud-cycle-button cloud-cycle-button--danger" variant="outline" size="sm" onClick={onConfirm} disabled={isBusy}>
        {isBusy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
        Delete
      </Button>
    </div>
  </div>
);

/** Delete action control that swaps between the confirm prompt and the destructive button. */
const CloudCycleDeleteAction: React.FC<{
  confirmingDelete: boolean;
  cycleLabel: string;
  isBusy: boolean;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}> = ({
  confirmingDelete,
  cycleLabel,
  isBusy,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}) => {
  if (confirmingDelete) {
    return (
      <CloudCycleDeletePrompt
        cycleLabel={cycleLabel}
        isBusy={isBusy}
        onCancel={onCancelDelete}
        onConfirm={onConfirmDelete}
      />
    );
  }

  return (
    <Button className="cloud-cycle-button cloud-cycle-button--danger" variant="outline" onClick={onRequestDelete} disabled={isBusy}>
      <Trash2 className="mr-2 h-4 w-4" />
      Delete
    </Button>
  );
};

/** Rename and delete actions shown only when the current cloud cycle can be edited. */
const CloudCycleWriteActions: React.FC<{
  cycle: CloudCycleMetadata;
  canWrite: boolean;
  isBusy: boolean;
  isRenaming: boolean;
  confirmingDelete: boolean;
  onStartRename: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}> = ({
  cycle,
  canWrite,
  isBusy,
  isRenaming,
  confirmingDelete,
  onStartRename,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}) => {
  if (!canWrite || cycle.isReadOnly) {
    return null;
  }

  return (
    <>
      <Button
        className="cloud-cycle-button cloud-cycle-button--ghost"
        variant="outline"
        onClick={onStartRename}
        disabled={isBusy || isRenaming || confirmingDelete}
      >
        <Edit2 className="mr-2 h-4 w-4" />
        Rename
      </Button>
      <CloudCycleDeleteAction
        confirmingDelete={confirmingDelete}
        cycleLabel={cycle.label}
        isBusy={isBusy}
        onRequestDelete={onRequestDelete}
        onCancelDelete={onCancelDelete}
        onConfirmDelete={onConfirmDelete}
      />
    </>
  );
};

/** Action block for loading, renaming, and deleting one cloud cycle. */
const CloudCycleActions: React.FC<{
  canWrite: boolean;
  loading: boolean;
  cycle: CloudCycleMetadata;
  isDeleting: boolean;
  isSavingRename: boolean;
  isRenaming: boolean;
  confirmingDelete: boolean;
  onLoad: () => void;
  onStartRename: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}> = ({
  canWrite,
  loading,
  cycle,
  isDeleting,
  isSavingRename,
  isRenaming,
  confirmingDelete,
  onLoad,
  onStartRename,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}) => {
  const workspaceLabel = getCloudCycleWorkspaceLabel(cycle);
  const loadSupported = getCloudCycleWorkspaceId(cycle) === 'severe';
  const loadHintId = `cloud-cycle-load-hint-${cycle.id}`;
  const isBusy = loading || isDeleting || isSavingRename;

  /** Keeps unsupported Load focusable while blocking any load, fetch, or navigation. */
  const handleLoadClick = () => {
    if (!loadSupported) {
      return;
    }
    onLoad();
  };

  return (
    <div className="cloud-cycle-actions">
      <Button
        className="cloud-cycle-button cloud-cycle-button--load"
        onClick={handleLoadClick}
        disabled={isBusy}
        aria-disabled={!loadSupported ? true : undefined}
        aria-describedby={loadSupported ? undefined : loadHintId}
      >
        <Download className="mr-2 h-4 w-4" />
        Load
      </Button>
      <CloudCycleWriteActions
        cycle={cycle}
        canWrite={canWrite}
        isBusy={isBusy}
        isRenaming={isRenaming}
        confirmingDelete={confirmingDelete}
        onStartRename={onStartRename}
        onRequestDelete={onRequestDelete}
        onCancelDelete={onCancelDelete}
        onConfirmDelete={onConfirmDelete}
      />
      {!loadSupported ? (
        <p id={loadHintId} className="cloud-cycle-load-hint">
          {workspaceLabel} loading is not supported yet. Only Severe saves can be opened.
        </p>
      ) : null}
    </div>
  );
};

interface CycleRowUiState {
  isRenaming: boolean;
  draft: string | null;
  confirmingDelete: boolean;
}

interface CycleItemProps {
  cycle: CloudCycleMetadata;
  canWrite: boolean;
  loading: boolean;
  showWorkspaceBadge?: boolean;
  rowState: CycleRowUiState;
  onRowStateChange: (next: CycleRowUiState) => void;
  onLoad: (cycleId: string) => Promise<void>;
  onDelete: (cycleId: string) => Promise<void>;
  onRename: (cycleId: string, newLabel: string) => Promise<void>;
}

interface CloudLibraryActions {
  message: string | null;
  setMessage: React.Dispatch<React.SetStateAction<string | null>>;
  handleLoadCycle: (cycleId: string) => Promise<void>;
  handleDeleteCycle: (cycleId: string) => Promise<void>;
  handleRenameCycle: (cycleId: string, newLabel: string) => Promise<void>;
}

/** One cloud cycle row inside the library list. */
const CycleItem: React.FC<CycleItemProps> = ({ cycle, canWrite, loading, showWorkspaceBadge = false, rowState, onRowStateChange, onLoad, onDelete, onRename }) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingRename, setIsSavingRename] = useState(false);
  const { isRenaming, confirmingDelete } = rowState;
  const newLabel = rowState.draft ?? cycle.label;

  /** Deletes the selected cloud cycle after the inline confirmation has been accepted. */
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(cycle.id);
      onRowStateChange({ ...rowState, confirmingDelete: false });
    } finally {
      setIsDeleting(false);
    }
  };

  /** Saves a renamed cloud-cycle label and exits inline editing when the request completes. */
  const handleRenameSave = async () => {
    if (!newLabel.trim() || newLabel.trim() === cycle.label) {
      onRowStateChange({ isRenaming: false, draft: null, confirmingDelete: false });
      return;
    }

    setIsSavingRename(true);
    try {
      await onRename(cycle.id, newLabel.trim());
    } finally {
      setIsSavingRename(false);
      onRowStateChange({ isRenaming: false, draft: null, confirmingDelete: false });
    }
  };

  return (
    <Card className="cloud-library-surface-card cloud-cycle-card">
      <CardContent className="cloud-cycle-card-content">
        <div className="cloud-cycle-main">
          <CloudCycleHeader cycle={cycle} showWorkspaceBadge={showWorkspaceBadge} />

          {isRenaming ? (
            <CycleRenameRow
              newLabel={newLabel}
              isBusy={loading || isSavingRename}
              onLabelChange={(value) => onRowStateChange({ ...rowState, draft: value })}
              onSave={handleRenameSave}
              onCancel={() => {
                onRowStateChange({ isRenaming: false, draft: null, confirmingDelete: false });
              }}
            />
          ) : null}

          <CloudCycleStats cycle={cycle} />
        </div>

        <CloudCycleActions
          canWrite={canWrite}
          loading={loading}
          cycle={cycle}
          isDeleting={isDeleting}
          isSavingRename={isSavingRename}
          isRenaming={isRenaming}
          confirmingDelete={confirmingDelete}
          onLoad={() => onLoad(cycle.id)}
          onStartRename={() => {
            onRowStateChange({ ...rowState, isRenaming: true, confirmingDelete: false });
          }}
          onRequestDelete={() => onRowStateChange({ ...rowState, confirmingDelete: true })}
          onCancelDelete={() => onRowStateChange({ ...rowState, confirmingDelete: false })}
          onConfirmDelete={handleDelete}
        />
      </CardContent>
    </Card>
  );
};

/** Centered sign-in card body for the signed-out cloud-library state. */
const CloudLibraryAuthCard: React.FC = () => (
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
);

/** Sign-in gate shown when a user reaches the cloud page without auth. */
const SignedOutGate: React.FC = () => (
  <div className="cloud-library-center-shell">
    <CloudLibraryAuthCard />
  </div>
);

/** Lightweight feedback banner used for transient cloud-library status or error messages. */
const CloudLibraryFeedbackCard: React.FC<{
  error: string | null;
  message: string | null;
}> = ({ error, message }) => {
  if (!error && !message) return null;

  return (
    <Card className="cloud-library-surface-card">
      <CardContent className="cloud-library-feedback" role="status">
        {error ? (
          <CloudOff className="h-5 w-5 shrink-0 text-destructive" />
        ) : (
          <Cloud className="h-5 w-5 shrink-0 text-primary" />
        )}
        <p>{error ?? message}</p>
      </CardContent>
    </Card>
  );
};

/** Modifier flags that turn arrow-key tab selection into a browser shortcut. */
const KEYBOARD_MODIFIER_FLAGS = ['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const;

/** True when a tab key event carries Alt, Ctrl, Meta, or Shift. */
const hasKeyboardModifier = (event: React.KeyboardEvent): boolean =>
  KEYBOARD_MODIFIER_FLAGS.some((flag) => event[flag]);

/** Picks the tab that should take focus after a keyboard selection, preferring the requested tab. */
const resolveTabFocusId = (
  tabs: CloudLibraryTab[],
  requestedTabId: CloudLibraryTabId,
  activeTab: CloudLibraryTabId,
): CloudLibraryTabId | undefined => {
  const fallbackTabId = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0]?.id;
  return tabs.some((tab) => tab.id === requestedTabId) ? requestedTabId : fallbackTabId;
};

/** Applies one tab key press: roving selection, or a no-op for shortcuts and dead keys. */
const handleTabKeyDown = (
  event: React.KeyboardEvent,
  options: {
    tabs: CloudLibraryTab[];
    tabId: CloudLibraryTabId;
    onTabChange: (tabId: CloudLibraryTabId) => void;
    onPendingFocus: (tabId: CloudLibraryTabId) => void;
  },
): void => {
  const { tabs, tabId, onTabChange, onPendingFocus } = options;
  if (hasKeyboardModifier(event)) return;
  const nextId = getNextCloudLibraryTabId(tabs, tabId, event.key);
  if (nextId === null || nextId === tabId) return;
  event.preventDefault();
  onPendingFocus(nextId);
  onTabChange(nextId);
};

/** One roving tab button inside the workspace tablist. */
const CloudLibraryTabButton: React.FC<{
  tab: CloudLibraryTab;
  tabs: CloudLibraryTab[];
  isActive: boolean;
  tabRefs: React.RefObject<Map<CloudLibraryTabId, HTMLButtonElement>>;
  onTabChange: (tabId: CloudLibraryTabId) => void;
  onPendingFocus: (tabId: CloudLibraryTabId) => void;
}> = ({ tab, tabs, isActive, tabRefs, onTabChange, onPendingFocus }) => (
  <Button
    ref={(node) => {
      if (node) {
        tabRefs.current.set(tab.id, node);
      } else {
        tabRefs.current.delete(tab.id);
      }
    }}
    id={`cloud-library-tab-${tab.id}`}
    role="tab"
    aria-selected={isActive}
    aria-controls="cloud-library-panel"
    tabIndex={isActive ? 0 : -1}
    variant={isActive ? 'default' : 'outline'}
    className="cloud-library-tab"
    onClick={() => onTabChange(tab.id)}
    onKeyDown={(event) => handleTabKeyDown(event, { tabs, tabId: tab.id, onTabChange, onPendingFocus })}
  >
    <span>{tab.label}</span>
    <Badge variant={isActive ? 'secondary' : 'outline'}>{tab.cycleCount}</Badge>
  </Button>
);

/** Workspace tabs keep saved products separated while retaining an All view for discovery. */
const CloudLibraryTabs: React.FC<{
  tabs: CloudLibraryTab[];
  activeTab: CloudLibraryTabId;
  onTabChange: (tabId: CloudLibraryTabId) => void;
}> = ({ tabs, activeTab, onTabChange }) => {
  const tabRefs = useRef(new Map<CloudLibraryTabId, HTMLButtonElement>());
  const pendingFocus = useRef<CloudLibraryTabId | null>(null);

  /** Moves focus after render so keyboard selection lands on the new tab. */
  useEffect(() => {
    if (pendingFocus.current === null) return;
    const focusTabId = resolveTabFocusId(tabs, pendingFocus.current, activeTab);
    pendingFocus.current = null;
    if (focusTabId) {
      tabRefs.current.get(focusTabId)?.focus();
    }
  }, [activeTab, tabs]);

  if (tabs.length === 0) return null;

  return (
    <div className="cloud-library-tabs" role="tablist" aria-label="Cloud library workspaces">
      {tabs.map((tab) => (
        <CloudLibraryTabButton
          key={tab.id}
          tab={tab}
          tabs={tabs}
          isActive={activeTab === tab.id}
          tabRefs={tabRefs}
          onTabChange={onTabChange}
          onPendingFocus={(tabId) => {
            pendingFocus.current = tabId;
          }}
        />
      ))}
    </div>
  );
};

/** Main library card that owns the saved-cycle list, empty state, and loading state. */
const CloudLibraryMainCard: React.FC<{
  loading: boolean;
  cycles: CloudCycleMetadata[];
  tabs: CloudLibraryTab[];
  activeTab: CloudLibraryTabId;
  premiumActive: boolean;
  workspaceLabel?: string;
  workspacePath: string;
  canWrite: boolean;
  cycleCountLabel: string;
  onLoadCycle: (cycleId: string) => Promise<void>;
  onDeleteCycle: (cycleId: string) => Promise<void>;
  onRenameCycle: (cycleId: string, newLabel: string) => Promise<void>;
  onTabChange: (tabId: CloudLibraryTabId) => void;
}> = ({
  loading,
  cycles,
  tabs,
  activeTab,
  premiumActive,
  workspaceLabel,
  workspacePath,
  canWrite,
  cycleCountLabel,
  onLoadCycle,
  onDeleteCycle,
  onRenameCycle,
  onTabChange,
}) => {
  const [rowStates, setRowStates] = useState<Record<string, CycleRowUiState>>({});

  return (
  <Card className="cloud-library-surface-card">
    <CardHeader className="cloud-library-section-header">
      <CardTitle>Your cloud cycles</CardTitle>
      <CardDescription>Open a saved package, rename it, or clear out older copies.</CardDescription>
      <CloudLibraryTabs tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
    </CardHeader>
    <CardContent className="cloud-library-list-content" id="cloud-library-panel" role="tabpanel" tabIndex={loading ? 0 : undefined} aria-labelledby={`cloud-library-tab-${activeTab}`}>
      {loading && cycles.length === 0 ? (
        <div
          className="cloud-library-loading"
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-labelledby="cloud-library-loading-text"
        >
          <LoaderCircle className="h-6 w-6 animate-spin" aria-hidden="true" />
          <span id="cloud-library-loading-text">Loading cloud cycles</span>
        </div>
      ) : cycles.length === 0 ? (
        <EmptyState
          premiumActive={premiumActive}
          workspaceLabel={workspaceLabel}
          workspacePath={workspacePath}
        />
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
                showWorkspaceBadge={activeTab === 'all'}
                rowState={rowStates[cycle.id] ?? { isRenaming: false, draft: null, confirmingDelete: false }}
                onRowStateChange={(next) => setRowStates((prev) => ({ ...prev, [cycle.id]: next }))}
                onLoad={onLoadCycle}
                onDelete={onDeleteCycle}
                onRename={onRenameCycle}
              />
            ))}
          </div>
        </>
      )}
    </CardContent>
  </Card>
  );
};

/** Signed-in library layout tying together the main list and the utility rail. */
const CloudLibrarySignedInLayout: React.FC<{
  premiumActive: boolean;
  isExpiredPremium: boolean;
  loading: boolean;
  cycles: CloudCycleMetadata[];
  tabs: CloudLibraryTab[];
  activeTab: CloudLibraryTabId;
  workspaceLabel?: string;
  workspacePath: string;
  canWrite: boolean;
  cycleCountLabel: string;
  onLoadCycle: (cycleId: string) => Promise<void>;
  onDeleteCycle: (cycleId: string) => Promise<void>;
  onRenameCycle: (cycleId: string, newLabel: string) => Promise<void>;
  onTabChange: (tabId: CloudLibraryTabId) => void;
}> = ({
  premiumActive,
  isExpiredPremium,
  loading,
  cycles,
  tabs,
  activeTab,
  workspaceLabel,
  workspacePath,
  canWrite,
  cycleCountLabel,
  onLoadCycle,
  onDeleteCycle,
  onRenameCycle,
  onTabChange,
}) => (
  <div className="cloud-library-layout">
    <div className="cloud-library-main">
      <CloudLibraryMainCard
        loading={loading}
        cycles={cycles}
        tabs={tabs}
        activeTab={activeTab}
        premiumActive={premiumActive}
        workspaceLabel={workspaceLabel}
        workspacePath={workspacePath}
        canWrite={canWrite}
        cycleCountLabel={cycleCountLabel}
        onLoadCycle={onLoadCycle}
        onDeleteCycle={onDeleteCycle}
        onRenameCycle={onRenameCycle}
        onTabChange={onTabChange}
      />
    </div>

    <div className="cloud-library-side">
      <CloudLibraryUtilityCard premiumActive={premiumActive} isExpiredPremium={isExpiredPremium} />
    </div>
  </div>
);

/** Creates the cloud library actions used by the page and keeps transient feedback local. */
const useCloudLibraryActions = ({
  cycles,
  loadCycle,
  deleteCycle,
  renameCycle,
  refreshCycles,
  navigate,
  userId,
}: {
  cycles: CloudCycleMetadata[];
  loadCycle: ReturnType<typeof useCloudCycles>['loadCycle'];
  deleteCycle: ReturnType<typeof useCloudCycles>['deleteCycle'];
  renameCycle: ReturnType<typeof useCloudCycles>['renameCycle'];
  refreshCycles: ReturnType<typeof useCloudCycles>['refreshCycles'];
  navigate: ReturnType<typeof useNavigate>;
  userId?: string;
}): CloudLibraryActions => {
  const payloadKey = getScopedStorageKey('cloudCyclePayload', getStorageScope(userId));
  const metaKey = getScopedStorageKey('cloudCycleMeta', getStorageScope(userId));
  const [message, setMessage] = useState<string | null>(null);

  const persistCloudCycleToSession = useCallback(
    (cycleId: string, label: string, payload: unknown): boolean => {
      try {
        sessionStorage.setItem(payloadKey, JSON.stringify(payload));
        sessionStorage.setItem(
          metaKey,
          JSON.stringify({
            id: cycleId,
            label,
          })
        );
        return true;
      } catch {
        setMessage('Unable to hand this cloud cycle off to the editor right now. Please try again.');
        return false;
      }
    },
    [metaKey, payloadKey]
  );

  /** Loads one hosted cycle into the forecast editor and preserves its cloud metadata in session storage. */
  const handleLoadCycle = useCallback(async (cycleId: string) => {
    setMessage(null);
    const selectedCycle = cycles.find((cycle) => cycle.id === cycleId);
    if (!selectedCycle) {
      return;
    }
    const workspaceId = getCloudCycleWorkspaceId(selectedCycle);
    if (workspaceId !== 'severe') {
      const workspaceLabel = getForecastWorkspace(workspaceId)?.label ?? 'This workspace';
      setMessage(
        `${workspaceLabel} saves can't be opened in the editor yet. Cloud loading currently supports Severe saves only. Your save is still stored.`
      );
      return;
    }

    const payload = await loadCycle(cycleId);
    if (!payload) {
      return;
    }

    if (!persistCloudCycleToSession(cycleId, selectedCycle.label, payload)) {
      return;
    }

    navigate(getDefaultForecastWorkspacePath());
  }, [cycles, loadCycle, navigate, persistCloudCycleToSession]);

  /** Deletes one hosted cloud cycle and surfaces a short success message on completion. */
  const handleDeleteCycle = useCallback(async (cycleId: string) => {
    setMessage(null);
    const success = await deleteCycle(cycleId);
    if (success) {
      setMessage('Cloud cycle deleted.');
    }
  }, [deleteCycle]);

  /** Persists a renamed label for one hosted cloud cycle and refreshes the list metadata. */
  const handleRenameCycle = useCallback(async (cycleId: string, newLabel: string) => {
    setMessage(null);
    const success = await renameCycle(cycleId, newLabel);
    if (success) {
      await refreshCycles();
      setMessage('Cloud cycle renamed.');
    }
  }, [refreshCycles, renameCycle]);

  return {
    message,
    setMessage,
    handleLoadCycle,
    handleDeleteCycle,
    handleRenameCycle,
  };
};

/** Production-facing page for loading and managing cloud-hosted cycles. */
const CloudLibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { premiumActive, effectiveSource } = useEntitlement();
  const { cycles, loading, error, loadCycle, deleteCycle, renameCycle, refreshCycles } = useCloudCycles();
  const [activeTab, setActiveTab] = useState<CloudLibraryTabId>('all');
  const buildTarget = getBuildTarget();
  const tabs = useMemo(() => getCloudLibraryTabs(cycles, buildTarget), [cycles, buildTarget]);
  const effectiveActiveTab = resolveActiveCloudLibraryTab(tabs, activeTab);

  /** Resets selection to All when exposure changes remove the selected workspace. */
  useEffect(() => {
    if (effectiveActiveTab !== activeTab) {
      setActiveTab(effectiveActiveTab);
    }
  }, [effectiveActiveTab, activeTab]);

  const visibleCycles = useMemo(
    () => filterCloudCyclesByWorkspace(cycles, effectiveActiveTab),
    [effectiveActiveTab, cycles]
  );
  const {
    message,
    handleLoadCycle,
    handleDeleteCycle,
    handleRenameCycle,
  } = useCloudLibraryActions({
    cycles,
    loadCycle,
    deleteCycle,
    renameCycle,
    refreshCycles,
    navigate,
    userId: user?.uid,
  });

  const canWrite = premiumActive;
  const isExpiredPremium = !premiumActive && effectiveSource === 'stripe';
  const cycleCountLabel = useMemo(
    () => `${visibleCycles.length} cloud cycle${visibleCycles.length === 1 ? '' : 's'}`,
    [visibleCycles.length],
  );
  const workspaceLabel = getCloudLibraryTabLabel(tabs, effectiveActiveTab);
  const workspacePath = getCloudLibraryWorkspacePath(effectiveActiveTab);

  if (!user) {
    return <SignedOutGate />;
  }

  return (
    <div className="cloud-library-page">
      <div className="cloud-library-shell">
        <CloudLibraryHero premiumActive={premiumActive} cycleCount={cycles.length} isExpiredPremium={isExpiredPremium} />

        {isExpiredPremium ? <ExpiredPremiumNotice /> : null}
        <CloudLibraryFeedbackCard error={error} message={message} />

        <CloudLibrarySignedInLayout
          premiumActive={premiumActive}
          isExpiredPremium={isExpiredPremium}
          loading={loading}
          cycles={visibleCycles}
          tabs={tabs}
          activeTab={effectiveActiveTab}
          workspaceLabel={workspaceLabel}
          workspacePath={workspacePath}
          canWrite={canWrite}
          cycleCountLabel={cycleCountLabel}
          onLoadCycle={handleLoadCycle}
          onDeleteCycle={handleDeleteCycle}
          onRenameCycle={handleRenameCycle}
          onTabChange={setActiveTab}
        />
      </div>
    </div>
  );
};

export default CloudLibraryPage;
