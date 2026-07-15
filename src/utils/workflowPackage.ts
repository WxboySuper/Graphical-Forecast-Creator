import type { GFCForecastSaveData } from '../types/outlooks';
import type { CycleMetadata, SerializedWorkflowPackage } from '../types/workflow';
import { WORKFLOW_SCHEMA_VERSION } from '../types/workflow';
import { getWorkflowTemplateById } from '../components/ForecastWorkflow/workflowTemplates';
import type { DayType } from '../types/outlooks';

export type WorkflowExportScope = 'workflow' | 'cycle';

export interface WorkflowExportPackage {
  packageType: WorkflowExportScope;
  schemaVersion: typeof WORKFLOW_SCHEMA_VERSION;
  exportedAt: string;
  metadata?: CycleMetadata;
  forecast: GFCForecastSaveData;
  styleSnapshots?: Record<string, unknown>;
}

const packageTypeFor = (scope: WorkflowExportScope): WorkflowExportScope => scope;

/** Keeps a workflow-scoped export limited to the days owned by its workflow template. */
export const restrictForecastToWorkflow = (
  forecast: GFCForecastSaveData,
  cycleMetadata?: CycleMetadata,
): GFCForecastSaveData => {
  if (!cycleMetadata?.workflowId || !forecast.forecastCycle) return forecast;
  const template = getWorkflowTemplateById(cycleMetadata.workflowId);
  if (!template || template.groupings.length === 0 || template.groupings.length === 4) return forecast;

  const allowedDays = new Set<DayType>();
  template.groupings.forEach((grouping) => {
    if (grouping === 'day1') allowedDays.add(1);
    if (grouping === 'day2') allowedDays.add(2);
    if (grouping === 'day3') allowedDays.add(3);
    if (grouping === 'day4-8') [4, 5, 6, 7, 8].forEach((day) => allowedDays.add(day as DayType));
  });
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
  packageType: packageTypeFor(scope),
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
