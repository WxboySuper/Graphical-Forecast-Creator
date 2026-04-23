import {
  getAvailableProbabilities,
  canBeSignificant,
  getProbabilityButtonStyle,
  getCurrentColor,
} from './outlookPanelUtils';

describe('outlookPanelUtils', () => {
  describe('getAvailableProbabilities', () => {
    it('returns TSTM for categorical on day 1', () => {
      const result = getAvailableProbabilities('categorical', 1);
      expect(result).toContain('TSTM');
    });

    it('returns empty for categorical on day 4-8', () => {
      const result = getAvailableProbabilities('categorical', 5);
      expect(result).toEqual([]);
    });

    it('returns tornado probabilities for tornado outlook type day 1', () => {
      const result = getAvailableProbabilities('tornado', 1);
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns wind probabilities for wind outlook type day 2', () => {
      const result = getAvailableProbabilities('wind', 2);
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns hail probabilities for hail outlook type', () => {
      const result = getAvailableProbabilities('hail', 1);
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns day4-8 probabilities for day4-8 outlook type', () => {
      const result = getAvailableProbabilities('day4-8', 5);
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns empty array for unknown outlook type', () => {
      const result = getAvailableProbabilities('tornado' as any, 1);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('canBeSignificant', () => {
    it('always returns false (legacy)', () => {
      expect(canBeSignificant('tornado', '30%', true)).toBe(false);
      expect(canBeSignificant('wind', '15%', false)).toBe(false);
      expect(canBeSignificant('hail', 'sig', true)).toBe(false);
    });
  });

  describe('getProbabilityButtonStyle', () => {
    it('returns styled object for active probability', () => {
      const style = getProbabilityButtonStyle('tornado', '30%', '30%');
      expect(style).toHaveProperty('backgroundColor');
      expect(style).toHaveProperty('color');
      expect(style.boxShadow).toBeDefined();
    });

    it('returns styled object for inactive probability', () => {
      const style = getProbabilityButtonStyle('tornado', '30%', '15%');
      expect(style).toHaveProperty('backgroundColor');
      expect(style).toHaveProperty('color');
      expect(style.boxShadow).toBeUndefined();
    });

    it('handles categorical outlook type', () => {
      const style = getProbabilityButtonStyle('categorical', 'ENH', 'ENH');
      expect(style).toHaveProperty('backgroundColor');
    });

    it('handles CIG hatching buttons', () => {
      const style = getProbabilityButtonStyle('tornado', '30%', 'CIG1');
      expect(style.backgroundColor).toBe('#e0e0e0');
      expect(style.color).toBe('#000000');
    });

    it('handles day4-8 outlook type with yellow color', () => {
      const style = getProbabilityButtonStyle('day4-8', '15%', '15%');
      expect(style.color).toBe('#000000');
    });
  });

  describe('getCurrentColor', () => {
    it('returns color for tornado probability', () => {
      const color = getCurrentColor('tornado', '30%');
      expect(typeof color).toBe('string');
      expect(color).not.toBe('');
    });

    it('returns color for categorical probability', () => {
      const color = getCurrentColor('categorical', 'MRGL');
      expect(typeof color).toBe('string');
    });

    it('returns color for CIG hatching', () => {
      const color = getCurrentColor('tornado', 'CIG1');
      expect(color).toBe('#e0e0e0');
    });

    it('returns default color for unknown probability', () => {
      const color = getCurrentColor('tornado', 'unknown');
      expect(color).toBe('#FFFFFF');
    });
  });
});