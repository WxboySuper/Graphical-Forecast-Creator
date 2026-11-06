/**
 * Forecast-map compatibility barrel. Re-exports the OpenLayers forecast map and
 * its adapter-backed prop and handle types for existing consumers.
 */
import type { ComponentProps } from 'react';
import OLMap from 'ol/Map';
import OpenLayersForecastMap from './OpenLayersForecastMap';
import type { MapAdapterHandle } from '../../maps/contracts';

export type ForecastMapHandle = MapAdapterHandle<OLMap>;
export type ForecastMapProps = ComponentProps<typeof OpenLayersForecastMap>;

export default OpenLayersForecastMap;
export type { ForecastMapProps as OpenLayersForecastMapProps };