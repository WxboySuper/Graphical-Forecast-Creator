/** Normalizes initial/settings hydration failures into a user-facing sync error message. */
export const getSettingsSyncError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unable to sync account settings right now.';

/** Normalizes update-write failures into a user-facing sync error message. */
export const getSettingsUpdateError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unable to update synced settings right now.';
