import React from 'react';
import { Card } from '../../components/ui/card';
import { Calendar, Layers, TrendingUp } from 'lucide-react';
import { DayType } from '../../types/outlooks';

interface Stats {
  daysWithData: DayType[];
  totalOutlooks: number;
  totalFeatures: number;
  savedCyclesCount: number;
}

export const Dashboard: React.FC<{ stats: Stats }> = ({ stats }) => {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: <Calendar className="h-6 w-6 text-primary" />, title: 'Days with Data', value: stats.daysWithData.length,
          },
          { icon: <Layers className="h-6 w-6 text-success" />, title: 'Outlook Maps', value: stats.totalOutlooks },
          { icon: <TrendingUp className="h-6 w-6 text-warning" />, title: 'Total Features', value: stats.totalFeatures },
          { icon: <Calendar className="h-6 w-6" />, title: 'Saved Cycles', value: stats.savedCyclesCount },
        ].map(({ icon, title, value }) => (
          <Card key={title} className="p-6 bg-card border-border hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">{icon}</div>
              <div>
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-sm text-muted-foreground">{title}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {/* Features cards simplified */}
        {[ 'Polygon Drawing', 'Discussion Editor', 'Forecast Verification', 'Cycle Manager' ].map((title) => (
          <Card key={title} className="p-6 bg-card border-border hover:shadow-lg transition-shadow space-y-3">
            <h3 className="font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">Brief description here.</p>
          </Card>
        ))}
      </div>
    </>
  );
};

export default Dashboard;
