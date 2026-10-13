type FetchMock = jest.Mock<Promise<{ ok: boolean; text: () => Promise<string> }>, []>;

/** Representative raw tornado archive body shared by archive fallback tests. */
const rawTornadoArchiveCsv = (): string => [
  'Raw Tornado LSR',
  'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
  '1234,EF1,,33.5,-97.2,Ada,Denton,TX,,',
].join('\n');

const filteredFailureResponses: Array<[string, { ok: boolean; status: number; text?: () => Promise<string> }]> = [
  ['an HTML error page', { ok: true, status: 200, text: () => Promise.resolve('<html>Unavailable</html>') }],
  ['a server error', { ok: false, status: 503 }],
  ['a rejected body read', { ok: true, status: 200, text: () => Promise.reject(new TypeError('stream failed')) }],
];

jest.setTimeout(10000);

afterEach(() => {
  Reflect.deleteProperty(globalThis as typeof globalThis & { fetch?: unknown }, 'fetch');
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('stormReportParser integration tests', () => {
  test('rejects impossible YYMMDD archive dates before fetching', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { fetchStormReports } = await import('./stormReportParser');

    await expect(fetchStormReports('991332')).rejects.toThrow('Invalid SPC report date');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rejects future archive dates before fetching', async () => {
    const fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { fetchStormReports, formatReportDate } = await import('./stormReportParser');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 2);
    await expect(fetchStormReports(formatReportDate(futureDate))).rejects.toThrow('Invalid SPC report date');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each(filteredFailureResponses)('retries the raw archive after %s', async (_description, filteredResponse) => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(filteredResponse)
      .mockResolvedValueOnce({ ok: true, status: 200, text: () => Promise.resolve(rawTornadoArchiveCsv()) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { fetchStormReports } = await import('./stormReportParser');
    await expect(fetchStormReports('260130')).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('remembers dates that only have a raw archive for this page session', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(rawTornadoArchiveCsv()) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { fetchStormReports } = await import('./stormReportParser');
    await fetchStormReports('260130');
    await fetchStormReports('260130');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'https://www.spc.noaa.gov/climo/reports/260130_rpts_raw.csv');
  });

  test('does not treat a report comment containing a section label as a new section', async () => {
    jest.doMock('uuid', () => ({ v4: () => 'section-anchor-test' }));

    const csv = [
      'Raw Tornado LSR',
      'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
      '1234,EF1,"Tree report mentions Hail LSR in comments",33.5,-97.2,Ada,Denton,TX,,',
      '',
      'Raw Wind/Gust LSR',
      'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
      '1240,UNK,"Wind report mentions Tornado LSR",34.0,-96.0,Norman,Cleveland,OK,65,',
    ].join('\n');

    globalThis.fetch = jest.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve(csv) })) as unknown as typeof fetch;
    const { fetchStormReports } = await import('./stormReportParser');

    const reports = await fetchStormReports('260130');

    expect(reports.map(({ type }) => type)).toEqual(['tornado', 'wind']);
    expect(reports[0]?.comments).toContain('Hail LSR');
    expect(reports[1]?.magnitude).toBe('65 mph');
  });

  test('accepts current archive section labels without the Raw prefix', async () => {
    jest.doMock('uuid', () => ({ v4: () => 'current-section-anchor-test' }));
    const csv = [
      'Tornado LSR',
      'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
      '1234,EF1,,33.5,-97.2,Ada,Denton,TX,,',
    ].join('\n');
    globalThis.fetch = jest.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve(csv) })) as unknown as typeof fetch;

    const { fetchStormReports } = await import('./stormReportParser');
    const reports = await fetchStormReports('260130');

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ type: 'tornado', magnitude: 'EF1', latitude: 33.5, longitude: -97.2 });
  });

  test('handles filtered headers with long preambles, quotes, casing, and whitespace', async () => {
    const csv = [
      ...Array.from({ length: 60 }, (_, index) => `SPC archive note ${index}`),
      '\uFEFF "TIME" , "F_Scale" , Location, County, State, Lat, Lon, Comments',
      '1234,1,Ada,Denton,TX,33.5,-97.2,Quoted header',
    ].join('\n');
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(csv) }) as unknown as typeof fetch;
    const { fetchStormReports } = await import('./stormReportParser');
    await expect(fetchStormReports('260130')).resolves.toMatchObject([
      { type: 'tornado', magnitude: 'EF1', latitude: 33.5, longitude: -97.2 },
    ]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test.each(['', '<html><body>maintenance</body></html>'])(
    'rejects empty or HTML archive bodies instead of reporting zero storms', async (body) => {
      globalThis.fetch = jest.fn(() => Promise.resolve({
        ok: true,
        text: () => Promise.resolve(body),
      })) as unknown as typeof fetch;

      const { fetchStormReports } = await import('./stormReportParser');
      await expect(fetchStormReports('260130')).rejects.toThrow('invalid report archive');
    }
  );

  test('parses tornado EF from Remarks when EF_Scale is UNK and handles quoted location', async () => {
    jest.doMock('uuid', () => ({ v4: () => 'test-uuid-1' }));

    const csv = [
      'Raw Tornado LSR',
      'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
      '1234,UNK,"EF2 damage near river, multiple structures",33.5,-97.2,"Town, River",Denton,TX,,',
      ''
    ].join('\n');

    const fetchMock: FetchMock = jest.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve(csv) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { fetchStormReports } = await import('./stormReportParser');
    const reports = await fetchStormReports('260130');

    expect(reports).toHaveLength(1);
    const report = reports[0];
    expect(report.id).toBe('test-uuid-1');
    expect(report.type).toBe('tornado');
    expect(report.magnitude).toBe('EF2');
    expect(report.latitude).toBeCloseTo(33.5);
    expect(report.longitude).toBeCloseTo(-97.2);
    expect(report.location).toBe('Town, River');
  });

  test('parses explicit EF_Scale, wind speed, hail size and skips invalid coords rows', async () => {
    jest.doMock('uuid', () => ({ v4: () => 'test-uuid-2' }));

    const csv = [
      'Raw Tornado LSR',
      'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
      '0100,EF3,,34.0,-96.0,Someplace,CountyA,ST,,',
      '',
      'Raw Wind/Gust LSR',
      'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
      '0200,UNK,"",35.0,-95.0,Windytown,WindCounty,WC,45,',
      '',
      'Raw Hail LSR',
      'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
      '0300,UNK,"",36.0,-94.5,Hailville,HailCounty,HC,,075',
      '',
      'Raw Wind LSR',
      'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
      '0400,UNK,"",N/A,N/A,BadCoords,BadCounty,BC,55,',
    ].join('\n');

    const fetchMock: FetchMock = jest.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve(csv) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { fetchStormReports } = await import('./stormReportParser');
    const reports = await fetchStormReports('260130');

    expect(reports.length).toBe(3);

    const tornadoReport = reports.find((report) => report.type === 'tornado');
    expect(tornadoReport).toBeDefined();
    expect(tornadoReport?.magnitude).toBe('EF3');

    const windReport = reports.find((report) => report.type === 'wind');
    expect(windReport).toBeDefined();
    expect(windReport?.magnitude).toBe('45 mph');

    const hailReport = reports.find((report) => report.type === 'hail');
    expect(hailReport).toBeDefined();
    expect(hailReport?.magnitude).toBe('0.75"');
  });

  test('does not reuse headers from one raw section when the next section lacks a header', async () => {
    const csv = [
      'Raw Tornado LSR',
      'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
      '1234,EF1,,33.5,-97.2,Ada,Denton,TX,,',
      'Raw Wind/Gust LSR',
      '1240,UNK,,34.0,-96.0,Norman,Cleveland,OK,65,',
      'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
      '1245,UNK,,34.1,-96.1,Norman,Cleveland,OK,70,',
    ].join('\n');
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(csv) }) as unknown as typeof fetch;
    const { fetchStormReports } = await import('./stormReportParser');
    const reports = await fetchStormReports('260130');
    expect(reports).toHaveLength(2);
    expect(reports.map((report) => report.type)).toEqual(['tornado', 'wind']);
    expect(reports[1]?.magnitude).toBe('70 mph');
  });

  test('direct archive parsing rejects unrecognized input', async () => {
    const { parseArchiveStormReportCsv } = await import('./stormReportParser');
    expect(() => parseArchiveStormReportCsv('bad input')).toThrow('invalid report archive');
  });

  test('formatReportDate and parseReportDate roundtrip', async () => {
    const { formatReportDate, parseReportDate } = await import('./stormReportParser');
    const date = new Date(2026, 0, 30);
    const reportDate = formatReportDate(date);
    expect(reportDate).toBe('260130');
    const parsedDate = parseReportDate(reportDate);
    expect(parsedDate.getFullYear()).toBe(2026);
    expect(parsedDate.getMonth()).toBe(0);
    expect(parsedDate.getDate()).toBe(30);
  });
});
