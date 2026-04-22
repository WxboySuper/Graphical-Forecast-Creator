jest.setTimeout(10000);

afterEach(() => {
  // cleanup mocked fetch
  try { delete (global as any).fetch; } catch {}
  jest.resetModules();
  jest.restoreAllMocks();
});

describe('stormReportParser integration tests', () => {
  test('parses tornado EF from Remarks when EF_Scale is UNK and handles quoted location', async () => {
    jest.resetModules();
    jest.doMock('uuid', () => ({ v4: () => 'test-uuid-1' }));

    const csv = [
      'Raw Tornado LSR',
      'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
      '1234,UNK,"EF2 damage near river, multiple structures",33.5,-97.2,"Town, River",Denton,TX,,',
      ''
    ].join('\n');

    (global as any).fetch = jest.fn(async () => ({ ok: true, text: async () => csv }));

    const { fetchStormReports } = await import('./stormReportParser');
    const reports = await fetchStormReports('260130');

    expect(reports).toHaveLength(1);
    const r = reports[0];
    expect(r.id).toBe('test-uuid-1');
    expect(r.type).toBe('tornado');
    expect(r.magnitude).toBe('EF2');
    expect(r.latitude).toBeCloseTo(33.5);
    expect(r.longitude).toBeCloseTo(-97.2);
    // Location should preserve the comma inside the quoted field
    expect(r.location).toBe('Town, River');
  });

  test('parses explicit EF_Scale, wind speed, hail size and skips invalid coords rows', async () => {
    jest.resetModules();
    jest.doMock('uuid', () => ({ v4: () => 'test-uuid-2' }));

    const csv = [
      'Raw Tornado LSR',
      'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
      '0100,EF3,,34.0,-96.0,Someplace,CountyA,ST,,',
      '',
      'Raw Wind/Gust LSR',
      'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
      // correctly align empty EF_Scale and Remarks, then lat/lon
      '0200,UNK,"",35.0,-95.0,Windytown,WindCounty,WC,45,',
      '',
      'Raw Hail LSR',
      'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
      '0300,UNK,"",36.0,-94.5,Hailville,HailCounty,HC,,075',
      '',
      // invalid coords should be skipped
      'Raw Wind LSR',
      'Time,EF_Scale,Remarks,LAT,LON,Location,County,State,Speed(MPH),Size(1/100in.)',
      '0400,UNK,"",N/A,N/A,BadCoords,BadCounty,BC,55,',
    ].join('\n');

    (global as any).fetch = jest.fn(async () => ({ ok: true, text: async () => csv }));

    const { fetchStormReports } = await import('./stormReportParser');
    const reports = await fetchStormReports('260130');

    // Expect 3 valid reports (tornado, wind, hail); the bad coords row should be skipped
    expect(reports.length).toBe(3);

    const tornado = reports.find(r => r.type === 'tornado');
    expect(tornado).toBeDefined();
    expect(tornado!.magnitude).toBe('EF3');

    const wind = reports.find(r => r.type === 'wind');
    expect(wind).toBeDefined();
    expect(wind!.magnitude).toBe('45 mph');

    const hail = reports.find(r => r.type === 'hail');
    expect(hail).toBeDefined();
    // 075 -> 0.75 inches -> "0.75"
    expect(hail!.magnitude).toBe('0.75"');
  });

  test('formatReportDate and parseReportDate roundtrip', () => {
    const { formatReportDate, parseReportDate } = require('./stormReportParser');
    const d = new Date(2026, 0, 30); // Jan 30, 2026
    const s = formatReportDate(d);
    expect(s).toBe('260130');
    const parsed = parseReportDate(s);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(0);
    expect(parsed.getDate()).toBe(30);
  });
});
