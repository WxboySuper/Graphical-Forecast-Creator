import * as turf from '@turf/turf';
import { buildLandMask } from './buildLandMask';
import { trimOutlookDataInPlace } from './trimOutlookData';
import { loadVendoredBoundaryGeoBundle } from './loadVendoredBoundaryGeoBundle';

describe('trimOutlookDataInPlace', () => {
  const boundaries = loadVendoredBoundaryGeoBundle();
  const landMask = buildLandMask('us-country-minus-great-lakes', boundaries);

  test('skips auto-generated categorical polygons', () => {
    if (!landMask) {
      throw new Error('Expected land mask');
    }

    const outlookData = {
      categorical: new Map([
        [
          'SLGT',
          [
            {
              type: 'Feature',
              id: 'auto-cat',
              geometry: turf.polygon([
                [
                  [-90, 28],
                  [-88, 28],
                  [-88, 30],
                  [-90, 30],
                  [-90, 28],
                ],
              ]).geometry,
              properties: {
                outlookType: 'categorical',
                probability: 'SLGT',
                isSignificant: false,
                derivedFrom: 'auto-generated',
              },
            },
          ],
        ],
      ]),
      tornado: new Map([
        [
          '5%',
          [
            {
              type: 'Feature',
              id: 'manual',
              geometry: turf.polygon([
                [
                  [-90, 28],
                  [-88, 28],
                  [-88, 30],
                  [-90, 30],
                  [-90, 28],
                ],
              ]).geometry,
              properties: {
                outlookType: 'tornado',
                probability: '5%',
                isSignificant: false,
              },
            },
          ],
        ],
      ]),
    };

    const result = trimOutlookDataInPlace(outlookData, landMask, 'us-country-minus-great-lakes');
    expect(result.skippedCount).toBe(1);
    expect(result.trimmedCount).toBe(1);
    expect(outlookData.categorical?.get('SLGT')?.[0].id).toBe('auto-cat');
  });
});
