import OLMap from 'ol/Map';
import OpenLayersForecastMap from './OpenLayersForecastMap';
import type { MapAdapterHandle } from '../../maps/contracts';

export type ForecastMapHandle = MapAdapterHandle<OLMap>;

export default OpenLayersForecastMap;
