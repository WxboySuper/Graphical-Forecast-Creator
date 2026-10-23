/** Normalizes initial/settings hydration failures into a user-facing sync error message. */
export const getSettingsSyncError = (_error: unknown): string =>
  'Unable to sync account settings right now.';

/** Normalizes update-write failures into a user-facing sync error message. */
export const getSettingsUpdateError = (_error: unknown): string =>
  'Unable to update synced settings right now.';
