export type ForecastUiVariant = 'tabbed_toolbar';

export const FORECAST_UI_VARIANT_STORAGE_KEY = 'gfc-forecast-ui-variant';
export const DEFAULT_FORECAST_UI_VARIANT: ForecastUiVariant = 'tabbed_toolbar';

export interface ForecastUiVariantOption {
  value: ForecastUiVariant;
  label: string;
  description: string;
}

export const FORECAST_UI_VARIANT_OPTIONS: ForecastUiVariantOption[] = [
  {
    value: 'tabbed_toolbar',
    label: 'Tabbed Toolbar',
    description: 'Compact tabbed controls with Draw / Days / Layers / Tools panels.',
  },
];

const FORECAST_UI_VARIANTS = new Set<ForecastUiVariant>(['tabbed_toolbar']);

export const normalizeForecastUiVariant = (
  value: string | null | undefined
): ForecastUiVariant | null => {
  if (!value) {
    return null;
  }

  return FORECAST_UI_VARIANTS.has(value as ForecastUiVariant) ? (value as ForecastUiVariant) : null;
};

export const resolveForecastUiVariant = ({
  search,
  syncedSettingValue,
  storageValue,
}: {
  search?: string;
  syncedSettingValue?: string | null;
  storageValue?: string | null;
}): ForecastUiVariant => {
  const params = new URLSearchParams(search ?? '');
  const queryVariant = normalizeForecastUiVariant(params.get('forecastUi'));
  if (queryVariant) {
    return queryVariant;
  }

  const syncedVariant = normalizeForecastUiVariant(syncedSettingValue);
  if (syncedVariant) {
    return syncedVariant;
  }

  const storedVariant = normalizeForecastUiVariant(storageValue);
  if (storedVariant) {
    return storedVariant;
  }

  return DEFAULT_FORECAST_UI_VARIANT;
};

export const readStoredForecastUiVariant = (): ForecastUiVariant | null => {
  try {
    return normalizeForecastUiVariant(localStorage.getItem(FORECAST_UI_VARIANT_STORAGE_KEY));
  } catch {
    return null;
  }
};

export const writeStoredForecastUiVariant = (value: ForecastUiVariant) => {
  try {
    localStorage.setItem(FORECAST_UI_VARIANT_STORAGE_KEY, value);
  } catch {
    // Ignore storage write failures so the UI can still function.
  }
};
