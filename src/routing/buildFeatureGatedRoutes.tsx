import { Suspense, type ComponentType, type LazyExoticComponent, type ReactElement } from 'react';
import { Route } from 'react-router';
import { getBuildTarget, type BuildTarget } from '../config/buildTarget';
import { flag, type FlagName } from '../config/flags';
import { lazyWithReload } from './lazyWithReload';

type GatedRouteDefinition = {
  feature: FlagName;
  path: string;
  loadPage: () => Promise<{ default: ComponentType }>;
};

/** Lazy routes owned by a flag. Core app routes stay outside this list. */
export const GATED_ROUTE_DEFINITIONS = [
  { feature: 'tropicalWorkspace', path: 'tropical', loadPage: () => import('../pages/gated/TropicalWorkspacePage') },
  { feature: 'collaborationRoom', path: 'collaborate', loadPage: () => import('../pages/gated/CollaborationRoomPage') },
  { feature: 'customProducts', path: 'custom-products', loadPage: () => import('../pages/gated/CustomProductsPage') },
] as const satisfies readonly GatedRouteDefinition[];

const lazyPageCache = new Map<string, LazyExoticComponent<ComponentType>>();

/** Returns a cached lazy component for one gated route definition. */
const getLazyPage = (definition: GatedRouteDefinition): LazyExoticComponent<ComponentType> => {
  const cached = lazyPageCache.get(definition.path);
  if (cached) {
    return cached;
  }

  const lazyPage = lazyWithReload(definition.path, definition.loadPage);
  lazyPageCache.set(definition.path, lazyPage);
  return lazyPage;
};

/** Returns gated route pathnames that would register for the given deployment target. */
export const getExposedGatedRoutePaths = (target: BuildTarget = getBuildTarget()): string[] =>
  GATED_ROUTE_DEFINITIONS.filter((definition) => flag(definition.feature, target)).map(
    (definition) => `/${definition.path}`
  );

/** Minimal loading placeholder shown while a gated lazy route chunk downloads. */
const GatedRouteFallback = () => (
  <div className="flex h-full items-center justify-center p-6" aria-busy="true" aria-label="Loading page" />
);

/** Registers lazy routes only for features exposed on the current build target. */
export const buildFeatureGatedRoutes = (target: BuildTarget = getBuildTarget()): ReactElement[] =>
  GATED_ROUTE_DEFINITIONS.filter((definition) => flag(definition.feature, target)).map(
    (definition) => {
      const Page = getLazyPage(definition);

      return (
        <Route
          key={definition.path}
          path={definition.path}
          element={
            <Suspense fallback={<GatedRouteFallback />}>
              <Page />
            </Suspense>
          }
        />
      );
    }
  );
