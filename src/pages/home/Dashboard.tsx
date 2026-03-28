import React from 'react';
import { CalendarDays, Layers3, Route } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import type { DayType } from '../../types/outlooks';
import type { HomeVariant } from './HomeHero';

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
  variant: HomeVariant;
}

/** Shared compact stat card for the redesigned landing page. */
const SnapshotCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  value: string;
}> = ({ icon, title, value }) => (
  <Card className="border-border/80 bg-card/95 shadow-sm">
    <CardContent className="flex items-center gap-4 p-5">
      <div className="rounded-2xl bg-primary/10 p-3 text-primary">{icon}</div>
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
        <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      </div>
    </CardContent>
  </Card>
);

/** One numbered getting-started step inside the signed-out sidebar. */
const GettingStartedStep: React.FC<{
  step: string;
  title: string;
  copy: string;
}> = ({ step, title, copy }) => (
  <div className="flex gap-4 rounded-2xl border border-border/80 bg-muted/20 p-4">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
      {step}
    </div>
    <div className="space-y-1">
      <h3 className="font-medium text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{copy}</p>
    </div>
  </div>
);

/** Dedicated getting-started guidance for first-time or signed-out users. */
const GettingStartedPanel: React.FC = () => (
  <section className="space-y-4">
    <div className="space-y-2">
      <h2 className="text-xl font-semibold text-foreground">Getting Started</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">
        GFC works best when you treat it like a package workspace: start a cycle, build the map, then write the
        discussion while the setup is still fresh.
      </p>
    </div>
    <div className="space-y-4">
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

/** Compact workflow snapshot for signed-in users returning to active work. */
const SignedInSnapshotStrip: React.FC<{ stats: Stats }> = ({ stats }) => (
  <div className="grid gap-4 md:grid-cols-3">
    <SnapshotCard
      icon={<CalendarDays className="h-5 w-5" />}
      title="Streak"
      value={`${stats.forecastStreak}`}
    />
    <SnapshotCard
      icon={<Layers3 className="h-5 w-5" />}
      title="Total Forecasts Made"
      value={`${stats.totalForecastsMade}`}
    />
    <SnapshotCard
      icon={<Route className="h-5 w-5" />}
      title="Total Cycles Made"
      value={`${stats.totalCyclesMade}`}
    />
  </div>
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
  <div className="rounded-2xl border border-border/80 bg-muted/10 p-5">
    <div className="space-y-2">
      <h3 className="text-lg font-semibold text-foreground">At a Glance</h3>
      <p className="text-sm text-muted-foreground">What is already in this local workspace right now.</p>
    </div>
    <div className="mt-4 space-y-3">
      <AtAGlanceRow label="Days with outlooks" value={stats.daysWithData.length} />
      <AtAGlanceRow label="Mapped outlooks" value={stats.totalOutlooks} />
      <AtAGlanceRow label="Saved cycles" value={stats.savedCyclesCount} />
    </div>
  </div>
);

/** Short reassurance block for the signed-out sidebar footer. */
const LocalFirstPanel: React.FC = () => (
  <div className="mt-auto rounded-2xl border border-border/80 bg-muted/10 p-5">
    <h3 className="text-lg font-semibold text-foreground">Still Local-First</h3>
    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
      You can start forecasting, save cycle files, and export work immediately. Accounts are optional and only add
      convenience, not gatekeeping.
    </p>
  </div>
);

/** Shared body layout for the signed-out sidebar card. */
const SignedOutSidebarContent: React.FC<{ stats: Stats }> = ({ stats }) => (
  <CardContent className="flex h-full flex-col gap-5 p-6">
    <GettingStartedPanel />
    <AtAGlancePanel stats={stats} />
    <LocalFirstPanel />
  </CardContent>
);

/** Secondary signed-out sidebar that keeps guidance and a few grounded stats close by. */
const SignedOutSidebar: React.FC<{ stats: Stats }> = ({ stats }) => (
  <Card className="h-full border-border/80 bg-card/95 shadow-sm">
    <SignedOutSidebarContent stats={stats} />
  </Card>
);

/** Secondary home-page content that changes based on whether the user is returning to work or onboarding. */
export const Dashboard: React.FC<Props> = ({ stats, variant }) => {
  if (variant === 'signed_in') {
    return <SignedInSnapshotStrip stats={stats} />;
  }

  return <SignedOutSidebar stats={stats} />;
};

export default Dashboard;
