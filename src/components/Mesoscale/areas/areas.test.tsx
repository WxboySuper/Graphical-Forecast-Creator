import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import mesoscaleReducer, { createInitialMesoscaleState, replaceMesoscaleProduct, selectMesoscaleState } from '../../../store/mesoscaleSlice';
import { MAX_MESOSCALE_AREAS } from '../../../utils/mesoscaleValidationLimits';
import { isMesoscaleArea } from '../../../utils/mesoscaleAreaValidation';
import { createArea, isoToUtcInput, newAreaId, utcInputToIso, validateAreaFields } from './areaModel';
import { AreasPanel } from './AreasPanel';
import { DiscussionPanel } from './DiscussionPanel';
import { useMesoscaleAreas } from './useMesoscaleAreas';

const polygon = { type: 'Polygon' as const, coordinates: [[[-100, 35], [-98, 35], [-98, 37], [-100, 35]]] };

const makeStore = () => configureStore({ reducer: { mesoscale: mesoscaleReducer } });

const setup = () => {
  const store = makeStore();
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  return { store, wrapper };
};

describe('area model', () => {
  it('creates a valid area with a three hour window starting at the hour', () => {
    const area = createArea(polygon, { now: new Date('2026-11-09T14:42:10Z'), id: 'a1' });
    expect(isMesoscaleArea(area)).toBe(true);
    expect(area.validStart).toBe('2026-11-09T14:00:00.000Z');
    expect(area.validEnd).toBe('2026-11-09T17:00:00.000Z');
  });

  it('round-trips UTC datetime-local values', () => {
    expect(isoToUtcInput('2026-11-09T14:00:00.000Z')).toBe('2026-11-09T14:00');
    expect(utcInputToIso('2026-11-09T14:00')).toBe('2026-11-09T14:00:00.000Z');
    expect(utcInputToIso('')).toBeNull();
  });

  it('flags missing text, a reversed window, and out-of-range confidence', () => {
    const area = { ...createArea(polygon, { now: new Date('2026-11-09T14:00:00Z'), id: 'a1' }), title: ' ', hazard: '', confidence: 120 };
    const reversed = { ...area, validEnd: '2026-11-09T10:00:00.000Z' };
    expect(Object.keys(validateAreaFields(reversed)).sort()).toEqual(['confidence', 'hazard', 'title', 'window']);
  });
});

describe('window validation', () => {
  it('reports an unparsable time as a window error', () => {
    const area = createArea(polygon, { id: 'a1' });
    expect(validateAreaFields({ ...area, validEnd: 'not a time' }).window).toBeDefined();
  });
});

describe('useMesoscaleAreas history', () => {
  it('merges typing into one undo step and keeps geometry edits separate', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useMesoscaleAreas(), { wrapper });
    act(() => result.current.addPolygon(polygon));
    const id = result.current.areas[0].id;
    for (const title of ['D', 'Dr', 'Dry']) act(() => result.current.updateArea(id, { title }));
    act(() => result.current.undo());
    expect(result.current.areas[0].title).toBe('Area 1');
  });

  it('drops the selection when undo removes the selected area', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useMesoscaleAreas(), { wrapper });
    act(() => result.current.addPolygon(polygon));
    expect(result.current.selectedId).not.toBeNull();
    act(() => result.current.undo());
    expect(result.current.selectedId).toBeNull();
  });
});

describe('history and external replacement', () => {
  it('clears undo steps when the product is replaced from outside', () => {
    const { store, wrapper } = setup();
    const { result } = renderHook(() => useMesoscaleAreas(), { wrapper });
    act(() => result.current.addPolygon(polygon));
    expect(result.current.canUndo).toBe(true);
    act(() => { store.dispatch(replaceMesoscaleProduct(createInitialMesoscaleState())); });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.areas).toHaveLength(0);
  });
});

describe('newAreaId', () => {
  it('falls back when WebCrypto is unavailable', () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(newAreaId()).toMatch(/\w+-\w+/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });
});

describe('useMesoscaleAreas', () => {
  it('numbers new areas without repeating a title', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useMesoscaleAreas(), { wrapper });
    act(() => result.current.addPolygon(polygon));
    act(() => result.current.addPolygon(polygon));
    act(() => result.current.removeArea(result.current.areas[0].id));
    act(() => result.current.addPolygon(polygon));
    expect(result.current.areas.map(area => area.title)).toEqual(['Area 2', 'Area 3']);
  });

  it('adds, edits, undoes, and redoes areas through the store', () => {
    const { store, wrapper } = setup();
    const { result } = renderHook(() => useMesoscaleAreas(), { wrapper });
    act(() => result.current.addPolygon(polygon));
    expect(selectMesoscaleState(store.getState()).areas).toHaveLength(1);
    expect(result.current.selectedId).toBe(result.current.areas[0].id);
    const id = result.current.areas[0].id;
    act(() => result.current.updateArea(id, { title: 'Dryline' }));
    expect(result.current.areas[0].title).toBe('Dryline');
    act(() => result.current.undo());
    expect(result.current.areas[0].title).toBe('Area 1');
    act(() => result.current.redo());
    expect(result.current.areas[0].title).toBe('Dryline');
    act(() => result.current.removeArea(id));
    expect(result.current.areas).toHaveLength(0);
    expect(result.current.selectedId).toBeNull();
  });

  it('stops adding at the area limit', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useMesoscaleAreas(), { wrapper });
    for (let i = 0; i < MAX_MESOSCALE_AREAS + 2; i += 1) act(() => result.current.addPolygon(polygon));
    expect(result.current.areas).toHaveLength(MAX_MESOSCALE_AREAS);
    expect(result.current.atLimit).toBe(true);
  });
});

describe('AreasPanel', () => {
  const Harness = () => {
    const areas = useMesoscaleAreas();
    return (
      <>
        <button type="button" onClick={() => areas.addPolygon(polygon)}>add</button>
        <AreasPanel areas={areas} />
      </>
    );
  };

  it('shows an empty state, then lists and edits an area', () => {
    const { wrapper } = setup();
    render(<Harness />, { wrapper });
    expect(screen.getByText(/No areas yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('add'));
    expect(screen.getByText('Areas (1/20)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Warm sector' } });
    expect(screen.getByRole('button', { name: /Warm sector/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Give the area a title.');
  });

  it('keeps confidence optional and clears it when emptied', () => {
    const { store, wrapper } = setup();
    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByText('add'));
    const input = screen.getByLabelText(/Confidence/);
    fireEvent.change(input, { target: { value: '60' } });
    expect(selectMesoscaleState(store.getState()).areas[0].confidence).toBe(60);
    fireEvent.change(input, { target: { value: '' } });
    expect(selectMesoscaleState(store.getState()).areas[0].confidence).toBeUndefined();
  });

  it('deletes the selected area', () => {
    const { store, wrapper } = setup();
    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByText('add'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete area' }));
    expect(selectMesoscaleState(store.getState()).areas).toHaveLength(0);
  });
});

describe('DiscussionPanel', () => {
  it('saves the discussion to the product', () => {
    const { store, wrapper } = setup();
    render(<DiscussionPanel />, { wrapper });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Dryline mixes east this afternoon.' } });
    expect(selectMesoscaleState(store.getState()).discussion).toBe('Dryline mixes east this afternoon.');
    expect(screen.getByText(/34 \/ 50,000/)).toBeInTheDocument();
  });
});
