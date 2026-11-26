export const APP_TITLE = 'Graphical Forecast Creator';

const SECTION_TITLES: Record<string, string> = {
  account: 'Account',
  admin: 'Admin',
  cloud: 'Cloud Library',
  monitor: 'Monitor',
  verification: 'Verification',
};

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

const describeSection = (segments: string[], search: string): string | null => {
  const [section, workspace] = segments;
  if (!section) return 'Home';
  if (section === 'forecast') {
    const surface = new URLSearchParams(search).get('surface');
    const workspaceName = workspace ? `${capitalize(workspace)} ` : '';
    return surface === 'discussion' ? `${workspaceName}Discussion` : `${workspaceName}Forecast`;
  }
  return SECTION_TITLES[section] ?? capitalize(section.replace(/-/g, ' '));
};

/** Returns the document title for a route, such as "Severe Forecast | Graphical Forecast Creator". */
export const getPageTitle = (pathname: string, search = ''): string => {
  const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const section = describeSection(segments, search);
  return section ? `${section} | ${APP_TITLE}` : APP_TITLE;
};
