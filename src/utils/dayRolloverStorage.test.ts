import {
  DAY_ROLLOVER_LAST_ACTIVE_KEY,
  DAY_ROLLOVER_PENDING_KEY,
  DAY_ROLLOVER_PROMPTED_KEY,
  clearStoredRolloverPrompt,
  getLegacyRolloverStorageKey,
  getRolloverStorageKey,
  readLegacyRolloverDayValue,
  readLegacyRolloverPrompt,
  readStoredRolloverPrompt,
  writeStoredRolloverPrompt,
} from './dayRolloverStorage';

const PENDING_PROMPT = { previousDay: '2026-09-23', currentDay: '2026-09-24' };

describe('dayRolloverStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('scopes every rollover key by workspace and account', () => {
    expect(getRolloverStorageKey(DAY_ROLLOVER_LAST_ACTIVE_KEY, null, 'severe')).toBe(
      `${DAY_ROLLOVER_LAST_ACTIVE_KEY}:severe:anonymous`,
    );
    expect(getRolloverStorageKey(DAY_ROLLOVER_LAST_ACTIVE_KEY, 'user-1', 'custom')).toBe(
      `${DAY_ROLLOVER_LAST_ACTIVE_KEY}:custom:user-user-1`,
    );
    expect(getRolloverStorageKey(DAY_ROLLOVER_LAST_ACTIVE_KEY, 'user-1', 'severe')).not.toBe(
      getRolloverStorageKey(DAY_ROLLOVER_LAST_ACTIVE_KEY, 'user-1', 'custom'),
    );
  });

  test('keeps a pending prompt inside one workspace', () => {
    writeStoredRolloverPrompt(PENDING_PROMPT, 'user-1', 'custom');
    writeStoredRolloverPrompt({ previousDay: '2026-09-22', currentDay: '2026-09-23' }, 'user-1', 'severe');

    expect(readStoredRolloverPrompt('user-1', 'custom')).toEqual(PENDING_PROMPT);
    expect(readStoredRolloverPrompt('user-1', 'severe')).toEqual({
      previousDay: '2026-09-22',
      currentDay: '2026-09-23',
    });
    expect(readStoredRolloverPrompt('user-1', 'tropical')).toBeNull();

    clearStoredRolloverPrompt('user-1', 'custom');
    expect(readStoredRolloverPrompt('user-1', 'custom')).toBeNull();
    expect(readStoredRolloverPrompt('user-1', 'severe')).toEqual({
      previousDay: '2026-09-22',
      currentDay: '2026-09-23',
    });
  });

  test('claims pre-workspace rollover values for the default workspace only', () => {
    localStorage.setItem(getLegacyRolloverStorageKey(DAY_ROLLOVER_LAST_ACTIVE_KEY, 'user-1'), '2026-09-23');
    localStorage.setItem(getLegacyRolloverStorageKey(DAY_ROLLOVER_PENDING_KEY, 'user-1'), JSON.stringify(PENDING_PROMPT));
    localStorage.setItem(DAY_ROLLOVER_PROMPTED_KEY, '2026-09-23');

    expect(readLegacyRolloverDayValue(DAY_ROLLOVER_LAST_ACTIVE_KEY, 'user-1', 'severe')).toBe('2026-09-23');
    expect(readLegacyRolloverDayValue(DAY_ROLLOVER_LAST_ACTIVE_KEY, 'user-1', 'custom')).toBeNull();
    expect(readLegacyRolloverPrompt('user-1', 'severe')).toEqual(PENDING_PROMPT);
    expect(readLegacyRolloverPrompt('user-1', 'custom')).toBeNull();
    // The unscoped copy only ever belonged to anonymous use.
    expect(readLegacyRolloverDayValue(DAY_ROLLOVER_PROMPTED_KEY, 'user-1', 'severe')).toBeNull();
    expect(readLegacyRolloverDayValue(DAY_ROLLOVER_PROMPTED_KEY, null, 'severe')).toBe('2026-09-23');
    expect(readLegacyRolloverDayValue(DAY_ROLLOVER_PROMPTED_KEY, null, 'custom')).toBeNull();
  });

  test('reads back a legacy pending prompt through the workspace-scoped read', () => {
    localStorage.setItem(getLegacyRolloverStorageKey(DAY_ROLLOVER_PENDING_KEY, null), JSON.stringify(PENDING_PROMPT));

    expect(readStoredRolloverPrompt(null, 'severe')).toBeNull();
    expect(readLegacyRolloverPrompt(null, 'severe')).toEqual(PENDING_PROMPT);
    expect(readLegacyRolloverPrompt(null, 'custom')).toBeNull();
  });

  test('ignores a malformed workspace-scoped pending prompt', () => {
    localStorage.setItem(getRolloverStorageKey(DAY_ROLLOVER_PENDING_KEY, null, 'custom'), '{bad json');

    expect(readStoredRolloverPrompt(null, 'custom')).toBeNull();
    expect(readStoredRolloverPrompt(null, 'severe')).toBeNull();
  });
});
