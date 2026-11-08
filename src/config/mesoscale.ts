import { getBuildTarget, type BuildTarget } from './buildTarget';
import { isFeatureExposed } from './featureExposure';

declare const __MESOSCALE_WORKER_URLS__: Record<BuildTarget, string>;
declare const __MESOSCALE_FIXTURES__: boolean;

export interface MesoscaleClientConfig {
  baseUrl: string;
  fixtures: boolean;
  enabled: boolean;
}

const getWorkerUrls = (): Record<BuildTarget, string> => typeof __MESOSCALE_WORKER_URLS__ === 'undefined'
  ? { local: '', beta: '', staging: '', production: '' }
  : __MESOSCALE_WORKER_URLS__;

const isValidWorkerUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    const secure = url.protocol === 'https:';
    const localDevelopment = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (!secure && !localDevelopment) return false;
    if (url.pathname !== '/') return false;
    if (url.search) return false;
    if (url.hash) return false;
    if (url.username || url.password) return false;
    return true;
  } catch {
    return false;
  }
};

export const getMesoscaleClientConfig = (): MesoscaleClientConfig => {
  const target = getBuildTarget();
  const fixtures = typeof __MESOSCALE_FIXTURES__ !== 'undefined' && __MESOSCALE_FIXTURES__ && target === 'local';
  const baseUrl = fixtures ? '/mesoscale-fixtures' : getWorkerUrls()[target];
  if (fixtures) return { baseUrl, fixtures, enabled: true };
  return {
    baseUrl,
    fixtures,
    enabled: isFeatureExposed('mesoscaleWorkspace') && isValidWorkerUrl(baseUrl),
  };
};
