/**
 * Workflow v2 schema definitions for forecast cycles, workflows,
 * outlook versions, and package metadata.
 *
 * This is the foundational type layer for the v1.7 forecast workflow
 * redesign (issue #429). Downstream issues WF-02 through WF-09 build
 * on these schemas.
 *
 * @see https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/451
 */

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------

/** Semver string for the workflow v2 type/schema surface. */
export const WORKFLOW_SCHEMA_VERSION = '1.0.0' as const;

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/** Stable workflow identifier, e.g. `"severe-day1"`, `"convective-outlook"`. */
export type WorkflowId = string;

/**
 * Stable cycle identifier.
 * Convention: `"WF-<workflowId>-<cycleDate>"`, but format is opaque to the
 * schema layer — consumers must not parse it.
 */
export type CycleId = string;

// ---------------------------------------------------------------------------
// Status enums
// ---------------------------------------------------------------------------

/**
 * Lifecycle status of a forecast cycle.
 *
 * - `in-progress` — cycle has started but is not yet final.
 * - `completed` — all required outlooks are final.
 * - `completed-with-omissions` — forecaster explicitly acknowledged
 *   missing outlooks (see WF-03).
 */
export type CycleStatus = 'in-progress' | 'completed' | 'completed-with-omissions';

/**
 * Lifecycle status of a single outlook within a cycle.
 *
 * - `in-progress` — outlook is being edited.
 * - `completed` — outlook is final.
 * - `skipped` — outlook was intentionally not drawn (e.g. no threat).
 * - `omitted` — outlook was not addressed (acknowledged omission).
 */
export type OutlookStatus = 'in-progress' | 'completed' | 'skipped' | 'omitted';

// ---------------------------------------------------------------------------
// Outlook versions
// ---------------------------------------------------------------------------

/**
 * Tracks a single revision of an outlook within the same cycle.
 *
 * When a forecaster issues an update (e.g. Day 1 1300Z → 1600Z), a new
 * `OutlookVersion` is appended. The `derivedFrom` field links the update
 * back to its parent, making lineage explicit.
 */
export interface OutlookVersion {
  /** 1-based version number within the cycle. */
  version: number;
  /** Current lifecycle status. */
  status: OutlookStatus;
  /** Parent version this was derived from (`undefined` = original). */
  derivedFrom?: number;
  /** ISO-8601 timestamp of creation. */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Groupings
// ---------------------------------------------------------------------------

/**
 * Standard day-based groupings that map to SPC issuance cadence.
 * Custom groupings are freeform strings chosen by the forecaster.
 */
export type StandardGrouping = 'day1' | 'day2' | 'day3' | 'day4-8';

/** User-defined grouping label. */
export type CustomGrouping = string;

/** Union of standard and custom groupings. */
export type Grouping = StandardGrouping | CustomGrouping;

// ---------------------------------------------------------------------------
// Workflow metadata
// ---------------------------------------------------------------------------

/** Describes a workflow template (e.g. "Severe Convective Day 1"). */
export interface WorkflowMetadata {
  /** Stable workflow identifier. */
  id: WorkflowId;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Ordered groupings this workflow covers. */
  groupings: Grouping[];
}

// ---------------------------------------------------------------------------
// Cycle metadata
// ---------------------------------------------------------------------------

/** Metadata for a single forecast cycle. */
export interface CycleMetadata {
  /** Stable cycle identifier. */
  id: CycleId;
  /** Workflow this cycle belongs to. */
  workflowId: WorkflowId;
  /** ISO date string (YYYY-MM-DD) of the forecast cycle. */
  cycleDate: string;
  /** Current lifecycle status. */
  status: CycleStatus;
  /** Ordered list of outlook versions issued within this cycle. */
  outlookVersions: OutlookVersion[];
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-updated timestamp. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Package metadata
// ---------------------------------------------------------------------------

/**
 * Package-level metadata for exporting or persisting a complete
 * workflow + cycle bundle.
 */
export interface WorkflowPackageMetadata {
  /** Workflow identifier. */
  workflowId: WorkflowId;
  /** Cycle identifier. */
  cycleId: CycleId;
  /** Package-level version (distinct from `OutlookVersion.version`). */
  version: number;
  /** Cycle status at time of packaging. */
  status: CycleStatus;
  /** Whether the package includes discussion content. */
  includesDiscussions: boolean;
  /** Whether the package includes custom style snapshots. */
  includesStyleSnapshots: boolean;
  /**
   * If this cycle was derived from a previous cycle, the source cycle ID.
   * `undefined` when the cycle is standalone.
   */
  derivedFromCycleId?: CycleId;
}

/**
 * A complete workflow package containing metadata and associated cycles.
 */
export interface Package {
  metadata: WorkflowPackageMetadata;
  cycles: CycleMetadata[];
}
