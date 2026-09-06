import {
  DEFAULT_FORECAST_UI_VARIANT,
  normalizeForecastUiVariant,
  readStoredForecastUiVariant,
  resolveForecastUiVariant,
  writeStoredForecastUiVariant,
} from './forecastUiVariant';

describe('forecastUiVariant utilities', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('normalizes only supported variants', () => {
    expect(normalizeForecastUiVariant('integrated')).toBe('integrated');
    expect(normalizeForecastUiVariant('workspace_dock')).toBe('workspace_dock');
    expect(normalizeForecastUiVariant('floating_panels')).toBe('floating_panels');
    expect(normalizeForecastUiVariant('tabbed_toolbar')).toBe('tabbed_toolbar');
    expect(normalizeForecastUiVariant('unknown')).toBeNull();
    expect(normalizeForecastUiVariant(null)).toBeNull();
  });

  test('prefers the query-string variant over the stored value', () => {
    expect(
      resolveForecastUiVariant({
        search: '?forecastUi=workspace_dock',
        syncedSettingValue: 'tabbed_toolbar',
        storageValue: 'floating_panels',
      })
    ).toBe('workspace_dock');
  });

  test('prefers the synced setting when the query-string is absent', () => {
    expect(
      resolveForecastUiVariant({
        search: '',
        syncedSettingValue: 'tabbed_toolbar',
        storageValue: 'floating_panels',
      })
    ).toBe('tabbed_toolbar');
  });

  test('falls back to the stored variant when the query-string is absent', () => {
    expect(
      resolveForecastUiVariant({
        search: '',
        syncedSettingValue: null,
        storageValue: 'floating_panels',
      })
    ).toBe('floating_panels');
  });

  test('defaults to integrated when neither source is valid', () => {
    expect(
      resolveForecastUiVariant({
        search: '?forecastUi=unknown',
        syncedSettingValue: 'still-unknown',
        storageValue: 'still-unknown',
      })
    ).toBe(DEFAULT_FORECAST_UI_VARIANT);
  });

  test('writes and reads one stored variant', () => {
    writeStoredForecastUiVariant('tabbed_toolbar');

    expect(readStoredForecastUiVariant()).toBe('tabbed_toolbar');
  });
});
