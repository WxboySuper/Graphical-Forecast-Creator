/**
 * Forecast day-rollover transformations: this module derives the next cycle or
 * day state, carries workflow metadata, and preserves supported outlook data.
 * It owns pure rollover rules; storage, user prompts, and route orchestration
 * stay in their respective modules.
 */
import type { DayType, ForecastCycle, OutlookData, OutlookType } from '../types/outlooks';
import type { CycleMetadata, WorkflowMetadata } from '../types/workflow';
import { getWorkflowTemplateById } from '../components/ForecastWorkflow/workflowTemplates';
import { cloneEntries, cloneIntegratedCustomLayers } from './forecastSnapshotHelpers';
import { clearHistory } from './forecastHistory';
import type { ForecastState } from './forecastSlice';

type DayBucket = 'day12' | 'day3' | 'day48';

interface CopyFeatureRule {
  sourceType: OutlookType;
  targetType: OutlookType;
}

const DIRECT_DAY12_COPY_TYPES: OutlookType[] = ['tornado', 'wind', 'hail', 'categorical'];

const COPY_FEATURE_RULES: Record<DayBucket, Record<DayBucket, CopyFeatureRule[]>> = {
  day12: {
    day12: DIRECT_DAY12_COPY_TYPES.map((type) => ({ sourceType: type, targetType: type })),
    day3: [{ sourceType: 'categorical', targetType: 'categorical' }],
    day48: [],
  },
  day3: {
    day12: [{ sourceType: 'categorical', targetType: 'categorical' }],
    day3: [
      { sourceType: 'totalSevere', targetType: 'totalSevere' },
      { sourceType: 'categorical', targetType: 'categorical' },
    ],
    day48: [],
  },
  day48: {
    day12: [],
    day3: [{ sourceType: 'day4-8', targetType: 'totalSevere' }],
    day48: [{ sourceType: 'day4-8', targetType: 'day4-8' }],
  },
};

/** Collapses the eight forecast days into the compatibility groups used for copying. */
const getDayBucket = (day: DayType): DayBucket => {
  if (day === 1 || day === 2) return 'day12';
  if (day === 3) return 'day3';
  return 'day48';
};

/** Copies outlook maps allowed by the source and target day compatibility rules. */
export const copyCompatibleOutlooks = (
  sourceData: OutlookData,
  targetData: OutlookData,
  sourceDay: DayType,
  targetDay: DayType,
) => {
  const copyRules = COPY_FEATURE_RULES[getDayBucket(sourceDay)][getDayBucket(targetDay)];

  copyRules.forEach(({ sourceType, targetType }) => {
    const clonedMap = cloneEntries(sourceData[sourceType]);
    if (clonedMap) targetData[targetType] = clonedMap;
  });
};

/** Resolves the workflow ID from template or cycle metadata, falling back to the default workflow. */
const resolveWorkflowId = (template?: WorkflowMetadata, cycleMetadata?: CycleMetadata): string =>
  template?.id || cycleMetadata?.workflowId || 'default';

/** Creates initial workflow metadata for a new cycle. */
const createInitialCycleMetadata = (workflowId: string, cycleDate: string, now: string): CycleMetadata => ({
  id: `WF-${workflowId}-${cycleDate}`,
  workflowId,
  cycleDate,
  status: 'in-progress',
  outlookVersions: [{
    version: 1,
    status: 'in-progress',
    createdAt: now,
  }],
  createdAt: now,
  updatedAt: now,
});

export interface ApplyRolloverArgs {
  sourceCycle: ForecastState['savedCycles'][number];
  sourceDayData: NonNullable<ForecastCycle['days'][DayType]>;
  sourceDayNumber: DayType;
  targetDay: DayType;
  targetDate: string;
  workflowTemplate?: WorkflowMetadata;
}

/** Builds a fresh cycle and copies compatible outlooks and custom layers into its target day. */
const buildRolloverCycle = ({
  sourceDayData,
  sourceDayNumber,
  targetDay,
  targetDate,
  now,
  createEmptyDay,
}: Omit<ApplyRolloverArgs, 'sourceCycle' | 'workflowTemplate'> & {
  now: string;
  createEmptyDay: (day: DayType, timestamp: string) => NonNullable<ForecastCycle['days'][DayType]>;
}): ForecastCycle => {
  const newCycle: ForecastCycle = {
    days: { [targetDay]: createEmptyDay(targetDay, now) },
    currentDay: targetDay,
    cycleDate: targetDate,
  };
  const targetDayData = newCycle.days[targetDay];
  if (targetDayData) {
    copyCompatibleOutlooks(sourceDayData.data, targetDayData.data, sourceDayNumber, targetDay);
    targetDayData.customLayers = cloneIntegratedCustomLayers(sourceDayData.customLayers);
  }
  return newCycle;
};

/** Applies workflow metadata to a rollover while keeping plain cycles plain. */
const applyRolloverWorkflowState = (
  state: ForecastState,
  { sourceCycle, targetDate, workflowTemplate }: Pick<ApplyRolloverArgs, 'sourceCycle' | 'targetDate' | 'workflowTemplate'>,
  now: string,
) => {
  const sourceHadWorkflow = Boolean(sourceCycle.workflowMetadata);
  if (workflowTemplate || sourceHadWorkflow) {
    const workflowId = resolveWorkflowId(workflowTemplate, sourceCycle.workflowMetadata);
    state.workflowMetadata = createInitialCycleMetadata(workflowId, targetDate, now);
    state.isWorkflowActive = true;
    state.workflowTemplate = workflowTemplate || getWorkflowTemplateById(workflowId) || undefined;
    return;
  }
  state.workflowMetadata = undefined;
  state.isWorkflowActive = false;
  state.workflowTemplate = undefined;
};

/** Resets the in-memory cycle to a fresh rollover derived from the requested source. */
export const applyRolloverFromPreviousCycle = (
  state: ForecastState,
  args: ApplyRolloverArgs,
  now: string,
  createEmptyDay: (day: DayType, timestamp: string) => NonNullable<ForecastCycle['days'][DayType]>,
) => {
  clearHistory(state);
  state.discussionDraftsByScope = {};
  state.forecastCycle = buildRolloverCycle({ ...args, now, createEmptyDay });
  state.isSaved = false;
  state.outlookVersionSnapshots = [];
  applyRolloverWorkflowState(state, args, now);
};
