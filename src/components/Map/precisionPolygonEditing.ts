/**
 * Research prototypes for issue #624 — precision polygon editing.
 * Toggle via localStorage key `gfc_precision_edit_prototype` (local dev only).
 * See docs/architecture/precision-polygon-editing-624.md.
 */

export const PRECISION_EDIT_PROTOTYPE_STORAGE_KEY = 'gfc_precision_edit_prototype';

export type PrecisionEditPrototype =
  | 'baseline'
  | 'vertex-hints'
  | 'active-tier-filter'
  | 'hover-target'
  | 'combined';

export const PRECISION_EDIT_PROTOTYPES: readonly PrecisionEditPrototype[] = [
  'baseline',
  'vertex-hints',
  'active-tier-filter',
  'hover-target',
  'combined',
];

const isPrecisionEditPrototype = (value: string): value is PrecisionEditPrototype =>
  (PRECISION_EDIT_PROTOTYPES as readonly string[]).includes(value);

/** Reads the active research prototype from localStorage (defaults to baseline). */
export const getPrecisionEditPrototype = (): PrecisionEditPrototype => {
  if (typeof window === 'undefined') {
    return 'baseline';
  }
  const stored = localStorage.getItem(PRECISION_EDIT_PROTOTYPE_STORAGE_KEY);
  if (stored && isPrecisionEditPrototype(stored)) {
    return stored;
  }
  return 'baseline';
};

/** Only modify features that match the outlook panel's active probability/CIG tier. */
export const shouldFilterModifyByActiveTier = (
  prototype: PrecisionEditPrototype,
): boolean => prototype === 'active-tier-filter' || prototype === 'combined';

/** Scope Modify to the topmost polygon under the pointer (OL Collection pattern). */
export const shouldUseHoverTargetCollection = (
  prototype: PrecisionEditPrototype,
): boolean => prototype === 'hover-target';

/** One undo step per modify gesture when multiple features change. */
export const shouldBatchModifyUndo = (
  prototype: PrecisionEditPrototype,
): boolean => prototype === 'combined';

/** Surface Alt+click vertex removal in map toolbar help. */
export const shouldShowVertexDeletionHints = (
  prototype: PrecisionEditPrototype,
): boolean => prototype === 'vertex-hints' || prototype === 'combined';

export const getPanModeHelpText = (prototype: PrecisionEditPrototype): string => {
  const base =
    'Pan mode: drag map to move, scroll to zoom. Click a polygon to see its details.';
  if (!shouldShowVertexDeletionHints(prototype)) {
    return base;
  }
  return `${base} Drag vertices to reshape. Alt+click or Shift+click a vertex to remove it.`;
};

export const getActiveTierFilterHelpSuffix = (
  prototype: PrecisionEditPrototype,
): string => {
  if (!shouldFilterModifyByActiveTier(prototype)) {
    return '';
  }
  return ' Vertex edits apply only to the active probability/CIG tier in the outlook panel.';
};

/** Returns true when a map key represents CIG hatching rather than a numeric probability. */
export const isCigProbabilityKey = (probability: string): boolean =>
  probability.trim().toUpperCase().startsWith('CIG');
