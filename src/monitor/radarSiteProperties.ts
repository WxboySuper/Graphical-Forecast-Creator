const readRadarProperty = (properties: Record<string, unknown>, key: string): string =>
  typeof properties[key] === 'string' ? String(properties[key]).trim() : '';

const getFeatureProperties = (feature: unknown): Record<string, unknown> | null => {
  if (typeof feature !== 'object' || feature === null || !('properties' in feature)) {
    return null;
  }

  return (feature as { properties?: Record<string, unknown> }).properties ?? null;
};

export const readRadarSiteProperties = (
  feature: unknown,
): { id: string; name: string; wfoId?: string } | null => {
  const properties = getFeatureProperties(feature);
  if (!properties) {
    return null;
  }
  const id = readRadarProperty(properties, 'rda_id').toUpperCase();
  if (!/^K[A-Z0-9]{3}$/.test(id)) {
    return null;
  }

  const name = readRadarProperty(properties, 'name');
  const wfoId = readRadarProperty(properties, 'wfo_id') || undefined;
  return { id, name, wfoId };
};
