import { render, screen } from '@testing-library/react';
import { SourceLine } from './MonitorMesoscaleIntegration';

const mockDemo = jest.fn();
jest.mock('../../mesoscale/fixtures/client', () => ({
  ...jest.requireActual('../../mesoscale/fixtures/client'),
  isMesoscaleDemoData: () => mockDemo(),
}));

const source = { providerId: 'noaa-open-data', providerName: 'NOAA Open Data on AWS', datasetId: 'noaa-hrrr-bdp-pds', attribution: 'NOAA/NCEP HRRR', url: 'https://registry.opendata.aws/noaa-hrrr-bdp-pds/' };

describe('Monitor mesoscale source line', () => {
  it('links real data to its source', () => {
    mockDemo.mockReturnValue(false);
    render(<SourceLine source={source} />);
    expect(screen.getByRole('link', { name: 'NOAA/NCEP HRRR' })).toHaveAttribute('href', source.url);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('says so when attribution is missing', () => {
    mockDemo.mockReturnValue(false);
    render(<SourceLine />);
    expect(screen.getByText('Source attribution unavailable')).toBeInTheDocument();
  });

  it('shows one demo note and no source link for demo imagery', () => {
    mockDemo.mockReturnValue(true);
    render(<SourceLine source={source} />);
    expect(screen.getAllByRole('note')).toHaveLength(1);
    expect(screen.getByRole('note')).toHaveTextContent(/placeholder imagery/i);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
