import { hasAnyModifierKey, isTypingTarget, keyboardShortcutKey } from './keyboardShortcutKey';

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

describe('isTypingTarget', () => {
  it('returns true for input and textarea elements', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
  });

  it('returns false for other elements', () => {
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
  });
});

describe('hasAnyModifierKey', () => {
  it('returns true when a modifier is held', () => {
    expect(hasAnyModifierKey(new KeyboardEvent('keydown', { ctrlKey: true }))).toBe(true);
  });

  it('returns false when no modifier is held', () => {
    expect(hasAnyModifierKey(new KeyboardEvent('keydown'))).toBe(false);
  });
});
