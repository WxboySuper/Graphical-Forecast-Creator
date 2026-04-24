import { fireEvent, render, screen } from '@testing-library/react';
import RecentCycles from './RecentCycles';
import type { SavedCycle } from '../../store/forecastSlice';

const makeCycle = (id: string, label = ''): SavedCycle => ({
  id,
  cycleDate: `2026-04-${id.padStart(2, '0')}`,
  timestamp: '2026-04-24T12:00:00.000Z',
  label,
  version: '1',
  stats: {
    forecastDays: 1,
    totalFeatures: 0,
    outlookTypes: [],
  },
  data: {} as never,
});

describe('RecentCycles', () => {
  test('renders compact empty state and compact rows', () => {
    const onLoad = jest.fn();
    const onOpenHistory = jest.fn();
    const { rerender } = render(
      <RecentCycles savedCycles={[]} onLoad={onLoad} onOpenHistory={onOpenHistory} variant="compact" />
    );

    expect(screen.getByText(/Saved local packages/i)).toBeInTheDocument();

    rerender(
      <RecentCycles
        savedCycles={[makeCycle('1', 'Morning'), makeCycle('2'), makeCycle('3'), makeCycle('4'), makeCycle('5')]}
        onLoad={onLoad}
        onOpenHistory={onOpenHistory}
        variant="compact"
      />
    );

    expect(screen.getAllByText('Resume')).toHaveLength(4);
    fireEvent.click(screen.getByText('View Full History'));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Morning'));
    expect(onLoad).toHaveBeenCalled();
  });

  test('renders section tiles, all-history affordance, and empty section as null', () => {
    const onLoad = jest.fn();
    const onOpenHistory = jest.fn();
    const { container, rerender } = render(
      <RecentCycles savedCycles={[]} onLoad={onLoad} onOpenHistory={onOpenHistory} />
    );

    expect(container).toBeEmptyDOMElement();

    rerender(
      <RecentCycles
        savedCycles={[1, 2, 3, 4, 5, 6, 7].map((id) => makeCycle(String(id), id === 1 ? 'Labeled' : ''))}
        onLoad={onLoad}
        onOpenHistory={onOpenHistory}
      />
    );

    expect(screen.getByText('Recent Local Cycles')).toBeInTheDocument();
    expect(screen.getByText('Labeled')).toBeInTheDocument();
    fireEvent.click(screen.getByText('View All 7 Cycles'));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });
});
