/** Editor for the selected area: title, hazard or theme, optional confidence, and the valid window in UTC. */
import React, { useEffect, useState } from 'react';
import { HAZARD_SUGGESTIONS, isoToUtcInput, utcInputToIso, validateAreaFields } from './areaModel';
import type { Polygon } from 'geojson';
import type { MesoscaleArea } from '../../../store/mesoscaleSlice';
import { ShapeControls } from './ShapeControls';

interface Props {
  area: MesoscaleArea;
  onChange: (changes: Partial<MesoscaleArea>) => void;
  onDelete: () => void;
  onGeometry: (geometry: Polygon) => void;
}

const FieldError: React.FC<{ message?: string }> = ({ message }) =>
  message ? <span className="mesoscale-form__error" role="alert">{message}</span> : null;

/**
 * A UTC date-time input. It keeps what the user is typing in local state, so a half-typed
 * value is not overwritten, and only commits a complete, valid time.
 */
const UtcTimeInput: React.FC<{ label: string; iso: string; invalid?: boolean; onCommit: (iso: string) => void }> = ({ label, iso, invalid, onCommit }) => {
  const [draft, setDraft] = useState(isoToUtcInput(iso));
  // Follow outside changes such as undo.
  useEffect(() => setDraft(isoToUtcInput(iso)), [iso]);
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setDraft(event.target.value);
    const next = utcInputToIso(event.target.value);
    if (next) onCommit(next);
  };
  return (
    <label className="mesoscale-form__field">
      <span>{label}</span>
      <input type="datetime-local" value={draft} aria-invalid={invalid} onChange={handleChange} onBlur={() => setDraft(isoToUtcInput(iso))} />
    </label>
  );
};

const confidenceChange = (onChange: Props['onChange']) => (event: React.ChangeEvent<HTMLInputElement>): void => {
  const raw = event.target.value;
  if (raw === '') {
    onChange({ confidence: undefined });
    return;
  }
  const value = Number(raw);
  if (Number.isFinite(value)) onChange({ confidence: value });
};

const TextField: React.FC<{ label: string; value: string; max: number; list?: string; error?: string; onChange: (value: string) => void }> = (
  { label, value, max, list, error, onChange },
) => (
  <label className="mesoscale-form__field">
    <span>{label}</span>
    <input type="text" list={list} value={value} maxLength={max} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} />
    <FieldError message={error} />
  </label>
);

const WindowFields: React.FC<{ area: MesoscaleArea; error?: string; onChange: Props['onChange'] }> = ({ area, error, onChange }) => (
  <fieldset className="mesoscale-form__window">
    <legend>Valid window (UTC)</legend>
    <UtcTimeInput label="From" iso={area.validStart} onCommit={(validStart) => onChange({ validStart })} />
    <UtcTimeInput label="Until" iso={area.validEnd} invalid={Boolean(error)} onCommit={(validEnd) => onChange({ validEnd })} />
    <FieldError message={error} />
  </fieldset>
);

export const AreaEditor: React.FC<Props> = ({ area, onChange, onDelete, onGeometry }) => {
  const errors = validateAreaFields(area);
  return (
    <form className="mesoscale-form" aria-label={`Edit ${area.title}`} onSubmit={(event) => event.preventDefault()}>
      <TextField label="Title" value={area.title} max={200} error={errors.title} onChange={(title) => onChange({ title })} />
      <TextField label="Hazard or theme" value={area.hazard} max={120} list="mesoscale-hazards" error={errors.hazard} onChange={(hazard) => onChange({ hazard })} />
      <datalist id="mesoscale-hazards">{HAZARD_SUGGESTIONS.map(item => <option key={item} value={item} />)}</datalist>
      <label className="mesoscale-form__field">
        <span>Confidence <em>(optional, 0 to 100)</em></span>
        <input type="number" min={0} max={100} step={5} inputMode="numeric" value={area.confidence ?? ''} aria-invalid={Boolean(errors.confidence)} onChange={confidenceChange(onChange)} />
        <FieldError message={errors.confidence} />
      </label>
      <ShapeControls geometry={area.geometry} onChange={onGeometry} />
      <WindowFields area={area} error={errors.window} onChange={onChange} />
      <button type="button" className="mesoscale-form__delete" onClick={onDelete}>Delete area</button>
    </form>
  );
};
