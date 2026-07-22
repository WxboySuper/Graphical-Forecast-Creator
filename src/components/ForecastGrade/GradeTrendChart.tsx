import React, { useMemo, useState } from 'react';
import type { GradeCard } from '../../types/forecastGrade';
import { PRODUCT_KINDS, PRODUCT_LABELS, type ProductKind } from '../../utils/verificationV2';
import { formatGrade } from './gradeFormat';

interface GradeTrendChartProps {
  cards: GradeCard[];
  onSelectCard?: (card: GradeCard) => void;
}

type TrendFilter = 'package' | ProductKind;

const valueForFilter = (card: GradeCard, filter: TrendFilter): number | null =>
  filter === 'package' ? card.grade : card.productGrades[filter] ?? null;

/**
 * Grade trend for the latest 25 cards, filterable by hazard. Cards are
 * trend-only; selecting one does not reopen a full package for free accounts.
 */
const GradeTrendChart: React.FC<GradeTrendChartProps> = ({ cards, onSelectCard }) => {
  const [filter, setFilter] = useState<TrendFilter>('package');

  // Oldest → newest for a left-to-right trend.
  const ordered = useMemo(() => [...cards].reverse(), [cards]);
  const points = ordered
    .map((card) => ({ card, value: valueForFilter(card, filter) }))
    .filter(
      (entry): entry is { card: GradeCard; value: number } =>
        entry.value !== null && Number.isFinite(entry.value)
    );

  if (cards.length === 0) {
    return (
      <div className="rounded-xl border border-slate-300/40 p-4 text-sm text-slate-500">
        Your graded runs will appear here as a trend.
      </div>
    );
  }

  const width = 320;
  const height = 96;
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  const toY = (value: number) => height - (value / 100) * height;
  const path = points
    .map((entry, index) => `${index === 0 ? 'M' : 'L'} ${index * step} ${toY(entry.value)}`)
    .join(' ');

  return (
    <div className="rounded-xl border border-slate-300/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Grade trend</h3>
        <select
          className="fg-touch rounded border border-slate-300/40 bg-transparent px-2 py-1 text-sm"
          value={filter}
          aria-label="Filter trend by hazard"
          onChange={(event) => setFilter(event.target.value as TrendFilter)}
        >
          <option value="package">Package</option>
          {PRODUCT_KINDS.map((product) => (
            <option key={product} value={product}>
              {PRODUCT_LABELS[product]}
            </option>
          ))}
        </select>
      </div>

      {points.length === 0 ? (
        <p className="text-sm text-slate-500">No graded runs for this hazard yet.</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full" role="img" aria-label="Grade trend chart">
          <line x1="0" y1={toY(60)} x2={width} y2={toY(60)} stroke="rgba(148,163,184,0.4)" strokeDasharray="4 4" />
          {points.length > 1 && <path d={path} fill="none" stroke="#2563eb" strokeWidth="2" />}
          {points.map((entry, index) => (
            <circle
              key={entry.card.id}
              cx={index * step}
              cy={toY(entry.value)}
              r={3.5}
              fill="#2563eb"
              className="cursor-pointer"
              onClick={() => onSelectCard?.(entry.card)}
            >
              <title>
                {formatGrade(entry.value)} · {entry.card.reportDate ?? 'today'}
              </title>
            </circle>
          ))}
        </svg>
      )}

      <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs text-slate-500">
        {cards.slice(0, 6).map((card) => (
          <li key={card.id}>
            <button
              type="button"
              className="w-full text-left hover:underline"
              onClick={() => onSelectCard?.(card)}
            >
              {formatGrade(card.grade)} {card.letter ?? ''} · {card.reportDate ?? 'today'} · {card.dataQuality}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default GradeTrendChart;
