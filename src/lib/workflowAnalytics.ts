import { shouldTrack } from '../utils/analyticsUtils';
import {
  WORKFLOW_ANALYTICS_EVENTS,
  type WorkflowAnalyticsDimensions,
  type WorkflowAnalyticsEvent,
  type WorkflowAnalyticsPayload,
} from '../types/workflowAnalytics';

const DIMENSION_KEYS = ['dayGrouping', 'accountTier', 'entryPath', 'result', 'packageScope', 'action'] as const;
const EVENT_SET = new Set<string>(WORKFLOW_ANALYTICS_EVENTS);
const DIMENSION_VALUES: Record<string, readonly string[]> = {
  dayGrouping: ['day1', 'day2', 'day3', 'day4-8', 'full-cycle'],
  accountTier: ['signed-out', 'free', 'premium'],
  entryPath: ['home', 'forecast', 'cloud-library', 'forecast-workspace', 'rollover'],
  result: ['success', 'failure', 'cancelled'],
  packageScope: ['workflow', 'cycle'],
  action: ['keep', 'save-and-start-new', 'replace-without-saving'],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Validates the strict metadata-only payload before it can reach the transport. */
export const validateWorkflowAnalyticsPayload = (value: unknown): value is WorkflowAnalyticsPayload => {
  if (!isRecord(value) || typeof value.event !== 'string' || !EVENT_SET.has(value.event)) return false;
  if (value.dimensions === undefined) return true;
  if (!isRecord(value.dimensions)) return false;
  return Object.entries(value.dimensions).every(([key, dimension]) =>
    (DIMENSION_KEYS as readonly string[]).includes(key)
      && typeof dimension === 'string'
      && DIMENSION_VALUES[key]?.includes(dimension) === true,
  );
};

/** Sends a consent-gated event without ever allowing analytics failures into workflow code. */
export const trackWorkflowEvent = (
  event: WorkflowAnalyticsEvent,
  dimensions?: WorkflowAnalyticsDimensions,
  options: { enabled?: boolean; transport?: (payload: WorkflowAnalyticsPayload) => void } = {},
): void => {
  const payload: WorkflowAnalyticsPayload = dimensions ? { event, dimensions } : { event };
  if (options.enabled === false || !validateWorkflowAnalyticsPayload(payload)) return;
  if (options.transport) {
    try { options.transport(payload); } catch { /* analytics must never block forecasting */ }
    return;
  }
  if (!shouldTrack()) return;
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/collect', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
    }
  } catch { /* analytics is best effort */ }
};

export const workflowAnalyticsDimensionKeys = DIMENSION_KEYS;
