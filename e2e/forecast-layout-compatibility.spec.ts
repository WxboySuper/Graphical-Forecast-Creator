/**
 * E2E contract for forecast-layout-compatibility.spec.
 *
 * This file defines browser-level checks for the forecast-layout-compatibility.spec workflow and its user-visible behavior.
 */
import { test, expect } from '@playwright/test';
import { prepareAppState } from './testSetup';

for (const variant of ['integrated', 'workspace_dock', 'floating_panels', 'tabbed_toolbar']) {
  test(`forecast controls remain usable with the ${variant} preference`, async ({ page }) => {
    await prepareAppState(page);
    await page.goto(`/forecast/severe?forecastUi=${variant}`);

    await expect(page.locator('.map-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.tabbed-integrated-toolbar')).toBeVisible();
    await page.getByRole('tab', { name: 'Days', exact: true }).click();
    await page.getByRole('button', { name: '2', exact: true }).click();
    await page.getByRole('tab', { name: 'Draw', exact: true }).click();
    await page.getByRole('button', { name: /wind/i }).first().click();
    await page.getByRole('button', { name: /15%/ }).first().click();
    await page.getByRole('tab', { name: 'Tools', exact: true }).click();
    await expect(page.getByRole('button', { name: /Save/i }).first()).toBeVisible();
    await expect(page.locator('.map-container')).toBeVisible();
  });
}