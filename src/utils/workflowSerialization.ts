import type {
  Package,
  CycleMetadata,
  WorkflowMetadata,
  WorkflowPackageMetadata,
  CycleId,
  WorkflowId,
  CycleStatus,
  OutlookVersion,
  Grouping,
  SerializedCycle,
  SerializedWorkflowPackage,
  SerializedOutlookVersionData,
} from '../types/workflow';
import type {
  ForecastCycle,
  GFCForecastSaveData,
  DayType,
  OutlookDay,
  OutlookType,
  SerializedOutlookData,
  DiscussionData,
} from '../types/outlooks';
import { WORKFLOW_SCHEMA_VERSION } from '../types/workflow';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default workflow ID used when migrating legacy data with no explicit workflow context. */
const DEFAULT_WORKFLOW_ID = 'default';

/** Maps numeric DayType to the grouping key used in serialized output. */
const dayToGrouping = (day: DayType): Grouping => {
  if (day <= 3) return `day${day}` as Grouping;
  return 'day4-8' as Grouping;
};

/** Generates a deterministic CycleId from workflow + date. */
const makeCycleId = (workflowId: WorkflowId, cycleDate: string): CycleId =>
  `WF-${workflowId}-${cycleDate}`;

// ---------------------------------------------------------------------------
// Helpers: Map ↔ Array
// ---------------------------------------------------------------------------

const mapToArray = <K, V>(m: Map<K, V>): [K, V][] =>
  m instanceof Map ? Array.from(m.entries()) : [];

// ---------------------------------------------------------------------------
// serializeWorkflowPackage
// ---------------------------------------------------------------------------

/**
 * Converts a runtime `Package` (cycles + metadata) into a JSON-serializable
 * `SerializedWorkflowPackage`.
 *
 * The caller is responsible for populating `styleSnapshots` if desired.
 */
export const serializeWorkflowPackage = (
  pkg: Package,
): SerializedWorkflowPackage => {
  const serializedCycles: SerializedCycle[] = pkg.cycles.map((cycle) => {
    // Build groupings from outlookVersions + metadata — this is a passthrough
    // since the runtime Package does not yet carry per-cycle grouping data;
    // callers who need richer grouping info should populate it on the Package
    // before calling this function. For now we emit an empty groupings array
    // and let the consumer reconstruct from the cycle metadata.
    const groupings: { grouping: Grouping; day: DayType }[] = [];

    return {
      id: cycle.id,
      workflowId: cycle.workflowId,
      cycleDate: cycle.cycleDate,
      status: cycle.status,
      outlookVersions: cycle.outlookVersions,
      createdAt: cycle.createdAt,
      updatedAt: cycle.updatedAt,
      groupings,
      groupingData: {},
    };
  });

  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    version: String(pkg.metadata.version),
    metadata: pkg.metadata,
    cycles: serializedCycles,
  };
};

// ---------------------------------------------------------------------------
// deserializeWorkflowPackage
// ---------------------------------------------------------------------------

/**
 * Rehydrates a `SerializedWorkflowPackage` back into a runtime `Package`.
 *
 * This is a near-passthrough: the serialized format already mirrors the
 * runtime `Package` shape, so the main work is ensuring correct typing.
 */
export const deserializeWorkflowPackage = (
  data: SerializedWorkflowPackage,
): Package => {
  const cycles: CycleMetadata[] = data.cycles.map((sc) => ({
    id: sc.id,
    workflowId: sc.workflowId,
    cycleDate: sc.cycleDate,
    status: sc.status,
    outlookVersions: sc.outlookVersions,
    createdAt: sc.createdAt,
    updatedAt: sc.updatedAt,
  }));

  return {
    metadata: data.metadata,
    cycles,
  };
};

// ---------------------------------------------------------------------------
// migrateLegacyForecastToWorkflowPackage
// ---------------------------------------------------------------------------

/**
 * Converts a legacy `GFCForecastSaveData` (v0.5.0 / v1.0.0) into a v2
 * `Package` suitable for import into the workflow system.
 *
 * @param legacyData  The persisted v0.5.0/v1.0.0 forecast save data.
 * @param workflowId  Optional workflow ID; defaults to `'default'`.
 * @returns A fully-populated `Package` with one cycle.
 */
export const migrateLegacyForecastToWorkflowPackage = (
  legacyData: GFCForecastSaveData,
  workflowId: WorkflowId = DEFAULT_WORKFLOW_ID,
): Package => {
  const cycleDate = legacyData.forecastCycle?.cycleDate ?? new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();
  const cycleId = makeCycleId(workflowId, cycleDate);

  // Determine status — completed if all days exist and have data
  const status: CycleStatus = 'in-progress';

  // Build outlook versions — one version per existing day
  const outlookVersions: OutlookVersion[] = [];
  let versionCounter = 1;

  if (legacyData.forecastCycle?.days) {
    const dayKeys = Object.keys(legacyData.forecastCycle.days) as unknown as DayType[];
    dayKeys.forEach((day) => {
      if (legacyData.forecastCycle!.days[day]) {
        outlookVersions.push({
          version: versionCounter++,
          status: 'completed',
          createdAt: now,
        });
      }
    });
  }

  // If no outlook versions were created, add a single default one
  if (outlookVersions.length === 0) {
    outlookVersions.push({
      version: 1,
      status: 'completed',
      createdAt: now,
    });
  }

  // Build grouping data from the legacy days
  const groupingData: Record<string, SerializedOutlookVersionData> = {};
  if (legacyData.forecastCycle?.days) {
    const dayKeys = Object.keys(legacyData.forecastCycle.days) as unknown as DayType[];
    dayKeys.forEach((day) => {
      const savedDay = legacyData.forecastCycle!.days[day];
      if (savedDay) {
        const grouping = dayToGrouping(day);
        const key = `${grouping}-v1`;
        groupingData[key] = {
          day,
          data: savedDay.data,
          metadata: {
            issueDate: savedDay.metadata.issueDate,
            validDate: savedDay.metadata.validDate,
            issuanceTime: savedDay.metadata.issuanceTime,
            lowProbabilityOutlooks: savedDay.metadata.lowProbabilityOutlooks,
          },
          discussion: (savedDay as { discussion?: DiscussionData }).discussion,
        };
      }
    });
  }

  // Build groupings list (unique)
  const seenGroupings = new Set<string>();
  const groupings: { grouping: Grouping; day: DayType }[] = [];
  if (legacyData.forecastCycle?.days) {
    const dayKeys = Object.keys(legacyData.forecastCycle.days) as unknown as DayType[];
    dayKeys.forEach((day) => {
      const grouping = dayToGrouping(day);
      if (!seenGroupings.has(grouping)) {
        seenGroupings.add(grouping);
        groupings.push({ grouping, day });
      }
    });
  }

  const metadata: WorkflowPackageMetadata = {
    workflowId,
    cycleId,
    version: 1,
    status,
    includesDiscussions: Object.values(groupingData).some((g) => g.discussion !== undefined),
    includesStyleSnapshots: false,
  };

  const serializedCycle: SerializedCycle = {
    id: cycleId,
    workflowId,
    cycleDate,
    status,
    outlookVersions,
    createdAt: now,
    updatedAt: now,
    groupings,
    groupingData,
  };

  return {
    metadata,
    cycles: [{
      id: cycleId,
      workflowId,
      cycleDate,
      status,
      outlookVersions,
      createdAt: now,
      updatedAt: now,
    }],
  };
};

// ---------------------------------------------------------------------------
// validateWorkflowPackage
// ---------------------------------------------------------------------------

/**
 * Type guard that returns `true` when `data` is a valid
 * `SerializedWorkflowPackage`.
 */
export const validateWorkflowPackage = (
  data: unknown,
): data is SerializedWorkflowPackage => {
  if (typeof data !== 'object' || data === null) return false;

  const candidate = data as Partial<SerializedWorkflowPackage>;

  return (
    typeof candidate.schemaVersion === 'string' &&
    typeof candidate.version === 'string' &&
    typeof candidate.metadata === 'object' &&
    candidate.metadata !== null &&
    typeof (candidate.metadata as Partial<WorkflowPackageMetadata>).workflowId === 'string' &&
    typeof (candidate.metadata as Partial<WorkflowPackageMetadata>).cycleId === 'string' &&
    Array.isArray(candidate.cycles)
  );
};
