/**
 * Account billing card. It renders entitlement and subscription actions, tracks
 * request state, and delegates billing operations to the account controller.
 */
import React, { useState } from 'react';
import { Crown, LoaderCircle } from 'lucide-react';
import { MARKETING_PRICING_URL } from '../config/marketingLinks';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { useEntitlement } from '../billing/EntitlementProvider';
import {
  getBillingSupportCopy,
  getCurrentPlanPrice,
  getPlanLabel,
  getPricingButtonVariant,
} from './accountPageUtils';
import { AccountSummaryTile } from './AccountSummaryTile';

/** Billing header showing the current plan label. */
const BillingCardHeader: React.FC<{ premiumActive: boolean; planLabel: string }> = ({ premiumActive, planLabel }) => (
  <CardHeader className="account-section-header">
    <div className="account-section-topline">
      <div className="account-section-copy">
        <CardTitle className="text-2xl">Billing & Premium</CardTitle>
        <CardDescription>
          Premium funds hosted sync and storage. Core forecasting workflows remain free.
        </CardDescription>
      </div>
      <Badge variant={premiumActive ? 'success' : 'outline'} className="account-plan-badge">
        {planLabel}
      </Badge>
    </div>
  </CardHeader>
);

/** Compact billing status and price summary. */
const BillingSummaryGrid: React.FC<{ billingStatus: string; currentPlanPrice: string }> = ({ billingStatus, currentPlanPrice }) => (
  <div className="account-summary-grid">
    <AccountSummaryTile label="Billing status" value={billingStatus || 'inactive'} />
    <AccountSummaryTile label="Current plan price" value={currentPlanPrice} />
  </div>
);

type CheckoutPlan = 'monthly' | 'annual';

/** Upgrade buttons that start Stripe checkout for a free account. */
const UpgradeButtons: React.FC<{
  disabled: boolean;
  submittingPlan: CheckoutPlan | null;
  annualDisplayPrice: string;
  monthlyDisplayPrice: string;
  onCheckout: (plan: CheckoutPlan) => void;
}> = ({ disabled, submittingPlan, annualDisplayPrice, monthlyDisplayPrice, onCheckout }) => (
  <>
    <Button disabled={disabled} onClick={() => onCheckout('annual')}>
      {submittingPlan === 'annual' ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Crown className="mr-2 h-4 w-4" />}
      Upgrade annual ({annualDisplayPrice})
    </Button>
    <Button variant="outline" disabled={disabled} onClick={() => onCheckout('monthly')}>
      {submittingPlan === 'monthly' ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
      Upgrade monthly ({monthlyDisplayPrice})
    </Button>
  </>
);

/** Billing management and pricing navigation actions. */
const BillingActionRow: React.FC<{
  stripeCustomerId: string | null;
  billingEnabled: boolean;
  openingPortal: boolean;
  premiumActive: boolean;
  onOpenPortal: () => void;
  upgrade: React.ReactNode;
}> = ({ stripeCustomerId, billingEnabled, openingPortal, premiumActive, onOpenPortal, upgrade }) => (
  <div className="account-button-row">
    {stripeCustomerId && billingEnabled ? (
      <Button variant="outline" onClick={onOpenPortal} disabled={openingPortal}>
        {openingPortal ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
        Manage Subscription
      </Button>
    ) : null}
    {upgrade}
    <Button asChild variant={premiumActive ? getPricingButtonVariant(premiumActive) : 'outline'}>
      <a href={MARKETING_PRICING_URL} target="_blank" rel="noreferrer">
        View Pricing
      </a>
    </Button>
  </div>
);

/** Supporting copy and error state inside the billing card body. */
const BillingCardMessages: React.FC<{
  supportCopy: string | null;
  portalMessage: string | null;
  error: string | null;
}> = ({ supportCopy, portalMessage, error }) => (
  <>
    {supportCopy ? <p className="text-sm text-muted-foreground">{supportCopy}</p> : null}
    {portalMessage || error ? <p className="text-sm text-destructive">{portalMessage ?? error}</p> : null}
  </>
);

/** Main billing card for subscription state and management. */
export const AccountBillingCard: React.FC = () => {
  const {
    annualPromoActive,
    annualDisplayPrice,
    billingEnabled,
    billingStatus,
    checkoutEnabled,
    effectiveSource,
    error,
    monthlyDisplayPrice,
    openBillingPortal,
    openCheckout,
    planInterval,
    premiumActive,
    stripeCustomerId,
  } = useEntitlement();
  const [portalMessage, setPortalMessage] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [submittingPlan, setSubmittingPlan] = useState<CheckoutPlan | null>(null);
  const currentPlanPrice = getCurrentPlanPrice(premiumActive, planInterval, monthlyDisplayPrice, annualDisplayPrice);
  const planLabel = getPlanLabel(premiumActive, planInterval, effectiveSource);
  const supportCopy = getBillingSupportCopy(effectiveSource, premiumActive, annualPromoActive);

  /** Opens the Stripe billing portal and surfaces failures in the card. */
  const handleOpenPortal = async () => {
    setPortalMessage(null);
    setOpeningPortal(true);
    try {
      await openBillingPortal();
    } catch (nextError) {
      setPortalMessage(nextError instanceof Error ? nextError.message : 'Unable to open billing management right now.');
    } finally {
      setOpeningPortal(false);
    }
  };

  /** Starts Stripe checkout for one billing interval and surfaces failures in the card. */
  const handleCheckout = (plan: CheckoutPlan) => {
    setPortalMessage(null);
    setSubmittingPlan(plan);
    openCheckout(plan)
      .catch((nextError) => {
        setPortalMessage(nextError instanceof Error ? nextError.message : 'Unable to start checkout right now.');
      })
      .finally(() => setSubmittingPlan(null));
  };

  const upgrade = premiumActive ? null : (
    <UpgradeButtons
      disabled={!checkoutEnabled || submittingPlan !== null}
      submittingPlan={submittingPlan}
      annualDisplayPrice={annualDisplayPrice}
      monthlyDisplayPrice={monthlyDisplayPrice}
      onCheckout={handleCheckout}
    />
  );

  /** Wraps the portal action so button handlers stay synchronous. */
  const handleOpenPortalClick = () => {
    handleOpenPortal().catch(() => undefined);
  };

  return (
    <Card className="account-surface-card">
      <BillingCardHeader premiumActive={premiumActive} planLabel={planLabel} />
      <CardContent className="account-section-content">
        <BillingSummaryGrid billingStatus={billingStatus} currentPlanPrice={currentPlanPrice} />
        <BillingCardMessages supportCopy={supportCopy} portalMessage={portalMessage} error={error} />
        <BillingActionRow
          stripeCustomerId={stripeCustomerId}
          billingEnabled={billingEnabled}
          openingPortal={openingPortal}
          premiumActive={premiumActive}
          onOpenPortal={handleOpenPortalClick}
          upgrade={upgrade}
        />
      </CardContent>
    </Card>
  );
};
