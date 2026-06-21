import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes } from 'react-router-dom';
import * as featureExposure from '../config/featureExposure';
import { buildFeatureGatedRoutes, getExposedGatedRoutePaths } from './buildFeatureGatedRoutes';

jest.mock('../pages/gated/TropicalWorkspacePage', () => ({
  __esModule: true,
  default: () => <div>Tropical workspace page</div>,
}));

jest.mock('../pages/gated/CollaborationRoomPage', () => ({
  __esModule: true,
  default: () => <div>Collaboration room page</div>,
}));

describe('buildFeatureGatedRoutes', () => {
  const originalTarget = globalThis.__GFC_BUILD_TARGET__;

  afterEach(() => {
    globalThis.__GFC_BUILD_TARGET__ = originalTarget;
    jest.restoreAllMocks();
  });

  test('does not register gated routes while every feature remains disabled', () => {
    globalThis.__GFC_BUILD_TARGET__ = 'beta';

    expect(getExposedGatedRoutePaths('beta')).toEqual([]);
    expect(buildFeatureGatedRoutes('beta')).toEqual([]);
  });

  test('registers exposed gated routes and lazy-loads their modules', async () => {
    jest.spyOn(featureExposure, 'isFeatureExposedOnTarget').mockImplementation(
      (feature, target) => feature === 'tropicalWorkspace' && target === 'local'
    );

    expect(getExposedGatedRoutePaths('local')).toEqual(['/tropical']);

    render(
      <MemoryRouter initialEntries={['/tropical']}>
        <Routes>{buildFeatureGatedRoutes('local')}</Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Tropical workspace page')).toBeInTheDocument();
  });
});
