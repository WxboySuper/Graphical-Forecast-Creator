import { test, expect } from '@playwright/test';
import { prepareAppState } from './testSetup';

for (const variant of ['integrated', 'workspace_dock', 'floating_panels', 'tabbed_toolbar']) {
  test(`forecast controls remain usable with the ${variant} preference`, async ({ page }) => {
    await prepareAppState(page);
    await page.goto(`/forecast/severe?forecastUi=${variant}&localTestAccount=free`);

    await expect(page.locator('.map-container')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.tabbed-integrated-toolbar')).toBeVisible();
    await page.getByRole('tab', { name: 'Days', exact: true }).click();
    const dayTwoButton = page.locator('.tabbed-integrated-toolbar__day-button[data-day="2"]');
    await dayTwoButton.click();
    await expect(dayTwoButton).toHaveClass(/is-active/);

    await page.getByRole('tab', { name: 'Draw', exact: true }).click();
    const windButton = page.locator('.tabbed-integrated-toolbar__type-button[title="Wind"]');
    await windButton.click();
    await expect(windButton).toHaveClass(/is-active/);

    const probabilityButton = page.locator('.tabbed-integrated-toolbar__probability-button').filter({ hasText: '15%' });
    await probabilityButton.click();
    await expect(probabilityButton).toHaveClass(/is-active/);

    await page.getByRole('tab', { name: 'Tools', exact: true }).click();
    const cloudSaveButton = page.getByRole('button', { name: 'Save forecast to cloud', exact: true });
    await expect(cloudSaveButton).toBeVisible();
    await cloudSaveButton.click();
    await expect(page.getByRole('dialog')).toContainText('Subscribe to premium to save forecasts to the cloud.');
    await expect(page.locator('.map-container')).toBeVisible();
  });
}
