import type { Page } from '@playwright/test';

/** Prepares app-level browser state so route and UI tests can exercise their target behavior. */
export const prepareAppState = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    localStorage.setItem('gfc-local-beta-bypass', 'true');
    localStorage.setItem('gfc-tos-accepted', '2.0.0');
    localStorage.setItem('gfc-privacy-policy-accepted', '1.7.0');
  });
};

/** Selects the default Forecast workspace through the Forecast menu. */
export const navigateToSevereForecast = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: /^Forecast menu(?:,|$)/ }).click();
  await page.getByRole('menuitem', { name: 'Severe forecast workspace' }).click();
};

/** Opens the compatibility Discussion destination from the Forecast menu. */
export const navigateToDiscussion = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: /^Forecast menu(?:,|$)/ }).click();
  await page.getByRole('menuitem', { name: 'Discussion', exact: true }).click();
  await page.waitForURL(/\/forecast\/severe\?.*surface=discussion/);
  await page.getByRole('heading', { name: 'Forecast Discussion' }).waitFor();
};
