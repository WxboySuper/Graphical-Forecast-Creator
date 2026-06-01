import { Link } from 'react-router-dom';

interface AlertBannerLinkProps {
  linkUrl: string;
  linkLabel: string;
}

const isInternalAppPath = (url: string): boolean => url.startsWith('/') && !url.startsWith('//');

/** Renders an in-app or external CTA for the site-wide alert banner. */
export function AlertBannerLink({ linkUrl, linkLabel }: AlertBannerLinkProps) {
  if (isInternalAppPath(linkUrl)) {
    return (
      <Link className="alert-banner__link" to={linkUrl}>
        {linkLabel}
      </Link>
    );
  }

  return (
    <a className="alert-banner__link" href={linkUrl} rel="noopener noreferrer" target="_blank">
      {linkLabel}
    </a>
  );
}
