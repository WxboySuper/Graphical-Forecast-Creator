import { APP_TITLE, getPageTitle } from './pageTitle';

describe('getPageTitle', () => {
  it.each([
    ['/', '', `Home | ${APP_TITLE}`],
    ['/forecast/severe', '', `Severe Forecast | ${APP_TITLE}`],
    ['/forecast/severe', '?surface=discussion', `Severe Discussion | ${APP_TITLE}`],
    ['/forecast/mesoscale', '', `Mesoscale Forecast | ${APP_TITLE}`],
    ['/cloud', '', `Cloud Library | ${APP_TITLE}`],
    ['/verification', '', `Verification | ${APP_TITLE}`],
    ['/collaboration-room', '', `Collaboration room | ${APP_TITLE}`],
  ])('titles %s%s', (pathname, search, expected) => {
    expect(getPageTitle(pathname, search)).toBe(expected);
  });

  it('never throws on malformed percent-encoding', () => {
    expect(() => getPageTitle('/discussion/%')).not.toThrow();
  });
});
