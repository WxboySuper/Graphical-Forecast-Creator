import { isCigProbabilityKey, PAN_MODE_VERTEX_EDIT_HELP } from './precisionPolygonEditing';

describe('precisionPolygonEditing', () => {
  it('mentions vertex removal shortcut in pan-mode help', () => {
    expect(PAN_MODE_VERTEX_EDIT_HELP).toContain('Alt or Shift+click');
    expect(PAN_MODE_VERTEX_EDIT_HELP.length).toBeLessThan(120);
  });

  it('detects CIG probability keys', () => {
    expect(isCigProbabilityKey('CIG2')).toBe(true);
    expect(isCigProbabilityKey('5%')).toBe(false);
  });
});
