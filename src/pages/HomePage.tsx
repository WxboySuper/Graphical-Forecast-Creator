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
  PenTool,
  RefreshCw,
  BarChart2,
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
      <div className="max-w-7xl mx-auto p-8 space-y-10">

        {/* ── Hero ── */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20 p-10 md:p-14">
          {/* Background accent blobs */}
          <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-primary/8 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-primary/5 blur-2xl pointer-events-none" />

          <div className="relative flex flex-col md:flex-row items-start md:items-center gap-8">
            <div className="space-y-5 flex-1">
              {/* Brand pill */}
              <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/25 rounded-full px-4 py-1.5 text-sm font-medium text-primary">
                <Cloud className="h-4 w-4" />
                Graphical Forecast Creator
              </div>

              <div className="space-y-3">
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
                  Draw professional<br />
                  <span className="text-primary">severe weather outlooks.</span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
                  Create SPC-style probabilistic outlooks for Days 1–8, write forecast discussions, 
                  and verify your predictions — right in your browser, no sign-in required.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button size="lg" onClick={() => navigate('/forecast')}>
                  Start Drawing
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button size="lg" variant="outline" onClick={() => navigate('/discussion')}>
                  <FileText className="h-4 w-4 mr-2" />
                  Write a Discussion
                </Button>
              </div>
            </div>

            {/* Risk level badges — visual accent */}
            <div className="hidden lg:flex flex-col gap-2 shrink-0 select-none">
              {[
                { label: 'HIGH', bg: 'bg-[#fe7ffe]/30', border: 'border-[#fe7ffe]/60', text: 'text-foreground' },
                { label: 'MDT',  bg: 'bg-[#e67f7e]/30', border: 'border-[#e67f7e]/60', text: 'text-foreground' },
                { label: 'ENH',  bg: 'bg-[#e5c27f]/30', border: 'border-[#e5c27f]/60', text: 'text-foreground' },
                { label: 'SLGT', bg: 'bg-[#f3f67d]/30', border: 'border-[#f3f67d]/60', text: 'text-foreground' },
                { label: 'MRGL', bg: 'bg-[#7dc580]/30', border: 'border-[#7dc580]/60', text: 'text-foreground' },
                { label: 'TSTM', bg: 'bg-[#bfe7bc]/30', border: 'border-[#bfe7bc]/60', text: 'text-foreground' },
              ].map(({ label, bg, border, text }) => (
                <div
                  key={label}
                  className={cn(
                    'w-24 text-center px-4 py-2 rounded-lg border font-bold text-sm tracking-wide',
                    bg, border, text
                  )}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Features ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: <PenTool className="h-6 w-6 text-primary" />,
              bg: 'bg-primary/10',
              title: 'Polygon Drawing',
              body: 'Draw tornado, wind, hail, and categorical outlook polygons on an interactive map — with snapping, cut-outs, and automatic categorical derivation.',
            },
            {
              icon: <FileText className="h-6 w-6 text-btn-discussion" />,
              bg: 'bg-purple-500/10',
              title: 'Discussion Editor',
              body: 'Write forecast discussions in DIY free-form mode or step through guided questions. Export to plain text in GFC\'s clean, readable format.',
            },
            {
              icon: <BarChart2 className="h-6 w-6 text-success" />,
              bg: 'bg-success/10',
              title: 'Forecast Verification',
              body: 'Load storm reports and see how many fell inside each risk level. Reports are scored to the highest applicable zone to avoid double-counting.',
            },
            {
              icon: <RefreshCw className="h-6 w-6" style={{ color: 'var(--btn-cycle)' }} />,
              bg: 'bg-btn-cycle/10',
              title: 'Cycle Manager',
              body: 'Save named snapshots of any cycle and copy regions between days. Use yesterday\'s Day 2 as the starting point for today\'s Day 1 in seconds.',
            },
          ].map(({ icon, bg, title, body }) => (
            <Card key={title} className="p-6 bg-card border-border hover:shadow-lg transition-shadow space-y-3">
              <div className={cn('p-3 rounded-xl w-fit', bg)}>
                {icon}
              </div>
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </Card>
          ))}
        </div>

        {/* ── Outlook types quick-reference ── */}
        <Card className="p-6 bg-card border-border">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Supported Outlook Types
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { icon: <Wind className="h-4 w-4 text-red-500" />,    label: 'Tornado',     sub: '2–60% + CIG' },
              { icon: <Wind className="h-4 w-4 text-blue-500" />,   label: 'Wind',        sub: '5–90% + CIG' },
              { icon: <CloudRain className="h-4 w-4 text-green-500" />, label: 'Hail',    sub: '5–60% + CIG' },
              { icon: <Layers className="h-4 w-4 text-purple-500" />, label: 'Categorical', sub: 'TSTM→HIGH' },
              { icon: <Cloud className="h-4 w-4 text-orange-500" />, label: 'Total Severe', sub: 'Day 3 only' },
              { icon: <TrendingUp className="h-4 w-4 text-muted-foreground" />, label: 'Day 4–8',  sub: '15% / 30%' },
            ].map(({ icon, label, sub }) => (
              <div key={label} className="p-3 bg-muted/30 rounded-lg space-y-1">
                <div className="flex items-center gap-2">
                  {icon}
                  <p className="font-medium text-sm text-foreground">{label}</p>
                </div>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Dashboard divider ── */}
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Your Dashboard</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Stats */}
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
