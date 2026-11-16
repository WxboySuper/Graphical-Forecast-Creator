import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('Mesoscale.css', () => {
  it('has balanced braces and no leftover merge markers, so one bad block cannot swallow later rules', () => {
    const css = readFileSync(path.join(__dirname, 'Mesoscale.css'), 'utf8');
    expect(css.split('{').length).toBe(css.split('}').length);
    expect(css).not.toMatch(/^(<{7}|={7}|>{7})/m);
  });
});
