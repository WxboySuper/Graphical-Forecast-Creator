/**
 * File: src/components/Map/VerificationMap.tsx
 * Purpose: Renders the verification map and coordinates verification layers, controls, and map state.
 */

import OLMap from 'ol/Map';
import OpenLayersVerificationMap from './OpenLayersVerificationMap';
import type { MapAdapterHandle } from '../../maps/contracts';

export type VerificationMapHandle = MapAdapterHandle<OLMap>;

export default OpenLayersVerificationMap;
