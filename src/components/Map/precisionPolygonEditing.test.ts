import { isCigProbabilityKey, PAN_MODE_VERTEX_EDIT_HELP } from './precisionPolygonEditing';

describe('precisionPolygonEditing', () => {
  it('documents integrated vertex editing in pan-mode help', () => {
    expect(PAN_MODE_VERTEX_EDIT_HELP).toContain('Alt or Shift+click');
    expect(PAN_MODE_VERTEX_EDIT_HELP).toContain('selected probability');
  });

  it('detects CIG probability keys', () => {
    expect(isCigProbabilityKey('CIG2')).toBe(true);
    expect(isCigProbabilityKey('5%')).toBe(false);
  });
});
