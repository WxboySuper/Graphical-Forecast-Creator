import { test, expect } from '@playwright/test';

/**
 * Smoke tests — verifies the app loads and core routes are reachable
 * without any white-screen crashes.
 */

test.describe('App smoke tests', () => {
  test('homepage loads with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Graphical Forecast Creator/);
    // Use level:1 to avoid strict-mode conflict with the welcome card h2
    await expect(page.getByRole('heading', { level: 1, name: /Graphical Forecast Creator/i })).toBeVisible();
  });

  test('navbar is visible on homepage', async ({ page }) => {
    await page.goto('/');
    // Version badge
    await expect(page.getByText('v1.0.0')).toBeVisible();
  });

  test('forecast page loads without crashing', async ({ page }) => {
    await page.goto('/forecast');
    // The OpenLayers map container renders with class .map-container
    await expect(page.locator('.map-container')).toBeVisible({ timeout: 10000 });
  });

  test('verification page loads without crashing', async ({ page }) => {
    await page.goto('/verification');
    await expect(page.getByRole('heading', { name: /Verification/i })).toBeVisible({ timeout: 10000 });
  });

  test('404 / unknown routes do not white-screen', async ({ page }) => {
    await page.goto('/does-not-exist');
    // App shell (navbar) should still render — not a blank page
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
