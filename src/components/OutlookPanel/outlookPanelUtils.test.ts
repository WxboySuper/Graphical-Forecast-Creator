import {
  canBeSignificant,
  getAvailableProbabilities,
  getCurrentColor,
  getProbabilityButtonStyle,
} from './outlookPanelUtils';

describe('outlookPanelUtils', () => {
  it('returns day-specific probabilities for each outlook type', () => {
    expect(getAvailableProbabilities('categorical', 1)).toEqual(['TSTM']);
    expect(getAvailableProbabilities('categorical', 4)).toEqual([]);
    expect(getAvailableProbabilities('tornado', 1)).toContain('2%');
    expect(getAvailableProbabilities('wind', 1)).toContain('5%');
    expect(getAvailableProbabilities('hail', 1)).not.toContain('CIG3');
    expect(getAvailableProbabilities('totalSevere', 3)).toContain('5%');
    expect(getAvailableProbabilities('day4-8', 4)).toContain('15%');
    expect(getAvailableProbabilities('day4-8', 1)).toEqual([]);
  });

  it('keeps legacy significance disabled', () => {
    expect(canBeSignificant('tornado', '10%', true)).toBe(false);
    expect(canBeSignificant('hail', 'SIG', false)).toBe(false);
  });

  it('builds categorical, CIG, and active probability button styles', () => {
    expect(getProbabilityButtonStyle('categorical', 'MRGL', 'MRGL')).toMatchObject({
      color: '#000000',
      boxShadow: expect.stringContaining('#3f51b5'),
    });
    expect(getProbabilityButtonStyle('categorical', 'HIGH', 'HIGH')).toMatchObject({
      color: '#FFFFFF',
    });
    expect(getProbabilityButtonStyle('tornado', '2%', 'CIG1')).toMatchObject({
      backgroundColor: '#e0e0e0',
      color: '#000000',
    });
    expect(getProbabilityButtonStyle('day4-8', '30%', '15%')).toMatchObject({
      color: '#000000',
      boxShadow: undefined,
    });
    expect(getProbabilityButtonStyle('unknown' as never, '', '???')).toMatchObject({
      backgroundColor: '#FFFFFF',
    });
  });

  it('gets preview colors for active selections', () => {
    expect(getCurrentColor('categorical', 'TSTM')).not.toBe('#FFFFFF');
    expect(getCurrentColor('hail', 'CIG2')).toBe('#e0e0e0');
    expect(getCurrentColor('wind', '45%')).not.toBe('#FFFFFF');
    expect(getCurrentColor('unknown' as never, '??')).toBe('#FFFFFF');
  });
});
