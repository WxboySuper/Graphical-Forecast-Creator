import type { ForecastWorkspaceId } from '../../config/forecastWorkspaces';
import type { ForecastImportResult } from './types';

/**
 * Severe entry policy for GIS transfers.
 *
 * A KML or KMZ file carries no workspace identity, so an import can only report
 * that it is unowned. Severe is the GIS workspace, so unowned geometry opens
 * there and nowhere else: every other editor refuses it with a boundary error
 * instead of being handed geometry it cannot attribute. Exports use the same
 * rule, which is why KML/KMZ export is offered only from Severe.
 */
export const GIS_ENTRY_WORKSPACE: ForecastWorkspaceId = 'severe';

/** Returns true for the GIS transfer formats that carry no workspace identity. */
export const isGisTransfer = (format: ForecastImportResult['format']): boolean =>
  format === 'kml' || format === 'kmz';

/**
 * Returns why a transfer cannot open in the active workspace, or null when it can.
 *
 * This is the single source of truth for import ownership: the transfer modal and
 * the page apply path both call it, so the UI and the API cannot disagree.
 */
export const getForecastImportWorkspaceError = (
  result: Pick<ForecastImportResult, 'workspaceId' | 'format'>,
  workspaceId: ForecastWorkspaceId,
): string | null => {
  if (result.workspaceId === null) {
    if (isGisTransfer(result.format)) {
      return workspaceId === GIS_ENTRY_WORKSPACE
        ? null
        : 'This file does not declare a forecast workspace. KML/KMZ geometry cannot be imported across the workspace boundary.';
    }
    return 'This file does not declare a forecast workspace and cannot be imported.';
  }
  return result.workspaceId === workspaceId
    ? null
    : `This forecast belongs to the ${result.workspaceId} workspace. Open it there before importing it.`;
};
