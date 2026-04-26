import { getFirstEnabledOutlookType, isAnyOutlookEnabled, isOutlookTypeEnabled } from './featureFlagsUtils';

describe('featureFlagsUtils', () => {
  type FeatureFlagsState = {
    tornadoOutlookEnabled: boolean;
    windOutlookEnabled: boolean;
    hailOutlookEnabled: boolean;
    categoricalOutlookEnabled: boolean;
  };

  const base: FeatureFlagsState = {
    tornadoOutlookEnabled: false,
    windOutlookEnabled: false,
    hailOutlookEnabled: false,
    categoricalOutlookEnabled: false
  };

  test('getFirstEnabledOutlookType returns first enabled or categorical fallback', () => {
    expect(getFirstEnabledOutlookType({ ...base, tornadoOutlookEnabled: true })).toBe('tornado');
    expect(getFirstEnabledOutlookType({ ...base, windOutlookEnabled: true })).toBe('wind');
    expect(getFirstEnabledOutlookType({ ...base, hailOutlookEnabled: true })).toBe('hail');
    expect(getFirstEnabledOutlookType({ ...base, categoricalOutlookEnabled: true })).toBe('categorical');
    expect(getFirstEnabledOutlookType(base)).toBe('categorical');
  });

  test('isAnyOutlookEnabled', () => {
    expect(isAnyOutlookEnabled({ ...base, tornadoOutlookEnabled: true })).toBe(true);
    expect(isAnyOutlookEnabled({ ...base, windOutlookEnabled: true })).toBe(true);
    expect(isAnyOutlookEnabled({ ...base, hailOutlookEnabled: true })).toBe(true);
    expect(isAnyOutlookEnabled({ ...base, categoricalOutlookEnabled: true })).toBe(true);
    expect(isAnyOutlookEnabled(base)).toBe(false);
  });

  test('isOutlookTypeEnabled', () => {
    expect(isOutlookTypeEnabled({ ...base, tornadoOutlookEnabled: true }, 'tornado')).toBe(true);
    expect(isOutlookTypeEnabled({ ...base, windOutlookEnabled: true }, 'wind')).toBe(true);
    expect(isOutlookTypeEnabled({ ...base, hailOutlookEnabled: true }, 'hail')).toBe(true);
    expect(isOutlookTypeEnabled({ ...base, categoricalOutlookEnabled: true }, 'categorical')).toBe(true);
    expect(isOutlookTypeEnabled(base, 'hail')).toBe(false);
    expect(isOutlookTypeEnabled(base, 'totalSevere')).toBe(false);
  });
});
