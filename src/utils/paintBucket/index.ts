/**
 * Paint bucket utilities. Exports geometry and state helpers for applying one forecast category across a map region.
 */
export { applyPaintBucketStrategy, resolveTargetProbability } from './applyPaintBucketStrategy';
export {
  isPaintBucketOutlookType,
  resolvePaintBucketEditAction,
} from './outlookScope';
export {
  PAINT_BUCKET_MODES,
  type PaintBucketEditAction,
  type PaintBucketEditRequest,
  type PaintBucketEditResult,
  type PaintBucketMode,
  type PaintBucketStepDirection,
} from './types';