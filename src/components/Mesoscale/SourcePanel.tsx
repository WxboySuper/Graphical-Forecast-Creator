/**
 * Source panel: the model switcher, the forecast-hour scrubber, and a plain-language
 * readout of exactly which model data is showing (cycle, valid time, age, state).
 * f00 is always labeled as an analysis (model initialization), never as observed.
 */
import React from 'react';
import type { MesoscaleCatalog, MesoscaleModelId } from '../../mesoscale';

const MODELS: ReadonlyArray<{ id: MesoscaleModelId; label: string; note?: string }> = [
  { id: 'hrrr', label: 'HRRR' },
  { id: 'rap', label: 'RAP' },
  { id: 'rrfs', label: 'RRFS', note: 'Early access' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (value: number) => String(value).padStart(2, '0');

/** Formats a time as UTC, the way forecasters read model runs: "18Z Nov 8". */
export const formatUtc = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'unknown time';
  return `${pad(date.getUTCHours())}Z ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
};

/** Describes an age in minutes as "45 min" or "1 h 12 min". */
export const formatAge = (minutes: number | null): string => {
  if (minutes === null) return 'age unknown';
  if (minutes < 60) return `${minutes} min old`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h old` : `${hours} h ${rest} min old`;
};

const hourLabel = (hour: number): string => (hour === 0 ? 'f00' : `+${hour} h`);

const ModelSwitcher: React.FC<{ modelId: MesoscaleModelId; onSelect: (modelId: MesoscaleModelId) => void }> = ({ modelId, onSelect }) => (
  <div className="mesoscale-segments" role="group" aria-label="Model">
    {MODELS.map(({ id, label, note }) => (
      <button key={id} type="button" className="mesoscale-segment" aria-pressed={modelId === id} onClick={() => onSelect(id)}>
        {label}
        {note ? <span className="mesoscale-segment__note">{note}</span> : null}
      </button>
    ))}
  </div>
);

const FrameScrubber: React.FC<{ frames: MesoscaleCatalog['frames']; hour: number; onSelect: (hour: number) => void }> = ({ frames, hour, onSelect }) => {
  if (frames.length < 2) return null;
  return (
    <div className="mesoscale-frames" role="group" aria-label="Forecast hour">
      {frames.map((frame) => (
        <button
          key={frame.forecastHour}
          type="button"
          className={`mesoscale-frame${frame.frameType === 'analysis' ? ' is-analysis' : ''}`}
          aria-pressed={frame.forecastHour === hour}
          title={`${frame.frameType === 'analysis' ? 'Analysis' : 'Forecast'} valid ${formatUtc(frame.validTime)}`}
          onClick={() => onSelect(frame.forecastHour)}
        >
          {hourLabel(frame.forecastHour)}
        </button>
      ))}
    </div>
  );
};

export interface SourceReadoutProps {
  catalog: MesoscaleCatalog;
  frame: MesoscaleCatalog['frames'][number];
  ageMinutes: number | null;
  stale: boolean;
}

const SourceReadout: React.FC<SourceReadoutProps> = ({ catalog, frame, ageMinutes, stale }) => (
  <dl className="mesoscale-readout">
    <div><dt>Cycle</dt><dd>{formatUtc(catalog.cycleTime)}</dd></div>
    <div><dt>Valid</dt><dd>{formatUtc(frame.validTime)}</dd></div>
    <div>
      <dt>Frame</dt>
      <dd>{frame.frameType === 'analysis' ? 'Analysis (model initialization)' : `Forecast +${frame.forecastHour} h`}</dd>
    </div>
    <div>
      <dt>Updated</dt>
      <dd className={stale ? 'is-stale' : undefined}>{formatAge(ageMinutes)}{stale ? ' · stale' : ''}</dd>
    </div>
  </dl>
);

export interface SourcePanelProps extends SourceReadoutProps {
  modelId: MesoscaleModelId;
  hour: number;
  onSelectModel: (modelId: MesoscaleModelId) => void;
  onSelectHour: (hour: number) => void;
}

export const SourcePanel: React.FC<SourcePanelProps> = ({ modelId, hour, onSelectModel, onSelectHour, ...readout }) => (
  <section className="mesoscale-section" aria-labelledby="mesoscale-source-heading">
    <h2 id="mesoscale-source-heading" className="mesoscale-section__title">Model data</h2>
    <ModelSwitcher modelId={modelId} onSelect={onSelectModel} />
    <FrameScrubber frames={readout.catalog.frames} hour={hour} onSelect={onSelectHour} />
    <SourceReadout {...readout} />
  </section>
);
