import {
  availablePackageSources,
  loadForecastFromCloud,
  loadForecastFromFile,
  loadReportsForDate,
  resolveAccountTier,
  SourceLoadError,
  tierHasHistory,
  tierHasSnapshots,
  toArchiveDate,
} from './sources';
import { loadCloudCycle } from '../../lib/cloudCyclesService';
import { serializeForecast } from '../fileUtils';
import type { CloudCycle, CloudOperationResult } from '../../types/cloudCycles';

jest.mock('../../lib/cloudCyclesService', () => ({
  loadCloudCycle: jest.fn(),
}));

const mockedLoadCloudCycle = loadCloudCycle as jest.MockedFunction<typeof loadCloudCycle>;

describe('account tiers and sources', () => {
  test('resolves tier from auth + entitlement', () => {
    expect(resolveAccountTier(false, false)).toBe('signed-out');
    expect(resolveAccountTier(true, false)).toBe('free');
    expect(resolveAccountTier(true, true)).toBe('premium');
  });

  test('only premium gets the cloud package source', () => {
    expect(availablePackageSources('signed-out')).toEqual(['file']);
    expect(availablePackageSources('free')).toEqual(['file']);
    expect(availablePackageSources('premium')).toEqual(['file', 'cloud']);
  });

  test('converts ISO date input to SPC archive YYMMDD', () => {
    expect(toArchiveDate('2024-05-06')).toBe('240506');
    expect(toArchiveDate('240506')).toBe('240506');
    expect(toArchiveDate('2024-99-99')).toBeNull();
    expect(toArchiveDate('2024-5-6')).toBeNull();
  });

  test('history and snapshot capability by tier', () => {
    expect(tierHasHistory('signed-out')).toBe(false);
    expect(tierHasHistory('free')).toBe(true);
    expect(tierHasSnapshots('free')).toBe(false);
    expect(tierHasSnapshots('premium')).toBe(true);
  });
});

describe('source loaders', () => {
  const originalFetch = global.fetch;

  const mockFetch = (body: string, ok = true, statusText = 'OK'): void => {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      statusText,
      text: () => Promise.resolve(body),
    }) as unknown as typeof global.fetch;
  };

  afterEach(() => {
    global.fetch = originalFetch;
    mockedLoadCloudCycle.mockReset();
  });

  describe('loadReportsForDate', () => {
    test('fetches archived SPC reports for a valid ISO date', async () => {
      mockFetch([
        'Time,F_Scale,Location,County,State,Lat,Lon,Comments',
        '2045,UNK,5 W Hawk Springs,Goshen,WY,41.79,-104.37,[Landspout] Tornado (CYS)',
        'Time,Speed,Location,County,State,Lat,Lon,Comments',
        '1717,UNK,5 SW Kanona,Steuben,NY,42.33,-77.42,Tree down (BGM)',
        'Time,Size,Location,County,State,Lat,Lon,Comments',
        '1800,175,Moore,Cleveland,OK,35.0,-97.0,Quarter-size hail',
      ].join('\n'));
      const reports = await loadReportsForDate('2024-05-06');
      expect(reports.map(({ type }) => type)).toEqual(['tornado', 'wind', 'hail']);
      expect(reports.map(({ magnitude }) => magnitude)).toEqual(['', '', '1.75"']);
      expect(reports[0]).toMatchObject({ latitude: 41.79, longitude: -104.37, location: '5 W Hawk Springs', state: 'WY' });
      expect(global.fetch).toHaveBeenCalledWith('https://www.spc.noaa.gov/climo/reports/240506_rpts_filtered.csv');
    });

    test('routes null to today\'s SPC reports feed', async () => {
      mockFetch('');
      const reports = await loadReportsForDate(null);
      expect(reports).toEqual([]);
      expect(global.fetch).toHaveBeenCalledWith('https://www.spc.noaa.gov/climo/reports/today_filtered.csv');
    });

    const beforeBoundary = new Date('2026-08-09T11:59:59.999Z');
    const atBoundary = new Date('2026-08-09T12:00:00.000Z');
    const reportFeedCases: { label: string; date: string; now: Date; url: string }[] = [
      {
        label: 'the current SPC report day before 12Z (ISO)',
        date: '2026-08-08',
        now: beforeBoundary,
        url: 'https://www.spc.noaa.gov/climo/reports/today_filtered.csv',
      },
      {
        label: 'the current SPC report day before 12Z (YYMMDD)',
        date: '260808',
        now: beforeBoundary,
        url: 'https://www.spc.noaa.gov/climo/reports/today_filtered.csv',
      },
      {
        label: 'the previous SPC report day before 12Z (ISO)',
        date: '2026-08-07',
        now: beforeBoundary,
        url: 'https://www.spc.noaa.gov/climo/reports/yesterday_filtered.csv',
      },
      {
        label: 'the previous SPC report day before 12Z (YYMMDD)',
        date: '260807',
        now: beforeBoundary,
        url: 'https://www.spc.noaa.gov/climo/reports/yesterday_filtered.csv',
      },
      {
        label: 'the current SPC report day at 12Z',
        date: '2026-08-09',
        now: atBoundary,
        url: 'https://www.spc.noaa.gov/climo/reports/today_filtered.csv',
      },
      {
        label: 'the previous SPC report day at 12Z',
        date: '2026-08-08',
        now: atBoundary,
        url: 'https://www.spc.noaa.gov/climo/reports/yesterday_filtered.csv',
      },
    ];

    test.each(reportFeedCases)(
      'routes a date matching $label to the matching SPC reports feed',
      async ({ date, now, url }) => {
        mockFetch('');
        const reports = await loadReportsForDate(date, now);
        expect(reports).toEqual([]);
        expect(global.fetch).toHaveBeenCalledWith(url);
      }
    );

    test('keeps archived dates on the dated archive feed', async () => {
      const now = new Date('2026-08-09T15:00:00.000Z');
      const iso = '2024-05-06';

      mockFetch('Time,F_Scale,Location,County,State,Lat,Lon,Comments\n1234,EF1,Ada,Denton,TX,33.5,-97.2,');
      const reports = await loadReportsForDate(iso, now);
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatchObject({ type: 'tornado', magnitude: 'EF1', latitude: 33.5, longitude: -97.2 });
      const archiveDate = iso.slice(2).replace(/-/g, '');
      expect(global.fetch).toHaveBeenCalledWith(
        `https://www.spc.noaa.gov/climo/reports/${archiveDate}_rpts_filtered.csv`
      );
    });

    test('falls back to the raw archive only when SPC has no filtered archive for a date', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' })
        .mockResolvedValueOnce({
          ok: true,
          statusText: 'OK',
          text: () => Promise.resolve([
            'Raw Tornado LSR',
            'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
            '1234,EF1,,33.5,-97.2,Ada,Denton,TX,,',
          ].join('\n')),
        }) as unknown as typeof global.fetch;

      const reports = await loadReportsForDate('2024-05-06');

      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatchObject({ type: 'tornado', magnitude: 'EF1', latitude: 33.5, longitude: -97.2 });
      expect(global.fetch).toHaveBeenNthCalledWith(1, 'https://www.spc.noaa.gov/climo/reports/240506_rpts_filtered.csv');
      expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://www.spc.noaa.gov/climo/reports/240506_rpts_raw.csv');
    });

    test('treats blank strings as invalid dates, not as today', async () => {
      await expect(loadReportsForDate('')).rejects.toBeInstanceOf(SourceLoadError);
      await expect(loadReportsForDate('not-a-date')).rejects.toBeInstanceOf(SourceLoadError);
      await expect(loadReportsForDate('2024-99-99')).rejects.toBeInstanceOf(SourceLoadError);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('rejects malformed archive dates before constructing a fetch URL', async () => {
      mockFetch('');
      await expect(loadReportsForDate('2024-05-06x')).rejects.toBeInstanceOf(SourceLoadError);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('wraps fetch failures as SourceLoadError', async () => {
      mockFetch('', false, 'Server Error');
      await expect(loadReportsForDate('2024-05-06')).rejects.toBeInstanceOf(SourceLoadError);
    });
  });

  describe('loadForecastFromFile', () => {
    const fileFor = (contents: unknown): File => {
      const text = typeof contents === 'string' ? contents : JSON.stringify(contents);
      const bytes = new TextEncoder().encode(text);
      const fileLike = Object.assign(bytes, {
        name: 'forecast.json',
        type: 'application/json',
        arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
      });
      return fileLike as unknown as File;
    };

    const validPayload = serializeForecast(
      { days: {}, currentDay: 1, cycleDate: '2026-05-01' },
      { center: [0, 0], zoom: 0 }
    );

    test('returns a ForecastCycle for a valid uploaded file', async () => {
      const cycle = await loadForecastFromFile(fileFor(validPayload));
      expect(cycle.cycleDate).toBe('2026-05-01');
    });

    test('throws SourceLoadError for malformed file data', async () => {
      await expect(loadForecastFromFile(fileFor('{not-json'))).rejects.toBeInstanceOf(SourceLoadError);
    });

    test('throws SourceLoadError when the JSON does not pass validation', async () => {
      await expect(loadForecastFromFile(fileFor({}))).rejects.toBeInstanceOf(SourceLoadError);
    });
  });

  describe('loadForecastFromCloud', () => {
    const cloudPayload = serializeForecast(
      { days: {}, currentDay: 1, cycleDate: '2026-05-01' },
      { center: [0, 0], zoom: 0 }
    );

    const cloudCycle = (overrides: Partial<CloudCycle> = {}): CloudCycle => ({
      id: 'cycle-1',
      userId: 'user-1',
      label: 'Today',
      cycleDate: '2026-05-01',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
      forecastDays: 1,
      totalOutlooks: 0,
      totalFeatures: 0,
      isReadOnly: false,
      payload: cloudPayload,
      ...overrides,
    });

    test('loads and deserializes a premium cloud cycle', async () => {
      mockedLoadCloudCycle.mockResolvedValue({
        success: true,
        data: cloudCycle(),
      } as CloudOperationResult<CloudCycle>);

      const cycle = await loadForecastFromCloud({ userId: 'user-1', cycleId: 'cycle-1' });
      expect(cycle.cycleDate).toBe('2026-05-01');
      expect(mockedLoadCloudCycle).toHaveBeenCalledWith({ userId: 'user-1', cycleId: 'cycle-1' });
    });

    test('throws SourceLoadError when the cloud cycle lookup fails', async () => {
      mockedLoadCloudCycle.mockResolvedValue({
        success: false,
        error: 'Cloud cycle not found',
      });

      await expect(
        loadForecastFromCloud({ userId: 'user-1', cycleId: 'missing' })
      ).rejects.toBeInstanceOf(SourceLoadError);
    });
  });
});
