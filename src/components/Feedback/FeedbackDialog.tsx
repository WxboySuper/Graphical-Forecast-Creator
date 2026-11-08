/**
 * Feedback dialog. Collects a category and message from a signed-in user and
 * submits it to the feedback service; signed-out users are routed to sign in or Discord.
 */
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { CheckCircle2, LoaderCircle, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { useAuth } from '../../auth/AuthProvider';
import {
  DISCORD_INVITE_URL,
  FEEDBACK_CATEGORIES,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  isBetaBuild,
  type FeedbackCategory,
} from '../../config/feedback';
import { FeedbackSubmitError, submitFeedback } from '../../lib/feedbackClient';
import { cn } from '../../lib/utils';

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Shown when no hosted account is signed in. */
const SignedOutNotice: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      Sign in to send feedback straight from the site. Signing in keeps spam out and lets us follow up if you want us to.
      Prefer not to sign in? Share it in the Discord instead.
    </p>
    <DialogFooter className="gap-2 sm:gap-0">
      <Button asChild variant="outline">
        <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer">Open Discord</a>
      </Button>
      <Button asChild onClick={onClose}>
        <Link to="/account">Sign in</Link>
      </Button>
    </DialogFooter>
  </div>
);

/** Confirmation shown after a successful submission. */
const SentNotice: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="space-y-4" role="status">
    <div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-3">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-sm">Thanks. Your feedback went straight to the GFC team and will be read.</p>
    </div>
    <DialogFooter>
      <Button onClick={onClose}>Done</Button>
    </DialogFooter>
  </div>
);

/** The submit form for a signed-in user. */
const FeedbackForm: React.FC<{ onSent: () => void }> = ({ onSent }) => {
  const { user } = useAuth();
  const location = useLocation();
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [contactOk, setContactOk] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedLength = message.trim().length;
  const canSend = Boolean(user) && !sending && trimmedLength >= FEEDBACK_MIN_LENGTH;

  /** Submits the entry and reports success or a friendly failure. */
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !canSend) return;
    setSending(true);
    setError(null);
    try {
      await submitFeedback(user, { category, message, contactOk, page: location.pathname });
      onSent();
    } catch (err) {
      setError(err instanceof FeedbackSubmitError ? err.message : 'Feedback could not be sent right now. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        handleSubmit(event).catch(() => undefined);
      }}
    >
      <div role="radiogroup" aria-label="Feedback type" className="flex flex-wrap gap-2">
        {FEEDBACK_CATEGORIES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={category === option.id}
            onClick={() => setCategory(option.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              category === option.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background hover:bg-muted'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="feedback-message" className="text-sm font-medium">
          What happened, or what would you like to see?
        </label>
        <Textarea
          id="feedback-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={FEEDBACK_MAX_LENGTH}
          rows={6}
          placeholder="Steps, what you expected, what you saw. Please don't include passwords or personal info."
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{trimmedLength < FEEDBACK_MIN_LENGTH ? `At least ${FEEDBACK_MIN_LENGTH} characters` : 'Looks good'}</span>
          <span>{message.length}/{FEEDBACK_MAX_LENGTH}</span>
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={contactOk}
          onChange={(event) => setContactOk(event.target.checked)}
          className="mt-1"
        />
        <span>You can email me about this feedback ({user?.email ?? 'your account email'}).</span>
      </label>

      <p className="text-xs text-muted-foreground">
        We attach the page you are on, app version, and screen size. Forecast contents are never sent.
      </p>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="submit" disabled={!canSend}>
          {sending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
          Send feedback
        </Button>
      </DialogFooter>
    </form>
  );
};

/** Feedback dialog used by every feedback entry point. */
export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ open, onOpenChange }) => {
  const { status, user } = useAuth();
  const [sent, setSent] = useState(false);
  const signedIn = status === 'signed_in' && Boolean(user);

  /** Clears the success state when the dialog closes so it reopens as a fresh form. */
  const handleOpenChange = (next: boolean) => {
    if (!next) setSent(false);
    onOpenChange(next);
  };

  let body: React.ReactNode;
  if (!signedIn) {
    body = <SignedOutNotice onClose={() => handleOpenChange(false)} />;
  } else if (sent) {
    body = <SentNotice onClose={() => handleOpenChange(false)} />;
  } else {
    body = <FeedbackForm onSent={() => setSent(true)} />;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isBetaBuild() ? 'Send beta feedback' : 'Send feedback'}</DialogTitle>
          <DialogDescription>
            {isBetaBuild()
              ? 'You are testing features before release. Tell us what works and what does not.'
              : 'Tell us what is working, what is broken, or what you want next.'}
          </DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
};

export default FeedbackDialog;
