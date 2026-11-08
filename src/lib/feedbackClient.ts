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
  503: 'Feedback is temporarily unavailable. Please try again in a minute.',
  429: 'You have sent a lot of feedback recently. Please wait a few minutes and try again.',
};

/** Reduces a location to a bare pathname so user-specific query data stays local. */
export const toFeedbackPagePath = (pathname: string): string => pathname.split(/[?#]/)[0].slice(0, 200) || '/';

/** Builds the JSON body documented by the feedback service contract. */
const buildPayload = (submission: FeedbackSubmission) => ({
  category: submission.category,
  message: submission.message.trim(),
  page: toFeedbackPagePath(submission.page),
  appVersion: __GFC_APP_VERSION__.slice(0, 40),
  buildTarget: getBuildTarget() === 'beta' ? 'beta' : 'production',
  contactOk: submission.contactOk,
  viewport: `${window.innerWidth}x${window.innerHeight}`,
});

/** Sends the request, translating network failures into a presentable error. */
const postFeedback = async (baseUrl: string, token: string, body: unknown): Promise<Response> => {
  try {
    return await fetch(`${baseUrl}/v1/feedback`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new FeedbackSubmitError('Could not reach the feedback service. Check your connection and try again.');
  }
};

/** Reads the created entry id, tolerating an empty or malformed body. */
const readEntryId = async (response: Response): Promise<string> => {
  const data = (await response.json().catch(() => ({}))) as { id?: unknown };
  return typeof data.id === 'string' ? data.id : '';
};

/** Posts feedback and resolves with the new entry id. */
export const submitFeedback = async (user: User, submission: FeedbackSubmission): Promise<string> => {
  const baseUrl = getFeedbackApiUrl();
  if (!baseUrl) {
    throw new FeedbackSubmitError('Feedback is not available on this build.');
  }

  if (typeof user.getIdToken !== 'function') {
    throw new FeedbackSubmitError('Feedback needs a hosted GFC account. Sign in with a hosted account to send it.');
  }
  const response = await postFeedback(baseUrl, await user.getIdToken(), buildPayload(submission));
  if (!response.ok) {
    throw new FeedbackSubmitError(STATUS_MESSAGES[response.status] ?? 'Feedback could not be sent right now. Please try again.');
  }
  return readEntryId(response);
};
