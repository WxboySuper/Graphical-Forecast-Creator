import React, { useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { 
  Calendar,
  Map as MapIcon,
  FileText,
  CheckCircle2,
  TrendingUp,
  Clock,
  Layers,
  Save,
  Upload,
  History,
  ArrowRight,
  Zap,
  Cloud,
  Wind,
  CloudRain,
  AlertTriangle,
} from 'lucide-react';
import { RootState } from '../store';
import { 
  selectForecastCycle, 
  setForecastDay,
  resetForecasts,
  importForecastCycle,
  markAsSaved,
} from '../store/forecastSlice';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { cn } from '../lib/utils';
import { DayType } from '../types/outlooks';
import CycleHistoryModal from '../components/CycleManager/CycleHistoryModal';
import ConfirmationModal from '../components/DrawingTools/ConfirmationModal';
import { exportForecastToJson, deserializeForecast, validateForecastData } from '../utils/fileUtils';
import type { AddToastFn } from '../components/Layout';
import { useOutletContext } from 'react-router-dom';

interface PageContext {
  addToast: AddToastFn;
}

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { addToast } = useOutletContext<PageContext>();
  const forecastCycle = useSelector(selectForecastCycle);
  const savedCycles = useSelector((state: RootState) => state.forecast.savedCycles);
  const isSaved = useSelector((state: RootState) => state.forecast.isSaved);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [confirmNewCycle, setConfirmNewCycle] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Calculate stats
  const stats = useMemo(() => {
    const daysWithData: DayType[] = [];
    let totalOutlooks = 0;
    let totalFeatures = 0;

    Object.entries(forecastCycle.days).forEach(([dayStr, dayData]) => {
      const day = parseInt(dayStr) as DayType;
      let dayHasData = false;

      // Check for low probability outlooks in metadata
      if (dayData.metadata.lowProbabilityOutlooks && dayData.metadata.lowProbabilityOutlooks.length > 0) {
        dayHasData = true;
      }

      Object.values(dayData.data).forEach((outlookMap) => {
        if (outlookMap instanceof Map && outlookMap.size > 0) {
          dayHasData = true;
          totalOutlooks++;
          outlookMap.forEach((features: GeoJSON.Feature[]) => {
            totalFeatures += features.length;
          });
        }
      });

      if (dayHasData) {
        daysWithData.push(day);
      }
    });

    return {
      daysWithData,
      totalOutlooks,
      totalFeatures,
      savedCyclesCount: savedCycles.length,
    };
  }, [forecastCycle.days, savedCycles.length]);

  const handleNewCycle = () => {
    if (!isSaved) {
      setConfirmNewCycle(true);
      return;
    }
    dispatch(resetForecasts());
    addToast('Started new forecast cycle', 'success');
  };

  const handleQuickStart = (day: DayType) => {
    dispatch(setForecastDay(day));
    navigate('/forecast');
  };

  const handleSave = () => {
    try {
      exportForecastToJson(forecastCycle, {
        center: [39.8283, -98.5795],
        zoom: 4,
      });
      dispatch(markAsSaved());
      addToast('Forecast exported to JSON!', 'success');
    } catch {
      addToast('Error exporting forecast.', 'error');
    }
  };

  const handleLoad = async (file: File) => {
    try {
      const text = await file.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        addToast('File is not valid JSON.', 'error');
        return;
      }
      
      if (!validateForecastData(data)) {
        addToast('Invalid forecast data format.', 'error');
        return;
      }

      const deserializedCycle = deserializeForecast(data);
      dispatch(importForecastCycle(deserializedCycle));
      addToast('Forecast loaded successfully!', 'success');
    } catch {
      addToast('Error reading file.', 'error');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleLoad(file);
    }
    e.target.value = '';
  };

  const formattedDate = useMemo(() => {
    // Parse as local date to avoid timezone conversion issues
    const [year, month, day] = forecastCycle.cycleDate.split('-').map(Number);
    const localDate = new Date(year, month - 1, day); // month is 0-indexed
    return localDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [forecastCycle.cycleDate]);

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-background via-background to-muted/20">
      <div className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Cloud className="h-10 w-10 text-primary" />
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground">
                Graphical Forecast Creator
              </h1>
              <p className="text-muted-foreground">
                Professional severe weather outlook graphics
              </p>
            </div>
          </div>
        </div>

        {/* Welcome section for first-time users */}
        {stats.daysWithData.length === 0 && stats.savedCyclesCount === 0 && (
          <Card className="p-8 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/30">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              <div className="p-4 bg-primary/10 rounded-2xl shrink-0">
                <Cloud className="h-12 w-12 text-primary" />
              </div>
              <div className="space-y-3 flex-1">
                <h2 className="text-2xl font-bold text-foreground">Welcome to Graphical Forecast Creator</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Draw SPC-style severe weather outlooks for Days 1–8, write forecast discussions, and verify your forecasts against storm reports. 
                  Your work auto-saves every 5 seconds and persists between sessions.
                </p>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <span className="bg-background/50 rounded-full px-3 py-1 border border-border">🌪 Tornado</span>
                  <span className="bg-background/50 rounded-full px-3 py-1 border border-border">💨 Wind</span>
                  <span className="bg-background/50 rounded-full px-3 py-1 border border-border">🌨 Hail</span>
                  <span className="bg-background/50 rounded-full px-3 py-1 border border-border">📊 Categorical</span>
                  <span className="bg-background/50 rounded-full px-3 py-1 border border-border">✍️ Discussion Editor</span>
                  <span className="bg-background/50 rounded-full px-3 py-1 border border-border">✅ Verification</span>
                </div>
              </div>
              <Button
                size="lg"
                className="shrink-0"
                onClick={() => navigate('/forecast')}
              >
                Start Drawing
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </Card>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6 bg-card border-border hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.daysWithData.length}</p>
                <p className="text-sm text-muted-foreground">Days with Data</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-card border-border hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-success/10 rounded-lg">
                <Layers className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.totalOutlooks}</p>
                <p className="text-sm text-muted-foreground">Outlook Maps</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-card border-border hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-warning/10 rounded-lg">
                <TrendingUp className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.totalFeatures}</p>
                <p className="text-sm text-muted-foreground">Total Features</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-card border-border hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-btn-cycle/10 rounded-lg">
                <History className="h-6 w-6" style={{ color: 'var(--btn-cycle)' }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.savedCyclesCount}</p>
                <p className="text-sm text-muted-foreground">Saved Cycles</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Current Cycle */}
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

              {/* Days Overview */}
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Days with Outlooks</h3>
                <div className="grid grid-cols-8 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((day) => {
                    const hasData = stats.daysWithData.includes(day as DayType);
                    const isCurrent = forecastCycle.currentDay === day;
                    
                    return (
                      <button
                        key={day}
                        onClick={() => handleQuickStart(day as DayType)}
                        className={cn(
                          'relative p-4 rounded-lg border-2 transition-all',
                          'hover:shadow-md hover:scale-105',
                          hasData
                            ? 'bg-primary/10 border-primary'
                            : 'bg-muted/30 border-border',
                          isCurrent && 'ring-2 ring-primary ring-offset-2'
                        )}
                      >
                        <div className="text-center">
                          <p className="text-2xl font-bold text-foreground">{day}</p>
                          {hasData && (
                            <CheckCircle2 className="h-4 w-4 text-success mx-auto mt-1" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2"
                  onClick={() => navigate('/forecast')}
                >
                  <MapIcon className="h-5 w-5" />
                  <span>Continue Forecast</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2"
                  onClick={() => navigate('/discussion')}
                >
                  <FileText className="h-5 w-5" />
                  <span>Write Discussion</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          </Card>

          {/* Quick Actions Panel */}
          <Card className="p-6 bg-card border-border space-y-4">
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Zap className="h-5 w-5 text-warning" />
              Quick Actions
            </h2>

            <div className="space-y-2">
              <Button
                variant="default"
                className="w-full justify-start h-auto py-3"
                onClick={handleNewCycle}
              >
                <Calendar className="h-4 w-4 mr-2" />
                New Forecast Cycle
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={handleSave}
                disabled={isSaved}
              >
                <Save className="h-4 w-4 mr-2" />
                Save Current Cycle
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Load Cycle from File
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-auto py-3"
                onClick={() => setShowHistoryModal(true)}
              >
                <History className="h-4 w-4 mr-2" />
                View Cycle History
              </Button>
            </div>

            <div className="pt-4 border-t border-border">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Navigate</h3>
              <div className="space-y-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => navigate('/forecast')}
                >
                  <Cloud className="h-4 w-4 mr-2 text-foreground" />
                  Forecast Map
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => navigate('/discussion')}
                >
                  <FileText className="h-4 w-4 mr-2 text-btn-discussion" />
                  Discussion Editor
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => navigate('/verification')}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2 text-success" />
                  Verification
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Hazard Types Overview */}
        <Card className="p-6 bg-card border-border">
          <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Outlook Types
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Wind className="h-5 w-5 text-red-500" />
                <p className="font-medium text-foreground">Tornado</p>
              </div>
              <p className="text-xs text-muted-foreground">2%, 5%, 10%, 15%, 30%, 45%, 60%</p>
            </div>
            
            <div className="p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Wind className="h-5 w-5 text-blue-500" />
                <p className="font-medium text-foreground">Wind</p>
              </div>
              <p className="text-xs text-muted-foreground">5%, 15%, 30%, 45%, 60%</p>
            </div>
            
            <div className="p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CloudRain className="h-5 w-5 text-green-500" />
                <p className="font-medium text-foreground">Hail</p>
              </div>
              <p className="text-xs text-muted-foreground">5%, 15%, 30%, 45%, 60%</p>
            </div>
            
            <div className="p-4 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="h-5 w-5 text-purple-500" />
                <p className="font-medium text-foreground">Categorical</p>
              </div>
              <p className="text-xs text-muted-foreground">TSTM, MRGL, SLGT, ENH, MDT, HIGH</p>
            </div>
          </div>
        </Card>

        {/* Recent Cycles (if any) */}
        {savedCycles.length > 0 && (
          <Card className="p-6 bg-card border-border">
            <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
              <History className="h-5 w-5 text-btn-cycle" />
              Recent Saved Cycles
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedCycles.slice(0, 6).map((cycle) => (
                <button
                  key={cycle.id}
                  className="p-4 bg-muted/30 rounded-lg border border-border hover:border-primary hover:shadow-md transition-all text-left"
                  onClick={() => {
                    dispatch(importForecastCycle(cycle.forecastCycle));
                    addToast('Cycle loaded from history', 'success');
                  }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-medium text-foreground">{cycle.cycleDate}</p>
                    {cycle.label && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                        {cycle.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(cycle.timestamp).toLocaleString()}
                  </p>
                </button>
              ))}
            </div>
            {savedCycles.length > 6 && (
              <Button
                variant="outline"
                className="w-full mt-4"
                onClick={() => setShowHistoryModal(true)}
              >
                View All {savedCycles.length} Cycles
              </Button>
            )}
          </Card>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Modals */}
      <CycleHistoryModal 
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
      />
      <ConfirmationModal
        isOpen={confirmNewCycle}
        title="Start New Cycle"
        message="You have unsaved changes. Start a new cycle anyway?"
        onConfirm={() => {
          dispatch(resetForecasts());
          addToast('Started new forecast cycle', 'success');
          setConfirmNewCycle(false);
        }}
        onCancel={() => setConfirmNewCycle(false)}
        confirmLabel="Start New Cycle"
      />
    </div>
  );
};

export default HomePage;
