const FOCUSABLE_SELECTOR = 'a[href], area[href], button, input, select, textarea, iframe, object, embed, [tabindex], [contenteditable="true"]';

/** Removes focusable descendants from tab order and restores their original tabindex values. */
export const makeSubtreeUntabbable = (root: HTMLElement): (() => void) => {
  const originalTabIndex = new Map<HTMLElement, string | null>();
  const disableTree = (node: Node): void => {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches(FOCUSABLE_SELECTOR) && !originalTabIndex.has(node)) {
      originalTabIndex.set(node, node.getAttribute('tabindex'));
      node.setAttribute('tabindex', '-1');
    }
    node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR).forEach((element) => {
      if (originalTabIndex.has(element)) return;
      originalTabIndex.set(element, element.getAttribute('tabindex'));
      element.setAttribute('tabindex', '-1');
    });
  };

  disableTree(root);
  const observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach(disableTree));
  });
  observer.observe(root, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    originalTabIndex.forEach((tabIndex, element) => {
      if (tabIndex === null) element.removeAttribute('tabindex');
      else element.setAttribute('tabindex', tabIndex);
    });
  };
};
