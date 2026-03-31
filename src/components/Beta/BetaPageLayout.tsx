import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import '../../pages/BetaAccess.css';

interface BetaPageShellProps {
  children: React.ReactNode;
}

interface BetaInfoCardProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/** Shared outer shell used by the locked beta pages. */
export const BetaPageShell: React.FC<BetaPageShellProps> = ({ children }) => (
  <div className="beta-page-shell">
    <div className="beta-page-layout">{children}</div>
  </div>
);

/** Standard information card used across the beta landing and invite flows. */
export const BetaInfoCard: React.FC<BetaInfoCardProps> = ({
  title,
  description,
  children,
  className = 'beta-info-card',
}) => (
  <Card className={className}>
    <CardHeader className="beta-info-card-header">
      <CardTitle>{title}</CardTitle>
      {description ? <CardDescription>{description}</CardDescription> : null}
    </CardHeader>
    {children ? <CardContent className="beta-info-card-content">{children}</CardContent> : null}
  </Card>
);

/** Simple status shell used for loading and transitional beta checks. */
export const BetaStatusPanel: React.FC<{
  title: string;
  description: string;
}> = ({ title, description }) => (
  <BetaPageShell>
    <BetaInfoCard title={title} description={description} />
  </BetaPageShell>
);
