export type BuildTarget = 'local' | 'beta' | 'staging' | 'production';

/** Returns the deployment target validated and embedded by the Vite build. */
export const getBuildTarget = (): BuildTarget => __GFC_BUILD_TARGET__;
