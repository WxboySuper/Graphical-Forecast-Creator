import { expect, test } from '@playwright/test';
import { prepareAppState } from './testSetup';

test.describe('Local reusable custom products', () => {
  test.beforeEach(async ({ page }) => {
    await prepareAppState(page);
    await page.goto('/custom-products?localTestAccount=premium');
  });

  test('creates, reorders, reuses, and preserves an immutable product snapshot', async ({ page }) => {
    await page.getByRole('button', { name: 'New product' }).click();
    await page.getByLabel('Product name').fill('Fire weather');
    await page.getByLabel('Category 1 label').fill('Elevated');
    await page.getByRole('button', { name: 'Add category' }).click();
    await page.getByLabel('Category 2 label').fill('Critical');
    await page.getByLabel('Category 2 hatch').selectOption('crosshatch');
    await page.getByLabel('Category 2 stroke color').fill('#123456');
    await page.getByLabel('Category 2 stroke opacity').fill('0.4');
    await page.getByLabel('Category 2 stroke width').fill('4');
    await page.getByRole('button', { name: 'Move Critical up' }).click();
    await page.getByRole('button', { name: 'Create product' }).click();

    await expect(page.getByRole('heading', { name: 'Fire weather' })).toBeVisible();
    await page.getByRole('button', { name: 'Use in Forecast' }).click();
    await expect(page).toHaveURL(/\/forecast$/);
    await expect(page.getByLabel('Layer title')).toHaveValue('Fire weather');
    await expect(page.getByTestId('custom-category-list')).toHaveValue(/.+/);
    await expect(page.getByTestId('custom-category-list').locator('option:checked')).toHaveText('Critical');
    await expect(page.getByLabel('Category color')).toHaveValue('#f97316');
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('gfc-custom-product-handoff'))).toBeNull();

    await page.getByRole('link', { name: /Products/i }).click();
    await expect(page).toHaveURL(/\/custom-products$/);
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Product name').fill('Updated fire weather');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { name: 'Updated fire weather' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/forecast$/);
    await expect(page.getByLabel('Layer title')).toHaveValue('Fire weather');
    await expect(page.getByTestId('custom-category-list').locator('option:checked')).toHaveText('Critical');
  });

  test('keeps the library usable at portrait and constrained landscape phone sizes', async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Reusable custom products' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'New product' })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
    }
  });
});
