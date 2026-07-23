import { gradeForecast } from './gradeForecast';
import { circleContour, makeReport, scatterReports, tornadoOutlook } from './testFixtures';
import type { ProductKind } from './gradeContract';

/**
 * Hardening scenario suite (PR 09). Exercises the named calibration fixtures
 * end-to-end at the package level: dense congestion, sparse, quiet, and the
 * tiny high-probability core with one report vs many.
 */

const CENTER: [number, number] = [-97.5, 36.5];

const productGrade = (result: ReturnType<typeof gradeForecast>, product: ProductKind) =>
  result.products.find((entry) => entry.product === product);

describe('gfc-ver-1 hardening scenarios', () => {
  test('dense congestion: well-placed reports yield a Good, gradable package', () => {
    const outlooks = tornadoOutlook('15%', circleContour(CENTER[0], CENTER[1], 100));
    const reports = scatterReports('tornado', CENTER[0], CENTER[1], 20, 0.5);
    const result = gradeForecast({ outlooks, reports });

    expect(result.dataQuality).toBe('Good');
    expect(result.grade).not.toBeNull();
    expect(productGrade(result, 'tornado')?.reportCount).toBe(20);
    expect(productGrade(result, 'categorical')).toBeUndefined();
  });

  test('sparse: a non-quiet handful of reports withholds the package grade (Limited)', () => {
    const outlooks = tornadoOutlook('10%', circleContour(CENTER[0], CENTER[1], 100));
    const reports = [makeReport('tornado', CENTER[0], CENTER[1]), makeReport('tornado', CENTER[0] + 0.3, CENTER[1])];
    const result = gradeForecast({ outlooks, reports });

    expect(result.dataQuality).toBe('Limited');
    expect(result.grade).toBeNull();
    expect(result.products.some((product) => product.applicable)).toBe(true);
  });

  test('quiet: overforecast with no reports is Good/No reports and scores low', () => {
    const outlooks = tornadoOutlook('30%', circleContour(CENTER[0], CENTER[1], 130));
    const result = gradeForecast({ outlooks, reports: [] });

    expect(result.dataQuality).toBe('Good');
    expect(result.dataQualityReason).toBe('No reports');
    expect(result.hasReports).toBe(false);
    expect(result.grade as number).toBeLessThan(60);
  });

  test('tiny high-prob core: one report scores strictly below many reports', () => {
    const one = gradeForecast({
      outlooks: tornadoOutlook('45%', circleContour(CENTER[0], CENTER[1], 18)),
      reports: [makeReport('tornado', CENTER[0], CENTER[1])],
    });
    const many = gradeForecast({
      outlooks: tornadoOutlook('45%', circleContour(CENTER[0], CENTER[1], 18)),
      reports: scatterReports('tornado', CENTER[0], CENTER[1], 10, 0.05),
    });

    const yieldOne = productGrade(one, 'tornado')?.components.find((c) => c.key === 'eventYield')?.score ?? 0;
    const yieldMany = productGrade(many, 'tornado')?.components.find((c) => c.key === 'eventYield')?.score ?? 0;

    expect(yieldOne).toBeLessThan(yieldMany);
    expect(yieldMany).toBeGreaterThan(0.9);
  });

  test('huge high-prob blob with one report fails yield and areal support', () => {
    const result = gradeForecast({
      outlooks: tornadoOutlook('30%', circleContour(CENTER[0], CENTER[1], 170)),
      reports: [makeReport('tornado', CENTER[0], CENTER[1])],
    });
    const tornado = productGrade(result, 'tornado');
    const yieldScore = tornado?.components.find((c) => c.key === 'eventYield')?.score ?? 1;
    const spatial = tornado?.components.find((c) => c.key === 'spatialContingency')?.score ?? 1;

    expect(yieldScore).toBeLessThan(0.2);
    expect(spatial).toBeLessThan(0.3);
  });
});
