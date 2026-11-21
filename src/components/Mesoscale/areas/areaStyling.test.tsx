import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import Feature from 'ol/Feature';
import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import mesoscaleReducer, { selectMesoscaleState, type MesoscaleArea } from '../../../store/mesoscaleSlice';
import { withFlag } from '../../../testing/flags';
import { AreaLegend } from './AreaLegend';
import { AreasPanel } from './AreasPanel';
import { areaStyle } from './areaStyle';
import { haloColor, luminance } from './areaStyleModel';
import { useMesoscaleAreas } from './useMesoscaleAreas';

const polygon = { type: 'Polygon' as const, coordinates: [[[-100, 35], [-98, 35], [-98, 37], [-100, 35]]] };
const t = '2026-11-20T12:00:00.000Z';
const area = (id: string, hazard: string, style?: MesoscaleArea['style']): MesoscaleArea => ({
  id, title: `Area ${id}`, hazard, validStart: t, validEnd: t, geometry: polygon, createdAt: t, updatedAt: t, ...(style ? { style } : {}),
});

const setup = () => {
  const store = configureStore({ reducer: { mesoscale: mesoscaleReducer } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  return { store, wrapper };
};

afterEach(() => jest.restoreAllMocks());

describe('map style', () => {
  const feature = (style?: MesoscaleArea['style']) => new Feature({ hazard: 'Tornado potential', title: 'A', areaStyle: style });
  const outline = (styles: ReturnType<typeof areaStyle>) => styles[1].getStroke();

  it('ignores a saved style while the flag is off', () => {
    withFlag('mesoscaleAreaStyling', false);
    const plain = areaStyle(feature(), false);
    const styled = areaStyle(feature({ outlineColor: '#0072b2', outlineWidth: 6, outlineDash: 'dotted', fillPattern: 'none' }), false);
    expect(outline(styled)?.getColor()).toBe(outline(plain)?.getColor());
    expect(outline(styled)?.getWidth()).toBe(outline(plain)?.getWidth());
    expect(outline(styled)?.getLineDash()).toEqual(outline(plain)?.getLineDash());
    expect(styled[1].getFill()).not.toBeNull();
  });

  it('applies outline and fill choices while the flag is on, and keeps the rest from the hazard', () => {
    withFlag('mesoscaleAreaStyling', true);
    const styled = areaStyle(feature({ outlineColor: '#0072b2', outlineWidth: 6, outlineDash: 'solid', fillPattern: 'none' }), false);
    expect(outline(styled)?.getColor()).toBe('#0072b2');
    expect(outline(styled)?.getWidth()).toBe(6);
    expect(outline(styled)?.getLineDash()).toBeFalsy();
    expect(styled[1].getFill()).toBeNull();
    // Only the color was customized, so the dashes and the hatch stay as the hazard default.
    const partial = areaStyle(feature({ outlineColor: '#0072b2' }), false);
    expect(outline(partial)?.getLineDash()).toEqual([10, 5]);
    expect(partial[1].getFill()).not.toBeNull();
  });

  it('puts a dark halo under a light outline and a light one under a dark outline', () => {
    withFlag('mesoscaleAreaStyling', true);
    const halo = (hex: string) => String(areaStyle(feature({ outlineColor: hex }), false)[0].getStroke()?.getColor());
    expect(halo('#ffffff')).toBe(haloColor('#ffffff'));
    expect(halo('#ffffff')).not.toBe(halo('#111827'));
    expect(luminance('#ffffff')).toBeGreaterThan(0.9);
  });

  it('draws the selected area one pixel heavier than its chosen width', () => {
    withFlag('mesoscaleAreaStyling', true);
    expect(outline(areaStyle(feature({ outlineWidth: 4 }), true))?.getWidth()).toBe(5);
  });
});

describe('style editing', () => {
  const Harness = () => {
    const areas = useMesoscaleAreas();
    return (
      <>
        <button type="button" onClick={() => areas.addPolygon(polygon)}>add</button>
        <button type="button" onClick={areas.undo}>undo</button>
        <AreasPanel areas={areas} />
      </>
    );
  };
  const open = () => {
    const { store, wrapper } = setup();
    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByText('add'));
    fireEvent.click(screen.getByText('Appearance'));
    return store;
  };
  const style = (store: ReturnType<typeof setup>['store']) => selectMesoscaleState(store.getState()).areas[0].style;

  it('hides the Appearance controls while the flag is off', () => {
    withFlag('mesoscaleAreaStyling', false);
    const { wrapper } = setup();
    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByText('add'));
    expect(screen.queryByText('Appearance')).toBeNull();
  });

  it('starts on the hazard default and writes only what the forecaster changes', () => {
    withFlag('mesoscaleAreaStyling', true);
    const store = open();
    expect(style(store)).toBeUndefined();
    expect(screen.getByRole('button', { name: 'Reset to hazard default' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Outline color: Blue' }));
    expect(style(store)).toEqual({ outlineColor: '#0072b2' });
    fireEvent.click(within(screen.getByRole('group', { name: 'Outline style' })).getByRole('button', { name: 'Dotted' }));
    expect(style(store)).toEqual({ outlineColor: '#0072b2', outlineDash: 'dotted' });
    expect(screen.getByRole('button', { name: 'Outline color: Blue' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('makes each discrete change one undo step and a slider drag a single step', () => {
    withFlag('mesoscaleAreaStyling', true);
    const store = open();
    fireEvent.click(screen.getByRole('button', { name: 'Outline color: Blue' }));
    for (const value of ['3', '3.5', '4', '5']) fireEvent.change(screen.getByRole('slider', { name: 'Outline width' }), { target: { value } });
    expect(style(store)).toEqual({ outlineColor: '#0072b2', outlineWidth: 5 });
    fireEvent.click(screen.getByText('undo'));
    expect(style(store)).toEqual({ outlineColor: '#0072b2' });
    fireEvent.click(screen.getByText('undo'));
    expect(style(store)).toBeUndefined();
  });

  it('resets to the hazard default as one undoable step', () => {
    withFlag('mesoscaleAreaStyling', true);
    const store = open();
    fireEvent.click(within(screen.getByRole('group', { name: 'Fill' })).getByRole('button', { name: 'None' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset to hazard default' }));
    expect(style(store)).toBeUndefined();
    expect('style' in selectMesoscaleState(store.getState()).areas[0]).toBe(false);
    fireEvent.click(screen.getByText('undo'));
    expect(style(store)).toEqual({ fillPattern: 'none' });
  });

  it('hides fill color and strength when there is no fill', () => {
    withFlag('mesoscaleAreaStyling', true);
    open();
    expect(screen.getByRole('group', { name: 'Fill color' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('group', { name: 'Fill' })).getByRole('button', { name: 'None' }));
    expect(screen.queryByRole('group', { name: 'Fill color' })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Fill strength' })).toBeNull();
  });

  it('copies another area look as it appears, including a hazard default', () => {
    withFlag('mesoscaleAreaStyling', true);
    const { store, wrapper } = setup();
    const { result } = renderHook(() => useMesoscaleAreas(), { wrapper });
    act(() => result.current.addPolygon(polygon));
    act(() => result.current.addPolygon(polygon));
    const [first, second] = result.current.areas;
    act(() => result.current.setAreaStyle(first.id, { outlineColor: '#d55e00', outlineWidth: 6 }));
    const Panel = () => <AreasPanel areas={{ ...result.current, selectedId: second.id }} />;
    render(<Panel />, { wrapper });
    fireEvent.click(screen.getByText('Appearance'));
    fireEvent.change(screen.getByLabelText('Copy look from'), { target: { value: first.id } });
    expect(selectMesoscaleState(store.getState()).areas.find(a => a.id === second.id)?.style)
      .toMatchObject({ outlineColor: '#d55e00', outlineWidth: 6, fillPattern: 'hatch' });
  });
});

describe('legend', () => {
  it('lists each hazard once while the flag is off, whatever the styles', () => {
    withFlag('mesoscaleAreaStyling', false);
    render(<AreaLegend areas={[area('1', 'Wind', { outlineColor: '#111827' }), area('2', 'Wind')]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('names the area when one hazard is drawn in different looks', () => {
    withFlag('mesoscaleAreaStyling', true);
    render(<AreaLegend areas={[area('1', 'Wind', { outlineColor: '#111827' }), area('2', 'Wind'), area('3', 'Hail')]} />);
    expect(screen.getByText('Wind · Area 1')).toBeInTheDocument();
    expect(screen.getByText('Wind · Area 2')).toBeInTheDocument();
    expect(screen.getByText('Hail')).toBeInTheDocument();
  });

  it('merges areas with the same hazard and look into one entry', () => {
    withFlag('mesoscaleAreaStyling', true);
    render(<AreaLegend areas={[area('1', 'Wind', { outlineColor: '#111827' }), area('2', 'Wind', { outlineColor: '#111827' })]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Wind')).toBeInTheDocument();
  });
});
