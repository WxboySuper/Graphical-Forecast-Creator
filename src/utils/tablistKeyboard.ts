/**
 * Keyboard support for ARIA tablists. Attach to the `role="tablist"` element's onKeyDown.
 */
import type { KeyboardEvent } from 'react';

/** Moves focus and selection between tabs with the arrow, Home, and End keys (automatic activation). */
export const handleTablistKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
  if (!(event.target instanceof HTMLElement) || !event.target.matches('[role="tab"]')) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const current = Math.max(0, tabs.findIndex((tab) => tab === document.activeElement));
  const nextIndexByKey: Record<string, number> = {
    ArrowRight: (current + 1) % tabs.length,
    ArrowLeft: (current - 1 + tabs.length) % tabs.length,
    Home: 0,
    End: tabs.length - 1,
  };
  const next = nextIndexByKey[event.key];
  if (next === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  tabs[next]?.focus();
  tabs[next]?.click();
};
