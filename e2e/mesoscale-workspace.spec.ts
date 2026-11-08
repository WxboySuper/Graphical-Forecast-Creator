/** Verifies the Mesoscale workspace route on a local build with no model data source configured: it opens, explains itself, and is reachable from the Forecast menu without disturbing Severe. */
import { expect, test } from '@playwright/test';
import { prepareAppState } from './testSetup';

test.describe('Mesoscale workspace', () => {
  test.beforeEach(async ({ page }) => {
    await prepareAppState(page);
  });

  test('explains that no data source is set up instead of showing fake data', async ({ page }) => {
    await page.goto('/forecast/mesoscale');
    await expect(page.getByTestId('mesoscale-page')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Mesoscale data is not set up');
    await expect(page.getByTestId('mesoscale-map')).toHaveCount(0);
  });

  test('is reachable from the Forecast menu and Severe still opens', async ({ page }) => {
    await page.goto('/forecast/severe');
    await page.getByRole('button', { name: /^Forecast menu(?:,|$)/ }).click();
    await page.getByRole('menuitem', { name: 'Mesoscale forecast workspace' }).click();
    await expect(page).toHaveURL(/\/forecast\/mesoscale$/);
    await expect(page.getByTestId('mesoscale-page')).toBeVisible();

    await page.getByRole('button', { name: /^Forecast menu(?:,|$)/ }).click();
    await page.getByRole('menuitem', { name: 'Severe forecast workspace' }).click();
    await expect(page).toHaveURL(/\/forecast\/severe$/);
    await expect(page.getByTestId('severe-workspace')).toBeVisible();
  });
});
