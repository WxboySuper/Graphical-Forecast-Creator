/**
 * Mesoscale legend tests: ramps and end labels come from the catalog, and a
 * parameter without a legend still renders instead of crashing the workspace.
 */
import { render, screen } from '@testing-library/react';
import type { MesoscaleCatalogParameter } from '../../mesoscale';
import { MesoscaleLegend } from './MesoscaleLegend';

const parameter = (overrides: Partial<MesoscaleCatalogParameter>): MesoscaleCatalogParameter => ({
  id: 'cape-surface',
  displayName: 'CAPE (surface)',
  units: 'J kg-1',
  legend: [{ value: 0, label: '0', color: '#fff7bc' }, { value: 5000, label: '5000', color: '#7f0000' }],
  ...overrides,
} as MesoscaleCatalogParameter);

describe('MesoscaleLegend', () => {
  it('shows the name, units, and end values from the catalog', () => {
    render(<MesoscaleLegend parameters={[parameter({})]} />);
    expect(screen.getByText('CAPE (surface)')).toBeInTheDocument();
    expect(screen.getByText('(J kg-1)')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('5000')).toBeInTheDocument();
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(<MesoscaleLegend parameters={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not crash when a parameter omits its legend', () => {
    const missing = parameter({ legend: undefined as unknown as MesoscaleCatalogParameter['legend'] });
    render(<MesoscaleLegend parameters={[missing]} />);
    expect(screen.getByText('CAPE (surface)')).toBeInTheDocument();
  });
});
