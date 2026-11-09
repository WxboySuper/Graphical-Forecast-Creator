import { fireEvent, render, screen } from '@testing-library/react';
import type { Polygon } from 'geojson';
import { isMesoscalePolygon } from '../../../utils/mesoscaleGeometryValidation';
import { VertexEditor } from './VertexEditor';
import { MIN_VERTICES, addVertexAfter, formatVertex, moveVertex, nextIndex, removeVertex, vertexAt, vertexCount } from './vertexEdit';

const square: Polygon = { type: 'Polygon', coordinates: [[[-100, 35], [-98, 35], [-98, 37], [-100, 37], [-100, 35]]] };

describe('vertex operations', () => {
  it('counts vertices without the closing repeat and formats them', () => {
    expect(vertexCount(square)).toBe(4);
    expect(vertexAt(square, 2)).toEqual([-98, 37]);
    expect(vertexAt(square, 9)).toBeNull();
    expect(formatVertex([-98.4, 35.123])).toBe('35.12°N 98.40°W');
    expect(formatVertex([10.5, -3])).toBe('3.00°S 10.50°E');
  });

  it('moves a vertex and keeps the ring closed, including the first vertex', () => {
    const moved = moveVertex(square, 0, { lon: 1, lat: 0.5 }) as Polygon;
    expect(isMesoscalePolygon(moved)).toBe(true);
    expect(moved.coordinates[0][0]).toEqual([-99, 35.5]);
    expect(moved.coordinates[0][4]).toEqual([-99, 35.5]);
    expect(moved.coordinates[0][1]).toEqual([-98, 35]);
    expect(moveVertex(square, 9, { lon: 1, lat: 1 })).toBeNull();
  });

  it('keeps vertices on the globe', () => {
    const north = { type: 'Polygon', coordinates: [[[0, 89.9], [1, 89.9], [1, 80], [0, 89.9]]] } as Polygon;
    expect((moveVertex(north, 0, { lon: 0, lat: 5 }) as Polygon).coordinates[0][0][1]).toBe(90);
  });

  it('adds a vertex halfway to the next one and wraps from the last vertex', () => {
    const added = addVertexAfter(square, 0) as Polygon;
    expect(vertexCount(added)).toBe(5);
    expect(added.coordinates[0][1]).toEqual([-99, 35]);
    const wrapped = addVertexAfter(square, 3) as Polygon;
    expect(wrapped.coordinates[0][4]).toEqual([-100, 36]);
    expect(addVertexAfter(square, 9)).toBeNull();
  });

  it('removes a vertex but never below three', () => {
    expect(vertexCount(removeVertex(square, 1) as Polygon)).toBe(3);
    const triangle = removeVertex(square, 1) as Polygon;
    expect(vertexCount(triangle)).toBe(MIN_VERTICES);
    expect(removeVertex(triangle, 0)).toBeNull();
    expect(removeVertex(square, 9)).toBeNull();
  });

  it('treats a polygon with no outer ring as having no vertices instead of throwing', () => {
    const broken = { type: 'Polygon', coordinates: [] } as unknown as Polygon;
    expect(vertexCount(broken)).toBe(0);
    expect(moveVertex(broken, 0, { lon: 1, lat: 1 })).toBeNull();
    expect(removeVertex(broken, 0)).toBeNull();
    expect(addVertexAfter(broken, 0)).toBeNull();
  });

  it('wraps the active index in both directions', () => {
    expect(nextIndex(3, 4, 1)).toBe(0);
    expect(nextIndex(0, 4, -1)).toBe(3);
  });
});

describe('VertexEditor', () => {
  const setup = (geometry: Polygon = square) => {
    const onChange = jest.fn();
    const onActiveVertex = jest.fn();
    render(<VertexEditor areaId="a1" geometry={geometry} onChange={onChange} onActiveVertex={onActiveVertex} />);
    return { onChange, onActiveVertex };
  };

  it('announces the active vertex and steps through them', () => {
    const { onActiveVertex } = setup();
    expect(screen.getByText(/Vertex 1 of 4: 35.00°N 100.00°W/)).toBeInTheDocument();
    expect(onActiveVertex).toHaveBeenLastCalledWith(0);
    fireEvent.click(screen.getByRole('button', { name: 'Next vertex' }));
    expect(screen.getByText(/Vertex 2 of 4: 35.00°N 98.00°W/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous vertex' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous vertex' }));
    expect(screen.getByText(/Vertex 4 of 4/)).toBeInTheDocument();
  });

  it('nudges with the arrow keys on the pad using the chosen step, merging them into one undo step', () => {
    const { onChange } = setup();
    const pad = screen.getByRole('group', { name: /nudge pad/i });
    fireEvent.keyDown(pad, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'Polygon' }), true);
    expect((onChange.mock.calls[0][0] as Polygon).coordinates[0][0]).toEqual([-100, 35.5]);
    fireEvent.change(screen.getByLabelText('Nudge step'), { target: { value: '2' } });
    fireEvent.keyDown(pad, { key: 'ArrowRight' });
    expect((onChange.mock.calls[1][0] as Polygon).coordinates[0][0]).toEqual([-98, 35]);
    fireEvent.keyDown(pad, { key: 'a' });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('moves with the direction buttons', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Move vertex south' }));
    expect((onChange.mock.calls[0][0] as Polygon).coordinates[0][0]).toEqual([-100, 34.5]);
  });

  it('adds and deletes vertices as their own undo steps and disables delete at three', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Add vertex after/ }));
    expect(onChange).toHaveBeenLastCalledWith(expect.anything(), false);
    expect(vertexCount(onChange.mock.calls[0][0] as Polygon)).toBe(5);
  });

  it('cannot delete from a triangle', () => {
    setup({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] });
    expect(screen.getByRole('button', { name: /Delete vertex/ })).toBeDisabled();
  });

  it('clears the map highlight when it goes away', () => {
    const onActiveVertex = jest.fn();
    const { unmount } = render(<VertexEditor areaId="a1" geometry={square} onChange={jest.fn()} onActiveVertex={onActiveVertex} />);
    unmount();
    expect(onActiveVertex).toHaveBeenLastCalledWith(null);
  });
});
