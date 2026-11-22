/**
 * Baseline flag checks derived from the registry: every flag, every target. A new flag is covered
 * here automatically; only feature-specific behavior needs its own test.
 */
import registry from '../../server/flags.json';
import { BUILD_TARGETS, type BuildTarget } from './buildTarget';
import { flag, type FlagName } from './flags';
import { APP_NAVIGATION_ITEMS, getNavigationKeyboardShortcuts, getVisibleNavigationItems } from './featureNavigation';
import { FORECAST_WORKSPACES, isForecastWorkspaceExposed } from './forecastWorkspaces';
import { GATED_ROUTE_DEFINITIONS, getExposedGatedRoutePaths } from '../routing/buildFeatureGatedRoutes';

type Entry = { kind: 'dev' | 'switch'; default: boolean; values?: Partial<Record<BuildTarget, boolean>> };

const ENTRIES = Object.entries(registry.flags as unknown as Record<string, Entry>) as [FlagName, Entry][];

describe('flag registry baseline', () => {
  test.each(ENTRIES)('%s reads its value for each target and falls back to its default', (name, entry) => {
    for (const target of BUILD_TARGETS) {
      expect(flag(name, target)).toBe(entry.values?.[target] ?? entry.default);
    }
    expect(flag(name, 'unknown-target' as BuildTarget)).toBe(entry.default);
  });

  test.each(ENTRIES.filter(([, entry]) => entry.kind === 'dev'))('%s is on in production only when it says so explicitly', (name, entry) => {
    expect(entry.default).toBe(false);
    expect(flag(name, 'production')).toBe(entry.values?.production === true);
  });

  describe.each(BUILD_TARGETS)('on %s', (target) => {
    test('gated routes exist only while their flag is on', () => {
      const exposed = getExposedGatedRoutePaths(target);
      for (const definition of GATED_ROUTE_DEFINITIONS) {
        expect(exposed.includes(`/${definition.path}`)).toBe(flag(definition.feature, target));
      }
    });

    test('navigation items and shortcuts stay hidden while their flag is off', () => {
      const visible = getVisibleNavigationItems(target).map((item) => item.id);
      const shortcuts = getNavigationKeyboardShortcuts(jest.fn(), target);
      for (const item of APP_NAVIGATION_ITEMS) {
        const on = !item.feature || flag(item.feature, target);
        expect(visible.includes(item.id as never)).toBe(on);
        if (item.shortcutKey) expect(item.shortcutKey in shortcuts).toBe(on);
      }
    });

    test('gated workspaces are exposed only while their flag is on', () => {
      for (const workspace of FORECAST_WORKSPACES) {
        const on = workspace.exposureKey === null || flag(workspace.exposureKey, target);
        expect(isForecastWorkspaceExposed(workspace, target)).toBe(on);
      }
    });
  });
});
