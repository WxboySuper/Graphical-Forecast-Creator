const MODIFIER_KEYS: Array<keyof Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>> = [
  'ctrlKey',
  'metaKey',
  'altKey',
  'shiftKey',
];

/**
 * Normalizes a keydown event key for app shortcuts.
 * Some browsers (e.g. Opera) fire keydown with an undefined `key` while modifiers are held.
 */
export function keyboardShortcutKey(event: KeyboardEvent): string | null {
  if (!event.key) {
    return null;
  }

  return event.key.toLowerCase();
}

/** Returns true if the event target is an input or textarea that should receive keyboard text. */
export const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

/** Returns true if any Ctrl / Meta / Alt / Shift modifier key is held during the event. */
export const hasAnyModifierKey = (event: KeyboardEvent): boolean =>
  MODIFIER_KEYS.some((modifier) => event[modifier]);
