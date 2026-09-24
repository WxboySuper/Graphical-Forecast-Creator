import { readForecastImportFile, validateForecastDataReason } from '../fileUtils';
import type { CycleMetadata } from '../../types/workflow';
import type { ForecastImportResult, ForecastTransferMapView } from './types';
import { isWorkflowExportPackage } from '../workflowPackage';
import { deserializeForecastWorkspace } from '../forecastWorkspacePersistenceAdapter';
import { getForecastDataFromWorkspacePayload } from '../forecastWorkspacePersistence';
import { getForecastWorkspace, type ForecastWorkspaceId } from '../../config/forecastWorkspaces';

/** Reads the outer workspace named by a package. Missing means legacy; present-but-unknown is rejected. */
export const getDeclaredPackageWorkspace = (data: { workspaceId?: unknown }): ForecastWorkspaceId | null => {
  if (data.workspaceId === undefined) return null;
  if (typeof data.workspaceId !== 'string' || getForecastWorkspace(data.workspaceId) === undefined) {
    throw new Error('This workflow package declares an unknown workspace.');
  }
  return data.workspaceId as ForecastWorkspaceId;
};

/** Returns true when an explicit outer owner disagrees with a non-legacy inner forecast. */
export const isPackageWorkspaceMismatch = (
  outer: ForecastWorkspaceId | null,
  restored: ReturnType<typeof deserializeForecastWorkspace>,
): boolean => {
  if (outer === null) return false;
  if (restored.legacy) return false;
  return outer !== restored.workspaceId;
};

/** Throws when an explicit outer owner disagrees with a non-legacy inner forecast. */
export const assertPackageWorkspaceMatch = (
  outer: ForecastWorkspaceId | null,
  restored: ReturnType<typeof deserializeForecastWorkspace>,
): void => {
  if (isPackageWorkspaceMismatch(outer, restored)) {
    throw new Error('This workflow package declares a workspace that does not match its forecast.');
  }
};

interface ResolvedNativeFileContent {
  workspaceId: ForecastWorkspaceId;
  forecastCycle: ReturnType<typeof deserializeForecastWorkspace>['forecastCycle'];
  mapView?: ForecastTransferMapView;
  cycleMetadata?: CycleMetadata | null;
  warnings: string[];
  legacy: boolean;
}

/**
 * Resolves the declared or legacy workspace, cycle, map view, and workflow metadata.
 * This does not enforce an active-workspace match. Mutating editor entry points
 * must compare workspaceId before dispatch; grade, monitor, and verification
 * readers are read-only and may inspect a forecast owned by another workspace.
 *
 * A declared outer workspace is canonical over an untagged legacy inner forecast,
 * but that relabel is surfaced as a warning so a stripped or repackaged legacy
 * file cannot silently change owners. Packages without an outer label keep
 * backward compatibility by falling back to the inner owner with a warning that
 * ownership was inferred as Severe legacy.
 */
export const resolveNativeFileContent = (data: unknown): ResolvedNativeFileContent => {
  if (isWorkflowExportPackage(data)) {
    const declaredWorkspaceId = getDeclaredPackageWorkspace(data);
    const restored = deserializeForecastWorkspace(data.forecast);
    if (declaredWorkspaceId !== null && restored.legacy) {
      const inner = getForecastDataFromWorkspacePayload(
        data.forecast as Parameters<typeof getForecastDataFromWorkspacePayload>[0],
      ) as { mapView?: ForecastTransferMapView; cycleMetadata?: CycleMetadata | null };
      return {
        forecastCycle: restored.forecastCycle,
        workspaceId: declaredWorkspaceId,
        mapView: data.mapView ?? inner.mapView,
        cycleMetadata: data.metadata ?? data.cycleMetadata ?? inner.cycleMetadata,
        warnings: [`This package labels an untagged legacy forecast as ${declaredWorkspaceId} workspace.`],
        legacy: true,
      };
    }
    assertPackageWorkspaceMatch(declaredWorkspaceId, restored);
    const inner = getForecastDataFromWorkspacePayload(
      data.forecast as Parameters<typeof getForecastDataFromWorkspacePayload>[0],
    ) as { mapView?: ForecastTransferMapView; cycleMetadata?: CycleMetadata | null };
    if (declaredWorkspaceId === null) {
      if (restored.legacy) {
        return {
          forecastCycle: restored.forecastCycle,
          workspaceId: restored.workspaceId,
          mapView: data.mapView ?? inner.mapView,
          cycleMetadata: data.metadata ?? data.cycleMetadata ?? inner.cycleMetadata,
          warnings: ['This package has no workspace label; treated as a Severe legacy package.'],
          legacy: true,
        };
      }
      return {
        forecastCycle: restored.forecastCycle,
        workspaceId: restored.workspaceId,
        mapView: data.mapView ?? inner.mapView,
        cycleMetadata: data.metadata ?? data.cycleMetadata ?? inner.cycleMetadata,
        warnings: [],
        legacy: false,
      };
    }
    return {
      forecastCycle: restored.forecastCycle,
      workspaceId: declaredWorkspaceId,
      mapView: data.mapView ?? inner.mapView,
      cycleMetadata: data.metadata ?? data.cycleMetadata ?? inner.cycleMetadata,
      warnings: [],
      legacy: restored.legacy,
    };
  }
  const restored = deserializeForecastWorkspace(data);
  const rawData = getForecastDataFromWorkspacePayload(
    data as Parameters<typeof getForecastDataFromWorkspacePayload>[0],
  ) as { mapView?: ForecastTransferMapView; cycleMetadata?: CycleMetadata | null };
  return {
    forecastCycle: restored.forecastCycle,
    workspaceId: restored.workspaceId,
    mapView: rawData.mapView,
    cycleMetadata: rawData.cycleMetadata,
    warnings: [],
    legacy: restored.legacy,
  };
};

/** Imports a native JSON or workflow package transfer. */
export const importNativeTransfer = async (file: File, format: 'json' | 'package'): Promise<ForecastImportResult> => {
  const data = await readForecastImportFile(file);
  const validationError = validateForecastDataReason(data);
  if (validationError) throw new Error(validationError);
  const resolved = resolveNativeFileContent(data);
  return {
    forecastCycle: resolved.forecastCycle,
    workspaceId: resolved.workspaceId,
    mapView: resolved.mapView,
    cycleMetadata: resolved.cycleMetadata,
    warnings: resolved.warnings,
    format,
  };
};
