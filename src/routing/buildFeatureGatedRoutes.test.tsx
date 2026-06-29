import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes } from 'react-router-dom';
import {
  assertGatedRoutesAbsent,
  mockFeatureExposureOnTarget,
  runWithBuildTarget,
  singleTargetOn,
} from '../testing/featureExposure/harness';
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
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('does not register gated routes while every feature remains disabled', () => {
    runWithBuildTarget('beta', () => {
      assertGatedRoutesAbsent('tropicalWorkspace', ['beta']);
      assertGatedRoutesAbsent('collaborationRoom', ['beta']);
      expect(getExposedGatedRoutePaths('beta')).toEqual([]);
      expect(buildFeatureGatedRoutes('beta')).toEqual([]);
    });
  });

  test('registers exposed gated routes and lazy-loads their modules', async () => {
    const exposureSpy = mockFeatureExposureOnTarget('tropicalWorkspace', singleTargetOn('local'));

    expect(getExposedGatedRoutePaths('local')).toEqual(['/tropical']);

    render(
      <MemoryRouter initialEntries={['/tropical']}>
        <Routes>{buildFeatureGatedRoutes('local')}</Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Tropical workspace page')).toBeInTheDocument();
    exposureSpy.mockRestore();
  });
});
