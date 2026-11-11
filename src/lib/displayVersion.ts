/** Formats the padded package version as the shorter label used in the UI. */
export function formatDisplayVersion(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(version);
  if (!match) return version === 'dev' ? version : `v${version}`;

  const [, major, minor, patch, beta] = match;
  const shortVersion = Number(minor) === 0 && Number(patch) === 0
    ? `v${major}`
    : `v${major}.${minor}`;

  return beta ? `${shortVersion} beta ${beta}` : shortVersion;
}
