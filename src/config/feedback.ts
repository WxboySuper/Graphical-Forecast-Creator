/**
 * Feedback configuration. Resolves whether this build is the public beta and
 * where the feedback service lives; it holds no UI or submission logic.
 */
import { getBuildTarget } from './buildTarget';

export const DISCORD_INVITE_URL = 'https://discord.gg/SGk37rg8sz';

export const FEEDBACK_CATEGORIES = [
  { id: 'bug', label: 'Bug' },
  { id: 'idea', label: 'Idea' },
  { id: 'praise', label: 'Praise' },
  { id: 'question', label: 'Question' },
  { id: 'other', label: 'Other' },
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]['id'];

export const FEEDBACK_MIN_LENGTH = 10;
export const FEEDBACK_MAX_LENGTH = 4000;

/** True for the public open-beta deployment (beta.gfcweather.com). */
export const isBetaBuild = (): boolean => getBuildTarget() === 'beta';

/** Feedback is offered everywhere the product is hosted; local dev builds keep it hidden. */
export const isFeedbackEnabled = (): boolean => {
  const target = getBuildTarget();
  return (target === 'beta' || target === 'production') && Boolean(getFeedbackApiUrl());
};

/** Base URL of the feedback service, without a trailing slash. */
export const getFeedbackApiUrl = (): string => {
  const configured = typeof __GFC_FEEDBACK_API_URL__ === 'string' ? __GFC_FEEDBACK_API_URL__ : '';
  return configured.trim().replace(/\/+$/, '');
};
