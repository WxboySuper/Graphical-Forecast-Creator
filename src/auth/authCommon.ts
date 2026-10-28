/** Safely parse JSON from a Response. Returns parsed value or null on failure. */
export const safeParseJson = async <T = unknown>(resp: Response): Promise<T | null> => {
  try {
    const parsed = await resp.json();
    return parsed as T;
  } catch {
    return null;
  }
};

/** Coerce unknown value to a plain record for safe property access. */
export const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/** Attempt to extract minimal local user fields from an unknown response. */
export const extractLocalUserFromData = (data: unknown) => {
  const rec = asRecord(data);
  const uid = typeof rec.uid === 'string' ? rec.uid : 'local';
  const email = typeof rec.email === 'string' ? rec.email : '';
  const displayName = typeof rec.displayName === 'string' ? rec.displayName : '';
  return {
    uid,
    email,
    displayName,
    providerData: [],
  };
};

type LocalPostRequestOptions = {
  body?: unknown;
  failureMessage: string;
};

/** Posts JSON to a local auth endpoint and normalizes non-ok responses into errors. */
export const postLocalJson = async <TResponse = Record<string, unknown>>(
  path: string,
  { body, failureMessage }: LocalPostRequestOptions,
): Promise<TResponse> => {
  const resp = await fetch(path, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include',
  });

  if (!resp.ok) {
    const errorBody = (await safeParseJson<{ message?: string }>(resp)) ?? {};
    throw new Error(errorBody.message ?? failureMessage);
  }

  return (await safeParseJson<TResponse>(resp)) ?? ({} as TResponse);
};
