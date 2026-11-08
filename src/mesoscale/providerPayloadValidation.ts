import type { MesoscaleDisplayType, MesoscaleFrameType, MesoscaleLevelType, MesoscaleModelId } from './contracts';

const displayTypes = new Set<MesoscaleDisplayType>(['raster', 'contour', 'vector', 'scalar']);
const levelTypes = new Set<MesoscaleLevelType>(['surface', 'pressure', 'height', 'depth', 'layer', 'model']);
const modelIds = new Set<MesoscaleModelId>(['hrrr', 'rap', 'rrfs']);
const frameTypes = new Set<MesoscaleFrameType>(['analysis', 'forecast']);

type Check = (value: unknown) => boolean;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function allChecks(value: unknown, checks: Check[]): boolean {
  return checks.every(check => check(value));
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function validTime(value: unknown): boolean {
  return typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value));
}

function hasModelId(value: unknown): boolean {
  return isRecord(value) && modelIds.has(value.id as MesoscaleModelId);
}

function hasModelName(value: unknown): boolean {
  return isRecord(value) && nonEmptyString(value.name);
}

function hasCapabilityParameters(value: unknown): boolean {
  return allChecks(value, [isRecord, candidate => {
    return isRecord(candidate) && Array.isArray(candidate.availableParameterIds);
  }, candidate => {
    if (!isRecord(candidate) || !Array.isArray(candidate.availableParameterIds)) return false;
    return candidate.availableParameterIds.every(nonEmptyString);
  }, candidate => {
    if (!isRecord(candidate) || !Array.isArray(candidate.availableParameterIds)) return false;
    return new Set(candidate.availableParameterIds).size === candidate.availableParameterIds.length;
  }]);
}

function hasCapabilityLimits(value: unknown): boolean {
  return allChecks(value, [isRecord, candidate => isRecord(candidate) && Number.isInteger(candidate.maxForecastHour),
    candidate => isRecord(candidate) && (candidate.maxForecastHour as number) >= 0,
    candidate => isRecord(candidate) && isValidCadence(candidate.cycleCadenceMinutes)]);
}

function isValidCadence(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Number.isInteger(value)) return false;
  return (value as number) > 0;
}

function isValidCapabilities(value: unknown): boolean {
  return allChecks(value, [isRecord, hasCapabilityParameters, hasCapabilityLimits]);
}

function isValidModel(value: unknown): boolean {
  return allChecks(value, [isRecord, hasModelId, hasModelName, (model) => {
    return isRecord(model) && isValidCapabilities(model.capabilities);
  }]);
}

function hasLevelType(value: unknown): boolean {
  return isRecord(value) && levelTypes.has(value.type as MesoscaleLevelType);
}

function hasLevelLabel(value: unknown): boolean {
  return isRecord(value) && nonEmptyString(value.label);
}

function hasFiniteLevelBounds(value: unknown): boolean {
  return allChecks(value, [isRecord, candidate => ['value', 'top', 'bottom'].every(key => {
    return optionalFiniteNumber(candidate, key);
  })]);
}

function optionalFiniteNumber(value: unknown, key: string): boolean {
  return isRecord(value) && (value[key] === undefined || Number.isFinite(value[key]));
}

function hasValidLevelUnits(value: unknown): boolean {
  return isRecord(value) && (value.units === undefined || typeof value.units === 'string');
}

function isValidLevel(value: unknown): boolean {
  return allChecks(value, [isRecord, hasLevelType, hasLevelLabel, hasFiniteLevelBounds, hasValidLevelUnits]);
}

function isValidLegendStop(value: unknown): boolean {
  return allChecks(value, [isRecord, candidate => isRecord(candidate) && Number.isFinite(candidate.value),
    candidate => isRecord(candidate) && nonEmptyString(candidate.label),
    candidate => isRecord(candidate) && (candidate.color === undefined || nonEmptyString(candidate.color))]);
}

function isValidLegend(value: unknown): boolean {
  return Array.isArray(value) && value.every(isValidLegendStop);
}

function hasParameterIdentity(value: unknown): boolean {
  return isRecord(value) && nonEmptyString(value.id);
}

function hasParameterPresentation(value: unknown): boolean {
  return allChecks(value, [isRecord,
    candidate => isRecord(candidate) && nonEmptyString(candidate.displayName),
    candidate => isRecord(candidate) && typeof candidate.units === 'string',
    candidate => isRecord(candidate) && isValidLevel(candidate.level),
    candidate => isRecord(candidate) && isValidLegend(candidate.legend),
    candidate => isRecord(candidate) && displayTypes.has(candidate.displayType as MesoscaleDisplayType)]);
}

function hasParameterData(value: unknown): boolean {
  return isRecord(value) && value.data !== undefined && value.data !== null;
}

function isValidParameter(value: unknown): boolean {
  return allChecks(value, [isRecord, hasParameterIdentity, hasParameterPresentation, hasParameterData]);
}

function areValidParameters(value: unknown): boolean {
  return Array.isArray(value) && value.every(isValidParameter);
}

function hasUniqueParameterIds(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const ids = value.flatMap(item => isRecord(item) && nonEmptyString(item.id) ? [item.id] : []);
  return ids.length === value.length && new Set(ids).size === ids.length;
}

function isValidUnavailableParameter(value: unknown): boolean {
  return isRecord(value)
    && nonEmptyString(value.id)
    && (value.reason === undefined || typeof value.reason === 'string');
}

function areValidUnavailableParameters(value: unknown): boolean {
  return Array.isArray(value) && value.every(isValidUnavailableParameter) && hasUniqueParameterIds(value);
}

function areValidRequestedIds(value: unknown): boolean {
  return Array.isArray(value)
    && value.every(nonEmptyString)
    && new Set(value).size === value.length;
}

function isValidFrameType(value: unknown): boolean {
  return frameTypes.has(value as MesoscaleFrameType);
}

function hasValidForecastHour(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isValidFrameHour(payload: Record<string, unknown>): boolean {
  return isAnalysisFrame(payload) || isForecastFrame(payload);
}

function isAnalysisFrame(payload: Record<string, unknown>): boolean {
  return payload.frameType === 'analysis' && payload.forecastHour === 0;
}

function isForecastFrame(payload: Record<string, unknown>): boolean {
  return payload.frameType === 'forecast' && (payload.forecastHour as number) > 0;
}

function isWithinModelForecastRange(payload: Record<string, unknown>): boolean {
  if (!isRecord(payload.model) || !isRecord(payload.model.capabilities)) return false;
  return (payload.forecastHour as number) <= (payload.model.capabilities.maxForecastHour as number);
}

function isValidFrameTime(payload: Record<string, unknown>): boolean {
  const expectedValidTime = Date.parse(payload.cycleTime as string) + (payload.forecastHour as number) * 60 * 60 * 1000;
  return Date.parse(payload.validTime as string) === expectedValidTime;
}

function hasValidDomain(value: unknown): boolean {
  return allChecks(value, [isRecord, candidate => isRecord(candidate) && nonEmptyString(candidate.id),
    candidate => isRecord(candidate) && nonEmptyString(candidate.name)]);
}

function hasValidBounds(value: unknown): boolean {
  return allChecks(value, [isRecord, hasBoundShape]);
}

function hasBoundShape(value: unknown): boolean {
  if (!isRecord(value) || value.bounds === undefined) return true;
  if (!Array.isArray(value.bounds)) return false;
  return value.bounds.length === 4 && value.bounds.every(Number.isFinite);
}

function hasSourceAttribution(value: unknown): boolean {
  return allChecks(value, [isRecord,
    candidate => isRecord(candidate) && nonEmptyString(candidate.providerId),
    candidate => isRecord(candidate) && nonEmptyString(candidate.providerName),
    candidate => isRecord(candidate) && nonEmptyString(candidate.datasetId),
    candidate => isRecord(candidate) && nonEmptyString(candidate.attribution),
    candidate => isRecord(candidate) && (candidate.url === undefined || nonEmptyString(candidate.url))]);
}

function isValidSource(value: unknown): boolean {
  return allChecks(value, [isRecord, hasSourceAttribution]);
}

function getAvailableParameterIds(payload: Record<string, unknown>): unknown[] | undefined {
  if (!isRecord(payload.model)) return undefined;
  if (!isRecord(payload.model.capabilities)) return undefined;
  const ids = payload.model.capabilities.availableParameterIds;
  return Array.isArray(ids) ? ids : undefined;
}

function arePayloadParametersListed(payload: Record<string, unknown>, availableIds: unknown[]): boolean {
  if (!Array.isArray(payload.parameters)) return false;
  return payload.parameters.every(parameter => isRecord(parameter) && availableIds.includes(parameter.id));
}

function capabilitiesContainParameters(payload: Record<string, unknown>): boolean {
  const availableIds = getAvailableParameterIds(payload);
  return availableIds !== undefined && arePayloadParametersListed(payload, availableIds);
}

function unavailableIdsDoNotOverlap(payload: Record<string, unknown>): boolean {
  if (!Array.isArray(payload.parameters) || !Array.isArray(payload.unavailableParameters)) return true;
  const suppliedIds = new Set(payload.parameters.flatMap(parameter => isRecord(parameter) ? [parameter.id] : []));
  return payload.unavailableParameters.every(parameter => isRecord(parameter) && !suppliedIds.has(parameter.id));
}

interface ValidationRule {
  valid: (payload: Record<string, unknown>) => boolean;
  message: string;
}

const rules: ValidationRule[] = [
  { valid: payload => payload.schemaVersion === 1, message: 'Unsupported or missing provider payload schema version.' },
  { valid: payload => isValidModel(payload.model), message: 'Model metadata or capabilities are missing or invalid.' },
  { valid: payload => isValidFrameType(payload.frameType), message: 'Frame type must be analysis or forecast.' },
  { valid: payload => validTime(payload.cycleTime), message: 'Cycle time must be a valid timestamp.' },
  { valid: payload => hasValidForecastHour(payload.forecastHour), message: 'Forecast hour must be a non-negative integer.' },
  { valid: isValidFrameHour, message: 'Analysis frames must be f00 and forecast frames must be after f00.' },
  { valid: isWithinModelForecastRange, message: 'Forecast hour exceeds this model capability.' },
  { valid: payload => validTime(payload.validTime), message: 'Valid time must be a valid timestamp.' },
  { valid: isValidFrameTime, message: 'Valid time must equal cycle time plus forecast hour.' },
  { valid: payload => hasValidDomain(payload.domain), message: 'Domain metadata is missing or invalid.' },
  { valid: payload => hasValidBounds(payload.domain), message: 'Domain bounds must contain four finite coordinates.' },
  { valid: payload => isValidSource(payload.source), message: 'Source metadata and attribution are required.' },
  { valid: payload => areValidParameters(payload.parameters), message: 'Parameters contain invalid metadata or missing provider values.' },
  { valid: payload => hasUniqueParameterIds(payload.parameters), message: 'Parameter entries must have unique, non-empty identities.' },
  { valid: capabilitiesContainParameters, message: 'A parameter is not listed in this model capabilities.' },
  { valid: payload => payload.unavailableParameters === undefined || areValidUnavailableParameters(payload.unavailableParameters), message: 'Unavailable parameters must have unique, valid identities.' },
  { valid: unavailableIdsDoNotOverlap, message: 'A parameter cannot be both supplied and unavailable.' },
  { valid: payload => payload.requestedParameterIds === undefined || areValidRequestedIds(payload.requestedParameterIds), message: 'Requested parameter identities must be unique non-empty strings.' },
];

export function getProviderPayloadError(payload: unknown): string | undefined {
  if (!isRecord(payload)) return 'Provider payload must be an object.';
  return rules.find(rule => !rule.valid(payload))?.message;
}
