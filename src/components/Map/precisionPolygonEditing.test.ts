import {
  getPanModeHelpText,
  getActiveTierFilterHelpSuffix,
  getPrecisionEditPrototype,
  isCigProbabilityKey,
  PRECISION_EDIT_PROTOTYPE_STORAGE_KEY,
  shouldBatchModifyUndo,
  shouldFilterModifyByActiveTier,
  shouldShowVertexDeletionHints,
  shouldUseHoverTargetCollection,
} from './precisionPolygonEditing';

describe('precisionPolygonEditing', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to baseline when storage is empty or invalid', () => {
    expect(getPrecisionEditPrototype()).toBe('baseline');
    localStorage.setItem(PRECISION_EDIT_PROTOTYPE_STORAGE_KEY, 'not-a-prototype');
    expect(getPrecisionEditPrototype()).toBe('baseline');
  });

  it('reads a valid prototype from localStorage', () => {
    localStorage.setItem(PRECISION_EDIT_PROTOTYPE_STORAGE_KEY, 'combined');
    expect(getPrecisionEditPrototype()).toBe('combined');
  });

  it('flags prototype capabilities', () => {
    expect(shouldFilterModifyByActiveTier('baseline')).toBe(false);
    expect(shouldFilterModifyByActiveTier('active-tier-filter')).toBe(true);
    expect(shouldFilterModifyByActiveTier('combined')).toBe(true);

    expect(shouldUseHoverTargetCollection('hover-target')).toBe(true);
    expect(shouldUseHoverTargetCollection('combined')).toBe(false);

    expect(shouldBatchModifyUndo('combined')).toBe(true);
    expect(shouldBatchModifyUndo('active-tier-filter')).toBe(false);

    expect(shouldShowVertexDeletionHints('vertex-hints')).toBe(true);
    expect(shouldShowVertexDeletionHints('baseline')).toBe(false);
  });

  it('builds help text for vertex hints and active-tier filter', () => {
    expect(getPanModeHelpText('baseline')).not.toContain('Alt+click');
    expect(getPanModeHelpText('vertex-hints')).toContain('Alt+click');
    expect(getPanModeHelpText('vertex-hints')).toContain('Shift+click');
    expect(getActiveTierFilterHelpSuffix('combined')).toContain('outlook panel');
    expect(getActiveTierFilterHelpSuffix('baseline')).toBe('');
  });

  it('detects CIG probability keys', () => {
    expect(isCigProbabilityKey('CIG2')).toBe(true);
    expect(isCigProbabilityKey('5%')).toBe(false);
  });
});
