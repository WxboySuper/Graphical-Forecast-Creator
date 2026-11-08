/**
 * Feedback submission client. Sends one authenticated feedback entry to the
 * feedback service and maps failures to user-presentable messages.
 */
import type { User } from 'firebase/auth';
import { getBuildTarget } from '../config/buildTarget';
import { getFeedbackApiUrl, type FeedbackCategory } from '../config/feedback';

export interface FeedbackSubmission {
  category: FeedbackCategory;
  message: string;
  contactOk: boolean;
  /** Router pathname only; query strings and hashes are never sent. */
  page: string;
}

export class FeedbackSubmitError extends Error {}

const STATUS_MESSAGES: Record<number, string> = {
  401: 'Your sign-in expired. Please sign in again and retry.',
  403: 'Feedback could not be accepted from this site.',
  413: 'That message is too long.',
  429: 'You have sent a lot of feedback recently. Please wait a few minutes and try again.',
};

/** Reduces a location to a bare pathname so user-specific query data stays local. */
export const toFeedbackPagePath = (pathname: string): string => pathname.split(/[?#]/)[0].slice(0, 200) || '/';

/** Posts feedback and resolves with the new entry id. */
export const submitFeedback = async (user: User, submission: FeedbackSubmission): Promise<string> => {
  const baseUrl = getFeedbackApiUrl();
  if (!baseUrl) {
    throw new FeedbackSubmitError('Feedback is not available on this build.');
  }

  const buildTarget = getBuildTarget();
  const token = await user.getIdToken();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/feedback`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: submission.category,
        message: submission.message.trim(),
        page: toFeedbackPagePath(submission.page),
        appVersion: __GFC_APP_VERSION__.slice(0, 40),
        buildTarget: buildTarget === 'beta' ? 'beta' : 'production',
        contactOk: submission.contactOk,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      }),
    });
  } catch {
    throw new FeedbackSubmitError('Could not reach the feedback service. Check your connection and try again.');
  }

  if (!response.ok) {
    throw new FeedbackSubmitError(STATUS_MESSAGES[response.status] ?? 'Feedback could not be sent right now. Please try again.');
  }

  const data = (await response.json().catch(() => ({}))) as { id?: unknown };
  return typeof data.id === 'string' ? data.id : '';
};
