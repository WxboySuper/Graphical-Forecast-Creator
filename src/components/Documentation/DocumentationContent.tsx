// skipcq: JS-W1028
import React from 'react';
import {
  categoricalConversionTables,
  colorMappings,
  significantCategoricalFloors,
  type CategoricalConversionTable,
  type CategoricalConversionRow,
} from '../../utils/outlookUtils';
import type { CIGLevel, CategoricalRiskLevel } from '../../types/outlooks';

const CATEGORICAL_CELL_CLASSES: Readonly<Record<CategoricalRiskLevel, string>> = {
  TSTM: 'cat-tstm',
  MRGL: 'cat-mrgl',
  SLGT: 'cat-slgt',
  ENH: 'cat-enh',
  MDT: 'cat-mdt',
  HIGH: 'cat-high',
};

/** Renders a category cell using the map palette treatment. */
const CatCell = React.memo(function CatCell({ v }: { v: CategoricalRiskLevel }) {
  return <td className={CATEGORICAL_CELL_CLASSES[v]}>{v}</td>;
});

interface ColorExampleItem {
  label: string;
  color: string;
  darkText?: boolean;
}

/** Shared color-swatch row that keeps documentation palette examples tied to the live map colors. */
const ColorExamples: React.FC<{ items: ColorExampleItem[] }> = ({ items }) => (
  <div className="color-examples">
    {items.map(({ label, color, darkText = false }) => (
      <div key={label} className="color-item" style={{ backgroundColor: color, color: darkText ? '#333' : undefined }}>
        <span>{label}</span>
      </div>
    ))}
  </div>
);

const tornadoColorExamples: ColorExampleItem[] = [
  { label: '2%', color: colorMappings.tornado['2%'] },
  { label: '5%', color: colorMappings.tornado['5%'] },
  { label: '10%', color: colorMappings.tornado['10%'], darkText: true },
  { label: '15%', color: colorMappings.tornado['15%'] },
  { label: '30%', color: colorMappings.tornado['30%'] },
  { label: '45%', color: colorMappings.tornado['45%'] },
  { label: '60%', color: colorMappings.tornado['60%'] },
];

const windColorExamples: ColorExampleItem[] = [
  { label: '5%', color: colorMappings.wind['5%'] },
  { label: '15%', color: colorMappings.wind['15%'], darkText: true },
  { label: '30%', color: colorMappings.wind['30%'] },
  { label: '45%', color: colorMappings.wind['45%'] },
  { label: '60%', color: colorMappings.wind['60%'] },
  { label: '75%', color: colorMappings.wind['75%'] },
  { label: '90%', color: colorMappings.wind['90%'], darkText: true },
];

const hailColorExamples: ColorExampleItem[] = [
  { label: '5%', color: colorMappings.hail['5%'] },
  { label: '15%', color: colorMappings.hail['15%'], darkText: true },
  { label: '30%', color: colorMappings.hail['30%'] },
  { label: '45%', color: colorMappings.hail['45%'] },
  { label: '60%', color: colorMappings.hail['60%'] },
];

const categoricalColorExamples: ColorExampleItem[] = [
  { label: 'TSTM', color: colorMappings.categorical.TSTM, darkText: true },
  { label: 'MRGL', color: colorMappings.categorical.MRGL, darkText: true },
  { label: 'SLGT', color: colorMappings.categorical.SLGT, darkText: true },
  { label: 'ENH', color: colorMappings.categorical.ENH, darkText: true },
  { label: 'MDT', color: colorMappings.categorical.MDT },
  { label: 'HIGH', color: colorMappings.categorical.HIGH },
];

const totalSevereColorExamples: ColorExampleItem[] = [
  { label: '5%', color: colorMappings.totalSevere['5%'] },
  { label: '15%', color: colorMappings.totalSevere['15%'], darkText: true },
  { label: '30%', color: colorMappings.totalSevere['30%'] },
  { label: '45%', color: colorMappings.totalSevere['45%'] },
  { label: '60%', color: colorMappings.totalSevere['60%'] },
];

const dayFourToEightColorExamples: ColorExampleItem[] = [
  { label: '15%', color: colorMappings['day4-8']['15%'], darkText: true },
  { label: '30%', color: colorMappings['day4-8']['30%'] },
];

/** Overview tab content for the in-app documentation panel. */
export const OverviewSection: React.FC = () => (
  <div className="doc-section">
    <h3>Graphical Forecast Creator</h3>
    <p>
      GFC is a tool for creating professional severe weather outlook graphics.
      Draw probabilistic forecast areas on an interactive CONUS map, then export or share your work.
    </p>

    <h4>Pages</h4>
    <ul>
      <li><strong>Forecast</strong> — Draw and manage outlook polygons across Days 1–8</li>
      <li><strong>Discussion</strong> — Write a companion forecast discussion (DIY or guided mode)</li>
      <li><strong>Verification</strong> — Load storm reports and score your forecasts</li>
    </ul>

    <h4>Key Features</h4>
    <ul>
      <li>Multi-day forecast cycles with Day 1–8 support</li>
      <li>Tornado, Wind, Hail, Categorical, Day 3 Total Severe, and Day 4–8 outlook types</li>
      <li>CIG hatching system (CIG1–CIG3) for significant-threat overlays</li>
      <li>Auto-generated categorical outlook from probabilistic inputs</li>
      <li>Cycle Manager — save, load, and copy forecasts between cycles</li>
      <li>Export as JSON (for reloading) or PNG image snapshot</li>
      <li>Blank (Weather) map style — classic weather-style cream/blue basemap</li>
      <li>Full dark mode support</li>
    </ul>

    <h4>Map Styles</h4>
    <ul>
      <li><strong>Street</strong> — Standard OpenStreetMap tiles</li>
      <li><strong>Satellite</strong> — Esri World Imagery</li>
      <li><strong>Light</strong> — Carto light street map style</li>
      <li><strong>Blank (Weather)</strong> — Flat map: cream CONUS, gray neighbors, blue ocean</li>
    </ul>
  </div>
);

/** Usage tab content covering the basic workflow and shortcuts. */
export const UsageSection: React.FC = () => (
  <div className="doc-section">
    <h3>How to Use GFC</h3>

    <h4>Basic Workflow</h4>
    <ol>
      <li>
        <span className="item-title">Select a day:</span> Use the day buttons (1–8) in the toolbar or press the corresponding number key.
      </li>
      <li>
        <span className="item-title">Select an outlook type:</span> Choose Tornado, Wind, Hail, or Categorical (Days 1–2), Total Severe (Day 3), or Day 4–8.
      </li>
      <li>
        <span className="item-title">Select a probability:</span> Click the desired probability level in the panel.
      </li>
      <li>
        <span className="item-title">Set CIG hatching (optional):</span> Choose CIG1, CIG2, or CIG3 to overlay a hatch pattern that boosts the categorical risk level for that area.
      </li>
      <li>
        <span className="item-title">Draw on the map:</span> Use the polygon or rectangle drawing tools in the upper-right corner of the map.
      </li>
      <li>
        <span className="item-title">Review categorical:</span> The categorical outlook is auto-generated — you do not draw it directly (except for TSTM, which must be added manually with <kbd>G</kbd>).
      </li>
      <li>
        <span className="item-title">Save your cycle:</span> Use Cycle Manager to save with an optional label, or export to JSON / PNG from the toolbar.
      </li>
    </ol>

    <h4>Tips</h4>
    <ul>
      <li>Work outward from the highest risk areas to lower risk, not the reverse</li>
      <li>Copy yesterday&apos;s Day 2 into today&apos;s Day 1 via Cycle Manager → Copy from Previous</li>
      <li>Categorical risk is read-only — to change it, modify the underlying probabilistic outlooks</li>
      <li>Auto-save runs every 60 seconds to local storage as a backup</li>
    </ul>

    <h4>Keyboard Shortcuts</h4>
    <ul>
      <li><kbd>1</kbd>–<kbd>8</kbd> — Switch forecast day</li>
      <li><kbd>T</kbd> — Switch to Tornado outlook</li>
      <li><kbd>W</kbd> — Switch to Wind outlook</li>
      <li><kbd>H</kbd> — Switch to Hail outlook</li>
      <li><kbd>C</kbd> — Switch to Categorical outlook</li>
      <li><kbd>G</kbd> — Add General Thunderstorm (Categorical mode only)</li>
      <li><kbd>Ctrl+S</kbd> — Save forecast to JSON</li>
      <li><kbd>Ctrl+D</kbd> — Toggle dark mode</li>
      <li><kbd>Esc</kbd> — Cancel current drawing / close this panel</li>
      <li><kbd>Ctrl+H</kbd> — Go to Home</li>
      <li><kbd>Ctrl+1</kbd> — Go to Forecast</li>
      <li><kbd>Ctrl+2</kbd> — Go to Discussion</li>
      <li><kbd>Ctrl+3</kbd> — Go to Verification</li>
    </ul>
  </div>
);

/** Outlook reference tab content describing supported outlook types and colors. */
export const OutlooksSection: React.FC = () => (
  <div className="doc-section">
    <h3>Outlook Types &amp; Colors</h3>

    <h4>Tornado Outlook (Days 1–2)</h4>
    <p>Probability of a tornado within 25 miles of a point.</p>
    <ColorExamples items={tornadoColorExamples} />
    <p>Supports CIG1, CIG2, and CIG3 hatching. CIG level boosts categorical risk — see the Conversion tab for the full table.</p>

    <h4>Wind Outlook (Days 1–2)</h4>
    <p>Probability of damaging winds (&ge;58 mph) within 25 miles of a point.</p>
    <ColorExamples items={windColorExamples} />
    <p>Supports CIG1, CIG2, and CIG3 hatching.</p>

    <h4>Hail Outlook (Days 1–2)</h4>
    <p>Probability of hail &ge;1&quot; within 25 miles of a point.</p>
    <ColorExamples items={hailColorExamples} />
    <p>Supports CIG1 and CIG2 hatching only (no CIG3).</p>

    <h4>Categorical Outlook (Days 1–2)</h4>
    <p>Auto-derived from Tornado, Wind, and Hail. Only TSTM is drawn manually.</p>
    <ColorExamples items={categoricalColorExamples} />
    <p>Risk hierarchy: TSTM &lt; MRGL &lt; SLGT &lt; ENH &lt; MDT &lt; HIGH. The highest risk from any probabilistic outlook wins in overlapping areas.</p>

    <h4>Total Severe Outlook (Day 3 only)</h4>
    <p>Combined severe weather probability — no separate tornado/wind/hail breakdown.</p>
    <ColorExamples items={totalSevereColorExamples} />
    <p>Supports CIG1 and CIG2 hatching. No HIGH categorical on Day 3.</p>

    <h4>Day 4–8 Outlook</h4>
    <p>Extended-range probabilistic outlook — two levels only, no categorical conversion.</p>
    <ColorExamples items={dayFourToEightColorExamples} />

    <h4>CIG Hatching Levels</h4>
    <p>
      CIG overlays visualize significant threat areas and <strong>directly affect the derived categorical risk level</strong> — a higher CIG applied to a probability will raise its categorical output.
    </p>
    <ul>
      <li><strong>CIG1</strong> — Broken diagonal lines</li>
      <li><strong>CIG2</strong> — Solid diagonal line</li>
      <li><strong>CIG3</strong> — Crosshatch (Tornado and Wind only)</li>
    </ul>
  </div>
);

/** Renders labeled columns for a conversion table. */
const ConversionTableHeader = React.memo(function ConversionTableHeader({ cigs }: { cigs: readonly CIGLevel[] }) {
  return <thead><tr><th scope="col">Probability</th>{cigs.map((cig) => <th scope="col" key={cig}>{cig}</th>)}</tr></thead>;
});

/** Renders each probability and its hazard-specific CIG results. */
const ConversionTableBody = React.memo(function ConversionTableBody({ rows }: { rows: readonly CategoricalConversionRow[] }) {
  return <tbody>{rows.map(({ probability, cells }) => (
    <tr key={probability}><th scope="row">{probability}</th>{cells.map(({ cig, risk }) => <CatCell key={cig} v={risk} />)}</tr>
  ))}</tbody>;
});

/** Tracks whether a conversion table needs a keyboard-accessible scroll region. */
function useHorizontalOverflow(
  rows: readonly CategoricalConversionRow[],
  cigs: readonly CIGLevel[],
): [React.RefObject<HTMLDivElement | null>, boolean] {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = React.useState(false);
  React.useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return undefined;

    /** Measures table width and updates the scroll-region state. */
    const updateOverflow = () => {
      const nextValue = container.scrollWidth > container.clientWidth + 1;
      setOverflows((currentValue) => currentValue === nextValue ? currentValue : nextValue);
    };
    updateOverflow();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updateOverflow);
    observer?.observe(container);
    if (container.firstElementChild) observer?.observe(container.firstElementChild);
    window.addEventListener('resize', updateOverflow);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateOverflow);
    };
  }, [cigs, rows]);
  return [scrollRef, overflows];
}

/** Renders a horizontally scrollable, screen-reader labeled conversion matrix. */
const ConversionTable: React.FC<{
  label: string;
  rows: readonly CategoricalConversionRow[];
  cigs: readonly CIGLevel[];
}> = ({ label, rows, cigs }) => {
  const [scrollRef, overflows] = useHorizontalOverflow(rows, cigs);
  return (
    <div
      ref={scrollRef}
      className="conversion-table-scroll"
      role={overflows ? 'region' : undefined}
      aria-label={overflows ? `${label} scroll area` : undefined}
      tabIndex={overflows ? 0 : undefined}
    >
      <table className="conversion-table">
        <caption className="conversion-table__caption">{label}</caption>
        <ConversionTableHeader cigs={cigs} />
        <ConversionTableBody rows={rows} />
      </table>
    </div>
  );
};

/** Sorts and formats hazard floors for the documentation guide. */
const formatSignificantFloors = (floors: Readonly<Record<string, CategoricalRiskLevel>>): string =>
  Object.entries(floors)
    .sort(([left], [right]) => {
      const leftValue = Number.parseFloat(left);
      const rightValue = Number.parseFloat(right);
      return Number.isNaN(leftValue) || Number.isNaN(rightValue)
        ? left.localeCompare(right)
        : leftValue - rightValue;
    })
    .map(([probability, risk]) => `${probability}# → ${risk}`)
    .join(', ');

/** Formats significant floors once for the static documentation view. */
const significantFloorSummaries = {
  tornado: formatSignificantFloors(significantCategoricalFloors.tornado),
  wind: formatSignificantFloors(significantCategoricalFloors.wind),
  hail: formatSignificantFloors(significantCategoricalFloors.hail),
  totalSevere: formatSignificantFloors(significantCategoricalFloors.totalSevere),
};

const conversionGuides: readonly {
  title: string;
  label: string;
  table: CategoricalConversionTable;
  note?: string;
}[] = [
  { title: 'Tornado Conversion', label: 'Tornado category by probability and CIG', table: categoricalConversionTables.tornado, note: 'Tornado supports CIG0, the no-hatching baseline, through CIG3.' },
  { title: 'Wind Conversion', label: 'Wind category by probability and CIG', table: categoricalConversionTables.wind, note: 'Wind supports CIG0, the no-hatching baseline, through CIG3.' },
  {
    title: 'Hail Conversion',
    label: 'Hail category by probability and CIG',
    table: categoricalConversionTables.hail,
    note: 'Hail supports CIG1 and CIG2 hatching. CIG0 is the no-hatching baseline. CIG3 is not a drawable hail hatch, but imported or legacy CIG3 data uses the CIG2 mapping. Hail does not produce a HIGH category.',
  },
  {
    title: 'Day 3 Total Severe Conversion',
    label: 'Day 3 total severe category by probability and CIG',
    table: categoricalConversionTables.totalSevere,
    note: 'Day 3 uses one combined probability and supports CIG1 and CIG2 hatching. CIG0 is the no-hatching baseline. CIG3 is not drawable, and imported or legacy CIG3 data uses the CIG2 mapping. Its maximum category is MDT.',
  },
];

/** Conversion tab content generated from the same functions used by forecasts. */
export const CategoricalSection: React.FC = () => (
  <div className="doc-section">
    <h3>Probabilistic → Categorical Conversion</h3>
    <p>For Days 1–2, the highest categorical level among Tornado, Wind, and Hail wins where their areas overlap. From lowest to highest, the order is TSTM, MRGL, SLGT, ENH, MDT, then HIGH. Day 3 uses its separate Total Severe table below.</p>
    <p>
      Each table shows the non-significant probability result, without a trailing #, for every displayed probability and CIG combination.
      If there is no direct mapping, the highest category from a lower-numbered CIG applies.
      CIG0 is the no-hatching baseline. Repeated values mean a higher CIG does not raise the category.
    </p>
    {conversionGuides.map(({ title, label, table, note }) => (
      <div key={title}>
        <h4>{title}</h4>
        {note ? <p>{note}</p> : null}
        <ConversionTable {...table} label={label} />
      </div>
    ))}
    <h4>Significant Risk Floors</h4>
    <p>A trailing # identifies a significant probability. Where SPC guidance lists a floor, it sets the minimum category; the final category is the higher of that floor and the probability/CIG result. Other valid # probabilities keep their existing CIG hatching and do not raise the category.</p>
    <ul>
      <li><strong>Tornado:</strong> {significantFloorSummaries.tornado}</li>
      <li><strong>Wind:</strong> {significantFloorSummaries.wind}</li>
      <li><strong>Hail:</strong> {significantFloorSummaries.hail}</li>
      <li><strong>Day 3 Total Severe:</strong> {significantFloorSummaries.totalSevere || 'no separate floor'}</li>
    </ul>
  </div>
);

export default {} as Record<string, never>;
