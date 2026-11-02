/**
 * Temporary client-side kill switch for Auto-TSTM while the SPC HREF source is
 * being decommissioned. Full SPC REF wiring lands in v1.8 — this flag only
 * stops the client from polling/fetching HREF-backed guidance and surfaces a
 * consistent disabled message. Do not remove without the REF migration.
 */
export const AUTO_TSTM_DISABLED = true;

export const AUTO_TSTM_DISABLED_MESSAGE =
  'Auto-TSTM / automatic thunderstorm guidance is temporarily disabled while the SPC HREF source is being decommissioned. Replacement guidance (newer model / SPC REF) is planned for v1.8.';
