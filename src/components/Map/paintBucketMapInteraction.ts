import type OLMap from 'ol/Map';
import type OLFeature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import type VectorLayer from 'ol/layer/Vector';
import type { AppDispatch } from '../../store';
import { applyPaintBucketEdit } from '../../store/forecastSlice';
import type { OutlookType } from '../../types/outlooks';
import { getAvailableProbabilities } from '../OutlookPanel/outlookPanelUtils';
import type { PaintBucketStrategy } from '../../utils/paintBucket';
import { getFeatureIdentity } from './openLayersMapStyles';
import type { EditableOutlookType } from './openLayersMapStyles';

interface PaintBucketClickInput {
  map: OLMap;
  pixel: number[];
  vectorLayer: VectorLayer | null;
  catLayer: VectorLayer | null;
  dispatch: AppDispatch;
  outlookType: OutlookType;
  currentDay: number;
  strategy: PaintBucketStrategy;
  shiftKey: boolean;
}

/** Resolves the strategy used for one fill click, allowing Shift to force step-down. */
export const resolveFillClickStrategy = (
  strategy: PaintBucketStrategy,
  shiftKey: boolean,
): PaintBucketStrategy => {
  if (shiftKey) {
    return 'step-down';
  }
  return strategy;
};

/** Handles a fill-mode map click by re-keying the topmost hit polygon. */
export const handlePaintBucketMapClick = ({
  map,
  pixel,
  vectorLayer,
  catLayer,
  dispatch,
  outlookType,
  currentDay,
  strategy,
  shiftKey,
}: PaintBucketClickInput): boolean => {
  const feature = map.forEachFeatureAtPixel(pixel, (candidate) => candidate, {
    layerFilter: (layer) => layer === vectorLayer || layer === catLayer,
  }) as OLFeature<Geometry> | undefined;

  if (!feature) {
    return false;
  }

  const hitOutlookType = feature.get('outlookType') as string | undefined;
  const derivedFrom = feature.get('derivedFrom') as string | undefined;
  if (hitOutlookType === 'categorical' && derivedFrom === 'auto-generated') {
    return false;
  }

  const identity = getFeatureIdentity(feature);
  if (!identity) {
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
    strategy: resolveFillClickStrategy(strategy, shiftKey),
    probabilityList,
  }));

  return true;
};
