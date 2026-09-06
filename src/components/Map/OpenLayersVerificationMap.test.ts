/** Covers verification-specific paint and the mobile legend control. */

import { jest } from '@jest/globals';
import React from 'react';

// Mock ol-mapbox-style to avoid loading ESM modules in tests
jest.mock('ol-mapbox-style', () => ({ apply: jest.fn() }));

// Mock mapStyleUtils used by buildStyle/getVerificationStyleZIndex
jest.mock('../../utils/mapStyleUtils', () => ({
  getFeatureStyle: jest.fn(() => ({
    fillColor: '#112233',
    fillOpacity: 0.5,
    opacity: 0.9,
    color: '#445566',
    weight: 4,
  })),
  computeZIndex: jest.fn(() => 42),
}));

import { createCanvasStub } from '../../testUtils';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildStyle, VerifMapLegendToggleButton } from './OpenLayersVerificationMap';
import { getFeatureStyle } from '../../utils/mapStyleUtils';

describe('verification outlook styles', () => {
  afterEach(() => jest.restoreAllMocks());

  test('caps fill opacity while preserving the source stroke and probability order', () => {
    const style = buildStyle({ outlookType: 'categorical', probability: 'SLGT' });
    expect(style.getFill()?.getColor()).toBe('rgba(17, 34, 51, 0.42)');
    expect(style.getStroke()?.getColor()).toBe('rgba(68, 85, 102, 0.9)');
    expect(style.getStroke()?.getWidth()).toBe(4);
    expect(style.getZIndex()).toBe(42);
  });

  test('keeps faint fills faint and uses defaults when source style fields are absent', () => {
    jest.mocked(getFeatureStyle).mockReturnValueOnce({ fillOpacity: 0.2 });
    const style = buildStyle({ outlookType: 'wind', probability: '15%' });
    expect(style.getFill()?.getColor()).toBe('rgba(153, 153, 153, 0.2)');
    expect(style.getStroke()?.getColor()).toBe('rgba(0, 0, 0, 1)');
    expect(style.getStroke()?.getWidth()).toBe(2);
  });

  test.each(['CIG1', 'CIG2', 'CIG3'])('keeps %s above normal outlooks with the verification hatch stroke', (probability) => {
    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation(createCanvasStub(originalCreateElement));
    const style = buildStyle({ outlookType: 'tornado', probability });
    expect(style.getFill()?.getColor()).toBeTruthy();
    expect(style.getStroke()?.getColor()).toBe('#111111');
    expect(style.getStroke()?.getWidth()).toBe(1.2);
    expect(style.getZIndex()).toBe(1000 + Number(probability.slice(3)));
  });

  test('uses a transparent CIG fill when a canvas context is unavailable', () => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(buildStyle({ outlookType: 'tornado', probability: 'CIG2' }).getFill()?.getColor()).toBe('rgba(0, 0, 0, 0)');
  });
});

describe('verification map legend toggle', () => {
  test('toggles the mobile key state and exposes its expanded state', async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    const { rerender } = render(React.createElement(VerifMapLegendToggleButton, { mobileOpen: false, onToggle }));
    const button = screen.getByRole('button', { name: 'Show map key' });

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'map-legend');
    expect(button).toHaveClass('map-legend-toggle-button');
    await user.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(React.createElement(VerifMapLegendToggleButton, { mobileOpen: true, onToggle }));
    expect(screen.getByRole('button', { name: 'Hide map key' })).toHaveAttribute('aria-expanded', 'true');
  });
});
