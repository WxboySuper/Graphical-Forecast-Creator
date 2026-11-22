import reducer, { addMesoscaleArea, removeMesoscaleArea, setMesoscaleDiscussion, setMesoscaleModelContext } from './mesoscaleSlice';

const area = {
  id: 'area-1', title: 'Storm corridor', hazard: 'Heavy rain', validStart: '2026-10-01T12:00:00Z',
  validEnd: '2026-10-01T18:00:00Z', createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z',
  geometry: { type: 'Polygon' as const, coordinates: [[[-97, 35], [-96, 35], [-96, 36], [-97, 35]]] },
};

describe('mesoscale slice', () => {
  test('applies timestamped area and context actions deterministically', () => {
    const initial = reducer(undefined, { type: 'init' });
    const next = reducer(initial, addMesoscaleArea(area));
    expect(initial.areas).toHaveLength(0);
    expect(next.areas).toEqual([area]);
    expect(reducer(next, setMesoscaleDiscussion('Localized heavy rain is possible.')).discussion)
      .toBe('Localized heavy rain is possible.');
    expect(reducer(next, setMesoscaleModelContext({ modelId: 'hrrr', cycle: '2026-10-01T12:00:00Z', forecastHour: 3, activeLayers: [{ id: 'reflectivity', opacity: 0.7 }] })).modelContext.modelId)
      .toBe('hrrr');
    expect(reducer(next, removeMesoscaleArea('area-1')).areas).toEqual([]);
  });
});
