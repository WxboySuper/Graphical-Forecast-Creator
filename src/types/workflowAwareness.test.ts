import {
  getAwarenessRecommendations,
  isCurrentAwarenessConsent,
  WORKFLOW_AWARENESS_CONSENT_VERSION,
} from './workflowAwareness';

const base = {
  cycleId: 'cycle',
  workflowId: 'severe-day1',
  cycleDate: '2026-07-13',
  outlookVersions: [],
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T01:00:00.000Z',
};

test('requires the current consent version', () => {
  expect(isCurrentAwarenessConsent({ enabled: true, version: WORKFLOW_AWARENESS_CONSENT_VERSION })).toBe(true);
  expect(isCurrentAwarenessConsent({ enabled: true, version: WORKFLOW_AWARENESS_CONSENT_VERSION - 1 })).toBe(false);
  expect(isCurrentAwarenessConsent({ enabled: false, version: WORKFLOW_AWARENESS_CONSENT_VERSION })).toBe(false);
});

test('does not recommend completed cycles and sorts unfinished cycles newest first', () => {
  const recommendations = getAwarenessRecommendations([
    { ...base, cycleId: 'completed', status: 'completed' },
    { ...base, cycleId: 'old', status: 'in-progress', updatedAt: '2026-07-13T00:00:00.000Z' },
    { ...base, cycleId: 'new', status: 'in-progress', updatedAt: '2026-07-13T02:00:00.000Z' },
  ]);

  expect(recommendations.map((record) => record.cycleId)).toEqual(['new', 'old']);
});
