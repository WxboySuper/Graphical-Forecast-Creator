import { keyboardShortcutKey } from './keyboardShortcutKey';

describe('keyboardShortcutKey', () => {
  it('returns a lowercased key when present', () => {
    expect(keyboardShortcutKey(new KeyboardEvent('keydown', { key: 'Z' }))).toBe('z');
  });

  it('returns null when the browser omits KeyboardEvent.key', () => {
    const event = new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true });
    Object.defineProperty(event, 'key', { value: undefined });

    expect(keyboardShortcutKey(event)).toBeNull();
  });
});
