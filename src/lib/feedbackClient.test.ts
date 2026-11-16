/**
 * Feedback client tests. Verify the request contract sent to the feedback
 * service and the user-facing messages for each failure class.
 */
import type { User } from 'firebase/auth';
import { FeedbackSubmitError, submitFeedback, toFeedbackPagePath } from './feedbackClient';

const globals = globalThis as typeof globalThis & { __GFC_BUILD_TARGET__?: string };
const user = { getIdToken: jest.fn().mockResolvedValue('id-token') } as unknown as User;
const submission = { category: 'bug' as const, message: '  The map froze on load.  ', contactOk: true, page: '/forecast/outlooks?x=1#h' };

const mockFetch = (response: Partial<Response> | Error) => {
  const fn = response instanceof Error ? jest.fn().mockRejectedValue(response) : jest.fn().mockResolvedValue(response);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
};

describe('toFeedbackPagePath', () => {
  test('drops query strings and hashes and bounds length', () => {
    expect(toFeedbackPagePath('/forecast?a=1')).toBe('/forecast');
    expect(toFeedbackPagePath('/x#y')).toBe('/x');
    expect(toFeedbackPagePath('/' + 'a'.repeat(400))).toHaveLength(200);
    expect(toFeedbackPagePath('')).toBe('/');
  });
});

describe('submitFeedback', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    globals.__GFC_BUILD_TARGET__ = 'local';
  });

  test('posts the documented contract with the Firebase token', async () => {
    globals.__GFC_BUILD_TARGET__ = 'beta';
    const fetchMock = mockFetch({ ok: true, status: 201, json: () => Promise.resolve({ id: 'abc' }) });

    await expect(submitFeedback(user, submission)).resolves.toBe('abc');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://feedback.example.test/v1/feedback');
    expect(init.headers.Authorization).toBe('Bearer id-token');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      category: 'bug',
      message: 'The map froze on load.',
      page: '/forecast/outlooks',
      buildTarget: 'beta',
      contactOk: true,
    });
    expect(typeof body.appVersion).toBe('string');
    expect(body.viewport).toMatch(/^\d+x\d+$/);
  });

  test('labels every non-beta build as production', async () => {
    globals.__GFC_BUILD_TARGET__ = 'production';
    const fetchMock = mockFetch({ ok: true, status: 201, json: () => Promise.resolve({ id: 'x' }) });
    await submitFeedback(user, submission);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).buildTarget).toBe('production');
  });

  test.each([
    [401, /sign in again/i],
    [429, /wait a few minutes/i],
    [500, /try again/i],
  ])('maps HTTP %i to a friendly message', async (status, pattern) => {
    mockFetch({ ok: false, status });
    await expect(submitFeedback(user, submission)).rejects.toThrow(pattern);
  });

  test('explains when a local-dev user has no hosted token instead of throwing a TypeError', async () => {
    globals.__GFC_BUILD_TARGET__ = 'beta';
    const fetchMock = mockFetch({ ok: true, status: 201 });
    await expect(submitFeedback({ uid: 'local' } as unknown as User, submission)).rejects.toThrow(/hosted GFC account/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('treats a successful response with a JSON null body as accepted', async () => {
    globals.__GFC_BUILD_TARGET__ = 'beta';
    mockFetch({ ok: true, status: 201, json: () => Promise.resolve(null) });
    await expect(submitFeedback(user, submission)).resolves.toBe('');
  });

  test('reports network failures as FeedbackSubmitError', async () => {
    mockFetch(new Error('offline'));
    await expect(submitFeedback(user, submission)).rejects.toBeInstanceOf(FeedbackSubmitError);
  });
});
