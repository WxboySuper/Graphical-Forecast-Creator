import { fireEvent, render, screen } from '@testing-library/react';
import { MonitorMesoscaleLegend } from './MonitorMesoscaleLegend';
import type { MesoscaleCatalogParameter } from '../../mesoscale';

const parameter = {
  id: 'cape',
  displayName: 'CAPE',
  units: 'J/kg',
  legend: [{ color: '#fff', label: '0' }, { color: '#000', label: '3000' }],
} as MesoscaleCatalogParameter;

test('lets the map legend collapse and expand', () => {
  render(<MonitorMesoscaleLegend parameters={[parameter]} />);

  const toggle = screen.getByRole('button', { name: 'Hide legend' });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText(/CAPE/)).toBeInTheDocument();

  fireEvent.click(toggle);
  expect(screen.getByRole('button', { name: 'Show legend' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText(/CAPE/)).not.toBeInTheDocument();
});
