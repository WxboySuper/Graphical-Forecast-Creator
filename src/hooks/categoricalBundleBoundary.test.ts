import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('categorical Turf bundle boundary', () => {
  test('keeps Turf-backed processing out of eager UI imports', () => {
    const workerSource = readFileSync(resolve(process.cwd(), 'src/hooks/categoricalWorker.ts'), 'utf8');
    const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

    expect(workerSource).not.toMatch(/import\s+\{[^}]*processDay12OutlooksToCategorical[^}]*\}\s+from\s+['"]\.\/autoCategoricalProcessing/);
    expect(workerSource).toMatch(/await import\(['"]\.\/autoCategoricalProcessing['"]\)/);
    expect(appSource).not.toMatch(/from ['"]\.\/pages['"]/);
  });
});
