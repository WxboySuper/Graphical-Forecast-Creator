import React from 'react';
import { Card } from '../../components/ui/card';
import { History } from 'lucide-react';
import { Button } from '../../components/ui/button';

export const RecentCycles: React.FC<{ savedCycles: any[]; onLoad: (e: React.MouseEvent<HTMLButtonElement>) => void; onOpenHistory: () => void; }> = ({ savedCycles, onLoad, onOpenHistory }) => {
  if (!savedCycles || savedCycles.length === 0) return null;
  return (
    <Card className="p-6 bg-card border-border">
      <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
        <History className="h-5 w-5 text-btn-cycle" />
        Recent Saved Cycles
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {savedCycles.slice(0,6).map((cycle) => (
          <button key={cycle.id} className="p-4 bg-muted/30 rounded-lg border border-border hover:border-primary hover:shadow-md transition-all text-left" data-cycle-id={cycle.id} onClick={onLoad}>
            <div className="flex items-start justify-between mb-2">
              <p className="font-medium text-foreground">{cycle.cycleDate}</p>
              {cycle.label && (<span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">{cycle.label}</span>)}
            </div>
            <p className="text-xs text-muted-foreground">{new Date(cycle.timestamp).toLocaleString()}</p>
          </button>
        ))}
      </div>
      {savedCycles.length > 6 && (
        <Button variant="outline" className="w-full mt-4" onClick={onOpenHistory}>View All {savedCycles.length} Cycles</Button>
      )}
    </Card>
  );
};

export default RecentCycles;
