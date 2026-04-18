import React from 'react';
import { ArrowRight, CircleUserRound, Clock3, FileText, History, Map, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/button';

export type HomeVariant = 'signed_in' | 'signed_out';

interface Props {
  variant: HomeVariant;
  formattedDate: string;
  hasSavedCycles: boolean;
  savedCyclesCount: number;
  showSummaryCard?: boolean;
  onStart: () => void;
  onWriteDiscussion: () => void;
  onViewAccount: () => void;
  onOpenHistory: () => void;
}

interface HeroStatRow {
  icon: React.ReactNode;
  label: string;
  value: string;
}

/** Returns the home hero title and supporting copy for the active auth state. */
const getHeroCopy = (variant: HomeVariant) => {
  if (variant === 'signed_in') {
    return {
      eyebrow: 'Forecast Workspace',
      title: 'Pick up the next cycle without hunting through menus.',
      description:
        'Resume the package already in progress, reopen a saved cycle, or jump straight into the discussion editor when it is time to write.',
    };
  }

  return {
    eyebrow: 'Built For Forecast Workflow',
    title: 'Build outlook packages without fighting the tooling.',
    description:
      'GFC keeps drawing, cycle management, discussions, and verification in one place so you can focus on the forecast instead of bouncing between tools.',
  };
};

/** Builds the small right-hand hero summary card for the current landing-page variant. */
const getHeroStats = (
  variant: HomeVariant,
  formattedDate: string,
  savedCyclesCount: number
): HeroStatRow[] => {
  if (variant === 'signed_in') {
    return [
      {
        icon: <Clock3 className="h-4 w-4 text-primary" />,
        label: 'Current cycle',
        value: formattedDate,
      },
      {
        icon: <History className="h-4 w-4 text-primary" />,
        label: 'Saved cycles',
        value: `${savedCyclesCount}`,
      },
      {
        icon: <FileText className="h-4 w-4 text-primary" />,
        label: 'Best next move',
        value: 'Resume the map or open a saved package.',
      },
    ];
  }

  return [
    {
      icon: <Map className="h-4 w-4 text-primary" />,
      label: 'Draw outlooks',
      value: 'Jump into the map and sketch Day 1 through Day 8 packages.',
    },
    {
      icon: <FileText className="h-4 w-4 text-primary" />,
      label: 'Write discussions',
      value: 'Keep the narrative side of the package right next to the graphics.',
    },
    {
      icon: <ShieldCheck className="h-4 w-4 text-primary" />,
      label: 'Check your work',
      value: 'Come back later and verify packages against reports.',
    },
  ];
};

/** Shared action row for the hero, tailored to the signed-in or signed-out workflow. */
const HeroActions: React.FC<Props> = ({
  variant,
  hasSavedCycles,
  onStart,
  onWriteDiscussion,
  onViewAccount,
  onOpenHistory,
}) => (
  <div className="home-hero-actions">
    <Button size="lg" onClick={onStart}>
      {variant === 'signed_in' ? 'Continue Forecast' : 'Start Forecast'}
      <ArrowRight className="h-4 w-4 ml-2" />
    </Button>
    <Button size="lg" variant="outline" onClick={onWriteDiscussion}>
      <FileText className="h-4 w-4 mr-2" />
      Write Discussion
    </Button>
    {variant === 'signed_in' && hasSavedCycles ? (
      <Button size="lg" variant="ghost" onClick={onOpenHistory}>
        <History className="h-4 w-4 mr-2" />
        Open Saved Cycles
      </Button>
    ) : null}
    {variant === 'signed_out' ? (
      <Button size="lg" variant="ghost" onClick={onViewAccount}>
        <CircleUserRound className="h-4 w-4 mr-2" />
        Account &amp; Sync
      </Button>
    ) : null}
  </div>
);

/** Compact right-side summary card that gives the hero a more grounded, operational feel. */
export const HeroSummaryCard: React.FC<{
  variant: HomeVariant;
  formattedDate: string;
  savedCyclesCount: number;
}> = ({ variant, formattedDate, savedCyclesCount }) => {
  const stats = getHeroStats(variant, formattedDate, savedCyclesCount);

  return (
    <div className="home-hero-panel">
      <div className="home-hero-panel-header">
        <p>
          {variant === 'signed_in' ? 'Today In GFC' : 'What This Helps With'}
        </p>
        <h2>
          {variant === 'signed_in' ? 'Get back into the package quickly.' : 'A single workspace for the full package.'}
        </h2>
      </div>

      <div className="home-hero-panel-list">
        {stats.map(({ icon, label, value }) => (
          <div key={label} className="home-hero-panel-item">
            <div className="home-hero-panel-item-label">
              {icon}
              {label}
            </div>
            <p>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

/** Shared decorative background shapes for the home hero card. */
const HeroBackdrop: React.FC = () => (
  <>
    <div className="absolute -top-16 -right-12 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
    <div className="absolute -bottom-16 -left-10 h-56 w-56 rounded-full bg-primary/8 blur-3xl pointer-events-none" />
  </>
);

/** Shared card shell that preserves the current home-hero look while reducing JSX depth in the main component. */
const HeroShell: React.FC<{
  variant: HomeVariant;
  children: React.ReactNode;
}> = ({ variant, children }) => (
  <section className={variant === 'signed_in' ? 'home-hero home-hero-signed-in' : 'home-hero'}>
    <HeroBackdrop />
    {children}
  </section>
);

/** Main left-hand content stack for the home hero. */
const HeroMainContent: React.FC<Props> = ({
  variant,
  formattedDate,
  hasSavedCycles,
  savedCyclesCount,
  onStart,
  onWriteDiscussion,
  onViewAccount,
  onOpenHistory,
}) => {
  const copy = getHeroCopy(variant);

  return (
    <div className="home-hero-main">
      <div className="home-pill">
        <Map className="h-4 w-4" />
        {copy.eyebrow}
      </div>

      <div className="home-hero-text">
        <h1>
          {copy.title}
        </h1>
        <p>{copy.description}</p>
      </div>

      <div>
        <HeroActions
          variant={variant}
          formattedDate={formattedDate}
          hasSavedCycles={hasSavedCycles}
          savedCyclesCount={savedCyclesCount}
          onStart={onStart}
          onWriteDiscussion={onWriteDiscussion}
          onViewAccount={onViewAccount}
          onOpenHistory={onOpenHistory}
        />
      </div>
    </div>
  );
};

/** Forecast-oriented landing-page hero with tailored copy for signed-in and signed-out users. */
export const HomeHero: React.FC<Props> = ({
  variant,
  formattedDate,
  hasSavedCycles,
  savedCyclesCount,
  showSummaryCard = true,
  onStart,
  onWriteDiscussion,
  onViewAccount,
  onOpenHistory,
}) => {
  return (
    <HeroShell variant={variant}>
      <div className={showSummaryCard ? 'home-hero-grid' : 'home-hero-grid home-hero-grid-single'}>
        <HeroMainContent
          variant={variant}
          formattedDate={formattedDate}
          hasSavedCycles={hasSavedCycles}
          savedCyclesCount={savedCyclesCount}
          onStart={onStart}
          onWriteDiscussion={onWriteDiscussion}
          onViewAccount={onViewAccount}
          onOpenHistory={onOpenHistory}
        />

        {showSummaryCard ? (
          <div className="home-hero-side">
            <HeroSummaryCard variant={variant} formattedDate={formattedDate} savedCyclesCount={savedCyclesCount} />
          </div>
        ) : null}
      </div>
    </HeroShell>
  );
};

export default HomeHero;
