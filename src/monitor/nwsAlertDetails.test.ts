import {
  formatNwsAlertTime,
  parseNwsAlertProperties,
  resolveNwsAlertDetailUrl,
} from './nwsAlertDetails';

describe('nwsAlertDetails', () => {
  test('parseNwsAlertProperties maps NWS fields', () => {
    const details = parseNwsAlertProperties({
      event: 'Tornado Warning',
      headline: 'Tornado Warning issued April 20',
      areaDesc: 'Oklahoma County; Cleveland County',
      severity: 'Extreme',
      certainty: 'Observed',
      urgency: 'Immediate',
      effective: '2026-04-20T18:00:00-05:00',
      expires: '2026-04-20T19:00:00-05:00',
      description: 'Take shelter now.',
      instruction: 'Move to an interior room.',
      senderName: 'NWS Norman OK',
      '@id': 'https://api.weather.gov/alerts/urn:oid:1.2.3',
    });

    expect(details.event).toBe('Tornado Warning');
    expect(details.headline).toContain('Tornado Warning issued');
    expect(details.areaDesc).toContain('Oklahoma County');
    expect(details.description).toBe('Take shelter now.');
    expect(details.detailUrl).toBe('https://api.weather.gov/alerts/urn:oid:1.2.3');
  });

  test('resolveNwsAlertDetailUrl ignores non-url ids', () => {
    expect(resolveNwsAlertDetailUrl({ id: 'local-id' })).toBeNull();
    expect(resolveNwsAlertDetailUrl({ '@id': 'https://api.weather.gov/alerts/1' }))
      .toBe('https://api.weather.gov/alerts/1');
  });

  test('formatNwsAlertTime returns readable text for valid ISO timestamps', () => {
    const formatted = formatNwsAlertTime('2026-04-20T18:00:00-05:00');
    expect(formatted).toBeTruthy();
    expect(formatted).not.toBe('2026-04-20T18:00:00-05:00');
  });
});
