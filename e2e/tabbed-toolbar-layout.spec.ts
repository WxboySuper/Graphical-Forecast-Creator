import { test, expect, type Page } from '@playwright/test';
import { prepareAppState } from './testSetup';
import { collectToolbarLayoutViolations } from './tabbedToolbarLayoutChecks';

const LAYOUT_TOLERANCE_PX = 1;

const FORECAST_URL = '/forecast?localBetaBypass=true&forecastUi=tabbed_toolbar&localTestAccount=free';

const VIEWPORTS = [
  { width: 1024, height: 800, label: '1024x800' },
  { width: 1280, height: 800, label: '1280x800' },
] as const;

const mockAutoTstmCapabilities = async (page: Page) => {
  await page.route('**/api/capabilities/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        capabilities: {
          TSTM_GENERATION_ENABLED: {
            available: true,
            reason: 'available',
          },
        },
      }),
    });
  });
};

const openTabbedForecast = async (page: Page, viewport: { width: number; height: number }) => {
  await page.setViewportSize(viewport);
  await prepareAppState(page);
  await mockAutoTstmCapabilities(page);
  await page.goto(FORECAST_URL);
  await expect(page.locator('.map-container')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.tabbed-integrated-toolbar')).toBeVisible();
};

const assertActiveTabToolbarLayout = async (
  page: Page,
  options: { requireDaysRowFits?: boolean },
) => {
  const violations = await page.evaluate(collectToolbarLayoutViolations, {
    tolerance: LAYOUT_TOLERANCE_PX,
    requireDaysRowFits: options.requireDaysRowFits ?? false,
  });

  expect(violations, violations.map((violation) => `${violation.kind}: ${violation.detail}`).join('; ')).toEqual([]);
};

const tabScenarios = [
  {
    name: 'Draw Severe',
    activate: async (page: Page) => {
      await page.getByRole('tab', { name: 'Draw', exact: true }).click();
      const severeRadio = page.getByRole('radio', { name: 'Severe', exact: true });
      if (await severeRadio.isVisible().catch(() => false)) {
        await severeRadio.click();
      }
      await expect(page.locator('.tabbed-integrated-toolbar__type-button').first()).toBeVisible();
    },
    requireDaysRowFits: false,
  },
  {
    name: 'Draw Custom',
    activate: async (page: Page) => {
      await page.getByRole('tab', { name: 'Draw', exact: true }).click();
      await page.getByRole('radio', { name: 'Custom', exact: true }).click();
      await expect(page.getByTestId('custom-draw-panel')).toBeVisible();
    },
    requireDaysRowFits: false,
  },
  {
    name: 'Days',
    activate: async (page: Page) => {
      await page.getByRole('tab', { name: 'Days', exact: true }).click();
    },
    requireDaysRowFits: true,
  },
  {
    name: 'Layers',
    activate: async (page: Page) => {
      await page.getByRole('tab', { name: 'Layers', exact: true }).click();
    },
    requireDaysRowFits: false,
  },
  {
    name: 'Tools',
    activate: async (page: Page) => {
      await page.getByRole('tab', { name: 'Tools', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Auto-TSTM' })).toBeVisible({ timeout: 10_000 });
    },
    requireDaysRowFits: false,
  },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`tabbed toolbar layout @ ${viewport.label}`, () => {
    test.beforeEach(async ({ page }) => {
      await openTabbedForecast(page, viewport);
    });

    for (const scenario of tabScenarios) {
      test(`${scenario.name} tab keeps labels and controls within bounds`, async ({ page }) => {
        await scenario.activate(page);
        await assertActiveTabToolbarLayout(page, {
          requireDaysRowFits: scenario.requireDaysRowFits && viewport.width >= 1280,
        });
      });
    }
  });
}
