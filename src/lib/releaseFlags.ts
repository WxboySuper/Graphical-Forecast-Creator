export interface ReleaseFlags {
  vectorBasemapEnabled: boolean;
}

/** Deployment-scoped feature flags. Beta can enable these before main does. */
export const releaseFlags: ReleaseFlags = {
  vectorBasemapEnabled: __GFC_FLAG_VECTOR_BASEMAP__,
};
