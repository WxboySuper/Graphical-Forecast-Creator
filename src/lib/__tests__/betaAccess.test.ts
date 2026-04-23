import {
  isBetaModeEnabled,
  getBetaInvitePath,
  isLocalBetaBypassHost,
  resolveLocalBetaBypass,
} from '../betaAccess';

describe('betaAccess', () => {
  describe('isLocalBetaBypassHost', () => {
    it('returns true for localhost', () => {
      expect(isLocalBetaBypassHost('localhost')).toBe(true);
    });
    it('returns true for 127.0.0.1', () => {
      expect(isLocalBetaBypassHost('127.0.0.1')).toBe(true);
    });
    it('returns true for ::1', () => {
      expect(isLocalBetaBypassHost('[::1]')).toBe(true);
    });
    it('returns true for .local domains', () => {
      expect(isLocalBetaBypassHost('myapp.local')).toBe(true);
    });
    it('returns false for production domain', () => {
      expect(isLocalBetaBypassHost('graphicalforecast.com')).toBe(false);
    });
  });

  describe('resolveLocalBetaBypass', () => {
    it('returns false when not a local bypass host', () => {
      const result = resolveLocalBetaBypass({ hostname: 'graphicalforecast.com', search: '', storageValue: null });
      expect(result).toBe(false);
    });
    it('returns query param true when present', () => {
      const result = resolveLocalBetaBypass({ hostname: 'localhost', search: '?localBetaBypass=true', storageValue: null });
      expect(result).toBe(true);
    });
    it('returns query param false when present', () => {
      const result = resolveLocalBetaBypass({ hostname: 'localhost', search: '?localBetaBypass=false', storageValue: null });
      expect(result).toBe(false);
    });
    it('returns storage true when no query param and storage is true', () => {
      const result = resolveLocalBetaBypass({ hostname: 'localhost', search: '', storageValue: 'true' });
      expect(result).toBe(true);
    });
    it('returns storage false when no query param and storage is false', () => {
      const result = resolveLocalBetaBypass({ hostname: 'localhost', search: '', storageValue: 'false' });
      expect(result).toBe(false);
    });
    it('handles yes/on/1 as true', () => {
      expect(resolveLocalBetaBypass({ hostname: 'localhost', search: '?localBetaBypass=yes', storageValue: null })).toBe(true);
      expect(resolveLocalBetaBypass({ hostname: 'localhost', search: '?localBetaBypass=on', storageValue: null })).toBe(true);
      expect(resolveLocalBetaBypass({ hostname: 'localhost', search: '?localBetaBypass=1', storageValue: null })).toBe(true);
    });
    it('handles no/off/0 as false', () => {
      expect(resolveLocalBetaBypass({ hostname: 'localhost', search: '?localBetaBypass=no', storageValue: null })).toBe(false);
      expect(resolveLocalBetaBypass({ hostname: 'localhost', search: '?localBetaBypass=off', storageValue: null })).toBe(false);
      expect(resolveLocalBetaBypass({ hostname: 'localhost', search: '?localBetaBypass=0', storageValue: null })).toBe(false);
    });
  });
});
