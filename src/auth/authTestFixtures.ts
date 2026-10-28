import type { OverlaysState } from '../store/overlaysSlice';

/** Shared overlay baseline used by auth settings and provider tests. */
export const TEST_OVERLAY_STATE: OverlaysState = {
  baseMapStyle: 'osm',
  stateBorders: true,
  counties: false,
  ghostOutlooks: {
    tornado: false,
    wind: false,
    hail: false,
    categorical: false,
    totalSevere: false,
    'day4-8': false,
  },
  outlookTrimStrategy: 'us-country-minus-great-lakes',
  outlookTrimAutoOnDraw: false,
  outlookTrimPreviewOnly: false,
};
