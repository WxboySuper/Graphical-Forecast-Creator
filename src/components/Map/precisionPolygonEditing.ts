/** Pan-mode map toolbar help for integrated polygon vertex editing (#624). */
export const PAN_MODE_VERTEX_EDIT_HELP =
  'Pan mode: drag map to move, scroll to zoom. Click a polygon for details. Vertex edits apply to the selected probability, CIG, or custom category. Drag vertices to reshape; Alt or Shift+click a vertex to remove it.';

/** Returns true when an outlook map key is a standalone CIG hatching overlay. */
export const isCigProbabilityKey = (probability: string): boolean =>
  probability.trim().toUpperCase().startsWith('CIG');
