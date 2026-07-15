import { sendWorkflowAnalyticsPayload, trackWorkflowEvent, validateWorkflowAnalyticsPayload } from './workflowAnalytics';
import { WORKFLOW_ANALYTICS_EVENTS } from '../types/workflowAnalytics';

test.each(WORKFLOW_ANALYTICS_EVENTS)('accepts the allowlisted %s event', (event) => {
  expect(validateWorkflowAnalyticsPayload({ event, dimensions: { result: 'success' } })).toBe(true);
});

test.each(['coordinates', 'geometry', 'discussion', 'label', 'filename', 'packageContents', 'forecast'])('rejects prohibited or unknown field %s', (key) => {
  expect(validateWorkflowAnalyticsPayload({ event: 'complete', dimensions: { [key]: 'secret' } })).toBe(false);
});

test('rejects unknown events, invalid values, and nested payloads', () => {
  expect(validateWorkflowAnalyticsPayload({ event: 'render' })).toBe(false);
  expect(validateWorkflowAnalyticsPayload({ event: 'export', dimensions: { result: 'raw-error' } })).toBe(false);
  expect(validateWorkflowAnalyticsPayload({ event: 'export', dimensions: { result: { message: 'filename.geojson' } } })).toBe(false);
});

test('opt-out and provider failures are no-ops', () => {
  const transport = jest.fn(() => { throw new Error('provider down'); });
  expect(() => trackWorkflowEvent('complete', { result: 'success' }, { enabled: false, transport })).not.toThrow();
  expect(transport).not.toHaveBeenCalled();
  expect(() => trackWorkflowEvent('complete', { result: 'success' }, { transport })).not.toThrow();
  expect(transport).toHaveBeenCalledTimes(1);
});

test('falls back to fetch when Beacon refuses to queue an event', () => {
  const sendBeacon = jest.fn(() => false);
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: sendBeacon });
  const fetchMock = jest.fn(() => Promise.resolve());
  const originalFetch = global.fetch;
  global.fetch = fetchMock as typeof fetch;
  sendWorkflowAnalyticsPayload({ event: 'export', dimensions: { result: 'success' } });
  expect(sendBeacon).toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledWith('/api/collect', expect.objectContaining({ method: 'POST' }));
  global.fetch = originalFetch;
  Reflect.deleteProperty(navigator, 'sendBeacon');
});
