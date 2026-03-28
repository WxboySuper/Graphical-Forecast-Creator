import React from 'react';
import { History } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import type { SavedCycle } from '../../store/forecastSlice';

interface Props {
  savedCycles: SavedCycle[];
  onLoad: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onOpenHistory: () => void;
  variant?: 'compact' | 'section';
}

/** Formats saved-cycle timestamps consistently for the home page. */
const formatSavedCycleTime = (timestamp: string): string => new Date(timestamp).toLocaleString();

/** Card row used in the compact recent-cycles sidebar. */
const CompactCycleRow: React.FC<{
  cycle: SavedCycle;
  onLoad: (e: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ cycle, onLoad }) => (
  <button
    data-cycle-id={cycle.id}
    onClick={onLoad}
    className="w-full rounded-2xl border border-border/80 bg-muted/20 px-4 py-4 text-left transition-all hover:border-primary hover:shadow-sm"
  >
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <p className="font-medium text-foreground">{cycle.cycleDate}</p>
        <p className="text-xs text-muted-foreground">{formatSavedCycleTime(cycle.timestamp)}</p>
      </div>
      <span className="text-xs font-medium text-primary">Resume</span>
    </div>
    {cycle.label ? <p className="mt-3 text-sm text-muted-foreground">{cycle.label}</p> : null}
  </button>
);

/** Card tile used by the wider recent-cycles section for signed-out or shared local history. */
const SectionCycleTile: React.FC<{
  cycle: SavedCycle;
  onLoad: (e: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ cycle, onLoad }) => (
  <button
    data-cycle-id={cycle.id}
    onClick={onLoad}
    className="rounded-2xl border border-border/80 bg-muted/20 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-sm"
  >
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1">
        <p className="font-medium text-foreground">{cycle.cycleDate}</p>
        <p className="text-xs text-muted-foreground">{formatSavedCycleTime(cycle.timestamp)}</p>
      </div>
      {cycle.label ? (
        <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
          {cycle.label}
        </span>
      ) : null}
    </div>
  </button>
);

/** Empty-state card for signed-in users who have not saved any cycles yet. */
const EmptyRecentCyclesCard: React.FC = () => (
  <Card className="border-border/80 bg-card/95 shadow-sm">
    <CardHeader className="space-y-2">
      <CardTitle className="text-xl">Recent Cycles</CardTitle>
      <CardDescription>Saved local packages will show up here once you start building a forecast cycle.</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Start on the current cycle card, then save locally whenever you want a package ready to reopen later.
      </p>
    </CardContent>
  </Card>
);

/** Recent cycle list, shown as either a prominent section or a compact resume sidebar. */
export const RecentCycles: React.FC<Props> = ({
  savedCycles,
  onLoad,
  onOpenHistory,
  variant = 'section',
}) => {
  if ((!savedCycles || savedCycles.length === 0) && variant === 'section') {
    return null;
  }

  if ((!savedCycles || savedCycles.length === 0) && variant === 'compact') {
    return <EmptyRecentCyclesCard />;
  }

  if (variant === 'compact') {
    return (
      <Card className="border-border/80 bg-card/95 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl">Recent Cycles</CardTitle>
          <CardDescription>Jump back into a saved package without leaving the landing page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {savedCycles.slice(0, 4).map((cycle) => (
            <CompactCycleRow key={cycle.id} cycle={cycle} onLoad={onLoad} />
          ))}

          <Button variant="outline" className="w-full" onClick={onOpenHistory}>
            View Full History
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/80 bg-card/95 shadow-sm">
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2 text-2xl">
          <History className="h-5 w-5 text-primary" />
          Recent Local Cycles
        </CardTitle>
        <CardDescription>
          Saved packages stay easy to reopen, which makes it simpler to compare setups or continue older work.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {savedCycles.slice(0, 6).map((cycle) => (
            <SectionCycleTile key={cycle.id} cycle={cycle} onLoad={onLoad} />
          ))}
        </div>

        {savedCycles.length > 6 ? (
          <Button variant="outline" className="w-full" onClick={onOpenHistory}>
            View All {savedCycles.length} Cycles
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default RecentCycles;
