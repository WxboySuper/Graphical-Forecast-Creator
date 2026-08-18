import type OLMap from 'ol/Map';
import type VectorLayer from 'ol/layer/Vector';
import type { AppDispatch } from '../../store';
import { applyPaintBucketEdit } from '../../store/forecastSlice';
import type { OutlookType } from '../../types/outlooks';
import { getAvailableProbabilities } from '../OutlookPanel/outlookPanelUtils';
import {
  isPaintBucketOutlookType,
  resolvePaintBucketEditAction,
  type PaintBucketMode,
} from '../../utils/paintBucket';
import { getFeatureIdentity } from './openLayersMapStyles';
import type { EditableOutlookType } from './openLayersMapStyles';
import { pickTopmostPaintBucketFeature } from './pickTopmostPaintBucketFeature';

interface PaintBucketClickInput {
  map: OLMap;
  pixel: number[];
  vectorLayer: VectorLayer | null;
  dispatch: AppDispatch;
  outlookType: OutlookType;
  currentDay: number;
  mode: PaintBucketMode;
  shiftKey: boolean;
}

/** Handles a paint-bucket click on an existing probabilistic polygon. */
export const handlePaintBucketMapClick = ({
  map,
  pixel,
  vectorLayer,
  dispatch,
  outlookType,
  currentDay,
  mode,
  shiftKey,
}: PaintBucketClickInput): boolean => {
  if (!isPaintBucketOutlookType(outlookType)) {
    return false;
  }

  const feature = pickTopmostPaintBucketFeature(map, pixel, vectorLayer);
  if (!feature) {
    return false;
  }

  const identity = getFeatureIdentity(feature);
  if (!identity || !isPaintBucketOutlookType(identity.outlookType)) {
    return false;
  }

  const probabilityList = getAvailableProbabilities(outlookType, currentDay);
  if (probabilityList.length === 0) {
    return false;
  }

  dispatch(applyPaintBucketEdit({
    outlookType: identity.outlookType as EditableOutlookType,
    featureId: identity.featureId,
    fromProbability: identity.probability,
    action: resolvePaintBucketEditAction(mode, shiftKey),
    probabilityList,
  }));

  return true;
};
