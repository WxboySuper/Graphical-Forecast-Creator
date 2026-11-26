/** Verifies keyboard focus handoff between the More actions menu, the dialogs it opens, and the cycle history modal. */
import { test, expect, type Page } from '@playwright/test';
import { prepareAppState } from './testSetup';

const focusIsInside = (page: Page, selector: string) =>
  page.evaluate((sel) => Boolean(document.activeElement?.closest(sel)), selector);

test.describe('Dialog focus', () => {
  test.beforeEach(async ({ page }) => {
    await prepareAppState(page);
  });

  test('documentation drawer opened from More actions traps focus and returns it to the trigger', async ({ page }) => {
    await page.goto('/forecast');
    const trigger = page.getByRole('button', { name: 'More actions' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: /Documentation/ }).focus();
    await page.keyboard.press('Enter');

    const drawer = page.getByRole('dialog', { name: 'Documentation' });
    await expect(drawer).toBeVisible();
    await expect.poll(() => focusIsInside(page, '[aria-label="Documentation"]')).toBe(true);
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      expect(await focusIsInside(page, '[aria-label="Documentation"]')).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('cycle history modal keeps Tab inside and returns focus to its opener', async ({ page }) => {
    await page.goto('/forecast');
    await page.getByRole('tab', { name: /^Tools$/i }).click();
    const opener = page.getByRole('button', { name: /History/i }).first();
    await opener.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('button', { name: 'Close cycle history modal' })).toBeFocused();
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press('Tab');
      expect(await focusIsInside(page, '.history-modal')).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Close cycle history modal' })).toBeHidden();
    await expect(opener).toBeFocused();
  });
});
