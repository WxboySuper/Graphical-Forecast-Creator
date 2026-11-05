import { test, expect } from '@playwright/test';

const bypassLocalBeta = async (page: import('@playwright/test').Page) => {
  await page.addInitScript(() => {
    localStorage.setItem('gfc-local-beta-bypass', 'true');
  });
};

const acceptAgreementsIfPresent = async (page: import('@playwright/test').Page) => {
  for (let i = 0; i < 2; i += 1) {
    const agreementCheckbox = page.getByRole('checkbox', { name: /I have read and agree/i });
    if (!(await agreementCheckbox.isVisible().catch(() => false))) break;

    await agreementCheckbox.check();
    await page.getByRole('button', { name: /Accept & Continue/i }).click();
  }
};

// Auto-TSTM is temporarily disabled client-side while the SPC HREF source is
// decommissioned (REFS / REFSCT replacement planned for v1.8). The client must not
// hit /api/tstm/* in normal use and the entry point must stay visibly disabled.
test.describe('Auto-TSTM disabled (HREF decommission)', () => {
  test.beforeEach(async ({ page }) => {
    await bypassLocalBeta(page);
    await page.route('**/api/capabilities/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ capabilities: { TSTM_GENERATION_ENABLED: { available: true, reason: 'available' } } }),
      });
    });
  });

  test('shows the disabled banner and keeps the entry point disabled without fetching', async ({ page }) => {
    let tstmRequestCount = 0;
    await page.route('**/api/tstm/**', async (route) => {
      tstmRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.goto('/forecast?localBetaBypass=true');
    await acceptAgreementsIfPresent(page);
    await expect(page.locator('.map-container')).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId('auto-tstm-disabled-banner')).toContainText(
      /temporarily disabled while the SPC HREF source/i,
    );
    await expect(page.getByTestId('auto-tstm-disabled-banner')).toContainText(/REFSCT.*v1\.8/i);

    await page.getByRole('tab', { name: 'Tools' }).click();
    await expect(page.getByRole('button', { name: 'Auto-TSTM' })).toBeDisabled();

    expect(tstmRequestCount).toBe(0);
  });

  test('keeps the toolbar visible on a short phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 600 });
    await page.goto('/forecast?localBetaBypass=true');
    await acceptAgreementsIfPresent(page);
    const toolbar = page.locator('.tabbed-integrated-toolbar');
    await expect(toolbar).toBeVisible();
    const bounds = await toolbar.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(601);
    await page.getByRole('tab', { name: 'Tools' }).click();
    await expect(page.getByRole('button', { name: /Auto-TSTM/ })).toBeDisabled();
  });
});
