import {
  CLOUD_CYCLE_PAYLOAD_KEY,
  clearCloudSessionStorage,
  getCloudSessionStorageKey,
} from './cloudSessionStorage';

describe('cloud session storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('scopes pending handoffs by workspace and account', () => {
    expect(getCloudSessionStorageKey(CLOUD_CYCLE_PAYLOAD_KEY, { workspaceId: 'severe' })).toBe(
      'cloudCyclePayload:severe:anonymous',
    );
    expect(getCloudSessionStorageKey(CLOUD_CYCLE_PAYLOAD_KEY, { workspaceId: 'custom' })).toBe(
      'cloudCyclePayload:custom:anonymous',
    );
    expect(getCloudSessionStorageKey(CLOUD_CYCLE_PAYLOAD_KEY, { userId: 'user-1', workspaceId: 'severe' })).toBe(
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
    expect(sessionStorage.getItem('cloudCyclePayload')).toBeNull();
    expect(sessionStorage.getItem('cloudCyclePayload:custom:anonymous')).toBe('custom-payload');
    expect(sessionStorage.getItem('cloudCycleMeta:custom:anonymous')).toBe('custom-meta');
  });

  test('clearing a signed-in workspace only touches that account scope', () => {
    sessionStorage.setItem('cloudCyclePayload:severe:user-user-1', 'account-payload');
    sessionStorage.setItem('cloudCyclePayload:severe:anonymous', 'anonymous-payload');

    clearCloudSessionStorage({ userId: 'user-1', workspaceId: 'severe' });

    expect(sessionStorage.getItem('cloudCyclePayload:severe:user-user-1')).toBeNull();
    expect(sessionStorage.getItem('cloudCyclePayload:severe:anonymous')).toBe('anonymous-payload');
  });
});
