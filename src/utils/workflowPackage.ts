import type { DayType, GFCForecastSaveData } from '../types/outlooks';
import type { CycleMetadata, SerializedWorkflowPackage } from '../types/workflow';
import { WORKFLOW_SCHEMA_VERSION } from '../types/workflow';
import { getWorkflowTemplateById } from '../components/ForecastWorkflow/workflowTemplates';

export type WorkflowExportScope = 'workflow' | 'cycle';

export interface WorkflowExportPackage {
  packageType: WorkflowExportScope;
  schemaVersion: typeof WORKFLOW_SCHEMA_VERSION;
  exportedAt: string;
  metadata?: CycleMetadata;
  forecast: GFCForecastSaveData;
  styleSnapshots?: Record<string, unknown>;
}

const WORKFLOW_GROUPING_DAYS: Record<string, DayType[]> = {
  day1: [1],
  day2: [2],
  day3: [3],
  'day4-8': [4, 5, 6, 7, 8],
};

/** Returns the day slots owned by a workflow template. */
const getWorkflowDays = (workflowId: string): Set<DayType> => {
  const template = getWorkflowTemplateById(workflowId);
  return new Set(template?.groupings.flatMap((grouping) => WORKFLOW_GROUPING_DAYS[grouping] ?? []) ?? []);
};

/** Keeps a workflow-scoped export limited to the days owned by its workflow template. */
export const restrictForecastToWorkflow = (
  forecast: GFCForecastSaveData,
  cycleMetadata?: CycleMetadata,
): GFCForecastSaveData => {
  if (!cycleMetadata?.workflowId || !forecast.forecastCycle) return forecast;
  const allowedDays = getWorkflowDays(cycleMetadata.workflowId);
  if (allowedDays.size === 0 || allowedDays.size === 8) return forecast;
  const days = Object.fromEntries(
    Object.entries(forecast.forecastCycle.days).filter(([day]) => allowedDays.has(Number(day) as DayType)),
  );
  return {
    ...forecast,
    forecastCycle: {
      ...forecast.forecastCycle,
      days,
      currentDay: allowedDays.has(forecast.forecastCycle.currentDay)
        ? forecast.forecastCycle.currentDay
        : (Array.from(allowedDays)[0] ?? forecast.forecastCycle.currentDay),
    },
  };
};

/** Builds the JSON payload used by both workflow- and cycle-scoped exports. */
export const buildWorkflowExportPackage = ({
  scope,
  forecast,
  cycleMetadata,
  styleSnapshots,
  exportedAt = new Date().toISOString(),
}: {
  scope: WorkflowExportScope;
  forecast: GFCForecastSaveData;
  cycleMetadata?: CycleMetadata;
  styleSnapshots?: Record<string, unknown>;
  exportedAt?: string;
}): WorkflowExportPackage => ({
  packageType: scope,
  schemaVersion: WORKFLOW_SCHEMA_VERSION,
  exportedAt,
  ...(cycleMetadata ? { metadata: cycleMetadata } : {}),
  forecast: scope === 'workflow' ? restrictForecastToWorkflow(forecast, cycleMetadata) : forecast,
  ...(styleSnapshots ? { styleSnapshots } : {}),
});

/** Returns true only for the exact top-level markers of a workflow export package. */
export const isWorkflowExportPackage = (value: unknown): value is WorkflowExportPackage => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<WorkflowExportPackage>;
  return (candidate.packageType === 'workflow' || candidate.packageType === 'cycle')
    && candidate.schemaVersion === WORKFLOW_SCHEMA_VERSION
    && typeof candidate.exportedAt === 'string'
    && Boolean(candidate.forecast && typeof candidate.forecast === 'object');
};

/** Converts the local package into the v2 package shape used for future readers. */
export const toSerializedWorkflowPackage = (pkg: WorkflowExportPackage): SerializedWorkflowPackage | null => {
  const metadata = pkg.metadata;
  if (!metadata) return null;
  const groupingData = Object.fromEntries(
    Object.entries(pkg.forecast.forecastCycle?.days ?? {}).map(([day, value]) => [String(day), value]),
  );
  return {
    schemaVersion: pkg.schemaVersion,
    version: pkg.schemaVersion,
    metadata: {
      workflowId: metadata.workflowId,
      cycleId: metadata.id,
      version: metadata.outlookVersions.at(-1)?.version ?? 1,
      status: metadata.status,
      includesDiscussions: Object.values(groupingData).some((day) => Boolean((day as { discussion?: unknown }).discussion)),
      includesStyleSnapshots: Boolean(pkg.styleSnapshots),
    },
    cycles: [{
      id: metadata.id,
      workflowId: metadata.workflowId,
      cycleDate: metadata.cycleDate,
      status: metadata.status,
      outlookVersions: metadata.outlookVersions,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      groupings: Object.keys(groupingData).map((day) => ({ grouping: day, day: Number(day) as never })),
      groupingData,
    }],
    ...(pkg.styleSnapshots ? { styleSnapshots: pkg.styleSnapshots } : {}),
  };
};
