import React from 'react';
import { Button } from '../../components/ui/button';
import { ArrowRight, FileText, Cloud, CircleUserRound } from 'lucide-react';

interface Props {
  onStart: () => void;
  onWriteDiscussion: () => void;
  onViewAccount: () => void;
}

/** Renders the main headline with primary-colored text highlight. */
const HeroHeadline: React.FC = () => (
  <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
    Draw professional<br />
    <span className="text-primary">severe weather outlooks.</span>
  </h1>
);

/** Left-hand content panel: app badge, headline, description, and CTA buttons. */
const HeroLeftPanel: React.FC<Pick<Props, 'onStart' | 'onWriteDiscussion' | 'onViewAccount'>> = ({ onStart, onWriteDiscussion, onViewAccount }) => (
  <div className="space-y-5 flex-1">
    <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/25 rounded-full px-4 py-1.5 text-sm font-medium text-primary">
      <Cloud className="h-4 w-4" />
      Graphical Forecast Creator
    </div>
    <div className="space-y-3">
      <HeroHeadline />
      <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
        Create probabilistic severe weather outlooks for Days 1–8, write forecast discussions,
        and verify your predictions — right in your browser, no sign-in required.
      </p>
    </div>
    <div className="flex flex-wrap gap-3">
      <Button size="lg" onClick={onStart}>
        Start Drawing
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
      <Button size="lg" variant="outline" onClick={onWriteDiscussion}>
        <FileText className="h-4 w-4 mr-2" />
        Write a Discussion
      </Button>
      <Button size="lg" variant="ghost" onClick={onViewAccount}>
        <CircleUserRound className="h-4 w-4 mr-2" />
        Account &amp; Sync
      </Button>
    </div>
  </div>
);

/** Hero section for the home page with a headline, CTA buttons, and outlook level badge preview. */
export const HomeHero: React.FC<Props> = ({ onStart, onWriteDiscussion, onViewAccount }) => {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20 p-10 md:p-14">
      <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-primary/8 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
      <div className="relative flex flex-col md:flex-row items-start md:items-center gap-8">
        <HeroLeftPanel onStart={onStart} onWriteDiscussion={onWriteDiscussion} onViewAccount={onViewAccount} />
        <div className="hidden lg:flex flex-col gap-2 shrink-0 select-none">
          {[ 'HIGH','MDT','ENH','SLGT','MRGL','TSTM' ].map((label) => (
            <div key={label} className="w-24 text-center px-4 py-2 rounded-lg border font-bold text-sm tracking-wide bg-muted/10">
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HomeHero;
