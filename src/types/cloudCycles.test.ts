import type { CloudCycleMetadata } from './cloudCycles';

describe('types/cloudCycles', () => {
  it('accepts valid cloud cycle metadata', () => {
    const meta: CloudCycleMetadata = {
      id: 'cycle-1',
      userId: 'user-1',
      label: 'Test Cycle',
      createdAt: '2026-03-27T06:00:00Z',
      updatedAt: '2026-03-27T06:00:00Z',
      cycleDate: '2026-03-27',
      forecastDays: 1,
      totalOutlooks: 2,
      totalFeatures: 3,
      isReadOnly: false,
    };
    expect(meta.id).toBe('cycle-1');
    expect(meta.label).toBe('Test Cycle');
    expect(meta.createdAt).toBe('2026-03-27T06:00:00Z');
    expect(meta.updatedAt).toBe('2026-03-27T06:00:00Z');
    expect(meta.forecastDays).toBe(1);
    expect(meta.totalOutlooks).toBe(2);
    expect(meta.totalFeatures).toBe(3);
    expect(meta.isReadOnly).toBe(false);
  });

  it('accepts partial required fields', () => {
    const meta: CloudCycleMetadata = {
      id: 'cycle-2',
      userId: 'user-1',
      label: 'Test',
      createdAt: '2026-03-27T06:00:00Z',
      updatedAt: '2026-03-27T06:00:00Z',
      cycleDate: '2026-03-27',
      forecastDays: 1,
      totalOutlooks: 0,
      totalFeatures: 0,
      isReadOnly: true,
    };
    expect(meta.id).toBe('cycle-2');
    expect(meta.isReadOnly).toBe(true);
  });

  it('accepts optional payloadHash field', () => {
    const meta: CloudCycleMetadata = {
      id: 'cycle-3',
      userId: 'user-1',
      label: 'Test',
      createdAt: '2026-03-27T06:00:00Z',
      updatedAt: '2026-03-27T06:00:00Z',
      cycleDate: '2026-03-27',
      forecastDays: 1,
      totalOutlooks: 0,
      totalFeatures: 0,
      isReadOnly: false,
      payloadHash: 'abc123',
    };
    expect(meta.payloadHash).toBe('abc123');
  });

  it('allows isReadOnly to be false', () => {
    const meta: CloudCycleMetadata = {
      id: 'cycle-4',
      userId: 'user-1',
      label: 'Editable Cycle',
      createdAt: '2026-03-27T06:00:00Z',
      updatedAt: '2026-03-27T06:00:00Z',
      cycleDate: '2026-03-27',
      forecastDays: 3,
      totalOutlooks: 5,
      totalFeatures: 10,
      isReadOnly: false,
    };
    expect(meta.isReadOnly).toBe(false);
  });
});
