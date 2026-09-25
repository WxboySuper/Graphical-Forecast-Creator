import { getCloudLibraryTabs, getCloudCycleWorkspaceId, getCloudCycleWorkspaceLabel, filterCloudCyclesByWorkspace, getNextCloudLibraryTabId, getCloudLibraryTabFromSearchParams, type CloudLibraryTabId } from './cloudLibraryWorkspace';
import type { BuildTarget } from '../config/buildTarget';
import type { CloudCycleMetadata } from '../types/cloudCycles';

const makeCycle = (id: string, workspaceId?: CloudCycleMetadata['workspaceId']): CloudCycleMetadata => ({
  id,
  userId: 'user-1',
  workspaceId,
  label: id,
  cycleDate: '2026-09-08',
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
  forecastDays: 1,
  totalOutlooks: 1,
  totalFeatures: 1,
  isReadOnly: false,
});

describe('cloud library workspace boundaries', () => {
  it('keeps legacy metadata in Severe but refuses to claim an unknown workspace', () => {
    expect(getCloudCycleWorkspaceId(makeCycle('legacy'))).toBe('severe');
    expect(getCloudCycleWorkspaceId(makeCycle('malformed', 'not-a-workspace' as CloudCycleMetadata['workspaceId']))).toBeNull();
    expect(getCloudCycleWorkspaceId(makeCycle('wrong-case', 'Severe' as CloudCycleMetadata['workspaceId']))).toBeNull();
    expect(getCloudCycleWorkspaceId(makeCycle('valid', 'custom'))).toBe('custom');
  });

  it('filters cycles without changing the source list', () => {
    const cycles = [makeCycle('legacy'), makeCycle('custom', 'custom'), makeCycle('mesoscale', 'mesoscale')];

    expect(filterCloudCyclesByWorkspace(cycles, 'severe').map((cycle) => cycle.id)).toEqual(['legacy']);
    expect(filterCloudCyclesByWorkspace(cycles, 'custom').map((cycle) => cycle.id)).toEqual(['custom']);
    expect(filterCloudCyclesByWorkspace(cycles, 'all')).toBe(cycles);
  });

  it('keeps a cycle with an unknown owner visible in All but in no workspace tab', () => {
    const cycles = [
      makeCycle('legacy'),
      makeCycle('custom', 'custom'),
      makeCycle('rogue', 'not-a-workspace' as CloudCycleMetadata['workspaceId']),
    ];

    expect(filterCloudCyclesByWorkspace(cycles, 'all').map((cycle) => cycle.id)).toEqual(['legacy', 'custom', 'rogue']);
    expect(filterCloudCyclesByWorkspace(cycles, 'severe').map((cycle) => cycle.id)).toEqual(['legacy']);
    expect(filterCloudCyclesByWorkspace(cycles, 'custom').map((cycle) => cycle.id)).toEqual(['custom']);
  });

  it('creates All and exposed product tabs with counts', () => {
    const cycles = [makeCycle('legacy'), makeCycle('custom', 'custom'), makeCycle('mesoscale', 'mesoscale')];

    expect(getCloudLibraryTabs(cycles, 'local')).toEqual([
      { id: 'all', label: 'All', cycleCount: 3 },
      { id: 'severe', label: 'Severe', cycleCount: 1 },
      { id: 'custom', label: 'Custom', cycleCount: 1 },
    ]);
  });

  it.each([['local'], ['production']] as Array<[BuildTarget]>)(
    'keeps gated and future saves in All without dedicated tabs on %s',
    (target) => {
      const cycles = [
        makeCycle('severe-1', 'severe'),
        makeCycle('legacy'),
        makeCycle('custom-1', 'custom'),
        makeCycle('meso-1', 'mesoscale'),
        makeCycle('trop-1', 'tropical'),
        makeCycle('winter-1', 'winter'),
      ];

      expect(getCloudLibraryTabs(cycles, target)).toEqual([
        { id: 'all', label: 'All', cycleCount: 6 },
        { id: 'severe', label: 'Severe', cycleCount: 2 },
        { id: 'custom', label: 'Custom', cycleCount: 1 },
      ]);
      expect(filterCloudCyclesByWorkspace(cycles, 'all')).toHaveLength(6);
    },
  );

  it('labels every cycle by its resolved workspace', () => {
    expect(getCloudCycleWorkspaceLabel(makeCycle('legacy'))).toBe('Severe');
    expect(getCloudCycleWorkspaceLabel(makeCycle('malformed', 'not-a-workspace' as CloudCycleMetadata['workspaceId']))).toBe('Unknown workspace');
    expect(getCloudCycleWorkspaceLabel(makeCycle('severe-1', 'severe'))).toBe('Severe');
    expect(getCloudCycleWorkspaceLabel(makeCycle('custom-1', 'custom'))).toBe('Custom');
    expect(getCloudCycleWorkspaceLabel(makeCycle('meso-1', 'mesoscale'))).toBe('Mesoscale');
    expect(getCloudCycleWorkspaceLabel(makeCycle('trop-1', 'tropical'))).toBe('Tropical');
  });

  it('resolves arrow, home, and end keys across tabs', () => {
    const tabs = [
      { id: 'all' as const, label: 'All', cycleCount: 2 },
      { id: 'severe' as const, label: 'Severe', cycleCount: 1 },
      { id: 'custom' as const, label: 'Custom', cycleCount: 1 },
    ];

    expect(getNextCloudLibraryTabId(tabs, 'all', 'ArrowRight')).toBe('severe');
    expect(getNextCloudLibraryTabId(tabs, 'custom', 'ArrowRight')).toBe('all');
    expect(getNextCloudLibraryTabId(tabs, 'all', 'ArrowLeft')).toBe('custom');
    expect(getNextCloudLibraryTabId(tabs, 'custom', 'Home')).toBe('all');
    expect(getNextCloudLibraryTabId(tabs, 'all', 'End')).toBe('custom');
    expect(getNextCloudLibraryTabId(tabs, 'severe', 'Enter')).toBeNull();
    expect(getNextCloudLibraryTabId([], 'all', 'ArrowRight')).toBeNull();
  });

  it('falls back to the first tab when arrow navigation starts from an unknown tab', () => {
    const tabs = [
      { id: 'all' as const, label: 'All', cycleCount: 2 },
      { id: 'severe' as const, label: 'Severe', cycleCount: 1 },
      { id: 'custom' as const, label: 'Custom', cycleCount: 1 },
    ];

    expect(getNextCloudLibraryTabId(tabs, 'missing' as unknown as CloudLibraryTabId, 'ArrowRight')).toBe('severe');
    expect(getNextCloudLibraryTabId(tabs, 'missing' as unknown as CloudLibraryTabId, 'ArrowLeft')).toBe('custom');
  });

  it('accepts only tabs present in the current exposed tab set', () => {
    const tabs = getCloudLibraryTabs([makeCycle('legacy')], 'production');

    expect(getCloudLibraryTabFromSearchParams(new URLSearchParams('workspace=custom'), tabs)).toBe('custom');
    expect(getCloudLibraryTabFromSearchParams(new URLSearchParams('workspace=mesoscale'), tabs)).toBe('all');
    expect(getCloudLibraryTabFromSearchParams(new URLSearchParams('workspace=unknown'), tabs)).toBe('all');
  });
});
