import GeoJSON from "ol/format/GeoJSON";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import VectorSource from "ol/source/Vector";
import type { Feature as GeoJsonFeature, Polygon } from "geojson";
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

const seedSource = (source: VectorSource): Feature => {
  const stale = new Feature({ geometry: new Point([0, 0]) });
  source.addFeature(stale);
  return stale;
};

describe("syncTrimPreviewSource", () => {
  test("clears the source when given empty input", () => {
    const source = new VectorSource();
    seedSource(source);

    syncTrimPreviewSource(source, []);

    expect(source.getFeatures()).toEqual([]);
  });

  test("adds a single polygon with trim style and metadata", () => {
    const source = new VectorSource();

    syncTrimPreviewSource(source, [makePolygon("trim-1", 10)]);

    const features = source.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0]?.get("trimPreview")).toBe(true);
    expect(features[0]?.getStyle()).toBeTruthy();
    expect(features[0]?.getGeometry()?.getExtent()).toHaveLength(4);
  });

  test("adds one source feature per input feature", () => {
    const source = new VectorSource();

    syncTrimPreviewSource(source, [makePolygon("a", 0), makePolygon("b", 5)]);

    expect(source.getFeatures()).toHaveLength(2);
    for (const feature of source.getFeatures()) {
      expect(feature.get("trimPreview")).toBe(true);
    }
  });

  test("replaces previous contents instead of appending", () => {
    const source = new VectorSource();
    syncTrimPreviewSource(source, [makePolygon("old", 0)]);
    const firstRound = source.getFeatures();

    syncTrimPreviewSource(source, [makePolygon("new", 10)]);

    const secondRound = source.getFeatures();
    expect(secondRound).toHaveLength(1);
    expect(secondRound[0]).not.toBe(firstRound[0]);
    expect(source.getFeatures()).toHaveLength(1);
  });

  test("shares the trim style across features in one sync", () => {
    const source = new VectorSource();

    syncTrimPreviewSource(source, [makePolygon("a", 0), makePolygon("b", 5)]);

    const [first, second] = source.getFeatures();
    expect(first?.getStyle()).toBeTruthy();
    expect(first?.getStyle()).toBe(second?.getStyle());
  });

  test("adds every part when readFeature returns multiple features", () => {
    const source = new VectorSource();
    const format = new GeoJSON();
    const parts = [
      format.readFeature(makePolygon("part-0", 0), {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      }),
      format.readFeature(makePolygon("part-1", 5), {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      }),
    ];
    const spy = jest
      .spyOn(GeoJSON.prototype, "readFeature")
      .mockReturnValue(parts as never);

    try {
      syncTrimPreviewSource(source, [makePolygon("multi", 0)]);

      expect(source.getFeatures()).toHaveLength(2);
      for (const feature of source.getFeatures()) {
        expect(feature.get("trimPreview")).toBe(true);
        expect(feature.getStyle()).toBeTruthy();
      }
    } finally {
      spy.mockRestore();
    }
  });
});

describe("syncTstmPreviewSource", () => {
  test("clears the source when given empty input", () => {
    const source = new VectorSource();
    seedSource(source);

    syncTstmPreviewSource(source, []);

    expect(source.getFeatures()).toEqual([]);
  });

  test("adds a single polygon with TSTM style and metadata", () => {
    const source = new VectorSource();

    syncTstmPreviewSource(source, [makePolygon("tstm-7", 0)]);

    const features = source.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0]?.get("featureId")).toBe("tstm-7");
    expect(features[0]?.get("outlookType")).toBe("categorical");
    expect(features[0]?.get("probability")).toBe("TSTM");
    expect(features[0]?.getStyle()).toBeTruthy();
  });

  test("falls back to tstm-preview when the input has no id", () => {
    const source = new VectorSource();
    const withoutId: GeoJsonFeature<Polygon> = {
      ...makePolygon("ignored", 0),
      id: undefined,
    };

    syncTstmPreviewSource(source, [withoutId]);

    expect(source.getFeatures()).toHaveLength(1);
    expect(source.getFeatures()[0]?.get("featureId")).toBe("tstm-preview");
  });

  test("keeps each input featureId alongside shared TSTM metadata", () => {
    const source = new VectorSource();

    syncTstmPreviewSource(source, [makePolygon("one", 0), makePolygon("two", 5)]);

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

  test("replaces previous contents instead of appending", () => {
    const source = new VectorSource();
    syncTstmPreviewSource(source, [makePolygon("old", 0)]);
    const firstRound = source.getFeatures();

    syncTstmPreviewSource(source, [makePolygon("new", 10)]);

    const secondRound = source.getFeatures();
    expect(secondRound).toHaveLength(1);
    expect(secondRound[0]).not.toBe(firstRound[0]);
    expect(secondRound[0]?.get("featureId")).toBe("new");
  });

  test("adds every part when readFeature returns multiple features", () => {
    const source = new VectorSource();
    const format = new GeoJSON();
    const parts = [
      format.readFeature(makePolygon("part-0", 0), {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      }),
      format.readFeature(makePolygon("part-1", 5), {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      }),
    ];
    const spy = jest
      .spyOn(GeoJSON.prototype, "readFeature")
      .mockReturnValue(parts as never);

    try {
      syncTstmPreviewSource(source, [makePolygon("multi", 0)]);

      const features = source.getFeatures();
      expect(features).toHaveLength(2);
      for (const feature of features) {
        expect(feature.get("featureId")).toBe("multi");
        expect(feature.get("outlookType")).toBe("categorical");
        expect(feature.get("probability")).toBe("TSTM");
        expect(feature.getStyle()).toBeTruthy();
      }
    } finally {
      spy.mockRestore();
    }
  });
});
