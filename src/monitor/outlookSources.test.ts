import type { ForecastCycle } from '../types/outlooks';
import { buildMonitorOutlookOptions, resolveSelectedOutlookOption } from './outlookSources';

const makeCycle = (cycleDate: string): ForecastCycle => ({
  cycleDate,
  currentDay: 1,
  days: {
    1: {
      day: 1,
      data: {
        tornado: new Map([['2%', [{ type: 'Feature', geometry: null, properties: { outlookType: 'tornado', probability: '2%' } }]]]),
      },
      metadata: {
        issueDate: '',
        validDate: '',
        issuanceTime: '0600',
        createdAt: '',
        lastModified: '',
      },
    },
  },
});

describe('monitor outlook sources', () => {
  test('includes same-day current, local, and cloud options while filtering old cycles', () => {
    const today = '2026-04-28';
    const options = buildMonitorOutlookOptions({
      currentCycle: makeCycle(today),
      savedCycles: [
        {
          id: 'local-1',
          timestamp: '',
          cycleDate: today,
          label: 'Local Today',
          forecastCycle: makeCycle(today),
          stats: { forecastDays: 1, totalOutlooks: 1, totalFeatures: 1 },
        },
        {
          id: 'old',
          timestamp: '',
          cycleDate: '2026-04-27',
          forecastCycle: makeCycle('2026-04-27'),
          stats: { forecastDays: 1, totalOutlooks: 1, totalFeatures: 1 },
        },
      ],
      cloudCycles: [
        {
          id: 'cloud-1',
          userId: 'user-1',
          label: 'Cloud Today',
          cycleDate: today,
          createdAt: '',
          updatedAt: '',
          forecastDays: 1,
          totalOutlooks: 1,
          totalFeatures: 1,
          isReadOnly: false,
        },
      ],
      today,
    });

    expect(options.map((option) => option.id)).toEqual(['current', 'local-1', 'cloud-1']);
    expect(resolveSelectedOutlookOption(options, { kind: 'local-cycle', id: 'local-1' }).label).toBe('Local Today');
    expect(resolveSelectedOutlookOption(options, { kind: 'local-cycle', id: 'missing' }).id).toBe('current');
  });

  test('marks current outlook unavailable when cycle date differs from today', () => {
    const [option] = buildMonitorOutlookOptions({
      currentCycle: makeCycle('2026-04-27'),
      savedCycles: [],
      cloudCycles: [],
      today: '2026-04-28',
    });

    expect(option.data).toBeUndefined();
    expect(option.status).toMatch(/does not match today/i);
  });
});
