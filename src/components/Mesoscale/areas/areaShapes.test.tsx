import { fireEvent, render, screen } from '@testing-library/react';
import { Polygon as OlPolygon } from 'ol/geom';
import type { Polygon } from 'geojson';
import { isMesoscalePolygon } from '../../../utils/mesoscaleGeometryValidation';
import { AreaLegend } from './AreaLegend';
import { HAZARD_SUGGESTIONS, createArea, geometryToPolygon, hazardHue } from './areaModel';
import { rotatePolygon, scalePolygon, shapeGeometryFunction, isDegenerate, isShapeTool } from './areaShapes';
import { windowLabel } from './areaStyle';
import { ShapeControls } from './ShapeControls';

const box: Polygon = { type: 'Polygon', coordinates: [[[-100, 35], [-96, 35], [-96, 38], [-100, 38], [-100, 35]]] };
const bounds = (polygon: Polygon): number[] => {
  const xs = polygon.coordinates[0].map(([x]) => x);
  const ys = polygon.coordinates[0].map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

describe('shape tools', () => {
  it('builds ellipses, circles, and rectangles that store as valid polygons', () => {
    const corners = [[0, 0], [400000, 200000]];
    for (const tool of ['ellipse', 'rectangle'] as const) {
      const geometry = shapeGeometryFunction(tool)(corners, undefined, undefined as never);
      expect(isMesoscalePolygon(geometryToPolygon(geometry))).toBe(true);
    }
    const circle = shapeGeometryFunction('circle')([[0, 0], [150000, 0]], undefined, undefined as never);
    expect(circle).toBeInstanceOf(OlPolygon);
    expect(isMesoscalePolygon(geometryToPolygon(circle))).toBe(true);
  });

  it('tolerates an incomplete drag and flags zero-area shapes', () => {
    const ellipse = shapeGeometryFunction('ellipse')([[10, 10]], undefined, undefined as never);
    expect(isDegenerate(ellipse)).toBe(true);
    const real = shapeGeometryFunction('ellipse')([[0, 0], [100, 50]], undefined, undefined as never);
    expect(isDegenerate(real)).toBe(false);
  });

  it('knows which tools are shape tools', () => {
    expect(isShapeTool('circle')).toBe(true);
    expect(isShapeTool('draw')).toBe(false);
    expect(isShapeTool('select')).toBe(false);
  });
});

describe('rotate and scale', () => {
  it('rotates about the center and stays a valid polygon', () => {
    const rotated = rotatePolygon(box, 45);
    expect(rotated).not.toBeNull();
    expect(isMesoscalePolygon(rotated)).toBe(true);
    expect(bounds(rotated as Polygon)).not.toEqual(bounds(box));
  });

  it('scales about the center', () => {
    const larger = scalePolygon(box, 2) as Polygon;
    const [w, , e] = bounds(box);
    const [lw, , le] = bounds(larger);
    expect(le - lw).toBeCloseTo((e - w) * 2, 1);
  });

  it('refuses to scale beyond sane limits', () => {
    expect(scalePolygon(box, 100)).toBeNull();
    expect(scalePolygon(box, 0.001)).toBeNull();
  });
});

describe('ShapeControls', () => {
  it('reports the transformed geometry', () => {
    const onChange = jest.fn();
    render(<ShapeControls geometry={box} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Rotate 15° right/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Larger' }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(isMesoscalePolygon(onChange.mock.calls[0][0])).toBe(true);
  });
});

describe('hazard colors', () => {
  it('keeps the suggested hazards visually distinct and stable', () => {
    const hues = HAZARD_SUGGESTIONS.map(hazardHue);
    expect(new Set(hues).size).toBe(hues.length);
    expect(Number.isInteger(hazardHue('constructor'))).toBe(true);
    expect(hazardHue('Dust storm')).toBe(hazardHue('  dust STORM '));
  });
});

describe('area presentation', () => {
  it('labels the valid window in UTC hours', () => {
    expect(windowLabel('2026-11-09T13:00:00.000Z', '2026-11-09T16:00:00.000Z')).toBe('13Z to 16Z');
  });

  it('lists each hazard once and summarizes overflow', () => {
    const areas = ['A', 'B', 'C', 'D', 'E', 'F', 'F'].map((hazard, i) => ({ ...createArea(box, { id: `a${i}` }), hazard }));
    render(<AreaLegend areas={areas} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByText('+1 more')).toBeInTheDocument();
  });

  it('renders nothing without areas', () => {
    const { container } = render(<AreaLegend areas={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
