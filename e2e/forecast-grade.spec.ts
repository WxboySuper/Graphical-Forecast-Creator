import { expect, test } from '@playwright/test';
import { prepareAppState } from './testSetup';

const buildTarget = process.env.VITE_BUILD_TARGET ?? 'local';

/**
 * Forecast Grade dashboard smoke + responsive checks (PR 09 — hardening).
 *
 * The v2 dashboard is exposed on the local build target only, so these run
 * against a local dev server and are skipped on hosted targets where classic
 * VerificationMode is the live surface.
 */
test.describe('Forecast Grade dashboard (verificationRelaunch on local)', () => {
  test.skip(buildTarget !== 'local', 'verificationRelaunch dogfoods on the local target only.');

  test.beforeEach(async ({ page }) => {
    await prepareAppState(page);
  });

  test('mounts the map-first dashboard shell with an explicit source picker', async ({ page }) => {
    await page.goto('/verification');

    await expect(page.getByRole('heading', { name: 'Forecast Grade' })).toBeVisible();
    await expect(page.getByText('Choose a package')).toBeVisible();
    await expect(page.getByText('Upload forecast file')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grade forecast' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Methodology' })).toHaveAttribute(
      'href',
      '/docs/forecast-grade-methodology.html'
    );
    // Classic verification header must not appear when the flag is on.
    await expect(page.getByText('Load a saved forecast, then bring in storm reports')).toHaveCount(0);
  });

  test('signed-in free accounts see the grade trend area', async ({ page }) => {
    await page.goto('/verification?localTestAccount=free');
    // A fresh free account has no cards yet, so the trend area shows its
    // empty-state placeholder rather than the populated chart heading.
    await expect(page.getByText('Your graded runs will appear here as a trend.')).toBeVisible();
  });

  test('stays usable without horizontal overflow at phone portrait and landscape', async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/verification');
      await expect(page.getByRole('heading', { name: 'Forecast Grade' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Grade forecast' })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      expect(overflow).toBe(false);
    }
  });
});
