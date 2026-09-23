import type LayerGroup from 'ol/layer/Group';
import type TileLayer from 'ol/layer/Tile';
import type OSM from 'ol/source/OSM';
import type XYZ from 'ol/source/XYZ';
import type { OpenFreeMapStyleSet } from '../../lib/openFreeMap';
import type { BaseMapStyle } from '../../store/overlaysSlice';
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
}));

jest.mock('./openLayersMapStyles', () => ({
  createLabelOverlaySource: jest.fn(),
  createTileSource: jest.fn(),
  isCurrentOpenFreeMapRequest: jest.requireActual('./openLayersMapStyles').isCurrentOpenFreeMapRequest,
  loadOpenFreeMapLayerGroups: jest.fn(),
  replaceLayerGroupLayers: jest.fn(),
}));

type GroupStub = {
  setVisible: jest.Mock;
  getLayers: jest.Mock;
};

type TileStub = {
  setSource: jest.Mock;
  setVisible: jest.Mock;
};

const makeGroup = (): GroupStub => ({
  setVisible: jest.fn(),
  getLayers: jest.fn(() => ({ clear: jest.fn() })),
});

const makeTile = (): TileStub => ({
  setSource: jest.fn(),
  setVisible: jest.fn(),
});

const style = 'osm' as Exclude<BaseMapStyle, 'blank'>;

const options = ({
  requestRef,
  requestId,
  tile = makeTile(),
  labels = makeTile(),
  vectorBaseGroup = makeGroup(),
  vectorReferenceGroup = makeGroup(),
}: {
  requestRef: { current: number };
  requestId: number;
  tile?: TileStub;
  labels?: TileStub;
  vectorBaseGroup?: GroupStub;
  vectorReferenceGroup?: GroupStub;
}) => ({
  style,
  tile: tile as unknown as TileLayer<OSM | XYZ>,
  labels: labels as unknown as TileLayer<OSM | XYZ>,
  vectorBaseGroup: vectorBaseGroup as unknown as LayerGroup,
  vectorReferenceGroup: vectorReferenceGroup as unknown as LayerGroup,
  requestRef,
  requestId,
  logPrefix: 'test-map',
});

const flushPromises = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

describe('loadOpenFreeMapBasemap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('replaces both vector groups after a successful load', async () => {
    const baseGroup = makeGroup();
    const referenceGroup = makeGroup();
    jest.mocked(getOpenFreeMapStyleSet).mockResolvedValue({} as OpenFreeMapStyleSet);
    jest.mocked(loadOpenFreeMapLayerGroups).mockResolvedValue({
      baseGroup: baseGroup as unknown as LayerGroup,
      referenceGroup: referenceGroup as unknown as LayerGroup,
    });
    const vectorBaseGroup = makeGroup();
    const vectorReferenceGroup = makeGroup();

    loadOpenFreeMapBasemap(options({
      requestRef: { current: 1 },
      requestId: 1,
      vectorBaseGroup,
      vectorReferenceGroup,
    }));
    await flushPromises();

    expect(replaceLayerGroupLayers).toHaveBeenCalledWith(vectorBaseGroup, baseGroup);
    expect(replaceLayerGroupLayers).toHaveBeenCalledWith(vectorReferenceGroup, referenceGroup);
    expect(vectorBaseGroup.setVisible).toHaveBeenCalledWith(true);
    expect(vectorReferenceGroup.setVisible).toHaveBeenCalledWith(true);
  });

  test('ignores a vector load after a newer basemap request', async () => {
    let resolveStyle!: (value: OpenFreeMapStyleSet) => void;
    jest.mocked(getOpenFreeMapStyleSet).mockReturnValue(
      new Promise((resolve) => {
        resolveStyle = resolve;
      })
    );
    jest.mocked(loadOpenFreeMapLayerGroups).mockResolvedValue({
      baseGroup: makeGroup() as unknown as LayerGroup,
      referenceGroup: makeGroup() as unknown as LayerGroup,
    });
    const requestRef = { current: 1 };

    loadOpenFreeMapBasemap(options({ requestRef, requestId: 1 }));
    requestRef.current += 1;
    resolveStyle({} as OpenFreeMapStyleSet);
    await flushPromises();

    expect(replaceLayerGroupLayers).not.toHaveBeenCalled();
  });

  test('uses raster tiles and labels when vector loading fails', async () => {
    const tile = makeTile();
    const labels = makeTile();
    const tileSource = {};
    const labelSource = {};
    jest.mocked(getOpenFreeMapStyleSet).mockResolvedValue({} as OpenFreeMapStyleSet);
    jest.mocked(loadOpenFreeMapLayerGroups).mockRejectedValue(new Error('load failed'));
    jest.mocked(createTileSource).mockReturnValue(
      tileSource as unknown as ReturnType<typeof createTileSource>
    );
    jest.mocked(createLabelOverlaySource).mockReturnValue(
      labelSource as unknown as ReturnType<typeof createLabelOverlaySource>
    );

    loadOpenFreeMapBasemap(options({ requestRef: { current: 1 }, requestId: 1, tile, labels }));
    await flushPromises();

    expect(createTileSource).toHaveBeenCalledWith(style);
    expect(tile.setSource).toHaveBeenCalledWith(tileSource);
    expect(tile.setVisible).toHaveBeenCalledWith(true);
    expect(labels.setSource).toHaveBeenCalledWith(labelSource);
    expect(labels.setVisible).toHaveBeenCalledWith(true);
  });
});
