import React, { useState, useEffect } from 'react';
import { Cloud, Zap } from 'lucide-react';

// March 1, 2026 at noon CST (UTC-6) = 18:00 UTC
const LAUNCH_TIME = new Date('2026-03-01T18:00:00.000Z').getTime();

function getRemainingMs(): number {
  return Math.max(0, LAUNCH_TIME - Date.now());
}

const RISK_BADGES = [
  { label: 'HIGH', color: '#fe7ffe' },
  { label: 'MDT',  color: '#e67f7e' },
  { label: 'ENH',  color: '#e5c27f' },
  { label: 'SLGT', color: '#f3f67d' },
  { label: 'MRGL', color: '#7dc580' },
  { label: 'TSTM', color: '#bfe7bc' },
];

export const ComingSoonPage: React.FC = () => {
  const [remaining, setRemaining] = useState(getRemainingMs);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      const r = getRemainingMs();
      setRemaining(r);
      if (r <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const days    = Math.floor(remaining / 86_400_000);
  const hours   = Math.floor((remaining % 86_400_000) / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);

  const units = [
    { label: 'Days',    value: days },
    { label: 'Hours',   value: hours },
    { label: 'Minutes', value: minutes },
    { label: 'Seconds', value: seconds },
  ];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-8"
      style={{ background: 'linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-primary) 60%, var(--bg-tertiary) 100%)' }}
    >
      <div className="max-w-2xl w-full space-y-10 text-center">

        {/* Brand pill */}
        <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/25 rounded-full px-4 py-1.5 text-sm font-medium text-primary">
          <Cloud className="h-4 w-4" />
          Graphical Forecast Creator
        </div>

        {/* Headline */}
        <div className="space-y-4">
          <h1
            className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Draw professional<br />
            <span className="text-primary">severe weather outlooks.</span>
          </h1>
          <p className="text-lg max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            GFC launches publicly on{' '}
            <strong style={{ color: 'var(--text-primary)' }}>March 1st at noon CST</strong>.
            Full support for SPC-style probabilistic outlooks, forecast discussions, and verification — right in your browser.
          </p>
        </div>

        {/* Countdown or Launch Message */}
        {remaining > 0 ? (
          <div className="grid grid-cols-4 gap-3 md:gap-5">
            {units.map(({ label, value }) => (
              <div
                key={label}
                className="rounded-2xl p-5 space-y-1 border"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              >
                <p
                  className="text-3xl md:text-4xl font-extrabold tracking-tight tabular-nums"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {String(value).padStart(2, '0')}
                </p>
                <p
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {label}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl p-6 border border-primary/25 bg-primary/10">
            <p className="text-xl font-bold text-primary flex items-center justify-center gap-2">
              <Zap className="h-5 w-5" />
              GFC is live! Refresh to start forecasting.
            </p>
          </div>
        )}

        {/* Risk badge row — visual accent */}
        <div className="flex items-center justify-center gap-2 flex-wrap opacity-50">
          {RISK_BADGES.map(({ label, color }) => (
            <span
              key={label}
              className="px-3 py-1 rounded-full text-xs font-bold border"
              style={{
                backgroundColor: color + '40',
                borderColor: color + '80',
                color: 'var(--text-primary)',
              }}
            >
              {label}
            </span>
          ))}
        </div>

      </div>
    </div>
  );
};
