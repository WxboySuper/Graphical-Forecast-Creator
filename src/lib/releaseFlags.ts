export interface ReleaseFlags {
  vectorBasemapEnabled: boolean;
}

/** Safe accessor for build-time globals so tests and non-Vite tools can import this module. */
const readBooleanFlag = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

/** Deployment-scoped feature flags. Beta can enable these before main does. */
export const releaseFlags: ReleaseFlags = {
  vectorBasemapEnabled: readBooleanFlag(
    typeof __GFC_FLAG_VECTOR_BASEMAP__ !== 'undefined' ? __GFC_FLAG_VECTOR_BASEMAP__ : undefined
  ),
};
