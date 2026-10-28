import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ForecastTransferModal from './ForecastTransferModal';
import type { DayType } from '../../types/outlooks';
import { exportForecastTransfer, importForecastTransfer } from '../../utils/forecastTransfer';

jest.mock('../../utils/forecastTransfer', () => ({
  exportForecastTransfer: jest.fn(),
  importForecastTransfer: jest.fn(),
}));

jest.mock('../../config/featureExposure', () => ({ isFeatureExposed: () => true }));

jest.mock('../ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

jest.mock('../ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { value: string; children: React.ReactNode }) => <div>{children}</div>,
}));

const mockedExportForecastTransfer = exportForecastTransfer as jest.MockedFunction<typeof exportForecastTransfer>;
const mockedImportForecastTransfer = importForecastTransfer as jest.MockedFunction<typeof importForecastTransfer>;

describe('ForecastTransferModal review regressions', () => {
  beforeEach(() => jest.clearAllMocks());

  test('does not show warnings when workspace ownership rejects the import', async () => {
    const warning = 'Import note from the rejected file';
    const onError = jest.fn();
    mockedImportForecastTransfer.mockResolvedValue({
      forecastCycle: { cycleDate: '2026-04-21', currentDay: 1 as DayType, days: {} },
      workspaceId: 'custom',
      warnings: [warning],
      format: 'json',
    } as Awaited<ReturnType<typeof importForecastTransfer>>);
    render(
      <ForecastTransferModal
        open
        direction="import"
        onDirectionChange={jest.fn()}
        onClose={jest.fn()}
        forecastCycle={{ cycleDate: '2026-04-21', currentDay: 1, days: {} }}
        mapView={{ center: [0, 0], zoom: 4 }}
        isWorkflowActive={false}
        isBusy={false}
        onBusyChange={jest.fn()}
        onImported={jest.fn()}
        onExported={jest.fn()}
        onError={onError}
        workspaceId="severe"
      />,
    );

    fireEvent.change(screen.getByLabelText(/Choose a forecast file/), {
      target: { files: [new File(['{}'], 'custom.json')] },
    });

    await waitFor(() => expect(onError).toHaveBeenCalledWith(
      'This forecast belongs to the custom workspace. Open it there before importing it.',
    ));
    expect(screen.queryByText(warning)).not.toBeInTheDocument();
  });

  test('falls back to an available format before exporting after the workspace changes', async () => {
    mockedExportForecastTransfer.mockResolvedValue(undefined as never);
    const onExported = jest.fn();
    const props = {
      open: true,
      direction: 'export' as const,
      onDirectionChange: jest.fn(),
      onClose: jest.fn(),
      forecastCycle: { cycleDate: '2026-04-21', currentDay: 1 as DayType, days: {} },
      mapView: { center: [0, 0] as [number, number], zoom: 4 },
      isWorkflowActive: false,
      isBusy: false,
      onBusyChange: jest.fn(),
      onImported: jest.fn(),
      onExported,
      workspaceId: 'severe' as const,
    };
    const { rerender } = render(<ForecastTransferModal {...props} />);

    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'kml' } });
    rerender(<ForecastTransferModal {...props} workspaceId="tropical" />);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => expect(mockedExportForecastTransfer).toHaveBeenCalled());
    expect(mockedExportForecastTransfer.mock.calls[0][0]).toMatchObject({ format: 'json' });
    expect(onExported).toHaveBeenCalledWith('json', 'cycle');
  });
});
