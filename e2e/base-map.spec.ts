import { test, expect } from '@playwright/test';
import { prepareAppState } from './testSetup';

test.beforeEach(async ({ page }) => {
  await prepareAppState(page);
});

test.describe('Forecast base map controls', () => {
  test('keeps the selected base map active after switching styles', async ({ page }) => {
    await page.goto('/forecast');

    await page.getByRole('tab', { name: 'Layers' }).click();

    const streetsButton = page.getByRole('button', { name: 'OpenStreetMap' });
    const lightButton = page.getByRole('button', { name: 'Light' });
    const weatherButton = page.getByRole('button', { name: 'Weather Blank' });

    await expect(streetsButton).toHaveClass(/is-active/);
    await expect(lightButton).not.toHaveClass(/is-active/);
    await expect(weatherButton).not.toHaveClass(/is-active/);

    await lightButton.click();
    await expect(lightButton).toHaveClass(/is-active/);
    await expect(streetsButton).not.toHaveClass(/is-active/);
    await expect(weatherButton).not.toHaveClass(/is-active/);

    await weatherButton.click();
    await expect(weatherButton).toHaveClass(/is-active/);
    await expect(lightButton).not.toHaveClass(/is-active/);
    await expect(streetsButton).not.toHaveClass(/is-active/);

    await lightButton.click();
    await expect(lightButton).toHaveClass(/is-active/);
    await expect(weatherButton).not.toHaveClass(/is-active/);
    await expect(streetsButton).not.toHaveClass(/is-active/);
  });
});
