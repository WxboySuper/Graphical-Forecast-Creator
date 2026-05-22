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
