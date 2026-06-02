import { isSafeBannerLinkUrl, sanitizeBannerLinkUrl } from './bannerLinkUrl';

describe('bannerLinkUrl', () => {
  it('allows internal paths and http(s) URLs', () => {
    expect(isSafeBannerLinkUrl('/updates')).toBe(true);
    expect(isSafeBannerLinkUrl('https://example.com')).toBe(true);
    expect(isSafeBannerLinkUrl('http://example.com')).toBe(true);
  });

  it('rejects javascript and other schemes', () => {
    expect(isSafeBannerLinkUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeBannerLinkUrl('data:text/html,hi')).toBe(false);
  });

  it('sanitizeBannerLinkUrl drops unsafe values', () => {
    expect(sanitizeBannerLinkUrl('javascript:alert(1)')).toBeUndefined();
    expect(sanitizeBannerLinkUrl('https://wxboysuper.com')).toBe('https://wxboysuper.com');
  });
});
