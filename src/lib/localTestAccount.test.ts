import { createLocalTestUser, isLocalTestAccountEnabled, readLocalTestAccount } from './localTestAccount';

describe('local test account fixture', () => {
  beforeEach(() => {
    globalThis.__GFC_DEV_MODE__ = true;
  });

  afterEach(() => {
    globalThis.__GFC_DEV_MODE__ = false;
    window.history.replaceState({}, '', '/');
    window.sessionStorage.clear();
  });

  test('requires development mode and an exact local hostname', () => {
    expect(isLocalTestAccountEnabled('localhost', true)).toBe(true);
    expect(isLocalTestAccountEnabled('127.0.0.1', true)).toBe(true);
    expect(isLocalTestAccountEnabled('localhost', false)).toBe(false);
    expect(isLocalTestAccountEnabled('beta.weatherboysuper.com', true)).toBe(false);
    expect(isLocalTestAccountEnabled('localhost.evil.example', true)).toBe(false);
  });

  test('reads free and premium fixtures only from local URLs', () => {
    window.history.replaceState({}, '', '/?localTestAccount=free');
    expect(readLocalTestAccount()).toBe('free');

    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/?localTestAccount=premium');
    expect(readLocalTestAccount()).toBe('premium');

    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/?localTestAccount=unknown');
    expect(readLocalTestAccount()).toBeNull();
  });

  test('keeps the fixture active after local SPA navigation removes the query string', () => {
    window.history.replaceState({}, '', '/?localTestAccount=free');
    expect(readLocalTestAccount()).toBe('free');

    window.history.replaceState({}, '', '/account');
    expect(readLocalTestAccount()).toBe('free');
  });

  test('creates a stable disposable identity', () => {
    expect(createLocalTestUser('premium')).toMatchObject({
      uid: 'local-test-premium',
      email: 'premium@local.test',
      displayName: 'Local premium test account',
    });
  });
});
