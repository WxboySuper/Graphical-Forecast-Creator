import type { Feature } from 'geojson';
import OLMap from 'ol/Map';
import OpenLayersForecastMap from './OpenLayersForecastMap';
import type { MapAdapterHandle } from '../../maps/contracts';

export type ForecastMapHandle = MapAdapterHandle<OLMap>;

export type ForecastMapProps = {
  tstmPreviewFeatures?: Feature[];
};

export default OpenLayersForecastMap;
export type { ForecastMapProps as OpenLayersForecastMapProps };
