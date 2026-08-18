import type { OutlookType } from '../../types/outlooks';

/** Prototype strategies for issue #623 — selectable in local builds for comparison. */
export type PaintBucketStrategy =
  | 'recategorize'
  | 'step-up'
  | 'step-down'
  | 'subtract-overlap';

export const PAINT_BUCKET_STRATEGIES: readonly PaintBucketStrategy[] = [
  'recategorize',
  'step-up',
  'step-down',
  'subtract-overlap',
] as const;

export const PAINT_BUCKET_STRATEGY_STORAGE_KEY = 'gfc_paint_bucket_strategy';

export const DEFAULT_PAINT_BUCKET_STRATEGY: PaintBucketStrategy = 'recategorize';

export interface PaintBucketEditRequest {
  outlookType: OutlookType;
  featureId: string;
  fromProbability: string;
  strategy: PaintBucketStrategy;
  activeProbability: string;
  probabilityList: readonly string[];
}

export interface PaintBucketEditResult {
  changed: boolean;
  targetProbability?: string;
  map: Map<string, import('geojson').Feature[]>;
}
