import { fireEvent, render, screen } from '@testing-library/react';
import type { MesoscaleCatalogParameter } from '../mesoscale';
import { LayerPanel } from '../components/Mesoscale/LayerPanel';
import { FEATURE_EXPOSURE_REGISTRY, isFeatureExposedOnTarget } from '../config/featureExposure';
import { BUILD_TARGETS, type BuildTarget } from '../config/buildTarget';

const STP_PARAMETER: MesoscaleCatalogParameter = {
  id: 'stp-fixed-surface',
  displayName: 'Significant Tornado Parameter (fixed layer)',
  units: '1',
  level: { type: 'layer', label: 'surface-based fixed layer' },
  legend: [{ value: 0, label: '0' }, { value: 1, label: '1' }],
  displayType: 'raster',
  data: {
    type: 'xyz-raster',
    urlTemplate: '/stp/{z}/{x}/{y}.png',
    format: 'image/png',
    projection: 'EPSG:3857',
    minZoom: 3,
    maxZoom: 5,
  },
  source: { providerId: 'noaa-open-data', providerName: 'NOAA', datasetId: 'hrrr', attribution: 'NOAA' },
  status: 'complete',
};

describe('mesoscale derived parameter exposure', () => {
  const originalTarget = globalThis.__GFC_BUILD_TARGET__;

  afterEach(() => {
    globalThis.__GFC_BUILD_TARGET__ = originalTarget;
  });

  test.each(BUILD_TARGETS)('%s layer list follows the fail-closed exposure matrix', (target: BuildTarget) => {
    globalThis.__GFC_BUILD_TARGET__ = target;
    const exposed = isFeatureExposedOnTarget('mesoscaleDerivedParameters', target);
    const onChange = jest.fn();
    render(<LayerPanel parameters={[STP_PARAMETER]} layers={[]} onChange={onChange} />);

    const layer = screen.queryByRole('button', { name: /significant tornado parameter \(fixed layer\)/i });
    expect(Boolean(layer)).toBe(exposed);
    if (exposed) {
      fireEvent.click(layer!);
      expect(onChange).toHaveBeenCalledWith([{ id: 'stp-fixed-surface', opacity: expect.any(Number) }]);
    }
    expect(FEATURE_EXPOSURE_REGISTRY.mesoscaleDerivedParameters.exposure[target]).toBe(exposed);
  });
});
