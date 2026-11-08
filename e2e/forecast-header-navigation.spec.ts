import { expect, test } from '@playwright/test';
import { prepareAppState } from './testSetup';

test.describe('Forecast header navigation', () => {
  test.beforeEach(async ({ page }) => {
    await prepareAppState(page);
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.goto('/forecast/severe');
  });

  test('supports keyboard navigation, dismissal, and a narrow viewport', async ({ page }, testInfo) => {
    const trigger = page.getByRole('button', {
      name: 'Forecast menu, current page Severe',
    });
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await page.keyboard.press('Enter');

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const severeWorkspace = page.getByRole('menuitem', {
      name: 'Severe forecast workspace',
    });
    await expect(severeWorkspace).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('menuitem', { name: /Tropical forecast workspace/ })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: /Winter forecast workspace/ })).toHaveCount(0);

    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem').nth(1)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(1300, 800);
    await expect(menu).toBeHidden();

    await trigger.click();
    await page.getByRole('menuitem', { name: 'Discussion' }).click();
    await expect(page).toHaveURL(/\/forecast\/severe\?.*surface=discussion/);
    const discussionTrigger = page.getByRole('button', {
      name: 'Forecast menu, current page Discussion',
    });
    await expect(discussionTrigger).toHaveClass(/is-active/);

    await page.goto('/forecast/severe');

    await page.setViewportSize({ width: 375, height: 812 });
    const narrowTrigger = page.getByRole('button', {
      name: 'Forecast menu, current page Severe',
    });
    await expect(narrowTrigger).toBeVisible();
    await narrowTrigger.click();
    await expect(menu).toBeVisible();
    const menuBounds = await menu.boundingBox();
    expect(menuBounds).not.toBeNull();
    expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(375);
    await page.screenshot({ path: testInfo.outputPath('forecast-menu-mobile.png') });
  });
});
