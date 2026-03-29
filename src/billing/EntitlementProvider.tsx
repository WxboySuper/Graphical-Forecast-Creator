import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, type Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../auth/AuthProvider';

export type EntitlementStatus = 'disabled' | 'loading' | 'free' | 'premium' | 'error';
export type PlanInterval = 'monthly' | 'annual' | null;
type EffectiveSource = 'stripe' | 'beta_override' | 'none';

interface BillingConfig {
  billingEnabled: boolean;
  checkoutEnabled: boolean;
  annualPromoActive: boolean;
  monthlyDisplayPrice: string;
  annualDisplayPrice: string;
}

interface UserEntitlementDocument {
  uid: string;
  premiumActive: boolean;
  effectiveSource: EffectiveSource;
  planInterval: PlanInterval;
  billingStatus: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Timestamp | null;
  betaOverrideActive: boolean;
  updatedAt?: Timestamp | null;
}

interface EntitlementContextValue {
  entitlementStatus: EntitlementStatus;
  premiumActive: boolean;
  planInterval: PlanInterval;
  billingStatus: string;
  effectiveSource: EffectiveSource;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  stripeCustomerId: string | null;
  betaOverrideActive: boolean;
  checkoutEnabled: boolean;
  billingEnabled: boolean;
  annualPromoActive: boolean;
  monthlyDisplayPrice: string;
  annualDisplayPrice: string;
  error: string | null;
  openCheckout: (plan: 'monthly' | 'annual') => Promise<void>;
  openBillingPortal: () => Promise<void>;
}

const DEFAULT_BILLING_CONFIG: BillingConfig = {
  billingEnabled: false,
  checkoutEnabled: false,
  annualPromoActive: false,
  monthlyDisplayPrice: '$3/month',
  annualDisplayPrice: '$30/year',
};

const DEFAULT_ENTITLEMENT: UserEntitlementDocument = {
  uid: '',
  premiumActive: false,
  effectiveSource: 'none',
  planInterval: null,
  billingStatus: 'inactive',
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  betaOverrideActive: false,
};

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

interface EntitlementListenerState {
  entitlement: UserEntitlementDocument;
  status: EntitlementStatus;
  error: string | null;
}

/** Returns the auth header needed for server-side billing endpoints. */
const createAuthHeaders = async (getToken: () => Promise<string>): Promise<Record<string, string>> => ({
  Authorization: `Bearer ${await getToken()}`,
  'Content-Type': 'application/json',
});

/** Reads the billing service config and falls back safely when the hosted service is unavailable. */
const fetchBillingConfig = async (): Promise<BillingConfig> => {
  try {
    const response = await fetch('/api/billing/config');
    if (!response.ok) {
      return DEFAULT_BILLING_CONFIG;
    }

    const data = await response.json();
    return {
      billingEnabled: Boolean(data.billingEnabled),
      checkoutEnabled: Boolean(data.checkoutEnabled),
      annualPromoActive: Boolean(data.annualPromoActive),
      monthlyDisplayPrice: typeof data.monthlyDisplayPrice === 'string' ? data.monthlyDisplayPrice : DEFAULT_BILLING_CONFIG.monthlyDisplayPrice,
      annualDisplayPrice: typeof data.annualDisplayPrice === 'string' ? data.annualDisplayPrice : DEFAULT_BILLING_CONFIG.annualDisplayPrice,
    };
  } catch {
    return DEFAULT_BILLING_CONFIG;
  }
};

/** Validates a Firestore entitlement doc before the UI trusts it. */
const normalizeEffectiveSource = (value: unknown): EffectiveSource => {
  if (value === 'stripe' || value === 'beta_override' || value === 'none') {
    return value;
  }

  return 'none';
};

/** Validates a Firestore entitlement doc before the UI trusts it. */
const normalizePlanInterval = (value: unknown): PlanInterval => {
  if (value === 'monthly' || value === 'annual') {
    return value;
  }

  return null;
};

/** Validates a Firestore entitlement doc before the UI trusts it. */
const normalizeNullableString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** Validates a Firestore entitlement doc before the UI trusts it. */
const readEntitlementDocument = (value: Partial<UserEntitlementDocument> | undefined): UserEntitlementDocument => {
  if (!value) {
    return DEFAULT_ENTITLEMENT;
  }

  return {
    uid: normalizeNullableString(value.uid) ?? '',
    premiumActive: Boolean(value.premiumActive),
    effectiveSource: normalizeEffectiveSource(value.effectiveSource),
    planInterval: normalizePlanInterval(value.planInterval),
    billingStatus: normalizeNullableString(value.billingStatus) ?? 'inactive',
    stripeCustomerId: normalizeNullableString(value.stripeCustomerId),
    stripeSubscriptionId: normalizeNullableString(value.stripeSubscriptionId),
    cancelAtPeriodEnd: Boolean(value.cancelAtPeriodEnd),
    currentPeriodEnd: value.currentPeriodEnd ?? null,
    betaOverrideActive: Boolean(value.betaOverrideActive),
    updatedAt: value.updatedAt ?? null,
  };
};

/** Redirects the browser to a server-issued Stripe flow URL. */
const redirectToBillingUrl = (url: string) => {
  window.location.assign(url);
};

/** Applies the disabled hosted-auth fallback into entitlement state. */
const applyDisabledEntitlementState = (
  setEntitlement: React.Dispatch<React.SetStateAction<UserEntitlementDocument>>,
  setEntitlementStatus: React.Dispatch<React.SetStateAction<EntitlementStatus>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>
) => {
  setEntitlement(DEFAULT_ENTITLEMENT);
  setEntitlementStatus('disabled');
  setError(null);
};

/** Applies the signed-out hosted-auth fallback into entitlement state. */
const applySignedOutEntitlementState = (
  setEntitlement: React.Dispatch<React.SetStateAction<UserEntitlementDocument>>,
  setEntitlementStatus: React.Dispatch<React.SetStateAction<EntitlementStatus>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>
) => {
  setEntitlement(DEFAULT_ENTITLEMENT);
  setEntitlementStatus('free');
  setError(null);
};

/** Converts a successful entitlement snapshot into provider state. */
const createEntitlementListenerState = (snapshotData: Partial<UserEntitlementDocument> | undefined): EntitlementListenerState => {
  const entitlement = readEntitlementDocument(snapshotData);
  return {
    entitlement,
    status: entitlement.premiumActive ? 'premium' : 'free',
    error: null,
  };
};

/** Starts the Firestore listener that mirrors hosted entitlement state into the client. */
const subscribeToEntitlements = (
  userId: string,
  handlers: {
    setEntitlement: React.Dispatch<React.SetStateAction<UserEntitlementDocument>>;
    setEntitlementStatus: React.Dispatch<React.SetStateAction<EntitlementStatus>>;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
  }
) => {
  const entitlementRef = doc(db, 'userEntitlements', userId);

  return onSnapshot(
    entitlementRef,
    (snapshot) => {
      const nextState = createEntitlementListenerState(
        snapshot.data() as Partial<UserEntitlementDocument> | undefined
      );
      handlers.setEntitlement(nextState.entitlement);
      handlers.setEntitlementStatus(nextState.status);
      handlers.setError(nextState.error);
    },
    (nextError) => {
      handlers.setEntitlement(DEFAULT_ENTITLEMENT);
      handlers.setEntitlementStatus('error');
      handlers.setError(nextError.message);
    }
  );
};

/** True when the provider should operate in hosted mode for the current render. */
const isHostedEntitlementMode = (hostedAuthEnabled: boolean): boolean => Boolean(hostedAuthEnabled && db);

/** Provides one app-readable entitlement source of truth on top of auth. */
export const EntitlementProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { hostedAuthEnabled, status, user } = useAuth();
  const [billingConfig, setBillingConfig] = useState<BillingConfig>(DEFAULT_BILLING_CONFIG);
  const [entitlement, setEntitlement] = useState<UserEntitlementDocument>(DEFAULT_ENTITLEMENT);
  const [entitlementStatus, setEntitlementStatus] = useState<EntitlementStatus>(hostedAuthEnabled ? 'loading' : 'disabled');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBillingConfig().then(setBillingConfig);
  }, []);

  useEffect(() => {
    if (!isHostedEntitlementMode(hostedAuthEnabled)) {
      applyDisabledEntitlementState(setEntitlement, setEntitlementStatus, setError);
      return;
    }

    if (status === 'loading') {
      setEntitlementStatus('loading');
      return;
    }

    if (status !== 'signed_in' || !user) {
      applySignedOutEntitlementState(setEntitlement, setEntitlementStatus, setError);
      return;
    }

    setEntitlementStatus('loading');
    const unsubscribe = subscribeToEntitlements(user.uid, {
      setEntitlement,
      setEntitlementStatus,
      setError,
    });

    // skipcq: JS-0045 React effects intentionally return cleanup callbacks.
    return function cleanupEntitlementSubscription() {
      unsubscribe();
    };
  }, [hostedAuthEnabled, status, user]);

  /** Starts a Stripe checkout flow for the selected billing interval. */
  const openCheckout = useCallback(async (plan: 'monthly' | 'annual'): Promise<void> => {
    if (!user) {
      throw new Error('Sign in before starting checkout.');
    }
    if (!billingConfig.checkoutEnabled) {
      throw new Error('Billing is not available on this deployment yet.');
    }

    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: await createAuthHeaders(() => user.getIdToken()),
      body: JSON.stringify({ plan }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.url !== 'string') {
      throw new Error(typeof data.error === 'string' ? data.error : 'Unable to start checkout right now.');
    }

    redirectToBillingUrl(data.url);
  }, [billingConfig.checkoutEnabled, user]);

  /** Opens the Stripe billing portal for an existing customer. */
  const openBillingPortal = useCallback(async (): Promise<void> => {
    if (!user) {
      throw new Error('Sign in before opening billing management.');
    }

    const response = await fetch('/api/billing/portal', {
      method: 'POST',
      headers: await createAuthHeaders(() => user.getIdToken()),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.url !== 'string') {
      throw new Error(typeof data.error === 'string' ? data.error : 'Unable to open billing management right now.');
    }

    redirectToBillingUrl(data.url);
  }, [user]);

  const value = useMemo<EntitlementContextValue>(
    () => ({
      entitlementStatus,
      premiumActive: entitlement.premiumActive,
      planInterval: entitlement.planInterval,
      billingStatus: entitlement.billingStatus,
      effectiveSource: entitlement.effectiveSource,
      cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
      currentPeriodEnd: entitlement.currentPeriodEnd?.toDate?.() ?? null,
      stripeCustomerId: entitlement.stripeCustomerId,
      betaOverrideActive: entitlement.betaOverrideActive,
      checkoutEnabled: billingConfig.checkoutEnabled && hostedAuthEnabled,
      billingEnabled: billingConfig.billingEnabled,
      annualPromoActive: billingConfig.annualPromoActive,
      monthlyDisplayPrice: billingConfig.monthlyDisplayPrice,
      annualDisplayPrice: billingConfig.annualDisplayPrice,
      error,
      openCheckout,
      openBillingPortal,
    }),
    [billingConfig, entitlement, entitlementStatus, error, hostedAuthEnabled, openBillingPortal, openCheckout]
  );

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
};

/** Reads the current billing and entitlement state for the hosted product surfaces. */
export const useEntitlement = (): EntitlementContextValue => {
  const context = useContext(EntitlementContext);
  if (!context) {
    throw new Error('useEntitlement must be used within EntitlementProvider');
  }
  return context;
};
