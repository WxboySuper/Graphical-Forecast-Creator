import React from 'react';
import { Card, CardContent } from '../../components/ui/card';
import type { DayType } from '../../types/outlooks';

interface Stats {
  daysWithData: DayType[];
  totalOutlooks: number;
  totalFeatures: number;
  savedCyclesCount: number;
  totalForecastsMade: number;
  totalCyclesMade: number;
  forecastStreak: number;
}

interface Props {
  stats: Stats;
}

/** One numbered getting-started step inside the signed-out sidebar. */
const GettingStartedStep: React.FC<{
  step: string;
  title: string;
  copy: string;
}> = ({ step, title, copy }) => (
  <div className="home-step-card">
    <div className="home-step-number">
      {step}
    </div>
    <div className="home-step-copy">
      <h3>{title}</h3>
      <p>{copy}</p>
    </div>
  </div>
);

/** Dedicated getting-started guidance for first-time or signed-out users. */
const GettingStartedPanel: React.FC = () => (
  <section className="home-guidance-section">
    <div className="home-guidance-header">
      <h2>Getting Started</h2>
      <p>
        GFC works best when you treat it like a package workspace: start a cycle, build the map, then write the
        discussion while the setup is still fresh.
      </p>
    </div>
    <div className="home-step-list">
      {[
        {
          step: '1',
          title: 'Start or load a cycle',
          copy: 'Begin with a fresh package or reopen one you already saved locally.',
        },
        {
          step: '2',
          title: 'Open the forecast map',
          copy: 'Use the day buttons to jump straight into the map and start sketching outlook areas.',
        },
        {
          step: '3',
          title: 'Write the discussion',
          copy: 'Once the graphics are set, head into the discussion editor to build the text side of the package.',
        },
      ].map(({ step, title, copy }) => (
        <GettingStartedStep key={step} step={step} title={title} copy={copy} />
      ))}
    </div>
  </section>
);

/** Small row inside the signed-out "At a Glance" block. */
const AtAGlanceRow: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex items-center justify-between rounded-xl border border-border/80 bg-background/80 px-4 py-3">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="font-semibold text-foreground">{value}</span>
  </div>
);

/** Lower stats panel for signed-out users. */
const AtAGlancePanel: React.FC<{ stats: Stats }> = ({ stats }) => (
  <div className="home-info-panel">
    <div className="home-guidance-header">
      <h3>At a Glance</h3>
      <p>What is already in this local workspace right now.</p>
    </div>
    <div className="home-glance-list">
      <AtAGlanceRow label="Days with outlooks" value={stats.daysWithData.length} />
      <AtAGlanceRow label="Mapped outlooks" value={stats.totalOutlooks} />
      <AtAGlanceRow label="Saved cycles" value={stats.savedCyclesCount} />
    </div>
  </div>
);

/** Short reassurance block for the signed-out sidebar footer. */
const LocalFirstPanel: React.FC = () => (
  <div className="home-info-panel home-info-panel-footer">
    <h3>Still Local-First</h3>
    <p>
      You can start forecasting, save cycle files, and export work immediately. Accounts are optional and only add
      convenience, not gatekeeping.
    </p>
  </div>
);

/** Shared body layout for the signed-out sidebar card. */
const SignedOutSidebarContent: React.FC<{ stats: Stats }> = ({ stats }) => (
  <CardContent className="home-sidebar-content">
    <GettingStartedPanel />
    <AtAGlancePanel stats={stats} />
    <LocalFirstPanel />
  </CardContent>
);

/** Secondary signed-out sidebar that keeps guidance and a few grounded stats close by. */
const SignedOutSidebar: React.FC<{ stats: Stats }> = ({ stats }) => (
  <Card className="home-surface-card h-full">
    <SignedOutSidebarContent stats={stats} />
  </Card>
);

/** Secondary signed-out sidebar that keeps guidance and local context close to onboarding actions. */
export const Dashboard: React.FC<Props> = ({ stats }) => <SignedOutSidebar stats={stats} />;

export default Dashboard;
