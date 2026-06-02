import { Link } from 'react-router-dom';

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

  return (
    <a className="alert-banner__link" href={linkUrl} target="_blank" rel="noopener noreferrer">
      {linkLabel}
    </a>
  );
}
