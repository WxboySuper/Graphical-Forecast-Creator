import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import VectorSource from "ol/source/Vector";
import type {
  Feature as GeoJsonFeature,
  MultiPolygon,
  Polygon,
} from "geojson";
import {
  syncTrimPreviewSource,
  syncTstmPreviewSource,
} from "./openLayersForecastPreviews";

const makePolygon = (
  id: string,
  offset: number,
): GeoJsonFeature<Polygon> => ({
  type: "Feature",
  id,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [offset, offset],
        [offset + 1, offset],
        [offset + 1, offset + 1],
        [offset, offset + 1],
        [offset, offset],
      ],
    ],
  },
  properties: {},
});

const makeMultiPolygon = (id: string): GeoJsonFeature<MultiPolygon> => ({
  type: "Feature",
  id,
  geometry: {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
      [
        [
          [5, 5],
          [6, 5],
          [6, 6],
          [5, 6],
          [5, 5],
        ],
      ],
    ],
  },
  properties: {},
});

const seedSource = (source: VectorSource): Feature => {
  const stale = new Feature({ geometry: new Point([0, 0]) });
  source.addFeature(stale);
  return stale;
};

const createSource = (): VectorSource => new VectorSource();

const createSeededSource = (): VectorSource => {
  const source = createSource();
  seedSource(source);
  return source;
};

const makePair = (
  firstId = "a",
  secondId = "b",
): Array<GeoJsonFeature<Polygon>> => [
  makePolygon(firstId, 0),
  makePolygon(secondId, 5),
];

const expectTrimPart = (feature: Feature): void => {
  expect(feature.get("trimPreview")).toBe(true);
  expect(feature.getStyle()).toBeTruthy();
};

const expectTstmPart = (feature: Feature, featureId: string): void => {
  expect(feature.get("featureId")).toBe(featureId);
  expect(feature.get("outlookType")).toBe("categorical");
  expect(feature.get("probability")).toBe("TSTM");
  expect(feature.getStyle()).toBeTruthy();
};

type SyncFn = (source: VectorSource, features: GeoJsonFeature[]) => void;

type SharedSuite = {
  label: string;
  sync: SyncFn;
  assertReplaced: (features: Feature[]) => void;
};

const sharedSuites: SharedSuite[] = [
  {
    label: "syncTrimPreviewSource",
    sync: syncTrimPreviewSource,
    assertReplaced: (features) =>
      expect(features[0]?.get("trimPreview")).toBe(true),
  },
  {
    label: "syncTstmPreviewSource",
    sync: syncTstmPreviewSource,
    assertReplaced: (features) =>
      expect(features[0]?.get("featureId")).toBe("new"),
  },
];

describe.each(sharedSuites)("$label shared sync behavior", ({
  sync,
  assertReplaced,
}) => {
  test("clears the source when given empty input", () => {
    const source = createSeededSource();

    sync(source, []);

    expect(source.getFeatures()).toEqual([]);
  });

  test("replaces previous contents instead of appending", () => {
    const source = createSource();
    sync(source, [makePolygon("old", 0)]);
    const firstRound = source.getFeatures();

    sync(source, [makePolygon("new", 10)]);

    const secondRound = source.getFeatures();
    expect(secondRound).toHaveLength(1);
    expect(secondRound[0]).not.toBe(firstRound[0]);
    assertReplaced(secondRound);
  });
});

describe("syncTrimPreviewSource", () => {
  test("adds a single polygon with trim style and metadata", () => {
    const source = createSource();

    syncTrimPreviewSource(source, [makePolygon("trim-1", 10)]);

    const features = source.getFeatures();
    expect(features).toHaveLength(1);
    expectTrimPart(features[0] as Feature);
    expect(features[0]?.getGeometry()?.getExtent()).toHaveLength(4);
  });

  test("adds one source feature per input feature", () => {
    const source = createSource();

    syncTrimPreviewSource(source, makePair());

    expect(source.getFeatures()).toHaveLength(2);
    for (const feature of source.getFeatures()) {
      expect(feature.get("trimPreview")).toBe(true);
    }
  });

  test("keeps a MultiPolygon as one feature with MultiPolygon geometry", () => {
    const source = createSource();

    syncTrimPreviewSource(source, [makeMultiPolygon("trim-multi")]);

    const features = source.getFeatures();
    expect(features).toHaveLength(1);
    expectTrimPart(features[0] as Feature);
    expect(features[0]?.getGeometry()?.getType()).toBe("MultiPolygon");
  });

  test("shares the trim style across features in one sync", () => {
    // Sharing is deliberate. The style is never mutated, so one instance
    // covers every trim preview feature without extra allocation.
    const source = createSource();

    syncTrimPreviewSource(source, makePair());

    const [first, second] = source.getFeatures();
    expect(first?.getStyle()).toBeTruthy();
    expect(first?.getStyle()).toBe(second?.getStyle());
  });
});

describe("syncTstmPreviewSource", () => {
  test("adds a single polygon with TSTM style and metadata", () => {
    const source = createSource();

    syncTstmPreviewSource(source, [makePolygon("tstm-7", 0)]);

    const features = source.getFeatures();
    expect(features).toHaveLength(1);
    expectTstmPart(features[0] as Feature, "tstm-7");
  });

  test("falls back to tstm-preview when the input has no id", () => {
    const source = createSource();
    const withoutId: GeoJsonFeature<Polygon> = {
      ...makePolygon("ignored", 0),
      id: undefined,
    };

    syncTstmPreviewSource(source, [withoutId]);

    expect(source.getFeatures()).toHaveLength(1);
    expect(source.getFeatures()[0]?.get("featureId")).toBe("tstm-preview");
  });

  test("keeps a MultiPolygon as one feature with MultiPolygon geometry", () => {
    const source = createSource();

    syncTstmPreviewSource(source, [makeMultiPolygon("tstm-multi")]);

    const features = source.getFeatures();
    expect(features).toHaveLength(1);
    expectTstmPart(features[0] as Feature, "tstm-multi");
    expect(features[0]?.getGeometry()?.getType()).toBe("MultiPolygon");
  });

  test("keeps each input featureId alongside shared TSTM metadata", () => {
    const source = createSource();

    syncTstmPreviewSource(source, makePair("one", "two"));

    const features = source.getFeatures();
    expect(features).toHaveLength(2);
    expect(features.map((feature) => feature.get("featureId")).sort()).toEqual([
      "one",
      "two",
    ]);
    for (const feature of features) {
      expect(feature.get("outlookType")).toBe("categorical");
      expect(feature.get("probability")).toBe("TSTM");
    }
    expect(features[0]?.getStyle()).toBe(features[1]?.getStyle());
  });
});
