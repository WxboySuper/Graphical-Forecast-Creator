import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import Feature from 'ol/Feature';
import { render, screen } from '@testing-library/react';
import { flag } from '../config/flags';
import { BUILD_TARGETS, type BuildTarget } from '../config/buildTarget';
import mesoscaleReducer from '../store/mesoscaleSlice';
import { AreaEditor } from '../components/Mesoscale/areas/AreaEditor';
import { areaStyle } from '../components/Mesoscale/areas/areaStyle';

const t = '2026-11-20T12:00:00.000Z';
const area = {
  id: 'a1', title: 'Area 1', hazard: 'Wind', validStart: t, validEnd: t, createdAt: t, updatedAt: t,
  geometry: { type: 'Polygon' as const, coordinates: [[[-100, 35], [-98, 35], [-98, 37], [-100, 35]]] },
  style: { outlineColor: '#0072b2', fillPattern: 'none' as const },
};

describe('mesoscale area styling exposure', () => {
  const originalTarget = globalThis.__GFC_BUILD_TARGET__;
  afterEach(() => { globalThis.__GFC_BUILD_TARGET__ = originalTarget; });

  test.each(BUILD_TARGETS)('%s follows the fail-closed exposure matrix', (target: BuildTarget) => {
    globalThis.__GFC_BUILD_TARGET__ = target;
    const exposed = flag('mesoscaleAreaStyling', target);
    const store = configureStore({ reducer: { mesoscale: mesoscaleReducer } });
    render(
      <Provider store={store}>
        <AreaEditor area={area} onChange={jest.fn()} onDelete={jest.fn()} onGeometry={jest.fn()} onVertexChange={jest.fn()} onActiveVertex={jest.fn()} onStyle={jest.fn()} />
      </Provider>,
    );
    expect(Boolean(screen.queryByText('Appearance'))).toBe(exposed);

    // A saved style only reaches the map where the flag is on.
    const styles = areaStyle(new Feature({ hazard: 'Wind', areaStyle: area.style }), false);
    expect(styles[1].getFill() === null).toBe(exposed);
  });

  test('production keeps area styling off', () => {
    expect(flag('mesoscaleAreaStyling', 'production')).toBe(false);
  });
});
