import type { MesoscaleState } from '../store/mesoscaleSlice';
import { isRecord } from './forecastWorkspaceEnvelope';
import { isMesoscaleArea } from './mesoscaleAreaValidation';
import { isMesoscaleModelContext } from './mesoscaleContextValidation';
import { MAX_MESOSCALE_AREAS, MAX_MESOSCALE_DISCUSSION_LENGTH } from './mesoscaleValidationLimits';

export { MAX_MESOSCALE_AREAS, MAX_MESOSCALE_DISCUSSION_LENGTH, MAX_MESOSCALE_POLYGON_VERTICES } from './mesoscaleValidationLimits';
const hasOnlyProductKeys = (value: Record<string, unknown>): boolean =>
  Object.keys(value).every((key) => ['areas', 'discussion', 'modelContext'].includes(key));
const isAreaCollection = (value: unknown): boolean => {
  if (!Array.isArray(value) || value.length > MAX_MESOSCALE_AREAS || !value.every(isMesoscaleArea)) return false;
  const ids = value.map((area) => (area as { id: string }).id);
  return new Set(ids).size === ids.length;
};
const isDiscussion = (value: unknown): boolean => typeof value === 'string'
  && value.length <= MAX_MESOSCALE_DISCUSSION_LENGTH;

export const validateMesoscaleState = (value: unknown): value is MesoscaleState => {
  if (!isRecord(value) || !hasOnlyProductKeys(value)) return false;
  return isAreaCollection(value.areas) && isDiscussion(value.discussion)
    && isMesoscaleModelContext(value.modelContext);
};

const getAreaError = (value: Record<string, unknown>): string | null => {
  if (!Array.isArray(value.areas)) return 'Mesoscale areas must be a list.';
  if (value.areas.length > MAX_MESOSCALE_AREAS) return `Mesoscale saves support at most ${MAX_MESOSCALE_AREAS} areas.`;
  if (!value.areas.every(isMesoscaleArea)) return 'A mesoscale area has invalid fields, times, or polygon geometry.';
  const ids = value.areas.map((area) => (area as { id: string }).id);
  return new Set(ids).size === ids.length ? null : 'Mesoscale area IDs must be unique.';
};
const getDiscussionError = (value: Record<string, unknown>): string | null => {
  if (typeof value.discussion !== 'string') return 'Mesoscale discussion must be text.';
  return value.discussion.length <= MAX_MESOSCALE_DISCUSSION_LENGTH
    ? null : `Mesoscale discussion exceeds ${MAX_MESOSCALE_DISCUSSION_LENGTH} characters.`;
};

export const getMesoscaleValidationError = (value: unknown): string | null => {
  if (!isRecord(value)) return 'Mesoscale save must be an object.';
  if (!hasOnlyProductKeys(value)) return 'Mesoscale save contains unsupported fields.';
  const errors = [getAreaError(value), getDiscussionError(value)];
  if (!isMesoscaleModelContext(value.modelContext)) errors.push('Mesoscale model context is invalid.');
  return errors.find((error) => error !== null) ?? null;
};
