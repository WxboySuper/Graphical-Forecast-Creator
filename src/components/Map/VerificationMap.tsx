/**
 * Verification-map compatibility barrel. Re-exports the OpenLayers verification
 * map and its adapter-backed handle type for existing consumers.
 */
import OLMap from 'ol/Map';
import OpenLayersVerificationMap from './OpenLayersVerificationMap';
import type { MapAdapterHandle } from '../../maps/contracts';

export type VerificationMapHandle = MapAdapterHandle<OLMap>;

export default OpenLayersVerificationMap;