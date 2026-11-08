import type { MesoscaleModelId } from '../contracts';
import type { MesoscaleRequestResult } from '../client';
import { FIXTURE_STATUS, getFixtureCatalog, getFixtureLatest } from './catalogs';

const failure = (message: string): MesoscaleRequestResult<never> => ({ state: 'upstream-failure', message, retryable: false });

const readLatest = <T,>(model: MesoscaleModelId): MesoscaleRequestResult<T> => {
  const data = getFixtureLatest(model);
  return data ? { state: 'stale', data: data as T, stale: true, ageMinutes: null } : failure('No fixture exists for this model.');
};

const readCatalog = <T,>(model: MesoscaleModelId, cycle: string): MesoscaleRequestResult<T> => {
  const data = getFixtureCatalog(model, cycle);
  if (!data) return failure('Fixture catalog was not found.');
  const ageMinutes = Math.floor((Date.now() - Date.parse(data.cycleTime)) / 60000);
  const stale = Date.now() - Date.parse(data.cycleTime) > 180 * 60000;
  const state = stale ? 'stale' : data.status === 'partial' ? 'partial' : 'ready';
  return { state, data: data as T, stale, ageMinutes };
};

export function readMesoscaleFixture<T>(path: string): MesoscaleRequestResult<T> {
  if (path === 'status') return { state: 'partial', data: FIXTURE_STATUS as T, stale: true, ageMinutes: null };
  const latest = path.match(/^latest\/(hrrr|rap|rrfs)\.json$/);
  if (latest) return readLatest<T>(latest[1] as MesoscaleModelId);
  const catalog = path.match(/^catalog\/(hrrr|rap|rrfs)\/([\wTZ]+)\.json$/);
  if (catalog) return readCatalog<T>(catalog[1] as MesoscaleModelId, catalog[2]);
  return { state: 'malformed', message: 'Unknown mesoscale fixture route.' };
}
