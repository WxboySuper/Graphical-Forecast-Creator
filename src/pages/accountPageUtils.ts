import { PRICING_COPY } from '../billing/pricingCopy';
import type { useAuth } from '../auth/AuthProvider';
import type { useEntitlement } from '../billing/EntitlementProvider';
import type { BadgeProps } from '../components/ui/badge';

type SyncStatus = ReturnType<typeof useAuth>['settingsSyncStatus'];

export interface SyncStatusMeta {
  label: string;
  variant: BadgeProps['variant'];
}

/** Maps Firebase provider ids to short labels for the account UI. */
export const getProviderLabel = (providerId: string): string => {
  switch (providerId) {
    case 'google.com':
      return 'Google';
    case 'password':
      return 'Email / Password';
    default:
      return providerId;
  }
};

/** Converts the raw settings status into the compact account-page badge. */
export const getSyncStatusMeta = (settingsSyncStatus: SyncStatus): SyncStatusMeta => {
  switch (settingsSyncStatus) {
    case 'synced':
      return { label: 'Synced', variant: 'success' };
    case 'syncing':
      return { label: 'Syncing', variant: 'secondary' };
    case 'error':
      return { label: 'Needs Attention', variant: 'warning' };
    case 'disabled':
      return { label: 'Local Only', variant: 'outline' };
    case 'idle':
    default:
      return { label: 'Ready', variant: 'secondary' };
  }
};

/** Returns the current plan label based on entitlement state. */
export const getPlanLabel = (
  premiumActive: boolean,
  planInterval: ReturnType<typeof useEntitlement>['planInterval'],
  effectiveSource: ReturnType<typeof useEntitlement>['effectiveSource'],
): string => {
  if (!premiumActive) return 'Free Plan';
  if (planInterval === 'annual') return 'Premium Annual';
  if (planInterval === 'monthly') return 'Premium Monthly';
  return effectiveSource === 'beta_override' ? 'Premium Beta Access' : 'Premium';
};

/** Returns the short helper copy used under the billing summary grid. */
export const getBillingSupportCopy = (
  effectiveSource: ReturnType<typeof useEntitlement>['effectiveSource'],
  premiumActive: boolean,
  annualPromoActive: boolean,
): string | null => {
  if (effectiveSource === 'beta_override') {
    return 'Premium is currently being granted through the beta override path, so no live Stripe subscription is required yet.';
  }
  if (!premiumActive) return PRICING_COPY.downgradeSummary;
  if (annualPromoActive) return 'Annual intro pricing is currently active on this deployment.';
  return null;
};

/** Returns the pricing-button variant for the current entitlement state. */
export const getPricingButtonVariant = (premiumActive: boolean): 'outline' | 'default' =>
  premiumActive ? 'outline' : 'default';

/** Returns the current plan price shown in the billing summary card. */
export const getCurrentPlanPrice = (
  premiumActive: boolean,
  planInterval: ReturnType<typeof useEntitlement>['planInterval'],
  monthlyDisplayPrice: string,
  annualDisplayPrice: string,
): string => {
  if (!premiumActive) return '$0';
  if (planInterval === 'annual') return annualDisplayPrice;
  if (planInterval === 'monthly') return monthlyDisplayPrice;
  return 'Included';
};

/** Formats the last recorded active-day key into an account-friendly date label. */
export const formatLastActiveDate = (value: string | null): string => {
  if (!value) return 'No activity yet';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
