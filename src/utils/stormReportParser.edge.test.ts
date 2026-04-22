type FetchMock = jest.Mock<Promise<{ ok: boolean; text: () => Promise<string> }>, []>;

jest.setTimeout(10000);

afterEach(() => {
  Reflect.deleteProperty(globalThis as typeof globalThis & { fetch?: unknown }, 'fetch');
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('stormReportParser integration tests', () => {
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
