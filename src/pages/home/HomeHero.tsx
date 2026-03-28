import React from 'react';
import { ArrowRight, CircleUserRound, Clock3, FileText, History, Map, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/button';

export type HomeVariant = 'signed_in' | 'signed_out';

interface Props {
  variant: HomeVariant;
  formattedDate: string;
  hasSavedCycles: boolean;
  savedCyclesCount: number;
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
  <div className="flex flex-wrap gap-3">
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
const HeroSummaryCard: React.FC<{
  variant: HomeVariant;
  formattedDate: string;
  savedCyclesCount: number;
}> = ({ variant, formattedDate, savedCyclesCount }) => {
  const stats = getHeroStats(variant, formattedDate, savedCyclesCount);

  return (
    <div className="w-full rounded-3xl border border-primary/20 bg-background/80 p-6 shadow-sm backdrop-blur">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.22em] text-primary">
          {variant === 'signed_in' ? 'Today In GFC' : 'What This Helps With'}
        </p>
        <h2 className="text-lg font-semibold text-foreground">
          {variant === 'signed_in' ? 'Get back into the package quickly.' : 'A single workspace for the full package.'}
        </h2>
      </div>

      <div className="mt-5 space-y-4">
        {stats.map(({ icon, label, value }) => (
          <div key={label} className="rounded-2xl border border-border/70 bg-muted/25 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              {icon}
              {label}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{value}</p>
          </div>
        ))}
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
  onStart,
  onWriteDiscussion,
  onViewAccount,
  onOpenHistory,
}) => {
  const copy = getHeroCopy(variant);

  return (
    <div
      className={`relative overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/12 via-background to-background ${
        variant === 'signed_in' ? 'p-8 md:px-12 md:py-12' : 'p-8 md:p-12'
      }`}
    >
      <div className="absolute -top-16 -right-12 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-10 h-56 w-56 rounded-full bg-primary/8 blur-3xl pointer-events-none" />

      <div className="relative grid gap-8 lg:grid-cols-3 lg:items-start lg:gap-10">
        <div className="space-y-10 py-2 lg:col-span-2 lg:pr-6 lg:py-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            <Map className="h-4 w-4" />
            {copy.eyebrow}
          </div>

          <div className="space-y-8">
            <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-foreground md:text-5xl">
              {copy.title}
            </h1>
            <div className="pt-1">
              <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
                {copy.description}
              </p>
            </div>
          </div>

          <div className="pt-3">
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

        <div className="lg:pt-2">
          <HeroSummaryCard variant={variant} formattedDate={formattedDate} savedCyclesCount={savedCyclesCount} />
        </div>
      </div>
    </div>
  );
};

export default HomeHero;
