import { MARKETING_PRICING_URL, MARKETING_UPDATES_URL, marketingUrl } from './marketingLinks';

describe('marketingLinks', () => {
  it('builds absolute marketing URLs from clean paths', () => {
    expect(marketingUrl('/about/')).toBe('https://gfcweather.com/about/');
    expect(marketingUrl('contact/')).toBe('https://gfcweather.com/contact/');
    expect(MARKETING_PRICING_URL).toBe('https://gfcweather.com/pricing/');
    expect(MARKETING_UPDATES_URL).toBe('https://gfcweather.com/updates/');
  });
});
