import {
  describeStormReportFetchTarget,
  fetchStormReportsFromUrl,
  resolveStormReportFetchTarget,
} from './stormReportParser';

jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

describe('stormReportParser', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('resolves today, yesterday, and archive sources in UTC', () => {
    const now = new Date('2026-03-18T15:00:00Z');

    expect(resolveStormReportFetchTarget({ selectedDate: '2026-03-18', now })).toEqual({
      source: 'today',
      url: 'https://www.spc.noaa.gov/climo/reports/today.csv',
      reportDate: '260318',
      label: 'today.csv',
    });

    expect(resolveStormReportFetchTarget({ selectedDate: '2026-03-17', now })).toEqual({
      source: 'yesterday',
      url: 'https://www.spc.noaa.gov/climo/reports/yesterday.csv',
      reportDate: '260317',
      label: 'yesterday.csv',
    });

    expect(resolveStormReportFetchTarget({ selectedDate: '2026-03-16', now })).toEqual({
      source: 'archive',
      url: 'https://www.spc.noaa.gov/climo/reports/260316_rpts_raw.csv',
      reportDate: '260316',
      label: '260316_rpts_raw.csv',
    });
  });

  test('describes the resolved source for user-facing status messages', () => {
    const target = resolveStormReportFetchTarget({ selectedDate: '2026-03-18', now: new Date('2026-03-18T15:00:00Z') });
    expect(describeStormReportFetchTarget(target)).toContain('today.csv');
  });

  test('fetchStormReportsFromUrl parses CSV text into storm reports', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue([
        'Raw Tornado LSR',
        'Time,LAT,LON,EF_Scale,Location,County,State,Remarks',
        '1200,35.00,-97.00,EF1,Norman,Cleveland,OK,Test remark',
        '',
        'Raw Wind/Gust LSR',
        'Time,LAT,LON,Speed(MPH),Location,County,State,Remarks',
        '1300,36.00,-98.00,60,Enid,Garfield,OK,Wind remark',
      ].join('\n')),
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const reports = await fetchStormReportsFromUrl({ url: 'https://www.spc.noaa.gov/climo/reports/today.csv' });

    expect(fetchMock).toHaveBeenCalledWith('https://www.spc.noaa.gov/climo/reports/today.csv');
    expect(reports).toHaveLength(2);
    expect(reports[0]).toMatchObject({
      type: 'tornado',
      latitude: 35,
      longitude: -97,
      magnitude: 'EF1',
      location: 'Norman',
      county: 'Cleveland',
      state: 'OK',
    });
    expect(reports[1]).toMatchObject({
      type: 'wind',
      latitude: 36,
      longitude: -98,
      magnitude: '60 mph',
      location: 'Enid',
      county: 'Garfield',
      state: 'OK',
    });
  });
});
