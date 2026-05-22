const readRadarProperty = (properties: Record<string, unknown>, key: string): string =>
  typeof properties[key] === 'string' ? String(properties[key]).trim() : '';

export const readRadarSiteProperties = (
  feature: unknown,
): { id: string; name: string; wfoId?: string } | null => {
  if (!feature || typeof feature !== 'object' || !('properties' in feature)) {
    return null;
  }

  const properties = (feature as { properties?: Record<string, unknown> }).properties ?? {};
  const id = readRadarProperty(properties, 'rda_id').toUpperCase();
  if (!/^K[A-Z0-9]{3}$/.test(id)) {
    return null;
  }

  const name = readRadarProperty(properties, 'name');
  const wfoId = readRadarProperty(properties, 'wfo_id') || undefined;
  return { id, name, wfoId };
};
