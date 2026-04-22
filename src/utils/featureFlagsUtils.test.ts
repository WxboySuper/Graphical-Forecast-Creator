import { getFirstEnabledOutlookType, isAnyOutlookEnabled, isOutlookTypeEnabled } from './featureFlagsUtils';

describe('featureFlagsUtils', () => {
  const base = {
    tornadoOutlookEnabled: false,
    windOutlookEnabled: false,
    hailOutlookEnabled: false,
    categoricalOutlookEnabled: false
  } as any;

  test('getFirstEnabledOutlookType returns first enabled or categorical fallback', () => {
    expect(getFirstEnabledOutlookType({ ...base, tornadoOutlookEnabled: true })).toBe('tornado');
    expect(getFirstEnabledOutlookType(base)).toBe('categorical');
  });

  test('isAnyOutlookEnabled', () => {
    expect(isAnyOutlookEnabled({ ...base, categoricalOutlookEnabled: true })).toBe(true);
    expect(isAnyOutlookEnabled(base)).toBe(false);
  });

  test('isOutlookTypeEnabled', () => {
    expect(isOutlookTypeEnabled({ ...base, windOutlookEnabled: true }, 'wind')).toBe(true);
    expect(isOutlookTypeEnabled(base, 'hail')).toBe(false);
  });
});
