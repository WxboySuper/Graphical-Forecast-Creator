/**
 * jsdom does no layout, so this guards the CSS contract that keeps the Custom
 * workspace map filling its pane (it shrank to content width in Safari/Edge).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, 'ForecastWorkspaceSurfaces.css'), 'utf8');

describe('Custom workspace map sizing', () => {
  it('sizes the map wrapper from the pane, not its content', () => {
    expect(css).toMatch(/\.custom-workspace__map\s*\{[^}]*flex:\s*1 1 0;/);
  });

  it('stretches the map child to the wrapper width', () => {
    expect(css).toMatch(/\.custom-workspace__map > \*\s*\{[^}]*width:\s*100%;/);
  });
});
