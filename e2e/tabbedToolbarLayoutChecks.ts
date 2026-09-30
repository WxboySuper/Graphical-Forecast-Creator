export type LayoutViolation = { kind: string; detail: string };

export type ToolbarLayoutContext = {
  toolbar: Element;
  row: HTMLElement;
  toolbarRect: DOMRect;
  rowRect: DOMRect;
  sections: Element[];
  interactiveSelector: string;
};

export const INTERACTIVE_CONTROL_SELECTOR = [
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

/** Returns whether two rects overlap, allowing a pixel tolerance on each edge. */
export const rectsOverlap = (a: DOMRect, b: DOMRect, tolerance: number): boolean => (
  a.left < b.right - tolerance
  && a.right > b.left + tolerance
  && a.top < b.bottom - tolerance
  && a.bottom > b.top + tolerance
);

/** Returns whether an element is rendered and has non-zero size. */
export const isVisibleElement = (element: Element): boolean => {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

/** Locates the active tab row and toolbar roots used by layout checks. */
export const resolveToolbarLayoutContext = (): LayoutViolation | ToolbarLayoutContext => {
  const toolbar = document.querySelector('.tabbed-integrated-toolbar');
  if (!toolbar) {
    return { kind: 'missing-toolbar', detail: 'Tabbed toolbar root not found' };
  }

  const activePanel = document.querySelector('.tabbed-integrated-toolbar__panel[data-state="active"]');
  const row = activePanel?.querySelector('.tabbed-integrated-toolbar__row') as HTMLElement | null;
  if (!row) {
    return { kind: 'missing-row', detail: 'Active tab row not found' };
  }

  return {
    toolbar,
    row,
    toolbarRect: toolbar.getBoundingClientRect(),
    rowRect: row.getBoundingClientRect(),
    sections: Array.from(row.querySelectorAll('.tabbed-integrated-toolbar__section')),
    interactiveSelector: INTERACTIVE_CONTROL_SELECTOR,
  };
};

/** Section labels must not overlap controls in neighboring sections. */
export const collectLabelOverlapViolations = (
  context: ToolbarLayoutContext,
  tolerance: number,
): LayoutViolation[] => {
  const violations: LayoutViolation[] = [];

  context.sections.forEach((section, sectionIndex) => {
    const labels = Array.from(section.querySelectorAll('.tabbed-integrated-toolbar__section-label'));
    labels.forEach((label) => {
      if (!isVisibleElement(label)) return;
      const labelRect = label.getBoundingClientRect();

      context.sections.forEach((neighborSection, neighborIndex) => {
        if (neighborIndex === sectionIndex) return;
        const controls = Array.from(neighborSection.querySelectorAll(context.interactiveSelector));
        controls.forEach((control) => {
          if (!isVisibleElement(control)) return;
          if (!rectsOverlap(labelRect, control.getBoundingClientRect(), tolerance)) return;
          violations.push({
            kind: 'label-overlap',
            detail: `Label "${label.textContent?.trim() ?? ''}" overlaps a control in a neighboring section`,
          });
        });
      });
    });
  });

  return violations;
};

/** Interactive controls must fit vertically inside the active tab row. */
export const collectRowVerticalClipViolations = (
  context: ToolbarLayoutContext,
  tolerance: number,
): LayoutViolation[] => {
  const violations: LayoutViolation[] = [];
  const controls = Array.from(context.row.querySelectorAll(context.interactiveSelector)).filter(isVisibleElement);

  controls.forEach((control) => {
    const controlRect = control.getBoundingClientRect();
    const clippedAbove = controlRect.top < context.rowRect.top - tolerance;
    const clippedBelow = controlRect.bottom > context.rowRect.bottom + tolerance;
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
  context: ToolbarLayoutContext,
  tolerance: number,
): LayoutViolation[] => {
  const violations: LayoutViolation[] = [];
  const controls = Array.from(context.toolbar.querySelectorAll(context.interactiveSelector)).filter(isVisibleElement);

  controls.forEach((control) => {
    const controlRect = control.getBoundingClientRect();
    if (controlRect.bottom <= context.toolbarRect.bottom + tolerance) return;
    violations.push({
      kind: 'toolbar-spill',
      detail: 'A toolbar control extends below the toolbar onto the map',
    });
  });

  return violations;
};

/** At wide viewports the Days row should not require horizontal scrolling. */
export const collectDaysHorizontalOverflowViolations = (
  context: ToolbarLayoutContext,
  tolerance: number,
  requireDaysRowFits: boolean,
): LayoutViolation[] => {
  if (!requireDaysRowFits || context.row.scrollWidth <= context.clientWidth + tolerance) {
    return [];
  }

  return [{
    kind: 'days-horizontal-overflow',
    detail: `Days row scrollWidth ${context.row.scrollWidth} exceeds clientWidth ${context.row.clientWidth}`,
  }];
};

export type ToolbarLayoutCheckOptions = {
  tolerance: number;
  requireDaysRowFits: boolean;
};

/** Runs all tabbed-toolbar layout rules in the browser context. */
export const collectToolbarLayoutViolations = ({
  tolerance,
  requireDaysRowFits,
}: ToolbarLayoutCheckOptions): LayoutViolation[] => {
  const resolved = resolveToolbarLayoutContext();
  if ('kind' in resolved) {
    return [resolved];
  }

  return [
    ...collectLabelOverlapViolations(resolved, tolerance),
    ...collectRowVerticalClipViolations(resolved, tolerance),
    ...collectToolbarSpillViolations(resolved, tolerance),
    ...collectDaysHorizontalOverflowViolations(resolved, tolerance, requireDaysRowFits),
  ];
};
