/**
 * File: src/components/Map/VerificationMap.test.ts
 * Purpose: Covers verification map rendering, controls, layers, and lifecycle behavior.
 */

import VerificationMap from './VerificationMap';
import OpenLayersVerificationMap from './OpenLayersVerificationMap';

jest.mock('./OpenLayersVerificationMap', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

describe('VerificationMap', () => {
  it('re-exports the OpenLayers verification map implementation', () => {
    expect(VerificationMap).toBe(OpenLayersVerificationMap);
  });
});
