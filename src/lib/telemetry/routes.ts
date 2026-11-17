type RouteName = 'home' | 'forecast' | 'mesoscale' | 'discussion' | 'verification'
  | 'monitor' | 'account' | 'cloud' | 'admin' | 'pricing' | 'updates' | 'other';

const isForecastPath = (path: string): boolean => path === '/forecast' || path.startsWith('/forecast/');
const isMesoscalePath = (path: string): boolean => path === '/forecast/mesoscale';
const isDiscussionPath = (path: string): boolean => path.startsWith('/discussion');

const routeNames: ReadonlyArray<readonly [string, RouteName]> = [
  ['/verification', 'verification'], ['/monitor', 'monitor'], ['/account', 'account'],
  ['/cloud', 'cloud'], ['/admin', 'admin'], ['/pricing', 'pricing'], ['/updates', 'updates'],
];

const exactRouteName = (path: string): RouteName | undefined =>
  routeNames.find(([route]) => route === path)?.[1];

export const pageNameForPath = (pathname: string): string => {
  const path = pathname.split(/[?#]/, 1)[0];
  if (path === '/') return 'home';
  if (isForecastPath(path)) return isMesoscalePath(path) ? 'mesoscale' : 'forecast';
  if (isDiscussionPath(path)) return 'discussion';
  return exactRouteName(path) ?? 'other';
};
