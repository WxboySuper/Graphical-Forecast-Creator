/**
 * Alert-banner link renderer. Chooses internal router navigation or a validated
 * external link and suppresses unsafe destinations.
 */
import { Link } from 'react-router';
import { isSafeBannerLinkUrl } from '../utils/bannerLinkUrl';

interface AlertBannerLinkProps {
  linkUrl: string;
  linkLabel: string;
}

/** Renders an internal route or external link for the alert banner. */
export function AlertBannerLink({ linkUrl, linkLabel }: AlertBannerLinkProps) {
  if (linkUrl.startsWith('/')) {
    return (
      <Link className="alert-banner__link" to={linkUrl}>
        {linkLabel}
      </Link>
    );
  }

  if (!isSafeBannerLinkUrl(linkUrl)) {
    return null;
  }

  return (
    <a className="alert-banner__link" href={linkUrl} target="_blank" rel="noopener noreferrer">
      {linkLabel}
    </a>
  );
}