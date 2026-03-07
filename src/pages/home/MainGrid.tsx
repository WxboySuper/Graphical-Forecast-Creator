import React from 'react';
import { Card } from '../../components/ui/card';
import { Clock, CheckCircle2, AlertTriangle, Map as MapIcon, FileText, ArrowRight, Zap, Calendar, Save, Upload, History, Cloud } from 'lucide-react';
import { DayType } from '../../types/outlooks';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';

interface Props {
  formattedDate: string;
  isSaved: boolean;
  forecastCycle: any;
  stats: any;
  onQuickStartClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onNavigateForecast: () => void;
  onNavigateDiscussion: () => void;
  onNewCycle: () => void;
  onSave: () => void;
  onOpenFile: () => void;
  onOpenHistory: () => void;
}

export const MainGrid: React.FC<Props> = ({ formattedDate, isSaved, forecastCycle, stats, onQuickStartClick, onNavigateForecast, onNavigateDiscussion, onNewCycle, onSave, onOpenFile, onOpenHistory }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 p-6 bg-card border-border">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-6 w-6 text-primary" />
                Current Forecast Cycle
              </h2>
              <p className="text-sm text-muted-foreground mt-1">{formattedDate}</p>
            </div>
            <div className="flex items-center gap-2">
              {!isSaved && (
                <span className="flex items-center gap-1 text-warning text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  Unsaved
                </span>
              )}
              {isSaved && (
                <span className="flex items-center gap-1 text-success text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Saved
                </span>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3">Days with Outlooks</h3>
            <div className="grid grid-cols-8 gap-2">
              {[1,2,3,4,5,6,7,8].map((day) => {
                const hasData = stats.daysWithData.includes(day as DayType);
                const isCurrent = forecastCycle.currentDay === day;
                return (
                  <button key={day} data-day={day} onClick={onQuickStartClick} className={cn('relative p-4 rounded-lg border-2 transition-all','hover:shadow-md hover:scale-105', hasData ? 'bg-primary/10 border-primary' : 'bg-muted/30 border-border', isCurrent && 'ring-2 ring-primary ring-offset-2')}>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-foreground">{day}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={onNavigateForecast}>
              <MapIcon className="h-5 w-5" />
              <span>Continue Forecast</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Button>

            <Button variant="outline" className="h-auto py-4 flex-col gap-2" onClick={onNavigateDiscussion}>
              <FileText className="h-5 w-5" />
              <span>Write Discussion</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-card border-border space-y-4">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Zap className="h-5 w-5 text-warning" />
          Quick Actions
        </h2>

        <div className="space-y-2">
          <Button variant="default" className="w-full justify-start h-auto py-3" onClick={onNewCycle}>
            <Calendar className="h-4 w-4 mr-2" />
            New Forecast Cycle
          </Button>

          <Button variant="outline" className="w-full justify-start h-auto py-3" onClick={onSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Current Cycle
          </Button>

          <Button variant="outline" className="w-full justify-start h-auto py-3" onClick={onOpenFile}>
            <Upload className="h-4 w-4 mr-2" />
            Load Cycle from File
          </Button>

          <Button variant="outline" className="w-full justify-start h-auto py-3" onClick={onOpenHistory}>
            <History className="h-4 w-4 mr-2" />
            View Cycle History
          </Button>
        </div>

        <div className="pt-4 border-t border-border">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Navigate</h3>
          <div className="space-y-2">
            <Button variant="ghost" className="w-full justify-start" onClick={onNavigateForecast}>
              <Cloud className="h-4 w-4 mr-2 text-foreground" />
              Forecast Map
            </Button>
            <Button variant="ghost" className="w-full justify-start" onClick={onNavigateDiscussion}>
              <FileText className="h-4 w-4 mr-2 text-btn-discussion" />
              Discussion Editor
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default MainGrid;
