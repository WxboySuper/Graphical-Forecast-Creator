import {
  CLOUD_CYCLE_META_KEY,
  CLOUD_CYCLE_PAYLOAD_KEY,
  clearCloudSessionStorage,
  getCloudSessionStorageKey,
  migrateLegacyCloudSessionStorage,
} from './cloudSessionStorage';

const validForecast = () => ({
  version: '1.0.0',
  type: 'forecast-cycle',
  timestamp: '2026-09-08T00:00:00.000Z',
  forecastCycle: { days: {}, currentDay: 1, cycleDate: '2026-09-08' },
  mapView: { center: [0, 0], zoom: 0 },
});

describe('cloud session storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('scopes pending handoffs by workspace and account', () => {
    expect(getCloudSessionStorageKey({ baseKey: CLOUD_CYCLE_PAYLOAD_KEY, scope: { workspaceId: 'severe' } })).toBe(
      'cloudCyclePayload:severe:anonymous',
    );
    expect(getCloudSessionStorageKey({ baseKey: CLOUD_CYCLE_PAYLOAD_KEY, scope: { workspaceId: 'custom' } })).toBe(
      'cloudCyclePayload:custom:anonymous',
    );
    expect(getCloudSessionStorageKey({ baseKey: CLOUD_CYCLE_PAYLOAD_KEY, scope: { userId: 'user-1', workspaceId: 'severe' } })).toBe(
      'cloudCyclePayload:severe:user-user-1',
    );
  });

  test('clearing one workspace leaves every other staged handoff in place', () => {
    sessionStorage.setItem('cloudCyclePayload:severe:anonymous', 'severe-payload');
    sessionStorage.setItem('cloudCycleMeta:severe:anonymous', 'severe-meta');
    sessionStorage.setItem('cloudCyclePayload:custom:anonymous', 'custom-payload');
    sessionStorage.setItem('cloudCycleMeta:custom:anonymous', 'custom-meta');
    sessionStorage.setItem('cloudCyclePayload', 'pre-workspace-payload');

    clearCloudSessionStorage({ workspaceId: 'severe' });

    expect(sessionStorage.getItem('cloudCyclePayload:severe:anonymous')).toBeNull();
    expect(sessionStorage.getItem('cloudCycleMeta:severe:anonymous')).toBeNull();
    // An unscoped value that will not classify cannot be attributed to Severe,
    // so clearing Severe leaves it alone.
    expect(sessionStorage.getItem('cloudCyclePayload')).toBe('pre-workspace-payload');
    expect(sessionStorage.getItem('cloudCyclePayload:custom:anonymous')).toBe('custom-payload');
    expect(sessionStorage.getItem('cloudCycleMeta:custom:anonymous')).toBe('custom-meta');
  });

  test('clearing Severe keeps an unscoped handoff owned by Custom', () => {
    const payload = JSON.stringify({ schemaVersion: 1, workspaceId: 'custom', forecast: validForecast() });
    const meta = JSON.stringify({ id: 'custom-1', label: 'Custom save' });
    sessionStorage.setItem(CLOUD_CYCLE_PAYLOAD_KEY, payload);
    sessionStorage.setItem(CLOUD_CYCLE_META_KEY, meta);

    clearCloudSessionStorage({ workspaceId: 'severe' });

    expect(sessionStorage.getItem(CLOUD_CYCLE_PAYLOAD_KEY)).toBe(payload);
    expect(sessionStorage.getItem(CLOUD_CYCLE_META_KEY)).toBe(meta);
  });

  test('clearing Custom leaves untagged legacy handoffs for the default Severe workspace', () => {
    const payload = JSON.stringify(validForecast());
    const meta = JSON.stringify({ id: 'legacy-1', label: 'Legacy save' });
    sessionStorage.setItem('cloudCyclePayload:anonymous', payload);
    sessionStorage.setItem('cloudCycleMeta:anonymous', meta);
    sessionStorage.setItem(CLOUD_CYCLE_PAYLOAD_KEY, payload);
    sessionStorage.setItem(CLOUD_CYCLE_META_KEY, meta);

    clearCloudSessionStorage({ workspaceId: 'custom' });

    expect(sessionStorage.getItem('cloudCyclePayload:anonymous')).toBe(payload);
    expect(sessionStorage.getItem('cloudCycleMeta:anonymous')).toBe(meta);
    expect(sessionStorage.getItem(CLOUD_CYCLE_PAYLOAD_KEY)).toBe(payload);
    expect(sessionStorage.getItem(CLOUD_CYCLE_META_KEY)).toBe(meta);
  });

  test('clearing Custom removes explicitly Custom-owned legacy handoffs from every scope', () => {
    const payload = JSON.stringify({
      schemaVersion: 1,
      workspaceId: 'custom',
      forecast: validForecast(),
    });
    const meta = JSON.stringify({ id: 'custom-1', label: 'Custom save' });
    sessionStorage.setItem('cloudCyclePayload:anonymous', payload);
    sessionStorage.setItem('cloudCycleMeta:anonymous', meta);
    sessionStorage.setItem(CLOUD_CYCLE_PAYLOAD_KEY, payload);
    sessionStorage.setItem(CLOUD_CYCLE_META_KEY, meta);

    clearCloudSessionStorage({ userId: 'user-1', workspaceId: 'custom' });

    expect(sessionStorage.getItem('cloudCyclePayload:anonymous')).toBeNull();
    expect(sessionStorage.getItem('cloudCycleMeta:anonymous')).toBeNull();
    expect(sessionStorage.getItem(CLOUD_CYCLE_PAYLOAD_KEY)).toBeNull();
    expect(sessionStorage.getItem(CLOUD_CYCLE_META_KEY)).toBeNull();
  });

  test('clearing Severe removes an unscoped handoff owned by Severe', () => {
    sessionStorage.setItem(CLOUD_CYCLE_PAYLOAD_KEY, JSON.stringify(validForecast()));
    sessionStorage.setItem(CLOUD_CYCLE_META_KEY, JSON.stringify({ id: 'severe-1', label: 'Severe save' }));

    clearCloudSessionStorage({ workspaceId: 'severe' });

    expect(sessionStorage.getItem(CLOUD_CYCLE_PAYLOAD_KEY)).toBeNull();
    expect(sessionStorage.getItem(CLOUD_CYCLE_META_KEY)).toBeNull();
  });

  test('clearing keeps an unscoped meta entry that has no payload to attribute', () => {
    const meta = JSON.stringify({ id: 'legacy-1', label: 'Legacy save' });
    sessionStorage.setItem(CLOUD_CYCLE_META_KEY, meta);

    clearCloudSessionStorage({ workspaceId: 'severe' });

    expect(sessionStorage.getItem(CLOUD_CYCLE_META_KEY)).toBe(meta);
  });

  test('clears attributable anonymous and unscoped legacy handoffs for a signed-in workspace', () => {
    sessionStorage.setItem('cloudCyclePayload:severe:user-user-1', 'account-payload');
    sessionStorage.setItem('cloudCyclePayload:severe:anonymous', JSON.stringify(validForecast()));
    sessionStorage.setItem('cloudCycleMeta:severe:anonymous', JSON.stringify({ id: 'legacy-1', label: 'Legacy Severe' }));
    sessionStorage.setItem(CLOUD_CYCLE_PAYLOAD_KEY, JSON.stringify(validForecast()));
    sessionStorage.setItem(CLOUD_CYCLE_META_KEY, JSON.stringify({ id: 'legacy-2', label: 'Legacy Severe' }));

    clearCloudSessionStorage({ userId: 'user-1', workspaceId: 'severe' });

    expect(sessionStorage.getItem('cloudCyclePayload:severe:user-user-1')).toBeNull();
    expect(sessionStorage.getItem('cloudCyclePayload:severe:anonymous')).toBeNull();
    expect(sessionStorage.getItem('cloudCycleMeta:severe:anonymous')).toBeNull();
    expect(sessionStorage.getItem(CLOUD_CYCLE_PAYLOAD_KEY)).toBeNull();
    expect(sessionStorage.getItem(CLOUD_CYCLE_META_KEY)).toBeNull();
  });

  test('carries an account-tagged legacy handoff into that account workspace slot', () => {
    const payload = JSON.stringify(validForecast());
    sessionStorage.setItem('cloudCyclePayload:user-user-1', payload);
    sessionStorage.setItem('cloudCycleMeta:user-user-1', JSON.stringify({ id: 'severe-1', label: 'Severe save' }));

    migrateLegacyCloudSessionStorage({ userId: 'user-1' });

    expect(sessionStorage.getItem('cloudCyclePayload:user-user-1')).toBeNull();
    expect(sessionStorage.getItem('cloudCycleMeta:user-user-1')).toBeNull();
    expect(sessionStorage.getItem('cloudCyclePayload:severe:user-user-1')).toBe(payload);
    expect(sessionStorage.getItem('cloudCycleMeta:severe:user-user-1'))
      .toBe(JSON.stringify({ id: 'severe-1', label: 'Severe save' }));
  });

  test('keeps an unscoped legacy handoff out of every account scope', () => {
    const payload = JSON.stringify(validForecast());
    sessionStorage.setItem(CLOUD_CYCLE_PAYLOAD_KEY, payload);
    sessionStorage.setItem(CLOUD_CYCLE_META_KEY, JSON.stringify({ id: 'legacy-1', label: 'Legacy save' }));

    migrateLegacyCloudSessionStorage({ userId: 'user-1' });

    expect(sessionStorage.getItem(CLOUD_CYCLE_PAYLOAD_KEY)).toBeNull();
    expect(sessionStorage.getItem(CLOUD_CYCLE_META_KEY)).toBeNull();
    expect(sessionStorage.getItem('cloudCyclePayload:severe:user-user-1')).toBeNull();
    expect(sessionStorage.getItem('cloudCyclePayload:severe:anonymous')).toBe(payload);
  });

  test('drops an unreadable legacy handoff instead of migrating it', () => {
    sessionStorage.setItem(CLOUD_CYCLE_PAYLOAD_KEY, 'not-json');
    sessionStorage.setItem(CLOUD_CYCLE_META_KEY, JSON.stringify({ id: 'legacy-1', label: 'Legacy save' }));
    sessionStorage.setItem('cloudCyclePayload:anonymous', JSON.stringify({ nope: true }));

    migrateLegacyCloudSessionStorage();

    expect(sessionStorage.getItem(CLOUD_CYCLE_PAYLOAD_KEY)).toBeNull();
    expect(sessionStorage.getItem(CLOUD_CYCLE_META_KEY)).toBeNull();
    expect(sessionStorage.getItem('cloudCyclePayload:anonymous')).toBeNull();
    expect(sessionStorage.getItem('cloudCyclePayload:severe:anonymous')).toBeNull();
  });

  test('leaves a handoff already staged under the workspace keys in place', () => {
    const staged = JSON.stringify(validForecast());
    sessionStorage.setItem('cloudCyclePayload:severe:anonymous', staged);
    sessionStorage.setItem('cloudCycleMeta:severe:anonymous', JSON.stringify({ id: 'new-1', label: 'New save' }));
    sessionStorage.setItem(CLOUD_CYCLE_PAYLOAD_KEY, JSON.stringify({ ...validForecast(), cycleDate: 'older' }));
    sessionStorage.setItem(CLOUD_CYCLE_META_KEY, JSON.stringify({ id: 'old-1', label: 'Old save' }));

    migrateLegacyCloudSessionStorage();

    expect(sessionStorage.getItem('cloudCyclePayload:severe:anonymous')).toBe(staged);
    expect(sessionStorage.getItem('cloudCycleMeta:severe:anonymous'))
      .toBe(JSON.stringify({ id: 'new-1', label: 'New save' }));
    expect(sessionStorage.getItem(CLOUD_CYCLE_PAYLOAD_KEY)).toBeNull();
    expect(sessionStorage.getItem(CLOUD_CYCLE_META_KEY)).toBeNull();
  });

  test('keeps the legacy pair when only the target metadata slot is taken', () => {
    const payload = JSON.stringify(validForecast());
    const legacyMeta = JSON.stringify({ id: 'severe-1', label: 'Severe save' });
    const stagedMeta = JSON.stringify({ id: 'other-1', label: 'Other save' });
    sessionStorage.setItem('cloudCyclePayload:user-user-1', payload);
    sessionStorage.setItem('cloudCycleMeta:user-user-1', legacyMeta);
    sessionStorage.setItem('cloudCycleMeta:severe:user-user-1', stagedMeta);

    migrateLegacyCloudSessionStorage({ userId: 'user-1' });

    // Nothing was written, so the legacy pair is still the only copy.
    expect(sessionStorage.getItem('cloudCyclePayload:user-user-1')).toBe(payload);
    expect(sessionStorage.getItem('cloudCycleMeta:user-user-1')).toBe(legacyMeta);
    expect(sessionStorage.getItem('cloudCyclePayload:severe:user-user-1')).toBeNull();
    expect(sessionStorage.getItem('cloudCycleMeta:severe:user-user-1')).toBe(stagedMeta);
  });

  test('keeps a legacy payload without meta when the target metadata slot is taken', () => {
    const payload = JSON.stringify(validForecast());
    const stagedMeta = JSON.stringify({ id: 'other-1', label: 'Other save' });
    sessionStorage.setItem('cloudCyclePayload:user-user-1', payload);
    sessionStorage.setItem('cloudCycleMeta:severe:user-user-1', stagedMeta);

    migrateLegacyCloudSessionStorage({ userId: 'user-1' });

    // The legacy payload carries no meta, but the occupied target meta still
    // makes that slot unsafe to write into, so the payload stays put.
    expect(sessionStorage.getItem('cloudCyclePayload:user-user-1')).toBe(payload);
    expect(sessionStorage.getItem('cloudCyclePayload:severe:user-user-1')).toBeNull();
    expect(sessionStorage.getItem('cloudCycleMeta:severe:user-user-1')).toBe(stagedMeta);
  });

  test('routes a legacy handoff to the workspace its envelope names', () => {
    const payload = JSON.stringify({
      schemaVersion: 1,
      workspaceId: 'custom',
      forecast: validForecast(),
    });
    sessionStorage.setItem(CLOUD_CYCLE_PAYLOAD_KEY, payload);

    migrateLegacyCloudSessionStorage();

    expect(sessionStorage.getItem('cloudCyclePayload:custom:anonymous')).toBe(payload);
    expect(sessionStorage.getItem('cloudCyclePayload:severe:anonymous')).toBeNull();
  });

  test('migrates an untagged legacy handoff to Severe rather than guessing the route owner', () => {
    const payload = JSON.stringify(validForecast());
    const meta = JSON.stringify({ id: 'custom-legacy-1', label: 'Custom legacy save' });
    sessionStorage.setItem(CLOUD_CYCLE_PAYLOAD_KEY, payload);
    sessionStorage.setItem(CLOUD_CYCLE_META_KEY, meta);

    migrateLegacyCloudSessionStorage({ workspaceId: 'custom' });

    expect(sessionStorage.getItem('cloudCyclePayload:custom:anonymous')).toBeNull();
    expect(sessionStorage.getItem('cloudCycleMeta:custom:anonymous')).toBeNull();
    expect(sessionStorage.getItem('cloudCyclePayload:severe:anonymous')).toBe(payload);
    expect(sessionStorage.getItem('cloudCycleMeta:severe:anonymous')).toBe(meta);
  });

  test('does not overwrite a partial target handoff while migrating the legacy pair', () => {
    const targetPayload = JSON.stringify({ id: 'newer-target-payload' });
    const legacyPayload = JSON.stringify(validForecast());
    const legacyMeta = JSON.stringify({ id: 'legacy-1', label: 'Legacy save' });
    sessionStorage.setItem('cloudCyclePayload:severe:anonymous', targetPayload);
    sessionStorage.setItem(CLOUD_CYCLE_PAYLOAD_KEY, legacyPayload);
    sessionStorage.setItem(CLOUD_CYCLE_META_KEY, legacyMeta);

    migrateLegacyCloudSessionStorage();

    expect(sessionStorage.getItem('cloudCyclePayload:severe:anonymous')).toBe(targetPayload);
    expect(sessionStorage.getItem('cloudCycleMeta:severe:anonymous')).toBeNull();
    expect(sessionStorage.getItem(CLOUD_CYCLE_PAYLOAD_KEY)).toBe(legacyPayload);
    expect(sessionStorage.getItem(CLOUD_CYCLE_META_KEY)).toBe(legacyMeta);
  });

  test('keeps the legacy copy when storage refuses the migrated write', () => {
    const payload = JSON.stringify(validForecast());
    sessionStorage.setItem(CLOUD_CYCLE_PAYLOAD_KEY, payload);
    sessionStorage.setItem(CLOUD_CYCLE_META_KEY, JSON.stringify({ id: 'severe-1', label: 'Severe save' }));
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    try {
      migrateLegacyCloudSessionStorage();
    } finally {
      setItem.mockRestore();
    }

    expect(sessionStorage.getItem(CLOUD_CYCLE_PAYLOAD_KEY)).toBe(payload);
    expect(sessionStorage.getItem(CLOUD_CYCLE_META_KEY)).toBe(JSON.stringify({ id: 'severe-1', label: 'Severe save' }));
  });
});
