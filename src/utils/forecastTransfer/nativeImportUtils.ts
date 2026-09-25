import { readForecastImportFile, validateForecastDataReason } from '../fileUtils';
import type { CycleMetadata } from '../../types/workflow';
import type { ForecastImportResult, ForecastTransferMapView } from './types';
import { isWorkflowExportPackage, type WorkflowExportPackage } from '../workflowPackage';
import { deserializeForecastWorkspace } from '../forecastWorkspacePersistenceAdapter';
import { getForecastDataFromWorkspacePayload } from '../forecastWorkspacePersistence';
import { getForecastWorkspace, type ForecastWorkspaceId } from '../../config/forecastWorkspaces';

type RestoredWorkspace = ReturnType<typeof deserializeForecastWorkspace>;
type InnerView = { mapView?: ForecastTransferMapView; cycleMetadata?: CycleMetadata | null };

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
  restored: RestoredWorkspace,
): boolean => {
  if (outer === null) return false;
  if (restored.legacy) return false;
  return outer !== restored.workspaceId;
};

/** Throws when an explicit outer owner disagrees with a non-legacy inner forecast. */
export const assertPackageWorkspaceMatch = (
  outer: ForecastWorkspaceId | null,
  restored: RestoredWorkspace,
): void => {
  if (isPackageWorkspaceMismatch(outer, restored)) {
    throw new Error('This workflow package declares a workspace that does not match its forecast.');
  }
};

interface ResolvedNativeFileContent {
  workspaceId: ForecastWorkspaceId;
  forecastCycle: RestoredWorkspace['forecastCycle'];
  mapView?: ForecastTransferMapView;
  cycleMetadata?: CycleMetadata | null;
  warnings: string[];
  legacy: boolean;
}

/** Throws when envelope validation reports a reason. Keeps import entry points honest about shape. */
const assertValidNativeImportEnvelope = (data: unknown): void => {
  const validationError = validateForecastDataReason(data);
  if (validationError) throw new Error(validationError);
};

/** Reads map view and cycle metadata carried inside a forecast payload. */
const getInnerView = (forecast: unknown): InnerView =>
  getForecastDataFromWorkspacePayload(
    forecast as Parameters<typeof getForecastDataFromWorkspacePayload>[0],
  ) as InnerView;

/** Merges outer package overrides over inner view values. Outer wins when present. */
const mergePackageView = (pkg: WorkflowExportPackage, inner: InnerView): Pick<ResolvedNativeFileContent, 'mapView' | 'cycleMetadata'> => ({
  mapView: pkg.mapView ?? inner.mapView,
  cycleMetadata: pkg.metadata ?? pkg.cycleMetadata ?? inner.cycleMetadata,
});

/** Builds the relabeled result for a declared owner over an untagged legacy forecast. */
const buildLegacyRelabeledContent = (
  restored: RestoredWorkspace,
  workspaceId: ForecastWorkspaceId,
  view: Pick<ResolvedNativeFileContent, 'mapView' | 'cycleMetadata'>,
): ResolvedNativeFileContent => ({
  forecastCycle: restored.forecastCycle,
  workspaceId,
  mapView: view.mapView,
  cycleMetadata: view.cycleMetadata,
  warnings: [`This package labels an untagged legacy forecast as ${workspaceId} workspace.`],
  legacy: true,
});

/**
 * Rejects an outer label that would move an untagged legacy forecast into a
 * workspace its contents cannot prove. The inner payload of a legacy package
 * only ever validates as Severe, so any other declared owner is an unverifiable
 * reassignment; callers see the throw before any state is touched.
 */
const assertDeclaredLegacyOwnership = (
  declaredWorkspaceId: ForecastWorkspaceId | null,
  restored: RestoredWorkspace,
): void => {
  if (declaredWorkspaceId === null || !restored.legacy) return;
  if (declaredWorkspaceId === restored.workspaceId) return;
  throw new Error(
    `This package labels an untagged legacy forecast as ${declaredWorkspaceId} workspace, which cannot be verified. Export it from that workspace to include its workspace identity.`,
  );
};

/** Resolves ownership for an unlabeled package. Legacy falls back to inner owner with warning. */
const resolveUnlabeledPackageContent = (
  restored: RestoredWorkspace,
  view: Pick<ResolvedNativeFileContent, 'mapView' | 'cycleMetadata'>,
): ResolvedNativeFileContent => {
  if (restored.legacy) {
    return {
      forecastCycle: restored.forecastCycle,
      workspaceId: restored.workspaceId,
      mapView: view.mapView,
      cycleMetadata: view.cycleMetadata,
      warnings: [`This package has no workspace label; treated as a ${restored.workspaceId} legacy package.`],
      legacy: true,
    };
  }
  return {
    forecastCycle: restored.forecastCycle,
    workspaceId: restored.workspaceId,
    mapView: view.mapView,
    cycleMetadata: view.cycleMetadata,
    warnings: [
      `This package has no workspace label; ownership inferred from its inner forecast as ${restored.workspaceId} workspace.`,
    ],
    legacy: false,
  };
};

/** Resolves ownership once mismatch checks pass. Unlabeled keeps inner owner, labeled keeps outer. */
const resolvePackageOwnership = (
  declaredWorkspaceId: ForecastWorkspaceId | null,
  restored: RestoredWorkspace,
  view: Pick<ResolvedNativeFileContent, 'mapView' | 'cycleMetadata'>,
): ResolvedNativeFileContent => {
  if (declaredWorkspaceId === null) return resolveUnlabeledPackageContent(restored, view);
  return {
    forecastCycle: restored.forecastCycle,
    workspaceId: declaredWorkspaceId,
    mapView: view.mapView,
    cycleMetadata: view.cycleMetadata,
    warnings: [],
    legacy: restored.legacy,
  };
};

/** Returns relabeled content when an outer label covers an untagged legacy forecast. Null otherwise. */
const resolveDeclaredLegacyContent = (
  declaredWorkspaceId: ForecastWorkspaceId | null,
  restored: RestoredWorkspace,
  view: Pick<ResolvedNativeFileContent, 'mapView' | 'cycleMetadata'>,
): ResolvedNativeFileContent | null => {
  if (declaredWorkspaceId === null || !restored.legacy) return null;
  return buildLegacyRelabeledContent(restored, declaredWorkspaceId, view);
};

/** Resolves a workflow export package envelope into workspace, cycle, view, and warnings. */
const resolveWorkflowPackageContent = (data: WorkflowExportPackage): ResolvedNativeFileContent => {
  const declaredWorkspaceId = getDeclaredPackageWorkspace(data);
  const restored = deserializeForecastWorkspace(data.forecast);
  const view = mergePackageView(data, getInnerView(data.forecast));
  assertDeclaredLegacyOwnership(declaredWorkspaceId, restored);
  const legacyRelabeled = resolveDeclaredLegacyContent(declaredWorkspaceId, restored, view);
  if (legacyRelabeled) return legacyRelabeled;
  assertPackageWorkspaceMatch(declaredWorkspaceId, restored);
  return resolvePackageOwnership(declaredWorkspaceId, restored, view);
};

/** Resolves a bare forecast file without a package envelope. */
const resolveBareFileContent = (data: unknown): ResolvedNativeFileContent => {
  const restored = deserializeForecastWorkspace(data);
  const rawData = getInnerView(data);
  return {
    forecastCycle: restored.forecastCycle,
    workspaceId: restored.workspaceId,
    mapView: rawData.mapView,
    cycleMetadata: rawData.cycleMetadata,
    warnings: [],
    legacy: restored.legacy,
  };
};

/**
 * Resolves the declared or legacy workspace, cycle, map view, and workflow metadata.
 * This does not enforce an active-workspace match. Mutating editor entry points
 * must compare workspaceId before dispatch; grade, monitor, and verification
 * readers are read-only and may inspect a forecast owned by another workspace.
 *
 * A declared outer workspace that matches the owner a legacy inner forecast can
 * prove is accepted with a warning. One that names any other workspace throws,
 * because a stripped or repackaged legacy file must not change owners. Packages
 * with no outer label keep backward compatibility by falling back to the inner
 * owner, and both inferred-ownership outcomes are surfaced as warnings.
 */
export const resolveNativeFileContent = (data: unknown): ResolvedNativeFileContent => {
  if (isWorkflowExportPackage(data)) return resolveWorkflowPackageContent(data);
  return resolveBareFileContent(data);
};

/** Imports a native JSON or workflow package transfer. */
export const importNativeTransfer = async (file: File, format: 'json' | 'package'): Promise<ForecastImportResult> => {
  const data = await readForecastImportFile(file);
  assertValidNativeImportEnvelope(data);
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
