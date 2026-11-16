/**
 * Forecast UI variant tests. Verify forecast controls select the correct display variant for each mode.
 */
import {
  normalizeForecastUiVariant,
  readStoredForecastUiVariant,
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

  test('writes and reads one stored variant', () => {
    writeStoredForecastUiVariant('tabbed_toolbar');

    expect(readStoredForecastUiVariant()).toBe('tabbed_toolbar');
  });
});