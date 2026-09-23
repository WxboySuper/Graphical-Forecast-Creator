import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { prepareAppState } from './testSetup';

for (const width of [1280, 320]) {
  for (const theme of ['light', 'dark']) {
    test(`downloads the live forecast as a JPEG at ${width}px in ${theme} mode`, async ({ page }, testInfo) => {
    test.setTimeout(60000);
    // Keep authoring controls at desktop width; the 320px case narrows only the exported map target.
    await page.setViewportSize({ width: 1280, height: 720 });
    await prepareAppState(page);
    await page.goto('/forecast/severe');
    const viewport = page.locator('.map-container .ol-viewport');
    await expect(viewport).toBeVisible({ timeout: 10000 });

    if (theme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click();

    await page.getByRole('button', { name: /wind/i }).first().click();
    await page.getByRole('button', { name: /15%/ }).first().click();
    await page.getByRole('button', { name: 'Draw polygons' }).click();
    const box = await viewport.boundingBox();
    if (!box) throw new Error('Map viewport has no bounds');
    await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.35);
    await page.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.35);
    await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height * 0.65);
    await page.getByRole('button', { name: 'Pan map' }).click();

    await page.getByRole('tab', { name: 'Tools', exact: true }).click();
    await page.getByRole('button', { name: /Map image/ }).click();
    await page.getByLabel('Image Title (optional)').fill('Export audit');
    if (width < 1280) {
      await page.locator('.map-container').evaluate((element, targetWidth) => {
        element.style.width = `${targetWidth}px`;
        element.style.maxWidth = `${targetWidth}px`;
      }, width);
      await viewport.evaluate((element, targetWidth) => {
        element.style.width = `${targetWidth}px`;
      }, width);
    }
    const exportBox = await viewport.boundingBox();
    if (!exportBox) throw new Error('Export viewport has no bounds');
    const overlayBounds = await page.evaluate(async ({ containerWidth }) => {
      const { buildCloneCallback } = await import('/src/utils/exportUtils.ts');
      const source = document.querySelector<HTMLElement>('.map-container');
      if (!source) throw new Error('Forecast map export root was not found');
      const clonedRoot = source.cloneNode(true) as HTMLElement;
      clonedRoot.style.cssText += `;position:absolute;left:-10000px;top:0;width:${containerWidth}px;max-width:${containerWidth}px;`;
      document.body.appendChild(clonedRoot);

      try {
        const onClone = buildCloneCallback({
          title: 'Export audit',
          includeLegendAndStatus: true,
          unofficialText: 'Unofficial Forecast — Not for Safety Decisions',
        });
        onClone(clonedRoot);

        const warning = clonedRoot.querySelector<HTMLElement>('.gfc-export-unofficial-overlay');
        const warningContent = warning?.firstElementChild as HTMLElement | null;
        const footer = Array.from(clonedRoot.children).find((child) =>
          child.textContent?.includes('Created with Graphical Forecast Creator'),
        ) as HTMLElement | undefined;
        if (!warning || !warningContent || !footer) throw new Error('Export warning or attribution footer was not created');

        const containerRect = clonedRoot.getBoundingClientRect();
        const warningRect = warningContent.getBoundingClientRect();
        const footerRect = footer.getBoundingClientRect();
        return {
          container: { left: containerRect.left, right: containerRect.right },
          warning: { left: warningRect.left, right: warningRect.right, top: warningRect.top, text: warning.textContent },
          footer: { left: footerRect.left, right: footerRect.right, bottom: footerRect.bottom, text: footer.textContent },
        };
      } finally {
        clonedRoot.remove();
      }
    }, { containerWidth: width });
    expect(overlayBounds.warning.text).toContain('Not for Safety Decisions');
    expect(overlayBounds.footer.text).toContain('Created with Graphical Forecast Creator');
    expect(overlayBounds.warning.left).toBeGreaterThanOrEqual(overlayBounds.container.left);
    expect(overlayBounds.warning.right).toBeLessThanOrEqual(overlayBounds.container.right);
    expect(overlayBounds.footer.left).toBeGreaterThanOrEqual(overlayBounds.container.left);
    expect(overlayBounds.footer.right).toBeLessThanOrEqual(overlayBounds.container.right);
    expect(overlayBounds.footer.bottom).toBeLessThanOrEqual(overlayBounds.warning.top - 12);
    const downloadReady = page.waitForEvent('download');
    await page.getByRole('dialog', { name: 'Export Forecast Image' }).getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloadReady;
    expect(download.suggestedFilename()).toMatch(/^forecast-outlook-.*\.jpg$/);
    const path = testInfo.outputPath(`forecast-${theme}-${width}.jpg`);
    await download.saveAs(path);
    const bytes = await readFile(path);
    expect([...bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    const dimensions = await page.evaluate(async (data) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/jpeg' }));
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    }, [...bytes]);
    expect(dimensions.width).toBe(Math.floor(exportBox.width) * 2);
    expect(dimensions.height).toBe(Math.floor(exportBox.height) * 2);
    await expect(page.getByText('Forecast exported successfully!', { exact: true })).toBeVisible();
    });
  }
}
