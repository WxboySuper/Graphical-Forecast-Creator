/** Safely parses JSON from a response and returns null for an empty or invalid body. */
export const safeParseJson = async <T = unknown>(resp: Response): Promise<T | null> => {
  try {
    return (await resp.json()) as T;
  } catch {
    return null;
  }
};

/** Coerces an unknown response value into a record for guarded field access. */
export const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/** Extracts the minimal user shape returned by the local auth endpoints. */
export const extractLocalUserFromData = (data: unknown) => {
  const rec = asRecord(data);
  return {
    uid: typeof rec.uid === 'string' ? rec.uid : 'local',
    email: typeof rec.email === 'string' ? rec.email : '',
    displayName: typeof rec.displayName === 'string' ? rec.displayName : '',
    providerData: [],
  };
};

type LocalPostRequestOptions = {
  body?: unknown;
  failureMessage: string;
};

/** Posts JSON to a local auth endpoint and normalizes non-OK responses into errors. */
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
