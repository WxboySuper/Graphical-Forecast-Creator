import { Link } from 'react-router-dom';

interface AlertBannerLinkProps {
  linkUrl: string;
  linkLabel: string;
}

/** Renders an in-app or external CTA for the site-wide alert banner. */
export function AlertBannerLink({ linkUrl, linkLabel }: AlertBannerLinkProps) {
  if (linkUrl.startsWith('/')) {
    return (
      <Link className="alert-banner__link" to={linkUrl}>
        {linkLabel}
      </Link>
    );
  }

  return (
    <a className="alert-banner__link" href={linkUrl} rel="noopener noreferrer">
      {linkLabel}
    </a>
  );
}
