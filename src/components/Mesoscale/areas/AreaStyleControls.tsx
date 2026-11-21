/**
 * Per-area appearance controls: fill (none, hatch, solid), outline color, width and dash, a few
 * colorblind-safe swatches plus a custom color, copy from another area, and a reset to the
 * hazard default. Every change is one undo step; slider and color drags merge into one.
 */
import React, { useId } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import type { MesoscaleArea, MesoscaleAreaStyle, MesoscaleFillPattern, MesoscaleOutlineDash } from '../../../store/mesoscaleSlice';
import {
  FILL_PATTERNS, MAX_FILL_OPACITY, MAX_OUTLINE_WIDTH, MIN_FILL_OPACITY, MIN_OUTLINE_WIDTH,
} from '../../../utils/mesoscaleAreaStyleValidation';
import { AreaSwatch } from './AreaSwatch';
import { dashArray, fullAreaStyle, isStyled } from './areaStyleModel';

interface Props {
  area: MesoscaleArea;
  /** Other areas, offered as a source to copy a look from. */
  others: MesoscaleArea[];
  onStyle: (style: MesoscaleAreaStyle | undefined, coalesceKey?: string) => void;
}

/** Okabe-Ito colors (distinguishable with common color-vision differences) plus a near-black and white. */
export const STYLE_PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Vermillion', hex: '#d55e00' },
  { name: 'Orange', hex: '#e69f00' },
  { name: 'Yellow', hex: '#f0e442' },
  { name: 'Bluish green', hex: '#009e73' },
  { name: 'Sky blue', hex: '#56b4e9' },
  { name: 'Blue', hex: '#0072b2' },
  { name: 'Reddish purple', hex: '#cc79a7' },
  { name: 'Black', hex: '#111827' },
  { name: 'White', hex: '#ffffff' },
];

const PATTERN_LABELS: Record<MesoscaleFillPattern, string> = { none: 'None', hatch: 'Hatch', solid: 'Solid' };
const DASH_LABELS: Record<MesoscaleOutlineDash, string> = { solid: 'Solid', dashed: 'Dashed', dotted: 'Dotted', 'dash-dot': 'Dash-dot' };
const DASHES = Object.keys(DASH_LABELS) as MesoscaleOutlineDash[];

const sameColor = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

interface ColorFieldProps { label: string; value: string; onChange: (hex: string, drag: boolean) => void }

/** Preset swatches and a custom color input. A swatch shows a check when chosen, so color is never the only cue. */
const ColorField: React.FC<ColorFieldProps> = ({ label, value, onChange }) => {
  const isPreset = STYLE_PRESETS.some(preset => sameColor(preset.hex, value));
  return (
    <div className="mesoscale-style__field" role="group" aria-label={label}>
      <span className="mesoscale-style__label">{label}</span>
      <div className="mesoscale-colors">
        {STYLE_PRESETS.map(preset => {
          const active = sameColor(preset.hex, value);
          return (
            <button key={preset.hex} type="button" className="mesoscale-color" style={{ '--swatch': preset.hex } as React.CSSProperties} aria-pressed={active} aria-label={`${label}: ${preset.name}`} title={preset.name} onClick={() => onChange(preset.hex, false)}>
              {active ? <Check aria-hidden="true" strokeWidth={3} /> : null}
            </button>
          );
        })}
        <label className={`mesoscale-color mesoscale-color--custom${isPreset ? '' : ' is-active'}`} style={{ '--swatch': value } as React.CSSProperties} title="Custom color">
          <input type="color" value={value} aria-label={`${label}: custom color`} onChange={event => onChange(event.target.value, true)} />
          {isPreset ? <span aria-hidden="true">+</span> : <Check aria-hidden="true" strokeWidth={3} />}
        </label>
      </div>
    </div>
  );
};

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  render: (option: T) => React.ReactNode;
  onChange: (option: T) => void;
}

const Segmented = <T extends string>({ label, value, options, render, onChange }: SegmentedProps<T>): React.ReactElement => (
  <div className="mesoscale-style__field" role="group" aria-label={label}>
    <span className="mesoscale-style__label">{label}</span>
    <div className="mesoscale-segments mesoscale-style__segments">
      {options.map(option => (
        <button key={option} type="button" className="mesoscale-segment" aria-pressed={value === option} onClick={() => onChange(option)}>{render(option)}</button>
      ))}
    </div>
  </div>
);

interface SliderProps { label: string; value: number; min: number; max: number; step: number; format: (value: number) => string; onChange: (value: number) => void }

/** The label sits beside the live value, not around it: a label wrapping an `<output>` would name the output, not the slider. */
const Slider: React.FC<SliderProps> = ({ label, value, min, max, step, format, onChange }) => {
  const id = useId();
  return (
    <div className="mesoscale-style__field">
      <div className="mesoscale-style__label">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <input id={id} type="range" className="mesoscale-style__range" min={min} max={max} step={step} value={value} aria-valuetext={format(value)} onChange={event => onChange(Number(event.target.value))} />
    </div>
  );
};

const DashPreview: React.FC<{ dash: MesoscaleOutlineDash }> = ({ dash }) => (
  <svg width="30" height="10" viewBox="0 0 30 10" aria-hidden="true" focusable="false">
    <line x1="2" y1="5" x2="28" y2="5" stroke="currentColor" strokeWidth="2.2" strokeLinecap={dash === 'dotted' || dash === 'dash-dot' ? 'round' : 'butt'} strokeDasharray={dashArray(dash, 2.2, 0.8)?.join(' ')} />
  </svg>
);

const percent = (value: number): string => `${Math.round(value * 100)}%`;
const pixels = (value: number): string => `${value} px`;

/** The look summary shown on the collapsed header. */
export const styleSummary = (style: MesoscaleAreaStyle | undefined): string => (isStyled(style) ? 'Custom' : 'Hazard default');

const FillControls: React.FC<{ full: ReturnType<typeof fullAreaStyle>; apply: (changes: MesoscaleAreaStyle, key?: string) => void }> = ({ full, apply }) => (
  <>
    <Segmented label="Fill" value={full.fillPattern} options={FILL_PATTERNS} render={option => PATTERN_LABELS[option]} onChange={fillPattern => apply({ fillPattern })} />
    {full.fillPattern === 'none' ? null : (
      <>
        <ColorField label="Fill color" value={full.fillColor} onChange={(fillColor, drag) => apply({ fillColor }, drag ? 'fillColor' : undefined)} />
        <Slider label="Fill strength" value={full.fillOpacity} min={MIN_FILL_OPACITY} max={MAX_FILL_OPACITY} step={0.05} format={percent} onChange={fillOpacity => apply({ fillOpacity }, 'fillOpacity')} />
      </>
    )}
  </>
);

const OutlineControls: React.FC<{ full: ReturnType<typeof fullAreaStyle>; apply: (changes: MesoscaleAreaStyle, key?: string) => void }> = ({ full, apply }) => (
  <>
    <ColorField label="Outline color" value={full.outlineColor} onChange={(outlineColor, drag) => apply({ outlineColor }, drag ? 'outlineColor' : undefined)} />
    <Slider label="Outline width" value={full.outlineWidth} min={MIN_OUTLINE_WIDTH} max={MAX_OUTLINE_WIDTH} step={0.5} format={pixels} onChange={outlineWidth => apply({ outlineWidth }, 'outlineWidth')} />
    <Segmented label="Outline style" value={full.outlineDash} options={DASHES} render={option => <><DashPreview dash={option} /><span className="mesoscale-style__dash-name">{DASH_LABELS[option]}</span></>} onChange={outlineDash => apply({ outlineDash })} />
  </>
);

export const AreaStyleControls: React.FC<Props> = ({ area, others, onStyle }) => {
  const full = fullAreaStyle(area.hazard, area.style);
  // Changing one field keeps the rest of the custom style; other fields stay on the hazard default.
  const apply = (changes: MesoscaleAreaStyle, key?: string): void => onStyle({ ...area.style, ...changes }, key);
  const copyFrom = (id: string): void => {
    const source = others.find(other => other.id === id);
    if (source) onStyle(fullAreaStyle(source.hazard, source.style));
  };
  return (
    <details className="mesoscale-style">
      <summary className="mesoscale-style__summary">
        <AreaSwatch hazard={area.hazard} style={area.style} width={30} height={18} />
        <span className="mesoscale-style__title">Appearance</span>
        <span className="mesoscale-style__state">{styleSummary(area.style)}</span>
      </summary>
      <div className="mesoscale-style__body">
        <FillControls full={full} apply={apply} />
        <OutlineControls full={full} apply={apply} />
        <div className="mesoscale-style__footer">
          {others.length > 0 ? (
            <label className="mesoscale-style__copy">
              <span className="mesoscale-style__label">Copy look from</span>
              <select value="" onChange={event => copyFrom(event.target.value)}>
                <option value="">Choose an area</option>
                {others.map(other => <option key={other.id} value={other.id}>{other.title}</option>)}
              </select>
            </label>
          ) : null}
          <button type="button" className="mesoscale-style__reset" disabled={!isStyled(area.style)} onClick={() => onStyle(undefined)}>
            <RotateCcw aria-hidden="true" />
            Reset to hazard default
          </button>
        </div>
      </div>
    </details>
  );
};
