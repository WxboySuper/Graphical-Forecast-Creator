import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router';
import { getPageTitle } from '../../routing/pageTitle';

/**
 * Keeps keyboard and screen-reader users oriented across client-side navigation:
 * updates document.title for every route and, after the first render, moves focus
 * to the main landmark when the pathname changes so focus never stays on a link
 * that no longer exists.
 */
export const useRouteOrientation = (mainRef: RefObject<HTMLElement | null>): void => {
  const { pathname, search } = useLocation();
  const previousPathname = useRef<string | null>(null);

  useEffect(() => {
    document.title = getPageTitle(pathname, search);
  }, [pathname, search]);

  useEffect(() => {
    const isFirstRender = previousPathname.current === null;
    const pathnameChanged = previousPathname.current !== pathname;
    previousPathname.current = pathname;
    if (isFirstRender || !pathnameChanged) return;
    // Never pull focus out from behind an open modal such as the Terms or Privacy viewer.
    if (document.querySelector('[aria-modal="true"], dialog[open]')) return;
    // A new page should start at the top, like a full page load.
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [mainRef, pathname]);
};
