import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import type VectorSource from "ol/source/Vector";
import type { Feature as GeoJsonFeature } from "geojson";

const RENDER_KEY = "__gfcRenderKey";
const SOURCE_FEATURE = "__gfcSourceFeature";
const RENDER_SIGNATURE = "__gfcRenderSignature";

export type FeatureSyncDescriptor = {
  key: string;
  feature: GeoJsonFeature;
  /** Stable fallback for legacy serialized features that do not carry an id. */
  stableId?: string;
  signature: string;
  read: () => Feature<Geometry> | Feature<Geometry>[];
  apply: (feature: Feature<Geometry>) => void;
  targetSource?: VectorSource;
};

export type FeatureSyncStats = {
  parsed: number;
  added: number;
  updated: number;
  removed: number;
  reused: number;
  skipped: number;
};

export type ForecastSourceDescriptorPlan = {
  source: FeatureSyncDescriptor[];
  categorical: FeatureSyncDescriptor[];
};

export type ForecastSourceDescriptorPlanOptions = {
  normalDescriptors: FeatureSyncDescriptor[];
  customMode: boolean;
  customDescriptors: FeatureSyncDescriptor[];
  source: VectorSource;
  categoricalSource: VectorSource;
};

const increment = (
  stats: FeatureSyncStats | undefined,
  property: keyof FeatureSyncStats,
  amount = 1,
): void => {
  if (stats) {
    stats[property] += amount;
  }
};

const normalizeReadResult = (
  result: Feature<Geometry> | Feature<Geometry>[],
): Feature<Geometry>[] => (Array.isArray(result) ? result : [result]);

const isFinitePosition = (value: unknown): value is number[] =>
  Array.isArray(value)
  && value.length >= 2
  && value.slice(0, 2).every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate));

const isClosedRing = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length < 4 || !isFinitePosition(value[0]) || !isFinitePosition(value[value.length - 1])) {
    return false;
  }
  return value[0][0] === value[value.length - 1][0]
    && value[0][1] === value[value.length - 1][1];
};

const hasFiniteCoordinateTree = (value: unknown): boolean => {
  if (isFinitePosition(value)) return true;
  return Array.isArray(value)
    && value.length > 0
    && value.every((child) => hasFiniteCoordinateTree(child));
};

/** Checks the minimum coordinate shape needed by OpenLayers' Snap segmenters. */
// @codescene(disable:"Complex Method")
const hasValidCoordinateShape = (feature: Feature<Geometry>): boolean => {
  const geometry = feature.getGeometry();
  if (!geometry) return false;

  try {
    const coordinates = (geometry as Geometry & { getCoordinates: () => unknown }).getCoordinates();
    switch (geometry.getType()) {
      case "Point":
        return isFinitePosition(coordinates);
      case "LineString":
        return Array.isArray(coordinates) && coordinates.length >= 2 && hasFiniteCoordinateTree(coordinates);
      case "Polygon":
        return Array.isArray(coordinates) && coordinates.length > 0
          && coordinates.every((ring) => isClosedRing(ring) && hasFiniteCoordinateTree(ring));
      case "MultiPoint":
        return Array.isArray(coordinates) && coordinates.length > 0 && hasFiniteCoordinateTree(coordinates);
      case "MultiLineString":
        return Array.isArray(coordinates) && coordinates.length > 0
          && coordinates.every((line) => Array.isArray(line) && line.length >= 2 && hasFiniteCoordinateTree(line));
      case "MultiPolygon":
        return Array.isArray(coordinates) && coordinates.length > 0
          && coordinates.every((polygon) => Array.isArray(polygon) && polygon.length > 0
            && polygon.every((ring) => isClosedRing(ring) && hasFiniteCoordinateTree(ring)));
      case "GeometryCollection": {
        const collection = geometry as Geometry & { getGeometriesArray?: () => Geometry[] };
        return collection.getGeometriesArray?.().every((child) => {
          const childFeature = new Feature<Geometry>(child);
          return hasValidCoordinateShape(childFeature);
        }) ?? false;
      }
      default:
        return hasFiniteCoordinateTree(coordinates);
    }
  } catch {
    return false;
  }
};

/**
 * OpenLayers' Snap interaction assumes every indexed geometry has a finite,
 * non-empty extent and a usable coordinate shape. A malformed persisted or
 * derived feature can otherwise throw from inside Snap while VectorSource
 * dispatches its add event.
 */
const hasRenderableGeometry = (feature: Feature<Geometry>): boolean => {
  const geometry = feature.getGeometry();
  if (!geometry) {
    return false;
  }

  try {
    const extent = geometry.getExtent();
    return hasValidCoordinateShape(feature)
      && extent.length === 4
      && extent.every(Number.isFinite)
      && extent[0] <= extent[2]
      && extent[1] <= extent[3];
  } catch {
    return false;
  }
};

/** Reads a descriptor without allowing malformed geometry to reach OpenLayers. */
const readRenderableFeatures = (
  descriptor: FeatureSyncDescriptor,
): Feature<Geometry>[] | null => {
  try {
    const parsedFeatures = normalizeReadResult(descriptor.read());
    return parsedFeatures.length > 0 && parsedFeatures.every(hasRenderableGeometry)
      ? parsedFeatures
      : null;
  } catch {
    return null;
  }
};

const requireStableId = (descriptor: FeatureSyncDescriptor): void => {
  const stableId = descriptor.stableId ?? descriptor.feature.id;
  if (String(stableId ?? "").trim() === "") {
    throw new Error(`Feature sync descriptor "${descriptor.key}" requires a feature id.`);
  }
};

const requireUniqueKey = (key: string, keys: Set<string>): void => {
  if (key.trim() === "") {
    throw new Error(`Feature sync descriptors require unique non-empty keys: "${key}".`);
  }
  if (keys.has(key)) {
    throw new Error(`Feature sync descriptors require unique non-empty keys: "${key}".`);
  }
  keys.add(key);
};

/** Selects the descriptors that feed the normal and categorical map sources. */
export const getForecastSourceDescriptorPlan = (
  {
    normalDescriptors,
    customMode,
    customDescriptors,
    source,
    categoricalSource,
  }: ForecastSourceDescriptorPlanOptions,
): ForecastSourceDescriptorPlan => ({
  source: customMode
    ? customDescriptors
    : normalDescriptors.filter(({ targetSource }) => targetSource === source),
  categorical: customMode
    ? []
    : normalDescriptors.filter(({ targetSource }) => targetSource === categoricalSource),
});

const validateDescriptors = (descriptors: FeatureSyncDescriptor[]): void => {
  const keys = new Set<string>();
  descriptors.forEach((descriptor) => {
    requireStableId(descriptor);
    requireUniqueKey(descriptor.key, keys);
  });
};

const trackFeature = (
  feature: Feature<Geometry>,
  descriptor: FeatureSyncDescriptor,
  partIndex: number,
): void => {
  feature.set(RENDER_KEY, `${descriptor.key}:${partIndex}`);
  feature.set(SOURCE_FEATURE, descriptor.feature);
  feature.set(RENDER_SIGNATURE, descriptor.signature);
};

type ExistingFeatures = {
  byKey: Map<string, Feature<Geometry>[]>;
  unmanaged: Feature<Geometry>[];
};

const collectExistingFeatures = (source: VectorSource): ExistingFeatures => {
  const existing: ExistingFeatures = {
    byKey: new Map(),
    unmanaged: [],
  };

  source.getFeatures().forEach((feature) => {
    const renderKey = feature.get(RENDER_KEY);
    if (typeof renderKey !== "string") {
      existing.unmanaged.push(feature);
      return;
    }

    const descriptorKey = renderKey.slice(0, renderKey.lastIndexOf(":"));
    const features = existing.byKey.get(descriptorKey) || [];
    features.push(feature);
    existing.byKey.set(descriptorKey, features);
  });

  return existing;
};

const canReuseFeatures = (
  features: Feature<Geometry>[],
  descriptor: FeatureSyncDescriptor,
): boolean => features.length > 0 && features.every(
  (feature) =>
    // Redux feature objects are immutable, so a new source reference signals
    // that geometry or properties may need to be applied again.
    feature.get(SOURCE_FEATURE) === descriptor.feature &&
    feature.get(RENDER_SIGNATURE) === descriptor.signature,
);

const updateSharedFeatures = (
  sourceFeatures: Feature<Geometry>[],
  parsedFeatures: Feature<Geometry>[],
  descriptor: FeatureSyncDescriptor,
  stats: FeatureSyncStats | undefined,
): number => {
  // A descriptor key identifies the source feature. Its OpenLayers parts are
  // matched by read order; a part-count change is handled by add/remove below.
  const sharedFeatureCount = Math.min(sourceFeatures.length, parsedFeatures.length);
  for (let index = 0; index < sharedFeatureCount; index += 1) {
    const currentFeature = sourceFeatures[index];
    const parsedFeature = parsedFeatures[index];
    currentFeature.setGeometry(parsedFeature.getGeometry());
    descriptor.apply(currentFeature);
    trackFeature(currentFeature, descriptor, index);
    increment(stats, "updated");
  }
  return sharedFeatureCount;
};

const addNewFeatures = (
  source: VectorSource,
  parsedFeatures: Feature<Geometry>[],
  descriptor: FeatureSyncDescriptor,
  firstNewIndex: number,
  stats: FeatureSyncStats | undefined,
): void => {
  for (let index = firstNewIndex; index < parsedFeatures.length; index += 1) {
    const newFeature = parsedFeatures[index];
    descriptor.apply(newFeature);
    trackFeature(newFeature, descriptor, index);
    source.addFeature(newFeature);
    increment(stats, "added");
  }
};

const removeFeatures = (
  source: VectorSource,
  features: Feature<Geometry>[],
  firstIndex: number,
  stats: FeatureSyncStats | undefined,
): void => {
  for (let index = firstIndex; index < features.length; index += 1) {
    source.removeFeature(features[index]);
    increment(stats, "removed");
  }
};

const reconcileDescriptor = (
  source: VectorSource,
  descriptor: FeatureSyncDescriptor,
  existingByKey: Map<string, Feature<Geometry>[]>,
  stats: FeatureSyncStats | undefined,
): void => {
  const existing = existingByKey.get(descriptor.key) || [];
  if (canReuseFeatures(existing, descriptor)) {
    increment(stats, "reused", existing.length);
    return;
  }

  const parsedFeatures = readRenderableFeatures(descriptor);
  if (!parsedFeatures) {
    // Keep an existing good render when a replacement cannot be parsed. New
    // malformed features are omitted until their source data becomes valid.
    increment(stats, "skipped");
    return;
  }
  increment(stats, "parsed");
  const sharedFeatureCount = updateSharedFeatures(
    existing,
    parsedFeatures,
    descriptor,
    stats,
  );
  addNewFeatures(source, parsedFeatures, descriptor, sharedFeatureCount, stats);
  removeFeatures(source, existing, sharedFeatureCount, stats);
};

const removeStaleFeatures = (
  source: VectorSource,
  existing: ExistingFeatures,
  desiredKeys: Set<string>,
  stats: FeatureSyncStats | undefined,
): void => {
  // Keep the former clear() behavior explicit: transient features without a
  // reconciliation key are not part of the desired rendered feature set.
  existing.byKey.forEach((features, key) => {
    if (!desiredKeys.has(key)) {
      removeFeatures(source, features, 0, stats);
    }
  });
  removeFeatures(source, existing.unmanaged, 0, stats);
};

/** Reconciles one OL source while retaining feature identity for unchanged GeoJSON inputs. */
export const reconcileFeatureSource = (
  source: VectorSource,
  descriptors: FeatureSyncDescriptor[],
  stats?: FeatureSyncStats,
): void => {
  validateDescriptors(descriptors);
  const existing = collectExistingFeatures(source);
  const desiredKeys = new Set(descriptors.map(({ key }) => key));
  descriptors.forEach((descriptor) => {
    reconcileDescriptor(source, descriptor, existing.byKey, stats);
  });
  removeStaleFeatures(source, existing, desiredKeys, stats);
};
