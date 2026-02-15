import OLMap from 'ol/Map';
import OpenLayersVerificationMap from './OpenLayersVerificationMap';
import type { MapAdapterHandle } from '../../maps/contracts';

export type VerificationMapHandle = MapAdapterHandle<OLMap>;

export default OpenLayersVerificationMap;
