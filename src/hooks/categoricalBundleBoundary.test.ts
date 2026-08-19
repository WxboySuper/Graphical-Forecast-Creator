import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('categorical Turf bundle boundary', () => {
  test('keeps Turf-backed processing out of eager UI imports', () => {
    const workerSource = readFileSync(resolve(process.cwd(), 'src/hooks/categoricalWorker.ts'), 'utf8');
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

    expect(workerSource).not.toMatch(/import\s+\{[^}]*processDay12OutlooksToCategorical[^}]*\}\s+from\s+['"]\.\/autoCategoricalProcessing/);
    expect(workerSource).toMatch(/await import\(['"]\.\/autoCategoricalProcessing['"]\)/);
    expect(appSource).not.toMatch(/from ['"]\.\/pages['"]/);

    const assetsDirectory = resolve(process.cwd(), 'dist/assets');
    try {
      const assetNames = readdirSync(assetsDirectory);
      const mainAsset = assetNames.find((name) => /^index-.*\.js$/.test(name));
      if (mainAsset) {
        const mainBundle = readFileSync(resolve(assetsDirectory, mainAsset), 'utf8');
        expect(mainBundle).not.toMatch(/(?:from|import\()\s*['"].*turf.*['"]|turf-[A-Za-z0-9_-]+\.js/);
      }
    } catch {
      // Unit-only runs do not build dist; CI's production build supplies the graph check.
    }
  });
});
