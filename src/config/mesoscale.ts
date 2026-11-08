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

const isAllowedProtocol = (url: URL): boolean => url.protocol === 'https:'
  || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));

const hasNoPathOptionsOrCredentials = (url: URL): boolean => url.pathname === '/'
  && !url.search && !url.hash && !url.username && !url.password;

const isValidWorkerUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return isAllowedProtocol(url) && hasNoPathOptionsOrCredentials(url);
  } catch {
    return false;
  }
};

export const getMesoscaleClientConfig = (): MesoscaleClientConfig => {
  const target = getBuildTarget();
  const fixtures = typeof __MESOSCALE_FIXTURES__ !== 'undefined' && __MESOSCALE_FIXTURES__ && target === 'local';
  const baseUrl = fixtures ? '/mesoscale-fixtures' : getWorkerUrls()[target];
  return {
    baseUrl,
    fixtures,
    enabled: isFeatureExposed('mesoscaleWorkspace') && (fixtures || isValidWorkerUrl(baseUrl)),
  };
};
