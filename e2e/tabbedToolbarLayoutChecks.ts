export type LayoutViolation = { kind: string; detail: string };

export type BoxRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type ToolbarLayoutSnapshot = {
  toolbarRect: BoxRect;
  rowRect: BoxRect;
  rowScrollWidth: number;
  rowClientWidth: number;
  labels: { sectionIndex: number; text: string; rect: BoxRect }[];
  rowControlRects: BoxRect[];
  toolbarControlRects: BoxRect[];
  neighborControls: { sectionIndex: number; rect: BoxRect }[];
};

export type ToolbarLayoutSnapshotResult =
  | { ok: true; snapshot: ToolbarLayoutSnapshot }
  | { ok: false; violation: LayoutViolation };

/** Returns whether two rects overlap, allowing a pixel tolerance on each edge. */
export const rectsOverlap = (a: BoxRect, b: BoxRect, tolerance: number): boolean => (
  a.left < b.right - tolerance
  && a.right > b.left + tolerance
  && a.top < b.bottom - tolerance
  && a.bottom > b.top + tolerance
);

/** Section labels must not overlap controls in neighboring sections. */
export const collectLabelOverlapViolations = (
  snapshot: ToolbarLayoutSnapshot,
  tolerance: number,
): LayoutViolation[] => {
  const violations: LayoutViolation[] = [];

  snapshot.labels.forEach((label) => {
    snapshot.neighborControls.forEach((control) => {
      if (control.sectionIndex === label.sectionIndex) return;
      if (!rectsOverlap(label.rect, control.rect, tolerance)) return;
      violations.push({
        kind: 'label-overlap',
        detail: `Label "${label.text}" overlaps a control in a neighboring section`,
      });
    });
  });

  return violations;
};

/** Interactive controls must fit vertically inside the active tab row. */
export const collectRowVerticalClipViolations = (
  snapshot: ToolbarLayoutSnapshot,
  tolerance: number,
): LayoutViolation[] => {
  const violations: LayoutViolation[] = [];

  snapshot.rowControlRects.forEach((controlRect) => {
    const clippedAbove = controlRect.top < snapshot.rowRect.top - tolerance;
    const clippedBelow = controlRect.bottom > snapshot.rowRect.bottom + tolerance;
    if (!clippedAbove && !clippedBelow) return;
    violations.push({
      kind: 'row-vertical-clip',
      detail: 'A toolbar control is clipped vertically by the active tab row',
    });
  });

  return violations;
};

/** Controls must not extend below the toolbar container onto the map. */
export const collectToolbarSpillViolations = (
  snapshot: ToolbarLayoutSnapshot,
  tolerance: number,
): LayoutViolation[] => {
  const violations: LayoutViolation[] = [];

  snapshot.toolbarControlRects.forEach((controlRect) => {
    if (controlRect.bottom <= snapshot.toolbarRect.bottom + tolerance) return;
    violations.push({
      kind: 'toolbar-spill',
      detail: 'A toolbar control extends below the toolbar onto the map',
    });
  });

  return violations;
};

/** At wide viewports the Days row should not require horizontal scrolling. */
export const collectDaysHorizontalOverflowViolations = (
  snapshot: ToolbarLayoutSnapshot,
  tolerance: number,
  requireDaysRowFits: boolean,
): LayoutViolation[] => {
  if (!requireDaysRowFits || snapshot.rowScrollWidth <= snapshot.rowClientWidth + tolerance) {
    return [];
  }

  return [{
    kind: 'days-horizontal-overflow',
    detail: `Days row scrollWidth ${snapshot.rowScrollWidth} exceeds clientWidth ${snapshot.rowClientWidth}`,
  }];
};

export type ToolbarLayoutCheckOptions = {
  tolerance: number;
  requireDaysRowFits: boolean;
};

export const TOOLBAR_INTERACTIVE_CONTROL_SELECTOR = [
  'button',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '.tabbed-integrated-toolbar__stat-pill',
  '.tabbed-integrated-toolbar__day-button',
  '.tabbed-integrated-toolbar__type-button',
  '.tabbed-integrated-toolbar__probability-button',
  '.tabbed-integrated-toolbar__map-button',
  '.tabbed-integrated-toolbar__ghost-layer-button',
  '.tabbed-integrated-toolbar__action-tile',
  '.custom-product-toggle__button',
].join(',');

export type GatherToolbarLayoutSnapshotArgs = {
  interactiveSelector: string;
};

/** Runs layout rules against a DOM snapshot collected in the browser. */
export const collectToolbarLayoutViolations = (
  snapshot: ToolbarLayoutSnapshot,
  { tolerance, requireDaysRowFits }: ToolbarLayoutCheckOptions,
): LayoutViolation[] => [
  ...collectLabelOverlapViolations(snapshot, tolerance),
  ...collectRowVerticalClipViolations(snapshot, tolerance),
  ...collectToolbarSpillViolations(snapshot, tolerance),
  ...collectDaysHorizontalOverflowViolations(snapshot, tolerance, requireDaysRowFits),
];

/**
 * Self-contained browser function for Playwright evaluate (nested helpers are serialized with it).
 */
export function gatherToolbarLayoutSnapshot({
  interactiveSelector,
}: GatherToolbarLayoutSnapshotArgs): ToolbarLayoutSnapshotResult {
  const toBox = (rect: DOMRect): BoxRect => ({
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  });

  const isVisible = (element: Element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width * rect.height > 0;
  };

  const toolbar = document.querySelector('.tabbed-integrated-toolbar');
  const row = document.querySelector(
    '.tabbed-integrated-toolbar__panel[data-state="active"] .tabbed-integrated-toolbar__row',
  ) as HTMLElement | null;
  if (!toolbar || !row) {
    return {
      ok: false,
      violation: toolbar
        ? { kind: 'missing-row', detail: 'Active tab row not found' }
        : { kind: 'missing-toolbar', detail: 'Tabbed toolbar root not found' },
    };
  }

  const sections = Array.from(row.querySelectorAll('.tabbed-integrated-toolbar__section'));
  const labels = sections.flatMap((section, sectionIndex) =>
    Array.from(section.querySelectorAll('.tabbed-integrated-toolbar__section-label'))
      .filter(isVisible)
      .map((label) => ({
        sectionIndex,
        text: (label.textContent ?? '').trim(),
        rect: toBox(label.getBoundingClientRect()),
      })),
  );
  const neighborControls = sections.flatMap((section, sectionIndex) =>
    Array.from(section.querySelectorAll(interactiveSelector))
      .filter(isVisible)
      .map((control) => ({
        sectionIndex,
        rect: toBox(control.getBoundingClientRect()),
      })),
  );
  const rowControlRects = Array.from(row.querySelectorAll(interactiveSelector))
    .filter(isVisible)
    .map((control) => toBox(control.getBoundingClientRect()));
  const toolbarControlRects = Array.from(toolbar.querySelectorAll(interactiveSelector))
    .filter(isVisible)
    .map((control) => toBox(control.getBoundingClientRect()));

  return {
    ok: true,
    snapshot: {
      toolbarRect: toBox(toolbar.getBoundingClientRect()),
      rowRect: toBox(row.getBoundingClientRect()),
      rowScrollWidth: row.scrollWidth,
      rowClientWidth: row.clientWidth,
      labels,
      rowControlRects,
      toolbarControlRects,
      neighborControls,
    },
  };
}
