import {
  fetchTodayStormReports,
  fetchYesterdayStormReports,
  parseArchiveStormReportCsv,
  parseTodayStormReportCsv,
} from './stormReportParser';

describe('parseTodayStormReportCsv', () => {
  test('parses filtered archive sections using the shared report headers', () => {
    const csv = [
      'Time,F_Scale,Location,County,State,Lat,Lon,Comments',
      '1805,1,Ada,OK,OK,34.77,-96.67,Filtered archive tornado',
    ].join('\n');

    expect(parseArchiveStormReportCsv(csv)).toMatchObject([
      { type: 'tornado', magnitude: 'EF1', latitude: 34.77, longitude: -96.67 },
    ]);
  });

  test('parses report values and preserves type order when feed sections are out of order', () => {
    const csv = [
      'Time,Size,Location,County,State,Lat,Lon,Comments',
      '1815,1.75,Moore,OK,OK,35.34,-97.49,Test hail',
      'Time,F_Scale,Location,County,State,Lat,Lon,Comments',
      '1805,1,Ada,OK,OK,34.77,-96.67,Test tornado',
      'Time,Speed,Location,County,State,Lat,Lon,Comments',
      '1810,65,Norman,OK,OK,35.22,-97.44,Test wind',
    ].join('\n');

    const reports = parseTodayStormReportCsv(csv);

    expect(reports).toHaveLength(3);
    expect(reports.map((report) => report.type)).toEqual(['tornado', 'wind', 'hail']);
    expect(reports[0]?.magnitude).toBe('EF1');
    expect(reports[1]?.magnitude).toBe('65 mph');
    expect(reports[2]?.magnitude).toBe('1.75"');
  });

  test('treats unknown Time-prefixed lines as section boundaries', () => {
    const csv = [
      'Time,F_Scale,Location,County,State,Lat,Lon,Comments',
      '1805,1,Ada,OK,OK,34.77,-96.67,Test tornado',
      'Time,Future_Field,Location,County,State,Lat,Lon,Comments',
      '1806,2,Ignored,OK,OK,34.78,-96.68,Must not inherit tornado section',
      'Time,Speed,Location,County,State,Lat,Lon,Comments',
      '1810,65,Norman,OK,OK,35.22,-97.44,Test wind',
    ].join('\n');

    const reports = parseTodayStormReportCsv(csv);

    expect(reports.map((report) => report.type)).toEqual(['tornado', 'wind']);
  });
});

describe('fetchYesterdayStormReports', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('fetches yesterday_filtered.csv and parses the combined report layout', async () => {
    const csv = [
      'Time,F_Scale,Location,County,State,Lat,Lon,Comments',
      'Time,Speed,Location,County,State,Lat,Lon,Comments',
      '1810,65,Norman,OK,OK,35.22,-97.44,Test wind',
      'Time,Size,Location,County,State,Lat,Lon,Comments',
      '1815,1.75,Moore,OK,OK,35.34,-97.49,Test hail',
    ].join('\n');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      text: () => Promise.resolve(csv),
    }) as unknown as typeof global.fetch;

    const reports = await fetchYesterdayStormReports();

    expect(global.fetch).toHaveBeenCalledWith('https://www.spc.noaa.gov/climo/reports/yesterday_filtered.csv');
    expect(reports).toHaveLength(2);
    expect(reports.map((report) => report.type)).toEqual(['wind', 'hail']);
    expect(reports[0]?.magnitude).toBe('65 mph');
    expect(reports[1]?.magnitude).toBe('1.75"');
  });

  test('fetches today_filtered.csv and parses filtered reports', async () => {
    const csv = [
      'Time,F_Scale,Location,County,State,Lat,Lon,Comments',
      '1805,1,Ada,OK,OK,34.77,-96.67,Filtered tornado',
    ].join('\n');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      text: () => Promise.resolve(csv),
    }) as unknown as typeof global.fetch;

    const reports = await fetchTodayStormReports();

    expect(global.fetch).toHaveBeenCalledWith('https://www.spc.noaa.gov/climo/reports/today_filtered.csv');
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ type: 'tornado', magnitude: 'EF1', latitude: 34.77, longitude: -96.67 });
  });

  test('includes the HTTP code when a rolling feed fails without status text', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: '',
      url: '',
    }) as unknown as typeof global.fetch;

    await expect(fetchTodayStormReports()).rejects.toThrow('HTTP 503');
  });
});
