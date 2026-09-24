import { createInitialForecastState } from './forecastInitialState';

describe('createInitialForecastState', () => {
  test('returns the complete initial state contract', () => {
    expect(createInitialForecastState()).toStrictEqual({
      forecastCycle: {
        days: {
          1: {
            day: 1,
            data: {
              tornado: new Map(),
              wind: new Map(),
              hail: new Map(),
              categorical: new Map(),
            },
            metadata: {
              issueDate: '2026-01-01T00:00:00.000Z',
              validDate: '2026-01-01T00:00:00.000Z',
              issuanceTime: '0600',
              createdAt: '2026-01-01T00:00:00.000Z',
              lastModified: '2026-01-01T00:00:00.000Z',
              lowProbabilityOutlooks: [],
            },
          },
        },
        currentDay: 1,
        cycleDate: '2026-01-01',
      },
      drawingState: {
        activeOutlookType: 'tornado',
        activeProbability: '2%',
        isSignificant: false,
      },
      customEditor: {
        mode: 'severe',
        activeLayerId: null,
        activeCategoryId: null,
      },
      currentMapView: {
        center: [39.8283, -98.5795],
        zoom: 4,
      },
      isSaved: true,
      emergencyMode: false,
      savedCycles: [],
      lifetimeCycleStats: {
        totalCyclesMade: 0,
        totalForecastsMade: 0,
      },
      historyByDay: {},
      discussionDraftsByScope: {},
      completionValidation: {
        lastResult: null,
        showCompletionModal: false,
        omittedDays: {},
      },
      isWorkflowActive: false,
      outlookVersionSnapshots: [],
      autoCategoricalError: null,
      lastTrimResult: null,
    });
  });

  test('returns independent mutable maps and objects on every call', () => {
    const first = createInitialForecastState();
    const second = createInitialForecastState();
    const firstDay = first.forecastCycle.days[1]!;
    const secondDay = second.forecastCycle.days[1]!;

    expect(first).not.toBe(second);
    expect(first.forecastCycle).not.toBe(second.forecastCycle);
    expect(first.forecastCycle.days).not.toBe(second.forecastCycle.days);
    expect(firstDay).not.toBe(secondDay);
    expect(firstDay.data).not.toBe(secondDay.data);
    expect(firstDay.data.tornado).not.toBe(secondDay.data.tornado);
    expect(firstDay.data.wind).not.toBe(secondDay.data.wind);
    expect(firstDay.data.hail).not.toBe(secondDay.data.hail);
    expect(firstDay.data.categorical).not.toBe(secondDay.data.categorical);
    expect(firstDay.metadata).not.toBe(secondDay.metadata);
    expect(firstDay.metadata.lowProbabilityOutlooks).not.toBe(
      secondDay.metadata.lowProbabilityOutlooks
    );
    expect(first.drawingState).not.toBe(second.drawingState);
    expect(first.customEditor).not.toBe(second.customEditor);
    expect(first.currentMapView).not.toBe(second.currentMapView);
    expect(first.currentMapView.center).not.toBe(second.currentMapView.center);
    expect(first.savedCycles).not.toBe(second.savedCycles);
    expect(first.lifetimeCycleStats).not.toBe(second.lifetimeCycleStats);
    expect(first.historyByDay).not.toBe(second.historyByDay);
    expect(first.discussionDraftsByScope).not.toBe(second.discussionDraftsByScope);
    expect(first.completionValidation).not.toBe(second.completionValidation);
    expect(first.completionValidation.omittedDays).not.toBe(
      second.completionValidation.omittedDays
    );
    expect(first.outlookVersionSnapshots).not.toBe(second.outlookVersionSnapshots);

    first.isSaved = false;
    first.currentMapView.zoom = 5;
    firstDay.metadata.issuanceTime = '1200';
    firstDay.data.tornado!.set('2%', []);
    firstDay.data.wind!.set('2%', []);
    firstDay.data.hail!.set('2%', []);
    firstDay.data.categorical!.set('2%', []);
    first.completionValidation.omittedDays[1] = 'Skipped';

    expect(second.isSaved).toBe(true);
    expect(second.currentMapView.zoom).toBe(4);
    expect(secondDay.metadata.issuanceTime).toBe('0600');
    expect(secondDay.data.tornado!.size).toBe(0);
    expect(secondDay.data.wind!.size).toBe(0);
    expect(secondDay.data.hail!.size).toBe(0);
    expect(secondDay.data.categorical!.size).toBe(0);
    expect(second.completionValidation.omittedDays[1]).toBeUndefined();
  });
});
