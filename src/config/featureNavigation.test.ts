import * as featureExposure from './featureExposure';
import {
  APP_NAVIGATION_ITEMS,
  getNavigationKeyboardShortcuts,
  getVisibleNavigationItems,
} from './featureNavigation';

describe('featureNavigation', () => {
  const originalTarget = globalThis.__GFC_BUILD_TARGET__;

  afterEach(() => {
    globalThis.__GFC_BUILD_TARGET__ = originalTarget;
    jest.restoreAllMocks();
  });

  test('keeps core navigation visible when gated features are disabled', () => {
    globalThis.__GFC_BUILD_TARGET__ = 'production';

    expect(getVisibleNavigationItems('production').map((item) => item.id)).toEqual([
      'home',
      'forecast',
      'discussion',
      'verification',
      'monitor',
    ]);
  });

  test('includes gated navigation only when the feature is exposed on the target', () => {
    jest.spyOn(featureExposure, 'isFeatureExposedOnTarget').mockImplementation(
      (feature, target) => feature === 'tropicalWorkspace' && target === 'local'
    );

    expect(getVisibleNavigationItems('local').map((item) => item.id)).toContain('tropical-workspace');
    expect(getVisibleNavigationItems('production').map((item) => item.id)).not.toContain('tropical-workspace');
  });

  test('omits keyboard shortcuts for hidden gated destinations', () => {
    const navigate = jest.fn();
    const shortcuts = getNavigationKeyboardShortcuts(navigate, 'production');

    expect(Object.keys(shortcuts).sort()).toEqual(['1', '2', '3', '4', 'd', 'h']);
    expect(shortcuts['5']).toBeUndefined();
    expect(shortcuts['6']).toBeUndefined();
  });

  test('declares every navigation item with a stable id', () => {
    const ids = APP_NAVIGATION_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
