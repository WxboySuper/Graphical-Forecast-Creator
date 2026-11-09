/** Editor for the selected area: title, hazard or theme, optional confidence, and the valid window in UTC. */
import React from 'react';
import { HAZARD_SUGGESTIONS, isoToUtcInput, utcInputToIso, validateAreaFields } from './areaModel';
import type { MesoscaleArea } from '../../../store/mesoscaleSlice';

interface Props {
  area: MesoscaleArea;
  onChange: (changes: Partial<MesoscaleArea>) => void;
  onDelete: () => void;
}

const FieldError: React.FC<{ message?: string }> = ({ message }) =>
  message ? <span className="mesoscale-form__error" role="alert">{message}</span> : null;

/** Keeps the previous value when a time input is cleared or incomplete. */
const timeChange = (key: 'validStart' | 'validEnd', onChange: Props['onChange']) => (event: React.ChangeEvent<HTMLInputElement>): void => {
  const iso = utcInputToIso(event.target.value);
  if (iso) onChange({ [key]: iso });
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
    <label className="mesoscale-form__field"><span>From</span><input type="datetime-local" value={isoToUtcInput(area.validStart)} onChange={timeChange('validStart', onChange)} /></label>
    <label className="mesoscale-form__field"><span>Until</span><input type="datetime-local" value={isoToUtcInput(area.validEnd)} aria-invalid={Boolean(error)} onChange={timeChange('validEnd', onChange)} /></label>
    <FieldError message={error} />
  </fieldset>
);

export const AreaEditor: React.FC<Props> = ({ area, onChange, onDelete }) => {
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
      <WindowFields area={area} error={errors.window} onChange={onChange} />
      <button type="button" className="mesoscale-form__delete" onClick={onDelete}>Delete area</button>
    </form>
  );
};
