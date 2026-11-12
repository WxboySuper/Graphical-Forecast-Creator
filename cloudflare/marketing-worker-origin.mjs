const hasCredentials = (url) => Boolean(url.username || url.password);
const hasExtraComponents = (url) => url.pathname !== '/' || Boolean(url.search || url.hash);
const isSecureOrigin = (url) => {
  if (url.protocol !== 'https:') return false;
  if (!url.hostname) return false;
  if (hasCredentials(url)) return false;
  return !hasExtraComponents(url);
};

export const parseAppOrigin = (value) => {
  try {
    const origin = new URL(value);
    return isSecureOrigin(origin) ? origin : null;
  } catch {
    return null;
  }
};
