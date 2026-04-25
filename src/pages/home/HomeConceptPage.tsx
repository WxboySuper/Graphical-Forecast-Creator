import React from 'react';
import {
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock3,
  Cloud,
  Edit3,
  FileText,
  Folder,
  History,
  Lock,
  Map,
  MessageSquare,
  MoreVertical,
  PlayCircle,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  Upload,
  Zap,
} from 'lucide-react';
import type { SavedCycle } from '../../store/forecastSlice';
import type { ForecastCycle } from '../../types/outlooks';

type HomeConceptVariant = 'signed_in' | 'signed_out';

interface HomeConceptPageProps {
  variant: HomeConceptVariant;
  formattedDate: string;
  savedCycles: SavedCycle[];
  forecastCycle: ForecastCycle;
  isSaved: boolean;
  onResumeForecast: () => void;
  onOpenHistory: () => void;
  onOpenFile: () => void;
  onNewCycle: () => void;
  onLoadRecentCycle: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onNavigateAccount: () => void;
}

const featureItems = [
  {
    icon: Map,
    title: 'Interactive mapping',
    body: 'Draw, edit, and refine with intuitive mapping tools.',
  },
  {
    icon: MessageSquare,
    title: 'Discuss & collaborate',
    body: "Share your thoughts and get feedback when you're ready.",
  },
  {
    icon: ShieldCheck,
    title: 'Verify with confidence',
    body: 'Use built-in verification tools to improve accuracy and consistency.',
  },
];

const accountBenefits = [
  {
    icon: Map,
    title: 'Track your forecasts',
    body: 'View your forecast history and statistics to measure your progress.',
    badge: 'Free',
  },
  {
    icon: Upload,
    title: 'Sync across devices',
    body: 'Keep your settings in sync and access your forecasts anywhere.',
    badge: 'Premium',
  },
];

const formatRecentTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Saved recently';
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const getCyclePeriod = (timestamp: string) => {
  const hour = new Date(timestamp).getHours();
  if (Number.isNaN(hour)) {
    return 'Cycle';
  }
  if (hour < 12) {
    return 'Morning';
  }
  if (hour < 18) {
    return 'Afternoon';
  }
  return 'Evening';
};

const ConceptBackground: React.FC = () => (
  <div className="home-concept-map-bg" aria-hidden="true">
    <svg viewBox="0 0 1100 420" preserveAspectRatio="none">
      <path d="M0 300 C140 210 205 415 350 320 C490 226 605 380 760 292 C895 215 1005 282 1100 210" />
      <path d="M0 335 C115 260 220 440 375 350 C525 262 610 398 790 324 C928 267 1015 325 1100 250" />
      <path d="M0 255 C130 160 220 360 360 266 C500 172 590 320 750 248 C895 184 1000 238 1100 168" />
      <path d="M0 390 C128 300 230 485 390 390 C545 306 660 438 820 362 C955 296 1040 360 1100 310" />
    </svg>
  </div>
);

const HeroActionButton: React.FC<{
  icon: React.ElementType;
  label: string;
  sublabel?: string;
  onClick: () => void;
  primary?: boolean;
}> = ({ icon: Icon, label, sublabel, onClick, primary }) => (
  <button
    type="button"
    className={primary ? 'home-concept-action home-concept-action-primary' : 'home-concept-action'}
    onClick={onClick}
  >
    <Icon className="h-5 w-5" />
    <span>
      <strong>{label}</strong>
      {sublabel && <small>{sublabel}</small>}
    </span>
    <ArrowRight className="h-5 w-5 home-concept-action-arrow" />
  </button>
);

const RecentTimeline: React.FC<{
  cycles: SavedCycle[];
  onLoad: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onOpenHistory: () => void;
}> = ({ cycles, onLoad, onOpenHistory }) => {
  const recentCycles = cycles.slice(0, 5);

  return (
    <section className="home-concept-recent" aria-labelledby="recent-cycles-title">
      <h2 id="recent-cycles-title">Recent Cycles</h2>
      {recentCycles.length > 0 ? (
        <div className="home-concept-timeline">
          {recentCycles.map((cycle, index) => (
            <button
              type="button"
              className="home-concept-cycle-row"
              key={cycle.id}
              data-cycle-id={cycle.id}
              onClick={onLoad}
            >
              <span className={index === 0 ? 'home-concept-dot is-active' : 'home-concept-dot'} />
              <span className="home-concept-cycle-copy">
                <strong>{cycle.cycleDate}</strong>
                <small>{formatRecentTimestamp(cycle.timestamp)}</small>
                <small>{getCyclePeriod(cycle.timestamp)}</small>
              </span>
              {index === 0 ? <span className="home-concept-resume">Resume</span> : null}
              <ArrowRight className="h-4 w-4" />
            </button>
          ))}
        </div>
      ) : (
        <p className="home-concept-muted">Saved cycles will appear here once you create or load a forecast.</p>
      )}
      <button type="button" className="home-concept-link" onClick={onOpenHistory}>
        View full history
        <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
};

const AtAGlance: React.FC<{
  formattedDate: string;
  savedCyclesCount: number;
  hasSavedCycles: boolean;
}> = ({ formattedDate, savedCyclesCount, hasSavedCycles }) => (
  <section className="home-concept-glance" aria-labelledby="at-a-glance-title">
    <h2 id="at-a-glance-title">At A Glance</h2>
    <dl>
      <div>
        <dt><Clock3 className="h-5 w-5" />Today</dt>
        <dd>{formattedDate}</dd>
      </div>
      <div>
        <dt><History className="h-5 w-5" />Saved cycles</dt>
        <dd>{savedCyclesCount}</dd>
      </div>
      <div>
        <dt><FileText className="h-5 w-5" />Cycle status</dt>
        <dd>{hasSavedCycles ? 'History available' : 'Ready to draw'}</dd>
      </div>
    </dl>
  </section>
);

const SignedInConcept: React.FC<HomeConceptPageProps> = ({
  formattedDate,
  savedCycles,
  isSaved,
  onResumeForecast,
  onOpenHistory,
  onNewCycle,
  onLoadRecentCycle,
}) => (
  <main className="home-concept-shell home-concept-shell-signed-in">
    <ConceptBackground />
    <section className="home-concept-cycle-bar" aria-label="Active cycle">
      <div className="home-concept-cycle-meta">
        <span className="home-concept-icon-chip"><Calendar className="h-5 w-5" /></span>
        <div>
          <p>Active cycle</p>
          <h1>{formattedDate}</h1>
        </div>
        {!isSaved && <span className="home-concept-unsaved">Unsaved changes</span>}
      </div>
      <div className="home-concept-cycle-actions">
        <button type="button" className="home-concept-top-primary" onClick={onResumeForecast}>
          Resume Forecast
          <ArrowRight className="h-5 w-5" />
        </button>
        <button type="button" className="home-concept-top-secondary" onClick={onOpenHistory}>
          <Calendar className="h-5 w-5" />
          Switch Day
        </button>
        <button type="button" className="home-concept-top-secondary" onClick={onOpenHistory}>
          <MoreVertical className="h-5 w-5" />
          More
        </button>
      </div>
    </section>

    <div className="home-concept-signed-in-grid">
      <section className="home-concept-continue">
        <h2>
          <span>Continue your</span>
          <span className="home-concept-heading-line">forecast <Zap className="h-10 w-10" /></span>
        </h2>
        <p>Pick up right where you left off. Continue editing, verify your work, and publish with confidence.</p>
        <div className="home-concept-continue-actions">
          <HeroActionButton icon={PlayCircle} label="Resume Forecast" onClick={onResumeForecast} primary />
          <HeroActionButton icon={Folder} label="Open another saved cycle" onClick={onOpenHistory} />
          <HeroActionButton icon={PlusCircle} label="Start a new forecast cycle" onClick={onNewCycle} />
        </div>
      </section>

      <aside className="home-concept-side-rail">
        <AtAGlance
          formattedDate={formattedDate}
          savedCyclesCount={savedCycles.length}
          hasSavedCycles={savedCycles.length > 0}
        />
        <RecentTimeline cycles={savedCycles} onLoad={onLoadRecentCycle} onOpenHistory={onOpenHistory} />
      </aside>
    </div>
  </main>
);

const SignedOutConcept: React.FC<HomeConceptPageProps> = ({
  onResumeForecast,
  onOpenFile,
  onNavigateAccount,
}) => (
  <main className="home-concept-shell home-concept-shell-signed-out">
    <ConceptBackground />
    <div className="home-concept-landing-grid">
      <section className="home-concept-landing-hero">
        <h1>
          <span>Create forecasts.</span>
          <span className="home-concept-heading-line">Your way. <Zap className="h-12 w-12" /></span>
        </h1>
        <p>Draw, organize, and verify forecasts faster with intuitive mapping tools built for weather forecasters.</p>
        <div className="home-concept-pill">
          <Sparkles className="h-4 w-4" />
          No account required - start forecasting right away.
        </div>
        <div className="home-concept-start-row">
          <HeroActionButton icon={Edit3} label="Start a new forecast" sublabel="Jump right in" onClick={onResumeForecast} primary />
          <HeroActionButton icon={Folder} label="Open a saved forecast" sublabel="From your device" onClick={onOpenFile} />
        </div>
        <div className="home-concept-account-strip">
          <span className="home-concept-icon-chip"><Map className="h-6 w-6" /></span>
          <div>
            <strong>Create a free account to track your forecasts</strong>
            <p>See your history, view statistics, and access your work anywhere.</p>
          </div>
          <button type="button" className="home-concept-link" onClick={onNavigateAccount}>
            Create a free account
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <div className="home-concept-quick-notes">
          <span><CheckCircle2 className="h-4 w-4" />Always free to forecast</span>
          <span><BarChart3 className="h-4 w-4" />Track your performance</span>
          <span><Upload className="h-4 w-4" />Sync settings across devices</span>
        </div>
      </section>

      <aside className="home-concept-tool-rail">
        <section className="home-concept-feature-list">
          <h2>Powerful tools for every step</h2>
          {featureItems.map(({ icon: Icon, title, body }) => (
            <div className="home-concept-feature" key={title}>
              <span className="home-concept-icon-chip"><Icon className="h-8 w-8" /></span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="home-concept-account-card">
          <h2>More with an account</h2>
          {accountBenefits.map(({ icon: Icon, title, body, badge }) => (
            <div className="home-concept-benefit" key={title}>
              <span className="home-concept-icon-chip"><Icon className="h-6 w-6" /></span>
              <div>
                <strong>{title}</strong>
                <p>{body}</p>
              </div>
              <span className="home-concept-badge">{badge}</span>
            </div>
          ))}
          <p>Create an account to unlock these benefits.</p>
          <button type="button" className="home-concept-link" onClick={onNavigateAccount}>
            Create a free account
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>

        <p className="home-concept-privacy"><Lock className="h-4 w-4" />Your data is private. You're in control.</p>
      </aside>
    </div>
  </main>
);

const HomeConceptPage: React.FC<HomeConceptPageProps> = (props) => (
  <div className="home-concept-page">
    {props.variant === 'signed_in' ? <SignedInConcept {...props} /> : <SignedOutConcept {...props} />}
  </div>
);

export default HomeConceptPage;
