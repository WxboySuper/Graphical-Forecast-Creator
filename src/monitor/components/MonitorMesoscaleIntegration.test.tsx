import { currentCatalogDisplay } from './MonitorMesoscaleIntegration';
import type { MesoscaleCatalogParameter, MesoscaleLayerSpec } from '../../mesoscale';

const layers = [{ id: 'cape' }] as MesoscaleLayerSpec[];
const legend = [{ id: 'cape' }] as MesoscaleCatalogParameter[];

test('only forwards current catalog layers and legend to the map', () => {
  expect(currentCatalogDisplay(null, layers, legend)).toEqual({ layers, legend });
  expect(currentCatalogDisplay('stale', layers, legend)).toEqual({ layers: [], legend: [] });
  expect(currentCatalogDisplay('upstream-failure', layers, legend)).toEqual({ layers: [], legend: [] });
});
