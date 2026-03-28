import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CircleUserRound, Cloud, Crown, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useAuth } from '../auth/AuthProvider';
import { useEntitlement } from '../billing/EntitlementProvider';
import './PricingPage.css';

interface ComparisonRow {
  label: string;
  freeIncluded: boolean;
  premiumIncluded: boolean;
}

interface PricingPlanCardProps {
  eyebrow: string;
  title: string;
  price: string;
  priceNote: string;
  description: string;
  highlighted?: boolean;
  badgeLabel?: string;
  badgeVariant?: React.ComponentProps<typeof Badge>['variant'];
  summary: string;
  features: string[];
  cta: React.ReactNode;
}

const comparisonRows: ComparisonRow[] = [
  { label: 'Forecast workspace and map editor', freeIncluded: true, premiumIncluded: true },
  { label: 'Discussion editor', freeIncluded: true, premiumIncluded: true },
  { label: 'Verification mode', freeIncluded: true, premiumIncluded: true },
  { label: 'Local autosave and cycle history', freeIncluded: true, premiumIncluded: true },
  { label: 'JSON export and packaged downloads', freeIncluded: true, premiumIncluded: true },
  { label: 'Account settings sync', freeIncluded: true, premiumIncluded: true },
  { label: 'Hosted cloud cycle storage', freeIncluded: false, premiumIncluded: true },
  { label: 'Cross-device cloud access', freeIncluded: false, premiumIncluded: true },
];

/** Small bullet row inside one plan card. */
const PlanFeatureItem: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <li className="pricing-plan-feature">
    <span className="pricing-plan-feature-icon">
      <Check className="h-3.5 w-3.5" />
    </span>
    <span>{children}</span>
  </li>
);

/** Hero for the pricing page with a calmer intro and a compact reassurance panel. */
const PricingHero: React.FC<{ annualPromoActive: boolean }> = ({ annualPromoActive }) => (
  <section className="pricing-hero">
    <div className="pricing-hero-copy">
      <div className="pricing-pill">
        <Crown className="h-4 w-4" />
        Compare Plans
      </div>
      <div className="pricing-hero-text">
        <h1>Forecasting stays free. Premium covers the hosted layer.</h1>
        <p>
          GFC is still built around the local workflow. Premium exists for the official hosted service, including
          cloud storage, cross-device continuity, and the infrastructure needed to run it. Forecast building,
          discussions, verification, exports, and local cycle history stay available on the free plan.
        </p>
      </div>
    </div>

    <aside className="pricing-hero-panel">
      <div className="pricing-panel-header">
        <h2>Hosted features</h2>
      </div>
      <p>
        Premium pays for hosted storage, sync between devices, and the service behind those features. It does not put
        the forecasting workflow itself behind a paywall.
      </p>
      <p>
        If a subscription ends later, local work stays available and only new cloud writes are turned off.
      </p>
      <div className="pricing-panel-badges">
        <Badge variant="outline">Core workflow stays free</Badge>
        {annualPromoActive ? <Badge variant="success">Annual intro pricing active</Badge> : null}
      </div>
    </aside>
  </section>
);

/** Standard pricing card used for both free and premium. */
const PricingPlanCard: React.FC<PricingPlanCardProps> = ({
  eyebrow,
  title,
  price,
  priceNote,
  description,
  highlighted = false,
  badgeLabel,
  badgeVariant = 'success',
  summary,
  features,
  cta,
}) => (
  <Card className={highlighted ? 'pricing-plan-card pricing-plan-card-highlighted' : 'pricing-plan-card'}>
    <CardHeader className="pricing-plan-header">
      <div className="pricing-plan-topline">
        <div className="pricing-plan-heading">
          <p>{eyebrow}</p>
          <CardTitle>{title}</CardTitle>
        </div>
        {badgeLabel ? <Badge variant={badgeVariant}>{badgeLabel}</Badge> : highlighted ? <Badge variant="success">Recommended</Badge> : null}
      </div>

      <div className="pricing-plan-price-block">
        <div className="pricing-plan-price-row">
          <span className="pricing-plan-price">{price}</span>
          <span className="pricing-plan-price-note">{priceNote}</span>
        </div>
        <CardDescription>{description}</CardDescription>
      </div>
    </CardHeader>

    <CardContent className="pricing-plan-content">
      <p className="pricing-plan-summary">{summary}</p>

      <ul className="pricing-plan-feature-list">
        {features.map((feature) => (
          <PlanFeatureItem key={feature}>{feature}</PlanFeatureItem>
        ))}
      </ul>

      <div className={highlighted ? 'pricing-plan-note pricing-plan-note-highlighted' : 'pricing-plan-note'}>{summary}</div>

      <div className="pricing-plan-cta">{cta}</div>
    </CardContent>
  </Card>
);

/** Comparison grid showing exactly what free vs premium changes. */
const ComparisonTable: React.FC = () => (
  <Card className="pricing-comparison-card">
    <CardHeader className="pricing-section-header">
      <CardTitle>Compare plans</CardTitle>
      <CardDescription>
        Free covers the full local workflow. Premium adds the hosted service on top of it.
      </CardDescription>
    </CardHeader>
    <CardContent className="pricing-comparison-content">
      <div className="pricing-comparison-grid">
        <div className="pricing-comparison-head">Feature</div>
        <div className="pricing-comparison-head pricing-comparison-head-center">Free</div>
        <div className="pricing-comparison-head pricing-comparison-head-center">Premium</div>

        {comparisonRows.map((row) => (
          <React.Fragment key={row.label}>
            <div className="pricing-comparison-label">{row.label}</div>
            <div className="pricing-comparison-cell">
              {row.freeIncluded ? (
                <span className="pricing-comparison-icon pricing-comparison-icon-on">
                  <Check className="h-4 w-4" />
                </span>
              ) : (
                <span className="pricing-comparison-icon pricing-comparison-icon-off">
                  <X className="h-4 w-4" />
                </span>
              )}
            </div>
            <div className="pricing-comparison-cell">
              {row.premiumIncluded ? (
                <span className="pricing-comparison-icon pricing-comparison-icon-on">
                  <Check className="h-4 w-4" />
                </span>
              ) : (
                <span className="pricing-comparison-icon pricing-comparison-icon-off">
                  <X className="h-4 w-4" />
                </span>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>
    </CardContent>
  </Card>
);

/** Smaller operational sidebar card for supporting notes. */
const PricingNotesCard: React.FC<{
  billingEnabled: boolean;
  premiumActive: boolean;
  error: string | null;
  billingMessage: string | null;
}> = ({ billingEnabled, premiumActive, error, billingMessage }) => (
  <Card className="pricing-notes-card">
    <CardHeader className="pricing-section-header">
      <div className="pricing-notes-title">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <CardTitle>Good to know</CardTitle>
      </div>
      <CardDescription>Premium supports the hosted service. The local forecasting workflow stays open.</CardDescription>
    </CardHeader>
    <CardContent className="pricing-notes-content">
      <p>Billing can stay disabled on some deployments while setup is still being finished.</p>
      <p>Premium is for hosted sync and storage, while the core local product remains fully usable for free.</p>
      {premiumActive ? <p className="pricing-notes-emphasis">Your account currently has premium access.</p> : null}
      {!billingEnabled ? <p>Billing is not available on this deployment yet.</p> : null}
      {error || billingMessage ? <p className="pricing-notes-error">{billingMessage ?? error}</p> : null}
    </CardContent>
  </Card>
);

/** Production-facing pricing page for premium hosted storage and billing sign-up. */
const PricingPage: React.FC = () => {
  const { status } = useAuth();
  const {
    annualDisplayPrice,
    annualPromoActive,
    billingEnabled,
    checkoutEnabled,
    error,
    monthlyDisplayPrice,
    openCheckout,
    planInterval,
    premiumActive,
  } = useEntitlement();
  const [submittingPlan, setSubmittingPlan] = useState<'monthly' | 'annual' | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);

  /** Starts checkout for one billing interval. */
  const handleCheckout = async (plan: 'monthly' | 'annual') => {
    setBillingMessage(null);
    setSubmittingPlan(plan);

    try {
      await openCheckout(plan);
    } catch (nextError) {
      setBillingMessage(nextError instanceof Error ? nextError.message : 'Unable to start checkout right now.');
    } finally {
      setSubmittingPlan(null);
    }
  };

  const isSignedIn = status === 'signed_in';
  const activePremiumLabel = premiumActive
    ? planInterval === 'annual'
      ? 'Current: Annual'
      : planInterval === 'monthly'
        ? 'Current: Monthly'
        : 'Current Plan'
    : null;
  const premiumPrice = premiumActive
    ? planInterval === 'monthly'
      ? monthlyDisplayPrice
      : annualDisplayPrice
    : annualDisplayPrice;
  const premiumPriceNote = premiumActive
    ? planInterval === 'monthly'
      ? 'active subscription'
      : `or ${monthlyDisplayPrice}`
    : `or ${monthlyDisplayPrice}`;
  const premiumSummary = premiumActive
    ? planInterval === 'monthly'
      ? 'You are currently on Premium Monthly. Hosted storage and cross-device sync are active on this account.'
      : planInterval === 'annual'
        ? 'You are currently on Premium Annual. Hosted storage and cross-device sync are active on this account.'
        : 'Premium is currently active on this account.'
    : 'Premium adds the hosted layer. If it lapses later, local work remains available and only new cloud writes are disabled.';

  const premiumCtas = premiumActive ? (
    <Button asChild variant="outline" className="w-full">
      <Link to="/account">
        <CircleUserRound className="mr-2 h-4 w-4" />
        View Billing Details
      </Link>
    </Button>
  ) : isSignedIn ? (
    <div className="pricing-premium-cta-grid">
      <Button disabled={!checkoutEnabled || submittingPlan !== null} onClick={() => handleCheckout('annual')}>
        {submittingPlan === 'annual' ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Crown className="mr-2 h-4 w-4" />}
        Choose annual
      </Button>
      <Button variant="outline" disabled={!checkoutEnabled || submittingPlan !== null} onClick={() => handleCheckout('monthly')}>
        {submittingPlan === 'monthly' ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Cloud className="mr-2 h-4 w-4" />}
        Choose monthly
      </Button>
    </div>
  ) : (
    <Button asChild className="w-full">
      <Link to="/account">
        <CircleUserRound className="mr-2 h-4 w-4" />
        Sign in to choose premium
      </Link>
    </Button>
  );

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-background via-background to-muted/20">
      <div className="mx-auto max-w-7xl px-6 py-8 md:px-8 md:py-10">
        <div className="pricing-page-stack">
          <PricingHero annualPromoActive={annualPromoActive} />

          <section className="pricing-plans-grid">
            <PricingPlanCard
              eyebrow="Local-first plan"
              title="Free"
              price="$0"
              priceNote="always available"
              description="Everything needed to build, write, save, export, and verify forecasts locally."
              summary="Free is the full local forecasting product. It does not become a trial just because premium exists."
              features={[
                'Forecast workspace, map editor, and day-to-day cycle management',
                'Discussion editor, verification mode, and package exports',
                'Local autosave, cycle history, and free account settings sync',
              ]}
              cta={
                <Button asChild variant="outline" className="w-full">
                  <Link to="/">Keep using GFC free</Link>
                </Button>
              }
            />

            <PricingPlanCard
              eyebrow="Hosted plan"
              title="Premium"
              price={premiumPrice}
              priceNote={premiumPriceNote}
              description="For users who want the official hosted service: cloud storage, sync between devices, and premium account support."
              highlighted
              badgeLabel={activePremiumLabel ?? undefined}
              summary={premiumSummary}
              features={[
                'Everything in Free, plus hosted cloud storage for your cycles',
                'Cross-device access through the official hosted GFC service',
                'Funds the hosted infrastructure without putting core forecasting behind a paywall',
              ]}
              cta={premiumCtas}
            />
          </section>

          <section className="pricing-lower-grid">
            <ComparisonTable />
            <PricingNotesCard
              billingEnabled={billingEnabled}
              premiumActive={premiumActive}
              error={error}
              billingMessage={billingMessage}
            />
          </section>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
export { PricingPage };
