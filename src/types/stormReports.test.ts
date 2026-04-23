import type { StormReport, StormReportGeometry } from '../stormReports';

describe('types/stormReports', () => {
  describe('StormReportGeometry', () => {
    it('accepts point geometry', () => {
      const geom: StormReportGeometry = {
        type: 'Point',
        coordinates: [-97.0, 35.5],
      };
      expect(geom.type).toBe('Point');
      expect(geom.coordinates).toEqual([-97.0, 35.5]);
    });
  });

  describe('StormReport', () => {
    it('accepts minimal storm report', () => {
      const report: StormReport = {
        id: 'report-1',
        type: 'tornado',
        time: '2026-03-27T06:00:00Z',
        geometry: { type: 'Point', coordinates: [-97.0, 35.5] },
        properties: {
          magnitude: 2,
          location: 'Norman, OK',
          county: 'Cleveland',
          state: 'OK',
        },
      };
      expect(report.id).toBe('report-1');
      expect(report.type).toBe('tornado');
      expect(report.properties.magnitude).toBe(2);
    });

    it('accepts hail report without magnitude', () => {
      const report: StormReport = {
        id: 'report-2',
        type: 'hail',
        time: '2026-03-27T06:00:00Z',
        geometry: { type: 'Point', coordinates: [-97.0, 35.5] },
        properties: {
          size: 1.0,
          location: 'Norman, OK',
          county: 'Cleveland',
          state: 'OK',
        },
      };
      expect(report.type).toBe('hail');
      expect((report.properties as { size: number }).size).toBe(1.0);
    });
  });
});