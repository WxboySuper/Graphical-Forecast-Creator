import * as turf from '@turf/turf';
import { buildLandMask } from './buildLandMask';
import { clipOutlookToLandMask } from './clipOutlookPolygon';
import { findGreatLakes } from './geoBoundaryFeatures';
import { loadVendoredBoundaryGeoBundle } from './loadVendoredBoundaryGeoBundle';
import type { LandMaskStrategy } from './types';

type StrategyBenchmark = {
  strategy: LandMaskStrategy;
  buildDurationMs: number;
  gulfRemovedAreaRatio: number;
  inlandRetainedAreaRatio: number;
};

/** Runs the prototype land-mask strategies for comparative test coverage. */
const benchmarkLandMaskStrategies = (): StrategyBenchmark[] => {
  const boundaries = loadVendoredBoundaryGeoBundle();
  const strategies: LandMaskStrategy[] = [
    'us-country',
    'us-country-minus-great-lakes',
    'us-states-union',
  ];

  const gulfOutlook = turf.polygon([
    [
      [-90, 28],
      [-88, 28],
      [-88, 30],
      [-90, 30],
      [-90, 28],
    ],
  ]);

  const inlandOutlook = turf.polygon([
    [
      [-97, 35],
      [-96, 35],
      [-96, 36],
      [-97, 36],
      [-97, 35],
    ],
  ]);

  return strategies.map((strategy) => {
    const start = performance.now();
    const landMask = buildLandMask(strategy, boundaries);
    const buildDurationMs = performance.now() - start;

    if (!landMask) {
      return {
        strategy,
        buildDurationMs,
        gulfRemovedAreaRatio: 1,
        inlandRetainedAreaRatio: 0,
      };
    }

    const gulfClip = clipOutlookToLandMask(gulfOutlook, landMask, strategy);
    const inlandClip = clipOutlookToLandMask(inlandOutlook, landMask, strategy);
    const inlandArea = turf.area(inlandOutlook);
    const inlandRetainedAreaRatio =
      inlandClip.feature && inlandArea > 0
        ? turf.area(inlandClip.feature) / inlandArea
        : 0;

    return {
      strategy,
      buildDurationMs,
      gulfRemovedAreaRatio: gulfClip.removedAreaRatio,
      inlandRetainedAreaRatio,
    };
  });
};

describe('outlookPolygonMasking prototype', () => {
  const boundaries = loadVendoredBoundaryGeoBundle();

  test('vendored Great Lakes names are discoverable in CONUS bbox', () => {
    const names = findGreatLakes(boundaries.lakes)
      .map((feature) => (feature.properties as { name?: string }).name)
      .sort();
    expect(names).toEqual([
      'Lake Erie',
      'Lake Huron',
      'Lake Michigan',
      'Lake Ontario',
      'Lake Superior',
    ]);
  });

  test('prototype A — country-minus-lakes removes Gulf water but keeps Oklahoma land', () => {
    const landMask = buildLandMask('us-country-minus-great-lakes', boundaries);
    expect(landMask).not.toBeNull();

    const gulfOutlook = turf.polygon([
      [
        [-90, 28],
        [-88, 28],
        [-88, 30],
        [-90, 30],
        [-90, 28],
      ],
    ]);
    const inlandOutlook = turf.polygon([
      [
        [-97, 35],
        [-96, 35],
        [-96, 36],
        [-97, 36],
        [-97, 35],
      ],
    ]);

    const gulfClip = clipOutlookToLandMask(
      gulfOutlook,
      landMask!,
      'us-country-minus-great-lakes',
    );
    const inlandClip = clipOutlookToLandMask(
      inlandOutlook,
      landMask!,
      'us-country-minus-great-lakes',
    );

    expect(gulfClip.removedAreaRatio).toBeGreaterThan(0.5);
    expect(inlandClip.feature).not.toBeNull();
    expect(inlandClip.removedAreaRatio).toBeLessThan(0.05);
  });

  test('prototype B — states-union retains inland geometry (coarser coast, includes some lake area)', () => {
    const landMask = buildLandMask('us-states-union', boundaries);
    expect(landMask).not.toBeNull();

    const inlandOutlook = turf.polygon([
      [
        [-97, 35],
        [-96, 35],
        [-96, 36],
        [-97, 36],
        [-97, 35],
      ],
    ]);

    const inlandClip = clipOutlookToLandMask(
      inlandOutlook,
      landMask!,
      'us-states-union',
    );
    expect(inlandClip.removedAreaRatio).toBeLessThan(0.05);
  });

  test('strategy benchmark documents relative build cost and clipping behavior', () => {
    const benchmarks = benchmarkLandMaskStrategies();
    expect(benchmarks).toHaveLength(3);

    benchmarks.forEach((entry) => {
      expect(entry.gulfRemovedAreaRatio).toBeGreaterThan(0.5);
      expect(entry.inlandRetainedAreaRatio).toBeGreaterThan(0.95);
    });

    const statesUnion = benchmarks.find((entry) => entry.strategy === 'us-states-union');
    const countryMask = benchmarks.find((entry) => entry.strategy === 'us-country');
    expect(statesUnion).toBeDefined();
    expect(countryMask).toBeDefined();
    expect(statesUnion!.buildDurationMs).toBeGreaterThan(countryMask!.buildDurationMs);
  });
});
