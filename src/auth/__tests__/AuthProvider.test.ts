import { safeParseJson, asRecord, extractLocalUserFromData, createSettingsSnapshot, readRemoteSettings } from '../AuthProvider';
import type { UserSettingsDocument } from '../AuthProvider';
import type { OverlaysState } from '../../store/overlaysSlice';

describe('AuthProvider utility functions', () => {
  describe('safeParseJson', () => {
    it('parses valid JSON', async () => {
      const mockResponse = {
        json: () => Promise.resolve({ foo: 'bar' }),
      } as unknown as Response;
      const result = await safeParseJson(mockResponse);
      expect(result).toEqual({ foo: 'bar' });
    });

    it('returns null on JSON parse error', async () => {
      const mockResponse = {
        json: () => Promise.reject(new Error('parse error')),
      } as unknown as Response;
      const result = await safeParseJson<{ foo: string }>(mockResponse);
      expect(result).toBeNull();
    });

    it('returns null when json throws a non-error', async () => {
      const mockResponse = {
        json: () => Promise.reject('string error'),
      } as unknown as Response;
      const result = await safeParseJson(mockResponse);
      expect(result).toBeNull();
    });
  });

  describe('asRecord', () => {
    it('converts object to record', () => {
      const input = { foo: 'bar', count: 42 };
      const result = asRecord(input);
      expect(result).toEqual({ foo: 'bar', count: 42 });
    });

    it('returns empty record for null', () => {
      const result = asRecord(null);
      expect(result).toEqual({});
    });

    it('returns empty record for undefined', () => {
      const result = asRecord(undefined);
      expect(result).toEqual({});
    });

    it('returns empty record for primitives', () => {
      expect(asRecord('string')).toEqual({});
      expect(asRecord(123)).toEqual({});
      expect(asRecord(true)).toEqual({});
    });

    it('treats arrays as objects (returns them as-is)', () => {
      const arr = [1, 2, 3];
      const result = asRecord(arr);
      // arrays pass the object check, so they are returned as Record
      expect(result).toEqual([1, 2, 3] as unknown as Record<string, unknown>);
    });
  });

  describe('extractLocalUserFromData', () => {
    it('extracts user fields from valid data', () => {
      const data = {
        uid: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
      };
      const result = extractLocalUserFromData(data);
      expect(result).toEqual({
        uid: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        providerData: [],
      });
    });

    it('returns local uid for missing uid', () => {
      const data = { email: 'test@example.com' };
      const result = extractLocalUserFromData(data);
      expect(result.uid).toBe('local');
    });

    it('returns empty string for missing email', () => {
      const data = { uid: 'user-123' };
      const result = extractLocalUserFromData(data);
      expect(result.email).toBe('');
    });

    it('returns empty string for missing displayName', () => {
      const data = { uid: 'user-123', email: 'test@example.com' };
      const result = extractLocalUserFromData(data);
      expect(result.displayName).toBe('');
    });

    it('handles non-object input', () => {
      expect(extractLocalUserFromData(null)).toEqual({
        uid: 'local',
        email: '',
        displayName: '',
        providerData: [],
      });
      expect(extractLocalUserFromData('string')).toEqual({
        uid: 'local',
        email: '',
        displayName: '',
        providerData: [],
      });
    });
  });

  describe('createSettingsSnapshot', () => {
    it('creates settings snapshot from build args', () => {
      const overlays: OverlaysState = {
        baseMapStyle: 'carto-dark',
        stateBorders: false,
        counties: true,
        ghostOutlooks: {
          tornado: true, wind: false, hail: false,
          categorical: false, totalSevere: false, 'day4-8': false,
        },
      };
      const args = {
        darkMode: true,
        overlays,
        defaultForecasterName: 'Test User',
        forecastUiVariant: 'traditional' as const,
      };
      const result = createSettingsSnapshot(args);
      expect(result.darkMode).toBe(true);
      expect(result.baseMapStyle).toBe('carto-dark');
      expect(result.counties).toBe(true);
      expect(result.defaultForecasterName).toBe('Test User');
    });

    it('creates snapshot with osm base map style', () => {
      const overlays: OverlaysState = {
        baseMapStyle: 'osm',
        stateBorders: true,
        counties: false,
        ghostOutlooks: {
          tornado: false, wind: false, hail: false,
          categorical: false, totalSevere: false, 'day4-8': false,
        },
      };
      const args = {
        darkMode: false,
        overlays,
        defaultForecasterName: '',
        forecastUiVariant: 'traditional' as const,
      };
      const result = createSettingsSnapshot(args);
      expect(result.baseMapStyle).toBe('osm');
      expect(result.darkMode).toBe(false);
    });
  });

  describe('readRemoteSettings', () => {
    it('returns settings when all required fields present and valid', () => {
      const value: Partial<UserSettingsDocument> = {
        darkMode: true,
        baseMapStyle: 'carto-dark',
        stateBorders: false,
        counties: true,
        ghostOutlooks: {
          tornado: false, wind: false, hail: false,
          categorical: false, totalSevere: false, 'day4-8': false,
        },
        defaultForecasterName: 'Tester',
        forecastUiVariant: 'categorical',
      };
      const result = readRemoteSettings(value);
      expect(result).not.toBeNull();
      expect(result?.darkMode).toBe(true);
      expect(result?.baseMapStyle).toBe('carto-dark');
    });

    it('returns null when value is undefined', () => {
      const result = readRemoteSettings(undefined);
      expect(result).toBeNull();
    });

    it('returns null when value is null', () => {
      const result = readRemoteSettings(null as unknown as undefined);
      expect(result).toBeNull();
    });

    it('returns null when darkMode is missing', () => {
      const value = {
        baseMapStyle: 'osm',
        stateBorders: true,
        counties: false,
        ghostOutlooks: { tornado: false, wind: false, hail: false, categorical: false, totalSevere: false, 'day4-8': false },
        defaultForecasterName: '',
      };
      const result = readRemoteSettings(value as Partial<UserSettingsDocument>);
      expect(result).toBeNull();
    });

    it('returns null when baseMapStyle is missing', () => {
      const value = {
        darkMode: false,
        stateBorders: true,
        counties: false,
        ghostOutlooks: { tornado: false, wind: false, hail: false, categorical: false, totalSevere: false, 'day4-8': false },
        defaultForecasterName: '',
      };
      const result = readRemoteSettings(value as Partial<UserSettingsDocument>);
      expect(result).toBeNull();
    });

    it('returns null when ghostOutlooks is missing', () => {
      const value = {
        darkMode: false,
        baseMapStyle: 'osm' as const,
        stateBorders: true,
        counties: false,
        defaultForecasterName: '',
      };
      const result = readRemoteSettings(value as Partial<UserSettingsDocument>);
      expect(result).toBeNull();
    });

    it('returns null when stateBorders is not boolean', () => {
      const value = {
        darkMode: false,
        baseMapStyle: 'osm' as const,
        stateBorders: 'yes' as unknown as boolean,
        counties: false,
        ghostOutlooks: { tornado: false, wind: false, hail: false, categorical: false, totalSevere: false, 'day4-8': false },
        defaultForecasterName: '',
      };
      const result = readRemoteSettings(value as Partial<UserSettingsDocument>);
      expect(result).toBeNull();
    });

    it('returns partial object when only some fields are present and valid', () => {
      const value = {
        darkMode: true,
        baseMapStyle: 'osm',
        stateBorders: true,
        counties: false,
        ghostOutlooks: { tornado: false, wind: false, hail: false, categorical: false, totalSevere: false, 'day4-8': false },
        defaultForecasterName: 'Test',
      };
      const result = readRemoteSettings(value as Partial<UserSettingsDocument>);
      expect(result).not.toBeNull();
      expect(result?.darkMode).toBe(true);
    });
  });
});