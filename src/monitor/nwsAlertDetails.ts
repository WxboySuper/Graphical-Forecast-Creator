export interface NwsAlertDetails {
  event: string;
  headline: string | null;
  areaDesc: string | null;
  severity: string | null;
  certainty: string | null;
  urgency: string | null;
  effective: string | null;
  expires: string | null;
  description: string | null;
  instruction: string | null;
  senderName: string | null;
  detailUrl: string | null;
}

const readString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const resolveNwsAlertDetailUrl = (properties: Record<string, unknown>): string | null => {
  const candidates = ['@id', 'id', 'uri'];
  for (const key of candidates) {
    const value = readString(properties[key]);
    if (value && /^https?:\/\//i.test(value)) {
      return value;
    }
  }
  return null;
};

export const formatNwsAlertTime = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
};

export const parseNwsAlertProperties = (
  properties: Record<string, unknown>,
): NwsAlertDetails => {
  const event = readString(properties.event) ?? 'Weather alert';
  const headline = readString(properties.headline);
  const effective = readString(properties.effective) ?? readString(properties.onset);
  const expires = readString(properties.expires) ?? readString(properties.ends);

  return {
    event,
    headline: headline && headline !== event ? headline : null,
    areaDesc: readString(properties.areaDesc),
    severity: readString(properties.severity),
    certainty: readString(properties.certainty),
    urgency: readString(properties.urgency),
    effective,
    expires,
    description: readString(properties.description),
    instruction: readString(properties.instruction),
    senderName: readString(properties.senderName),
    detailUrl: resolveNwsAlertDetailUrl(properties),
  };
};

export const parseNwsAlertFromOlProperties = (
  properties: Record<string, unknown>,
): NwsAlertDetails | null => {
  if (!properties.nwsAlert) {
    return null;
  }

  return parseNwsAlertProperties(properties);
};
