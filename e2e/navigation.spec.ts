import { test, expect } from '@playwright/test';

/**
 * Navigation tests — verifies routing between pages works correctly.
 */

test.describe('Navigation', () => {
  test('can navigate from homepage to forecast page', async ({ page }) => {
    await page.goto('/');
    // "Continue Forecast" button always visible on the current-cycle card
    await page.getByRole('button', { name: /Continue Forecast/i }).click();
    await expect(page).toHaveURL('/forecast');
  });

  test('can navigate from homepage to verification page', async ({ page }) => {
    await page.goto('/');
    const verifyBtn = page.getByRole('link', { name: /Verification/i }).first();
    await verifyBtn.click();
    await expect(page).toHaveURL('/verification');
  });

  test('navbar links navigate correctly', async ({ page }) => {
    await page.goto('/forecast');
    // Click the "Home" nav link in the navbar tab strip
    await page.getByRole('link', { name: /^Home$/i }).click();
    // toHaveURL matches the full URL, so match either bare / or the full origin
    await expect(page).toHaveURL('http://localhost:3000/');
  });
});
