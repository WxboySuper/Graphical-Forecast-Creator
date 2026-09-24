import { expect, test, type Page } from '@playwright/test';
import { prepareAppState } from './testSetup';

/**
 * Workspace route navigation matrix for #914/#1456.
 *
 * The URL owns workspace identity. AppHooks syncs Redux ownership from the
 * route and ForecastPage holds the editor behind a restore gate ("Preparing
 * ... forecast workspace") until ownership matches, then restores that
 * workspace's autosave on top of a blank slate.
 *
 * These tests seed Severe and Custom with different selected days, then prove
 * direct navigation, refresh, and back/forward each land on the right workspace
 * with the right restore, and that a dirty switch flushes the old workspace
 * before the target restores.
 */

const SEVERE_KEY = 'forecastData';
const CUSTOM_KEY = 'forecastData:custom';

const dayButton = (page: Page, day: number) =>
  page.locator(`.tabbed-integrated-toolbar__day-button[data-day="${day}"]`);

const gotoWorkspace = async (page: Page, workspace: 'severe' | 'custom') => {
  await page.goto(`/forecast/${workspace}`);
  await expect(page).toHaveURL(new RegExp(`/forecast/${workspace}(?:[?#]|$)`));
  await expect(page.locator('.map-container')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.tabbed-integrated-toolbar')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Preparing .* forecast workspace/)).toHaveCount(0);
};

const expectActiveDay = async (page: Page, day: number) => {
  await page.getByRole('tab', { name: 'Days', exact: true }).click();
  await expect(dayButton(page, day)).toHaveClass(/is-active/, { timeout: 15000 });
};

const setDay = async (page: Page, day: number) => {
  await page.getByRole('tab', { name: 'Days', exact: true }).click();
  await dayButton(page, day).click();
  await expect(dayButton(page, day)).toHaveClass(/is-active/, { timeout: 15000 });
};

// SPA navigation without a full page load, so AppHooks stays mounted and the
// autosave scope-change flush can run. page.goto would destroy the old page
// context and drop a debounced edit, which is a separate full-reload path.
const spaNavigate = async (page: Page, path: string) => {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(page).toHaveURL(new RegExp(`${path}(?:[?#]|$)`));
};

const readAutosaveDay = (page: Page, key: string): Promise<number | null> =>
  page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as {
        workspaceId?: string;
        forecast?: { forecastCycle?: { currentDay?: number } };
      };
      return parsed.forecast?.forecastCycle?.currentDay ?? null;
    } catch {
      return null;
    }
  }, key);

const waitForAutosaveDay = async (page: Page, key: string, day: number) => {
  await expect
    .poll(() => readAutosaveDay(page, key), { timeout: 15000 })
    .toBe(day);
};

test.describe('Forecast workspace route navigation', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await prepareAppState(page);
  });

  test('restores per-workspace autosave across direct navigation, refresh, and back/forward', async ({
    page,
  }) => {
    test.setTimeout(120000);

    await gotoWorkspace(page, 'severe');
    await setDay(page, 2);
    await waitForAutosaveDay(page, SEVERE_KEY, 2);

    await gotoWorkspace(page, 'custom');
    await setDay(page, 5);
    await waitForAutosaveDay(page, CUSTOM_KEY, 5);

    // Direct navigation lands on the target workspace restore, not the
    // previously mounted workspace.
    await page.goto('/forecast/severe');
    await gotoWorkspace(page, 'severe');
    await expectActiveDay(page, 2);

    await page.goto('/forecast/custom');
    await gotoWorkspace(page, 'custom');
    await expectActiveDay(page, 5);

    // Refresh keeps the current workspace restore.
    await page.reload();
    await expect(page).toHaveURL(/\/forecast\/custom(?:[?#]|$)/);
    await expect(page.locator('.map-container')).toBeVisible({ timeout: 15000 });
    await expectActiveDay(page, 5);

    await page.goto('/forecast/severe');
    await gotoWorkspace(page, 'severe');
    await page.reload();
    await expect(page).toHaveURL(/\/forecast\/severe(?:[?#]|$)/);
    await expect(page.locator('.map-container')).toBeVisible({ timeout: 15000 });
    await expectActiveDay(page, 2);

    // Back/forward across the restore gate restores each history entry's
    // workspace instead of sticking to the last mounted one.
    await page.goto('/forecast/severe');
    await gotoWorkspace(page, 'severe');
    await expectActiveDay(page, 2);
    await page.goto('/forecast/custom');
    await gotoWorkspace(page, 'custom');
    await expectActiveDay(page, 5);

    await page.goBack();
    await expect(page).toHaveURL(/\/forecast\/severe(?:[?#]|$)/);
    await expect(page.locator('.map-container')).toBeVisible({ timeout: 15000 });
    await expectActiveDay(page, 2);

    await page.goForward();
    await expect(page).toHaveURL(/\/forecast\/custom(?:[?#]|$)/);
    await expect(page.locator('.map-container')).toBeVisible({ timeout: 15000 });
    await expectActiveDay(page, 5);

    // Workspaces never leak into each other's persisted scope.
    expect(await readAutosaveDay(page, SEVERE_KEY)).toBe(2);
    expect(await readAutosaveDay(page, CUSTOM_KEY)).toBe(5);
  });

  test('flushes a dirty workspace edit before restoring the switch target', async ({
    page,
  }) => {
    test.setTimeout(120000);

    await gotoWorkspace(page, 'severe');
    await setDay(page, 2);
    await waitForAutosaveDay(page, SEVERE_KEY, 2);

    await gotoWorkspace(page, 'custom');
    await setDay(page, 5);
    await waitForAutosaveDay(page, CUSTOM_KEY, 5);

    // Back to Severe, make a dirty edit, then SPA-switch before the 5s
    // autosave debounce can fire. The scope-change flush must write the Severe
    // edit to the Severe key instead of dropping it.
    await gotoWorkspace(page, 'severe');
    await expectActiveDay(page, 2);
    await setDay(page, 4);

    await spaNavigate(page, '/forecast/custom');
    await expectActiveDay(page, 5);

    // The old workspace flush lands promptly, without waiting for another
    // full debounce after the switch.
    await expect
      .poll(() => readAutosaveDay(page, SEVERE_KEY), { timeout: 10000 })
      .toBe(4);

    // The target restores its own snapshot, not the flushed Severe edit.
    await expectActiveDay(page, 5);
    expect(await readAutosaveDay(page, CUSTOM_KEY)).toBe(5);

    // The flushed edit survives a return visit.
    await page.goto('/forecast/severe');
    await gotoWorkspace(page, 'severe');
    await expectActiveDay(page, 4);
  });
});
