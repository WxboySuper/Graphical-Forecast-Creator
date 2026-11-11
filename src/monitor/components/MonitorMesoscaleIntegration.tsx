import React, { useMemo, useState } from 'react';
import type { MesoscaleCatalog, MesoscaleCatalogParameter, MesoscaleLayerSpec, MesoscaleModelId } from '../../mesoscale';
import { useMesoscaleFrames, useMesoscaleLatest } from '../../mesoscale';
import { isMesoscaleDemoData } from '../../mesoscale/fixtures/client';
import { LayerPanel } from '../../components/Mesoscale/LayerPanel';
import { filterExposedMesoscaleParameters } from '../../components/Mesoscale/layerExposure';
import { formatUtc } from '../../components/Mesoscale/SourcePanel';
import type { MonitorMesoscaleSettings } from '../types';
import '../../components/Mesoscale/Mesoscale.css';

export interface MonitorMesoscaleView {
  panel: React.ReactNode;
  layers: MesoscaleLayerSpec[];
  legend: MesoscaleCatalogParameter[];
}

export interface MonitorMesoscaleIntegrationProps {
  settings: MonitorMesoscaleSettings;
  onSettingsChange: (settings: MonitorMesoscaleSettings) => void;
  children: (view: MonitorMesoscaleView) => React.ReactNode;
}

const modelLabel: Record<MesoscaleModelId, string> = { hrrr: 'HRRR', rap: 'RAP', rrfs: 'RRFS' };
const EMPTY_LAYERS: MesoscaleLayerSpec[] = [];
const EMPTY_PARAMETERS: MesoscaleCatalogParameter[] = [];

export const currentCatalogDisplay = (
  status: string | null,
  layers: MesoscaleLayerSpec[],
  legend: MesoscaleCatalogParameter[],
): Pick<MonitorMesoscaleView, 'layers' | 'legend'> => status === null
  ? { layers, legend }
  : { layers: EMPTY_LAYERS, legend: EMPTY_PARAMETERS };

const isCatalogResult = (result: ReturnType<typeof useMesoscaleFrames>['result']): result is Extract<typeof result, { data: MesoscaleCatalog }> => 'data' in result;

const integrationPanel = (settings: MonitorMesoscaleSettings, onSettingsChange: MonitorMesoscaleIntegrationProps['onSettingsChange'], parameters: MesoscaleCatalogParameter[], children: React.ReactNode) => (
  <section className="monitor-mesoscale" aria-label="Mesoscale parameters">
    <label className="monitor-mesoscale__model">
      Model
      <select aria-label="Mesoscale model" value={settings.model} onChange={(event) => onSettingsChange({ ...settings, model: event.currentTarget.value as MesoscaleModelId })}>
        <option value="hrrr">HRRR</option><option value="rap">RAP</option><option value="rrfs">RRFS</option>
      </select>
    </label>
    {children}
    {parameters.length > 0 ? <LayerPanel parameters={parameters} layers={settings.layers} onChange={(layers) => onSettingsChange({ ...settings, layers })} /> : null}
  </section>
);

const findAnalysisFrame = (catalog: MesoscaleCatalog | null) =>
  catalog?.frames.find((frame) => frame.frameType === 'analysis' && frame.forecastHour === 0);

const availableParameters = (frame: ReturnType<typeof findAnalysisFrame>): MesoscaleCatalogParameter[] =>
  filterExposedMesoscaleParameters(frame?.parameters.filter((parameter) => parameter.status !== 'failed') ?? []);

const selectedLayerSpecs = (settings: MonitorMesoscaleSettings, parameters: MesoscaleCatalogParameter[]): MesoscaleLayerSpec[] => {
  const parameterById = new Map(parameters.map((parameter) => [parameter.id, parameter]));
  return settings.layers.flatMap((setting) => {
    const parameter = parameterById.get(setting.id);
    return parameter ? [{ id: setting.id, parameter, opacity: setting.opacity }] : [];
  });
};

const catalogState = (frames: ReturnType<typeof useMesoscaleFrames>, catalog: MesoscaleCatalog | null, analysis: ReturnType<typeof findAnalysisFrame>): string | null => {
  if (!catalog) return frames.result.state;
  if (frames.stale) return 'stale';
  if (analysis?.status === 'failed') return 'upstream-failure';
  return analysis ? null : 'missing';
};

const unavailableParameterIds = (catalog: MesoscaleCatalog, analysis: NonNullable<ReturnType<typeof findAnalysisFrame>>): string => {
  const ids = [...(analysis.unavailableParameters ?? []), ...(catalog.unavailableParameters ?? [])]
    .map((parameter) => parameter.id);
  return [...new Set(ids)].join(', ') || 'some catalog fields';
};

type SourceInfo = NonNullable<MesoscaleCatalog['source']>;

/** Demo imagery gets one plain note instead of a fake source link; real data links to its source. */
export const SourceLine: React.FC<{ source?: SourceInfo }> = ({ source }) => {
  if (isMesoscaleDemoData()) return <span role="note">Demo data: placeholder imagery, not real model output.</span>;
  if (!source) return <span>Source attribution unavailable</span>;
  return <a href={source.url} target="_blank" rel="noreferrer">{source.attribution}</a>;
};

const AnalysisReadout: React.FC<{ model: MesoscaleModelId; catalog: MesoscaleCatalog; analysis: NonNullable<ReturnType<typeof findAnalysisFrame>>; ageMinutes: number | null; stale: boolean }> = ({ model, catalog, analysis, ageMinutes, stale }) => {
  const source = catalog.source ?? analysis.parameters[0]?.source;
  const hasUnavailableFields = catalog.status === 'partial' || analysis.status === 'partial';
  return (
    <div className="monitor-mesoscale__meta">
      <span>{modelLabel[model]} analysis (f00)</span>
      <span>Cycle {formatUtc(catalog.cycleTime)}</span>
      <span>Valid {formatUtc(analysis.validTime)}</span>
      <span>{ageMinutes === null ? 'Age unknown' : `${ageMinutes} min old`}{stale ? ' · stale' : ''}</span>
      <SourceLine source={source} />
      {hasUnavailableFields ? <span role="status">Unavailable parameters: {unavailableParameterIds(catalog, analysis)}</span> : null}
    </div>
  );
};

const stateMessage = (state: string, retry: () => void): React.ReactNode => {
  const messages: Record<string, string> = {
    loading: 'Loading the latest model analysis.',
    stale: 'This model analysis is stale.',
    malformed: 'The model data could not be read.',
    'upstream-failure': 'The model data source is unavailable.',
    missing: 'No analysis is available for this model.',
  };
  return <div className="monitor-mesoscale__state" role={state === 'loading' ? 'status' : 'alert'}><span>{messages[state] ?? messages.missing}</span>{state !== 'loading' ? <button type="button" onClick={retry}>Retry</button> : null}</div>;
};

const MesoscaleCatalogPanel: React.FC<MonitorMesoscaleIntegrationProps & { cycle: string; retry: () => void }> = ({ settings, onSettingsChange, children, cycle, retry }) => {
  const frames = useMesoscaleFrames(settings.model, cycle);
  const catalog = isCatalogResult(frames.result) ? frames.result.data : null;
  const analysis = findAnalysisFrame(catalog);
  const parameters = useMemo(() => availableParameters(analysis), [analysis]);
  const layers = useMemo(() => selectedLayerSpecs(settings, parameters), [parameters, settings]);
  const selectedParameters = useMemo(() => layers.map((layer) => layer.parameter), [layers]);
  const status = catalogState(frames, catalog, analysis);
  const content = catalog && analysis && status === null
    ? <AnalysisReadout model={settings.model} catalog={catalog} analysis={analysis} ageMinutes={frames.ageMinutes} stale={frames.stale} />
    : stateMessage(status ?? 'missing', retry);
  const panel = integrationPanel(settings, onSettingsChange, parameters, content);
  return <>{children({ panel, ...currentCatalogDisplay(status, layers, selectedParameters) })}</>;
};

const MesoscaleLatestPanel: React.FC<MonitorMesoscaleIntegrationProps & { retry: () => void }> = ({ settings, onSettingsChange, children, retry }) => {
  const latest = useMesoscaleLatest(settings.model);
  if (!('data' in latest.result)) {
    const panel = integrationPanel(settings, onSettingsChange, [], stateMessage(latest.result.state, retry));
    return <>{children({ panel, layers: EMPTY_LAYERS, legend: EMPTY_PARAMETERS })}</>;
  }
  return <MesoscaleCatalogPanel settings={settings} onSettingsChange={onSettingsChange} cycle={latest.result.data.cycleTime} retry={retry}>{children}</MesoscaleCatalogPanel>;
};

export const MonitorMesoscaleIntegration: React.FC<MonitorMesoscaleIntegrationProps> = (props) => {
  const [retryVersion, setRetryVersion] = useState(0);
  const retry = () => setRetryVersion((value) => value + 1);
  return <MesoscaleLatestPanel key={retryVersion} {...props} retry={retry} />;
};
