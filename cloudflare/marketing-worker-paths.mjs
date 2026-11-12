export const LEGACY_PATHS = ['/forecast', '/discussion', '/monitor', '/verification', '/cloud', '/account', '/admin', '/beta', '/beta-access'];

export const isPathOrSubpath = (pathname, prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export const isLegacyPath = (pathname) => LEGACY_PATHS.some((prefix) => isPathOrSubpath(pathname, prefix));

export const isApiPath = (pathname) => isPathOrSubpath(pathname, '/api');

export const marketingWorkerFirstPaths = () => LEGACY_PATHS.flatMap((prefix) => [prefix, `${prefix}/*`]).concat(['/api', '/api/*']);
