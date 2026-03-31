/** True when this build targets the locked beta deployment. */
export const isBetaModeEnabled = (): boolean => __GFC_BETA_MODE__;

/** Optional invite-path segment used by the beta onboarding URL. */
export const getBetaInvitePath = (): string => __GFC_BETA_INVITE_PATH__.trim();
