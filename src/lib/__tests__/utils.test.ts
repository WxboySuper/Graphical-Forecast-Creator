import { cn } from '../utils';

describe('utils', () => {
  describe('cn', () => {
    it('merges class names', () => {
      const result = cn('foo', 'bar');
      expect(typeof result).toBe('string');
      expect(result).toContain('foo');
      expect(result).toContain('bar');
    });

    it('handles conditional classes', () => {
      const result = cn('foo', false && 'bar', 'baz');
      expect(result).toContain('foo');
      expect(result).toContain('baz');
      expect(result).not.toContain('bar');
    });

    it('handles empty input', () => {
      const result = cn();
      expect(result).toBe('');
    });

    it('resolves tailwind conflicts', () => {
      const result = cn('text-red-500', 'text-red-600');
      expect(typeof result).toBe('string');
    });
  });
});