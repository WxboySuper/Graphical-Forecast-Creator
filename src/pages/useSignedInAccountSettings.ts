import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { useWorkflowAwareness } from "../hooks/useWorkflowAwarenessSync";

/** Owns signed-in account settings state and the actions used by the account page. */
export const useSignedInAccountSettings = () => {
  const { user, signOutUser, settingsSyncStatus, syncedSettings, updateSyncedSettings } = useAuth();
  const [defaultForecasterName, setDefaultForecasterName] = useState(
    () => syncedSettings?.defaultForecasterName ?? user?.displayName ?? "",
  );
  const [forecastUiMessage, setForecastUiMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const { enabled: awarenessEnabled, setEnabled: setAwarenessEnabled } = useWorkflowAwareness();

  useEffect(() => {
    setDefaultForecasterName(syncedSettings?.defaultForecasterName ?? user?.displayName ?? "");
  }, [syncedSettings?.defaultForecasterName, user?.displayName]);

  /** Saves the discussion default byline into the synced user settings document. */
  const handleSaveDefaults = async () => {
    setSavingDefaults(true);
    setSaveMessage(null);
    try {
      await updateSyncedSettings({ defaultForecasterName: defaultForecasterName.trim() });
      setSaveMessage("Saved to your account.");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Unable to save right now.");
    } finally {
      setSavingDefaults(false);
    }
  };

  /** Wraps the async save action for a button click without leaking promise handling into JSX. */
  const handleSaveDefaultsClick = () => {
    handleSaveDefaults().catch(() => {});
  };

  /** Wraps sign-out for button usage while shared auth state handles any failure messaging. */
  const handleSignOutClick = () => {
    signOutUser().catch(() => {});
  };

  /** Clears any forecast UI message when opening forecast. */
  const handleOpenForecastClick = () => setForecastUiMessage(null);

  return {
    user,
    settingsSyncStatus,
    defaultForecasterName,
    setDefaultForecasterName,
    forecastUiMessage,
    awarenessEnabled,
    setAwarenessEnabled,
    savingDefaults,
    saveMessage,
    handleSaveDefaultsClick,
    handleOpenForecastClick,
    handleSignOutClick,
  };
};
