/** Pan-mode map toolbar help — keep brief; tier scope comes from the outlook panel. */
export const PAN_MODE_VERTEX_EDIT_HELP =
  'Pan mode: drag map to move, scroll to zoom. Alt or Shift+click a vertex to remove it.';

/** Returns true when an outlook map key is a standalone CIG hatching overlay. */
export const isCigProbabilityKey = (probability: string): boolean =>
  probability.trim().toUpperCase().startsWith('CIG');
