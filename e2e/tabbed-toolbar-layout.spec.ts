import { test, expect, type Page } from '@playwright/test';
import { prepareAppState } from './testSetup';

const LAYOUT_TOLERANCE_PX = 1;

const FORECAST_URL = '/forecast?localBetaBypass=true&forecastUi=tabbed_toolbar&localTestAccount=free';

const VIEWPORTS = [
  { width: 1024, height: 800, label: '1024x800' },
  { width: 1280, height: 800, label: '1280x800' },
] as const;

type LayoutViolation = { kind: string; detail: string };

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
  const violations = await page.evaluate(
    ({ tolerance, requireDaysRowFits }) => {
      const report: LayoutViolation[] = [];

      const rectsOverlap = (
        a: DOMRect,
        b: DOMRect,
        tol: number,
      ) => (
        a.left < b.right - tol
        && a.right > b.left + tol
        && a.top < b.bottom - tol
        && a.bottom > b.top + tol
      );

      const isVisible = (element: Element) => {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const toolbar = document.querySelector('.tabbed-integrated-toolbar');
      if (!toolbar) {
        return [{ kind: 'missing-toolbar', detail: 'Tabbed toolbar root not found' }];
      }
      const toolbarRect = toolbar.getBoundingClientRect();

      const activePanel = document.querySelector('.tabbed-integrated-toolbar__panel[data-state="active"]');
      const row = activePanel?.querySelector('.tabbed-integrated-toolbar__row') as HTMLElement | null;
      if (!row) {
        return [{ kind: 'missing-row', detail: 'Active tab row not found' }];
      }
      const rowRect = row.getBoundingClientRect();

      const interactiveSelector = [
        'button',
        'input',
        'select',
        'textarea',
        '[role="button"]',
        '.tabbed-integrated-toolbar__stat-pill',
        '.tabbed-integrated-toolbar__day-button',
        '.tabbed-integrated-toolbar__type-button',
        '.tabbed-integrated-toolbar__probability-button',
        '.tabbed-integrated-toolbar__map-button',
        '.tabbed-integrated-toolbar__ghost-layer-button',
        '.tabbed-integrated-toolbar__action-tile',
        '.custom-product-toggle__button',
      ].join(',');

      const sections = Array.from(row.querySelectorAll('.tabbed-integrated-toolbar__section'));

      sections.forEach((section, sectionIndex) => {
        const labels = Array.from(section.querySelectorAll('.tabbed-integrated-toolbar__section-label'));
        labels.forEach((label) => {
          if (!isVisible(label)) return;
          const labelRect = label.getBoundingClientRect();

          sections.forEach((neighborSection, neighborIndex) => {
            if (neighborIndex === sectionIndex) return;
            const controls = Array.from(neighborSection.querySelectorAll(interactiveSelector));
            controls.forEach((control) => {
              if (!isVisible(control)) return;
              const controlRect = control.getBoundingClientRect();
              if (rectsOverlap(labelRect, controlRect, tolerance)) {
                report.push({
                  kind: 'label-overlap',
                  detail: `Label "${label.textContent?.trim() ?? ''}" overlaps a control in a neighboring section`,
                });
              }
            });
          });
        });
      });

      const rowInteractives = Array.from(row.querySelectorAll(interactiveSelector)).filter(isVisible);
      rowInteractives.forEach((control) => {
        const controlRect = control.getBoundingClientRect();
        if (controlRect.top < rowRect.top - tolerance || controlRect.bottom > rowRect.bottom + tolerance) {
          report.push({
            kind: 'row-vertical-clip',
            detail: 'A toolbar control is clipped vertically by the active tab row',
          });
        }
      });

      const toolbarInteractives = Array.from(toolbar.querySelectorAll(interactiveSelector)).filter(isVisible);
      toolbarInteractives.forEach((control) => {
        const controlRect = control.getBoundingClientRect();
        if (controlRect.bottom > toolbarRect.bottom + tolerance) {
          report.push({
            kind: 'toolbar-spill',
            detail: 'A toolbar control extends below the toolbar onto the map',
          });
        }
      });

      if (requireDaysRowFits && row.scrollWidth > row.clientWidth + tolerance) {
        report.push({
          kind: 'days-horizontal-overflow',
          detail: `Days row scrollWidth ${row.scrollWidth} exceeds clientWidth ${row.clientWidth}`,
        });
      }

      return report;
    },
    {
      tolerance: LAYOUT_TOLERANCE_PX,
      requireDaysRowFits: options.requireDaysRowFits ?? false,
    },
  );

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
