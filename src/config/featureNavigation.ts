/**
 * Feature navigation configuration.
 *
 * This module maps feature identifiers to the navigation metadata used by GFC surfaces. Route components own rendering and access decisions; this file defines the shared configuration.
 */
import { getBuildTarget, type BuildTarget } from './buildTarget';
import { isFeatureExposedOnTarget, type FeatureKey } from './featureExposure';

export type AppNavigationItem = {
  id: string;
  to: string;
  label: string;
  shortcutKey?: string;
  shortcutLabel?: string;
  end?: boolean;
  feature?: FeatureKey;
};

/** Navigation and shortcut metadata. Items with a feature key are included only when exposed. */
const RAW_APP_NAVIGATION_ITEMS = [
  { id: 'home', to: '/', label: 'Home', shortcutKey: 'h', shortcutLabel: '⌃H', end: true },
  { id: 'forecast', to: '/forecast', label: 'Forecast', shortcutKey: '1', shortcutLabel: '⌃1' },
  { id: 'discussion', to: '/forecast/severe?surface=discussion', label: 'Discussion', shortcutKey: '2', shortcutLabel: '⌃2' },
  { id: 'verification', to: '/verification', label: 'Verification', shortcutKey: '3', shortcutLabel: '⌃3' },
  { id: 'monitor', to: '/monitor', label: 'Monitor', shortcutKey: '4', shortcutLabel: '⌃4' },
  {
    id: 'tropical-workspace',
    to: '/tropical',
    label: 'Tropical',
    shortcutKey: '5',
    shortcutLabel: '⌃5',
    feature: 'tropicalWorkspace',
  },
  {
    id: 'collaboration-room',
    to: '/collaborate',
    label: 'Collaborate',
    shortcutKey: '6',
    shortcutLabel: '⌃6',
    feature: 'collaborationRoom',
  },
] as const satisfies readonly AppNavigationItem[];

export const APP_NAVIGATION_ITEMS: readonly AppNavigationItem[] = RAW_APP_NAVIGATION_ITEMS;
export type AppNavigationItemId = (typeof RAW_APP_NAVIGATION_ITEMS)[number]['id'];

export type AppNavigationItemWithId = AppNavigationItem & { id: AppNavigationItemId };

/** Returns navbar items visible for the given deployment target. */
export const getVisibleNavigationItems = (
  target: BuildTarget = getBuildTarget()
): AppNavigationItemWithId[] =>
  APP_NAVIGATION_ITEMS.filter(
    (item) => !item.feature || isFeatureExposedOnTarget(item.feature, target)
  ) as AppNavigationItemWithId[];

/** Builds Ctrl/Cmd navigation shortcuts for visible navbar destinations. */
export const getNavigationKeyboardShortcuts = (
  navigate: (path: string) => void,
  target: BuildTarget = getBuildTarget()
): Record<string, () => void> => {
  const shortcuts: Record<string, () => void> = {
    d: () => document.documentElement.classList.toggle('dark-mode'),
  };

  for (const item of getVisibleNavigationItems(target)) {
    if (item.shortcutKey) {
      shortcuts[item.shortcutKey] = () => {
        if (item.id === 'discussion' && typeof window !== 'undefined') {
          const currentParams = new URLSearchParams(window.location.search);
          const params = new URLSearchParams();
          const currentWorkspace = window.location.pathname.match(/^\/forecast\/(severe|custom)(?:\/|$)/)?.[1];
          const legacyWorkspaceHint = window.location.pathname.startsWith('/discussion')
            ? currentParams.get('workspace')
            : null;
          const group = currentParams.get('group');
          if (group) params.set('group', group);
          if (currentWorkspace === 'custom' || (!currentWorkspace && legacyWorkspaceHint === 'custom')) {
            params.set('workspace', 'custom');
          }
          params.set('surface', 'discussion');
          navigate(`/discussion?${params.toString()}`);
          return;
        }
        navigate(item.to);
      };
    }
  }

  return shortcuts;
};
