/**
 * Caller-level regression coverage for the verification map basemap effect.
 * A pending OpenFreeMap vector load must not overwrite a newer blank or
 * raster selection. The effect invalidates on every style change by bumping
 * vectorStyleRequestRef before branching, then passes that id to the helper.
 */
import * as fs from 'fs';
import * as path from 'path';
import type LayerGroup from 'ol/layer/Group';
import type TileLayer from 'ol/layer/Tile';
import type OSM from 'ol/source/OSM';
import type XYZ from 'ol/source/XYZ';
import type { OpenFreeMapStyleSet } from '../../lib/openFreeMap';
import { getOpenFreeMapStyleSet } from '../../lib/openFreeMap';
import {
  createLabelOverlaySource,
  createTileSource,
  loadOpenFreeMapLayerGroups,
  replaceLayerGroupLayers,
} from './openLayersMapStyles';
import { loadOpenFreeMapBasemap } from './openLayersBasemap';

jest.mock('../../lib/openFreeMap', () => ({
  getOpenFreeMapStyleSet: jest.fn(),
  isOpenFreeMapStyle: jest.requireActual('../../lib/openFreeMap').isOpenFreeMapStyle,
}));

jest.mock('./openLayersMapStyles', () => ({
  createLabelOverlaySource: jest.fn(),
  createTileSource: jest.fn(),
  isCurrentOpenFreeMapRequest: jest.requireActual('./openLayersMapStyles').isCurrentOpenFreeMapRequest,
  loadOpenFreeMapLayerGroups: jest.fn(),
  replaceLayerGroupLayers: jest.fn(),
}));

type LayerStub = {
  setVisible: jest.Mock;
  setSource?: jest.Mock;
  getLayers: jest.Mock;
};

const makeLayer = (): LayerStub => ({
  setVisible: jest.fn(),
  setSource: jest.fn(),
  getLayers: jest.fn(() => ({ clear: jest.fn() })),
});

const flushPromises = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

/** Mirrors hideVectorBasemapGroups in OpenLayersVerificationMap. */
const hideVectorBasemapGroups = (base: LayerStub, reference: LayerStub) => {
  base.setVisible(false);
  reference.setVisible(false);
  base.getLayers().clear();
  reference.getLayers().clear();
};

/** Mirrors the blank branch in OpenLayersVerificationMap. */
const applyBlankBranch = (layers: {
  tile: LayerStub;
  vectorBaseGroup: LayerStub;
  vectorReferenceGroup: LayerStub;
  land: LayerStub;
  landOutline: LayerStub;
  labels: LayerStub;
  el: { style: { backgroundColor: string } };
}) => {
  hideVectorBasemapGroups(layers.vectorBaseGroup, layers.vectorReferenceGroup);
  layers.tile.setVisible(false);
  layers.land.setVisible(true);
  layers.landOutline.setVisible(true);
  layers.labels.setVisible(false);
  layers.el.style.backgroundColor = '#b8d4e8';
};

describe('verification map basemap effect invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('hoists request invalidation above the blank and raster branches', () => {
    const source = fs.readFileSync(
      path.join(__dirname, 'OpenLayersVerificationMap.tsx'),
      'utf8',
    );
    const effect = source.slice(source.indexOf('Swap base tile source'));
    const invalidateAt = effect.indexOf('vectorStyleRequestRef.current + 1');
    const blankAt = effect.indexOf('baseMapStyle === "blank"');
    const vectorAt = effect.indexOf('isOpenFreeMapStyle(baseMapStyle)');
    expect(invalidateAt).toBeGreaterThanOrEqual(0);
    expect(blankAt).toBeGreaterThanOrEqual(0);
    expect(vectorAt).toBeGreaterThanOrEqual(0);
    expect(invalidateAt).toBeLessThan(blankAt);
    expect(invalidateAt).toBeLessThan(vectorAt);
  });

  test('stale vector success cannot reveal vector groups or alter blank layers', async () => {
    let resolveStyle!: (value: OpenFreeMapStyleSet) => void;
    jest.mocked(getOpenFreeMapStyleSet).mockReturnValue(
      new Promise((resolve) => {
        resolveStyle = resolve;
      }),
    );
    jest.mocked(loadOpenFreeMapLayerGroups).mockResolvedValue({
      baseGroup: makeLayer() as unknown as LayerGroup,
      referenceGroup: makeLayer() as unknown as LayerGroup,
    });

    const requestRef = { current: 0 };
    const tile = makeLayer();
    const vectorBaseGroup = makeLayer();
    const vectorReferenceGroup = makeLayer();
    const land = makeLayer();
    const landOutline = makeLayer();
    const labels = makeLayer();
    const el = { style: { backgroundColor: '' } };

    // Vector selection: every style change bumps the id first.
    requestRef.current += 1;
    const vectorRequestId = requestRef.current;
    loadOpenFreeMapBasemap({
      style: 'osm',
      tile: tile as unknown as TileLayer<OSM | XYZ>,
      labels: labels as unknown as TileLayer<OSM | XYZ>,
      vectorBaseGroup: vectorBaseGroup as unknown as LayerGroup,
      vectorReferenceGroup: vectorReferenceGroup as unknown as LayerGroup,
      requestRef,
      requestId: vectorRequestId,
      logPrefix: 'verification-map',
    });

    // Switch to blank while the vector load is pending. The fixed effect
    // bumps the id here too, invalidating the in-flight vector request.
    requestRef.current += 1;
    applyBlankBranch({
      tile,
      vectorBaseGroup,
      vectorReferenceGroup,
      land,
      landOutline,
      labels,
      el,
    });
    const tileVisibleCalls = tile.setVisible.mock.calls.length;
    const landVisibleCalls = land.setVisible.mock.calls.length;

    resolveStyle({} as OpenFreeMapStyleSet);
    await flushPromises();

    expect(replaceLayerGroupLayers).not.toHaveBeenCalled();
    expect(vectorBaseGroup.setVisible).not.toHaveBeenCalledWith(true);
    expect(vectorReferenceGroup.setVisible).not.toHaveBeenCalledWith(true);
    expect(tile.setVisible).toHaveBeenCalledTimes(tileVisibleCalls);
    expect(tile.setVisible).toHaveBeenLastCalledWith(false);
    expect(land.setVisible).toHaveBeenCalledTimes(landVisibleCalls);
    expect(land.setVisible).toHaveBeenLastCalledWith(true);
    expect(landOutline.setVisible).toHaveBeenLastCalledWith(true);
    expect(labels.setVisible).toHaveBeenLastCalledWith(false);
    expect(el.style.backgroundColor).toBe('#b8d4e8');
  });

  test('stale vector success cannot reveal vector groups or alter raster layers', async () => {
    let resolveStyle!: (value: OpenFreeMapStyleSet) => void;
    jest.mocked(getOpenFreeMapStyleSet).mockReturnValue(
      new Promise((resolve) => {
        resolveStyle = resolve;
      }),
    );
    jest.mocked(loadOpenFreeMapLayerGroups).mockResolvedValue({
      baseGroup: makeLayer() as unknown as LayerGroup,
      referenceGroup: makeLayer() as unknown as LayerGroup,
    });
    const rasterSource = {};
    const rasterLabelSource = {};
    jest.mocked(createTileSource).mockReturnValue(
      rasterSource as unknown as ReturnType<typeof createTileSource>,
    );
    jest.mocked(createLabelOverlaySource).mockReturnValue(
      rasterLabelSource as unknown as ReturnType<typeof createLabelOverlaySource>,
    );

    const requestRef = { current: 0 };
    const tile = makeLayer();
    const vectorBaseGroup = makeLayer();
    const vectorReferenceGroup = makeLayer();
    const land = makeLayer();
    const landOutline = makeLayer();
    const labels = makeLayer();

    requestRef.current += 1;
    const vectorRequestId = requestRef.current;
    loadOpenFreeMapBasemap({
      style: 'osm',
      tile: tile as unknown as TileLayer<OSM | XYZ>,
      labels: labels as unknown as TileLayer<OSM | XYZ>,
      vectorBaseGroup: vectorBaseGroup as unknown as LayerGroup,
      vectorReferenceGroup: vectorReferenceGroup as unknown as LayerGroup,
      requestRef,
      requestId: vectorRequestId,
      logPrefix: 'verification-map',
    });

    // Switch to raster while the vector load is pending. The fixed effect
    // bumps the id here too, then applies the raster setup exactly once.
    requestRef.current += 1;
    hideVectorBasemapGroups(vectorBaseGroup, vectorReferenceGroup);
    tile.setVisible(true);
    land.setVisible(false);
    landOutline.setVisible(true);
    tile.setSource!(rasterSource as never);
    labels.setSource!(rasterLabelSource as never);
    labels.setVisible(true);
    const tileSourceCalls = tile.setSource!.mock.calls.length;
    const tileVisibleCalls = tile.setVisible.mock.calls.length;

    resolveStyle({} as OpenFreeMapStyleSet);
    await flushPromises();

    expect(replaceLayerGroupLayers).not.toHaveBeenCalled();
    expect(vectorBaseGroup.setVisible).not.toHaveBeenCalledWith(true);
    expect(vectorReferenceGroup.setVisible).not.toHaveBeenCalledWith(true);
    expect(tile.setSource!).toHaveBeenCalledTimes(tileSourceCalls);
    expect(tile.setSource!).toHaveBeenLastCalledWith(rasterSource);
    expect(tile.setVisible).toHaveBeenCalledTimes(tileVisibleCalls);
    expect(tile.setVisible).toHaveBeenLastCalledWith(true);
    expect(land.setVisible).toHaveBeenLastCalledWith(false);
    expect(labels.setVisible).toHaveBeenLastCalledWith(true);
  });
});
