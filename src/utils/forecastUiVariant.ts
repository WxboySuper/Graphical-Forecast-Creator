export type ForecastUiVariant = 'integrated' | 'workspace_dock' | 'floating_panels' | 'tabbed_toolbar';

export const FORECAST_UI_VARIANT_STORAGE_KEY = 'gfc-forecast-ui-variant';
export const DEFAULT_FORECAST_UI_VARIANT: ForecastUiVariant = 'integrated';

const FORECAST_UI_VARIANTS = new Set<ForecastUiVariant>([
  'integrated',
  'workspace_dock',
  'floating_panels',
  'tabbed_toolbar',
]);

/** Normalize an arbitrary string into a ForecastUiVariant or return null if invalid. */
export const normalizeForecastUiVariant = (
  value: string | null | undefined
): ForecastUiVariant | null => {
  if (!value) {
    return null;
  }

  return FORECAST_UI_VARIANTS.has(value as ForecastUiVariant) ? (value as ForecastUiVariant) : null;
};

/** Read the stored ForecastUiVariant from localStorage, returning null on error. */
export const readStoredForecastUiVariant = (): ForecastUiVariant | null => {
  try {
    return normalizeForecastUiVariant(localStorage.getItem(FORECAST_UI_VARIANT_STORAGE_KEY));
  } catch {
    return null;
  }
};

/** Persist the selected ForecastUiVariant to localStorage, ignoring write failures. */
export const writeStoredForecastUiVariant = (value: ForecastUiVariant) => {
  try {
    localStorage.setItem(FORECAST_UI_VARIANT_STORAGE_KEY, value);
  } catch {
    // Ignore storage write failures so the UI can still function.
  }
};
