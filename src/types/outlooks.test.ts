import type {
  CategoricalRiskLevel,
  TornadoProbability,
  WindProbability,
  HailProbability,
  TotalSevereProbability,
  Day48Probability,
  OutlookDay,
  DayType,
  OutlookType,
} from '../outlooks';

describe('types/outlooks', () => {
  describe('CategoricalRiskLevel', () => {
    it('accepts all categorical risk levels', () => {
      const levels: CategoricalRiskLevel[] = ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'];
      expect(levels).toHaveLength(6);
      levels.forEach(level => expect(typeof level).toBe('string'));
    });
  });

  describe('TornadoProbability', () => {
    it('accepts valid tornado probabilities', () => {
      const probs: TornadoProbability[] = ['2%', '5%', '10%', '15%', '30%', '45%', '60%'];
      expect(probs).toHaveLength(7);
    });
  });

  describe('WindProbability', () => {
    it('accepts valid wind probabilities', () => {
      const probs: WindProbability[] = ['5%', '15%', '30%', '45%', '60%', '75%', '90%'];
      expect(probs).toHaveLength(7);
    });
  });

  describe('HailProbability', () => {
    it('accepts valid hail probabilities', () => {
      const probs: HailProbability[] = ['5%', '15%', '30%', '45%', '60%'];
      expect(probs).toHaveLength(5);
    });
  });

  describe('TotalSevereProbability', () => {
    it('accepts valid total severe probabilities', () => {
      const probs: TotalSevereProbability[] = ['5%', '15%', '30%', '45%'];
      expect(probs).toHaveLength(4);
    });
  });

  describe('Day48Probability', () => {
    it('accepts valid day 4-8 probabilities', () => {
      const probs: Day48Probability[] = ['15%', '30%'];
      expect(probs).toHaveLength(2);
    });
  });

  describe('OutlookType', () => {
    it('accepts all outlook types', () => {
      const types: OutlookType[] = ['tornado', 'wind', 'hail', 'categorical', 'totalSevere', 'day4-8'];
      expect(types).toHaveLength(6);
    });
  });

  describe('DayType', () => {
    it('accepts valid day numbers', () => {
      const days: DayType[] = [1, 2, 3, 4, 5, 6, 7, 8];
      expect(days).toHaveLength(8);
    });
  });
});