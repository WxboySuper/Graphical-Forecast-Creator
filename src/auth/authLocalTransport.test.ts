import { asRecord, extractLocalUserFromData, postLocalJson, safeParseJson } from './authLocalTransport';

describe('authLocalTransport', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  test('safeParseJson returns the parsed body', async () => {
    const body = { uid: 'user-1' };
    const resp = { json: jest.fn().mockResolvedValue(body) } as unknown as Response;

    await expect(safeParseJson(resp)).resolves.toEqual(body);
  });

  test('safeParseJson returns null when the body is not JSON', async () => {
    const resp = { json: jest.fn().mockRejectedValue(new Error('invalid json')) } as unknown as Response;

    await expect(safeParseJson(resp)).resolves.toBeNull();
  });

  test('asRecord passes objects through and returns an empty record for arrays, primitives and null', () => {
    const record = { uid: 'user-1' };

    expect(asRecord(record)).toEqual(record);
    expect(asRecord(['user-1'])).toEqual({});
    expect(asRecord(null)).toEqual({});
    expect(asRecord(undefined)).toEqual({});
    expect(asRecord('user-1')).toEqual({});
    expect(asRecord(42)).toEqual({});
  });

  test('extractLocalUserFromData reads local user fields', () => {
    expect(
      extractLocalUserFromData({ uid: 'user-1', email: 'user@example.com', displayName: 'User' }),
    ).toEqual({
      uid: 'user-1',
      email: 'user@example.com',
      displayName: 'User',
      providerData: [],
    });
  });

  test('extractLocalUserFromData falls back when fields are missing or mistyped', () => {
    expect(extractLocalUserFromData({})).toEqual({
      uid: 'local',
      email: '',
      displayName: '',
      providerData: [],
    });

    expect(extractLocalUserFromData({ uid: 42, email: null, displayName: ['User'] })).toEqual({
      uid: 'local',
      email: '',
      displayName: '',
      providerData: [],
    });
  });

  test('extractLocalUserFromData falls back for non-object payloads', () => {
    const fallback = { uid: 'local', email: '', displayName: '', providerData: [] };

    expect(extractLocalUserFromData(null)).toEqual(fallback);
    expect(extractLocalUserFromData(undefined)).toEqual(fallback);
    expect(extractLocalUserFromData('user-1')).toEqual(fallback);
  });

  test.each([
    {
      name: 'sends JSON with credentials',
      requestOptions: { body: { ok: true }, failureMessage: 'Failed' },
      expectedInit: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true }),
        credentials: 'include',
      },
    },
    {
      name: 'omits headers and body when there is no payload',
      requestOptions: { failureMessage: 'Failed' },
      expectedInit: {
        method: 'POST',
        headers: undefined,
        body: undefined,
        credentials: 'include',
      },
    },
  ])('postLocalJson $name', async ({ requestOptions, expectedInit }) => {
    const fetchMock = jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    } as unknown as Response);

    await expect(postLocalJson('/api/local/test', requestOptions)).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith('/api/local/test', expectedInit);
  });

  test('postLocalJson resolves an empty object when a success body is not JSON', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new Error('invalid json')),
    } as unknown as Response);

    await expect(postLocalJson('/api/local/test', { failureMessage: 'Failed' })).resolves.toEqual({});
  });

  test('postLocalJson throws the server message on failure', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: 'Nope' }),
    } as unknown as Response);

    await expect(postLocalJson('/api/local/test', { failureMessage: 'Failed' })).rejects.toThrow('Nope');
  });

  test('postLocalJson falls back to the failure message without a server message', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    } as unknown as Response);

    await expect(postLocalJson('/api/local/test', { failureMessage: 'Failed' })).rejects.toThrow('Failed');
  });

  test('postLocalJson falls back to the failure message when the error body is not JSON', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.reject(new Error('invalid json')),
    } as unknown as Response);

    await expect(postLocalJson('/api/local/test', { failureMessage: 'Failed' })).rejects.toThrow('Failed');
  });

  test('postLocalJson propagates a fetch rejection', async () => {
    jest.mocked(global.fetch).mockRejectedValueOnce(new Error('offline'));

    await expect(postLocalJson('/api/local/test', { failureMessage: 'Failed' })).rejects.toThrow('offline');
  });
});
