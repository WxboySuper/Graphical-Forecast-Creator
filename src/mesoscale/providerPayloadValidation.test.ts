import completePayload from './fixtures/complete.json';
import { getProviderPayloadError, isRecord } from './providerPayloadValidation';

const validPayload = completePayload as unknown as Record<string, unknown>;

const withChange = (path: string[], value: unknown): Record<string, unknown> => {
  const payload = JSON.parse(JSON.stringify(validPayload)) as Record<string, unknown>;
  let parent = payload;
  for (const key of path.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
  parent[path.at(-1)!] = value;
  return payload;
};

describe('getProviderPayloadError', () => {
  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'payload'],
  ])('rejects %s as the top-level payload', (_label, payload) => {
    expect(getProviderPayloadError(payload)).toBe('Provider payload must be an object.');
  });

  it('accepts a complete provider payload', () => {
    expect(getProviderPayloadError(validPayload)).toBeUndefined();
  });

  it.each([
    ['unsupported schema', ['schemaVersion'], 2, 'Unsupported or missing provider payload schema version.'],
    ['unknown model', ['model', 'id'], '__proto__', 'Model metadata or capabilities are missing or invalid.'],
    ['duplicate capabilities', ['model', 'capabilities', 'availableParameterIds'], ['mlcape', 'mlcape'], 'Model metadata or capabilities are missing or invalid.'],
    ['negative capability limit', ['model', 'capabilities', 'maxForecastHour'], -1, 'Model metadata or capabilities are missing or invalid.'],
    ['analysis with a nonzero hour', ['frameType'], 'analysis', 'Analysis frames must be f00 and forecast frames must be after f00.'],
    ['forecast outside model range', ['forecastHour'], 49, 'Forecast hour exceeds this model capability.'],
    ['timezone-less timestamp', ['cycleTime'], '2026-05-20T12:00:00', 'Cycle time must be a valid timestamp.'],
    ['inconsistent valid time', ['validTime'], '2026-05-20T16:00:00Z', 'Valid time must equal cycle time plus forecast hour.'],
    ['hostile domain bounds', ['domain', 'bounds'], [0, 1, Infinity, 3], 'Domain bounds must contain four finite coordinates.'],
    ['missing attribution', ['source', 'attribution'], '', 'Source metadata and attribution are required.'],
    ['missing provider data', ['parameters', '0', 'data'], null, 'Parameters contain invalid metadata or missing provider values.'],
    ['duplicate parameter identity', ['parameters', '1', 'id'], 'mlcape', 'Parameter entries must have unique, non-empty identities.'],
    ['unlisted parameter', ['model', 'capabilities', 'availableParameterIds'], ['mlcape'], 'A parameter is not listed in this model capabilities.'],
    ['duplicate requested identities', ['requestedParameterIds'], ['mlcape', 'mlcape'], 'Requested parameter identities must be unique non-empty strings.'],
  ])('rejects %s', (_label, path, value, expectedError) => {
    expect(getProviderPayloadError(withChange(path as string[], value))).toBe(expectedError);
  });

  it('rejects unavailable parameter identities that overlap supplied values', () => {
    const payload = withChange(['unavailableParameters'], [{ id: 'mlcape' }]);
    expect(getProviderPayloadError(payload)).toBe('A parameter cannot be both supplied and unavailable.');
  });
});

describe('isRecord', () => {
  it.each([{}, { value: 1 }])('accepts object records', value => {
    expect(isRecord(value)).toBe(true);
  });

  it.each([null, [], 'text', 1])('rejects non-record values', value => {
    expect(isRecord(value)).toBe(false);
  });
});
