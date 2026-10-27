import { Link } from 'react-router';
import { isSafeBannerLinkUrl } from '../utils/bannerLinkUrl';

interface AlertBannerLinkProps {
  linkUrl: string;
  linkLabel: string;
}

/** In-app routes start with a single slash. '//host' is protocol-relative and resolves off-site. */
const isInternalRoute = (linkUrl: string): boolean =>
  linkUrl.startsWith('/') && !linkUrl.startsWith('//');

/** Renders an internal route or external link for the alert banner. */
export function AlertBannerLink({ linkUrl, linkLabel }: AlertBannerLinkProps) {
  if (!isSafeBannerLinkUrl(linkUrl)) {
    return null;
  }

  if (isInternalRoute(linkUrl)) {
    return (
      <Link className="alert-banner__link" to={linkUrl}>
        {linkLabel}
      </Link>
    );
  }

  return (
    <a className="alert-banner__link" href={linkUrl} target="_blank" rel="noopener noreferrer">
      {linkLabel}
    </a>
  );
}
