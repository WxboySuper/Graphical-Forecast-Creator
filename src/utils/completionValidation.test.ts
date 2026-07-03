import { validateCycleCompletion } from './completionValidation';
import type { ForecastCycle, DayType, OutlookType } from '../types/outlooks';
import type { StandardGrouping } from '../types/workflow';

const createDayWithAllOutlooks = (day: DayType) => {
  const outlookData: Record<string, Map<string, unknown[]>> = {};

  if (day === 1 || day === 2) {
    outlookData.tornado = new Map([['2%', [{ id: 't1' }]]]);
    outlookData.wind = new Map([['5%', [{ id: 'w1' }]]]);
    outlookData.hail = new Map([['5%', [{ id: 'h1' }]]]);
    outlookData.categorical = new Map([['SLGT', [{ id: 'c1' }]]]);
  } else if (day === 3) {
    outlookData.totalSevere = new Map([['15%', [{ id: 'ts1' }]]]);
    outlookData.categorical = new Map([['SLGT', [{ id: 'c1' }]]]);
  } else {
    outlookData['day4-8'] = new Map([['15%', [{ id: 'd1' }]]]);
  }

  return {
    day,
    data: outlookData as any,
    metadata: {
      issueDate: new Date().toISOString(),
      validDate: new Date().toISOString(),
      issuanceTime: '0600',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      lowProbabilityOutlooks: [] as OutlookType[],
    },
    discussion: undefined,
  };
};

const createDayAllLowProb = (day: DayType) => {
  const allTypes: OutlookType[] =
    day === 1 || day === 2
      ? ['tornado', 'wind', 'hail', 'categorical']
      : day === 3
        ? ['totalSevere', 'categorical']
        : ['day4-8'];

  return {
    day,
    data: {} as any,
    metadata: {
      issueDate: new Date().toISOString(),
      validDate: new Date().toISOString(),
      issuanceTime: '0600',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      lowProbabilityOutlooks: allTypes,
    },
    discussion: undefined,
  };
};

const createDayWithDiscussion = (day: DayType) => {
  const d = createDayWithAllOutlooks(day);
  d.discussion = {
    mode: 'diy',
    validStart: new Date().toISOString(),
    validEnd: new Date().toISOString(),
    forecasterName: 'Test',
    diyContent: 'This is a test discussion.',
    lastModified: new Date().toISOString(),
  };
  return d;
};

const createDayWithEmptyDiscussion = (day: DayType) => {
  const d = createDayWithAllOutlooks(day);
  d.discussion = {
    mode: 'diy',
    validStart: new Date().toISOString(),
    validEnd: new Date().toISOString(),
    forecasterName: 'Test',
    diyContent: '',
    lastModified: new Date().toISOString(),
  };
  return d;
};

const createEmptyDay = (day: DayType) => ({
  day,
  data: {} as any,
  metadata: {
    issueDate: new Date().toISOString(),
    validDate: new Date().toISOString(),
    issuanceTime: '0600',
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    lowProbabilityOutlooks: [] as OutlookType[],
  },
  discussion: undefined,
});

const createForecastCycle = (
  days: ForecastCycle['days'],
  currentDay: DayType = 1,
): ForecastCycle => ({
  days,
  currentDay,
  cycleDate: '2026-06-13',
});

describe('validateCycleCompletion', () => {
  it('returns incomplete for empty cycle', () => {
    const result = validateCycleCompletion(createForecastCycle({}));
    expect(result.isComplete).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('returns complete when all day1 types are low probability', () => {
    const result = validateCycleCompletion(
      createForecastCycle({ 1: createDayAllLowProb(1) }),
      ['day1'],
    );
    expect(result.isComplete).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('reports missing polygon for day1 with no data', () => {
    const result = validateCycleCompletion(
      createForecastCycle({ 1: createEmptyDay(1) }),
      ['day1'],
    );
    expect(result.isComplete).toBe(false);
    expect(result.issues.some((i) => i.type === 'missing-polygon')).toBe(true);
    expect(result.missingGroupings).toContain('day1');
  });

  it('reports missing discussion when polygons exist but discussion is empty', () => {
    const result = validateCycleCompletion(
      createForecastCycle({ 1: createDayWithEmptyDiscussion(1) }),
      ['day1'],
    );
    expect(result.isComplete).toBe(true);
    expect(result.issues.some((i) => i.type === 'missing-discussion')).toBe(true);
  });

  it('is complete when day1 has all polygons and discussion', () => {
    const result = validateCycleCompletion(
      createForecastCycle({ 1: createDayWithDiscussion(1) }),
      ['day1'],
    );
    expect(result.isComplete).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('validates day3 with totalSevere and categorical', () => {
    const result = validateCycleCompletion(
      createForecastCycle({ 3: createDayWithAllOutlooks(3) }, 3),
      ['day3'],
    );
    expect(result.isComplete).toBe(true);
  });

  it('validates day4 with day4-8 outlook', () => {
    const result = validateCycleCompletion(
      createForecastCycle({ 4: createDayWithAllOutlooks(4) }, 4),
      ['day4-8'],
    );
    expect(result.issues.some((i) => i.day === 'day4-8' && i.outlookType === 'day4-8' && i.type === 'missing-polygon')).toBe(true);
    expect(result.missingGroupings).toContain('day4-8');
  });

  it('reports no-tstm-forecast warning when categorical has only TSTM but is not low probability', () => {
    const day = createEmptyDay(1);
    day.data.tornado = new Map([['2%', [{ id: 't1' }]]]);
    day.data.wind = new Map([['5%', [{ id: 'w1' }]]]);
    day.data.hail = new Map([['5%', [{ id: 'h1' }]]]);
    day.data.categorical = new Map([['TSTM', [{ id: 'c1' }]]]);
    day.metadata.lowProbabilityOutlooks = [];

    const result = validateCycleCompletion(createForecastCycle({ 1: day }), ['day1']);
    expect(result.issues.some((i) => i.type === 'no-tstm-forecast')).toBe(true);
  });

  it.each([
    ['critical', createEmptyDay(1), (issues: ReturnType<typeof validateCycleCompletion>['issues']) => {
      expect(issues.filter((issue) => issue.severity === 'critical').length).toBeGreaterThan(0);
    }],
    ['warning', createDayWithEmptyDiscussion(1), (issues: ReturnType<typeof validateCycleCompletion>['issues']) => {
      expect(issues.filter((issue) => issue.severity === 'warning').length).toBeGreaterThan(0);
    }],
  ])('returns %s issues with expected severity', (_label, day, assertSeverity) => {
    const result = validateCycleCompletion(createForecastCycle({ 1: day }), ['day1']);
    assertSeverity(result.issues);
  });
});
