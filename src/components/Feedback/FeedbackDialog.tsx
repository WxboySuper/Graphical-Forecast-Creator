/**
 * Feedback dialog. Collects a category and message from a signed-in user and
 * submits it to the feedback service; signed-out users are routed to sign in or Discord.
 */
import React, { useRef, useState } from 'react';
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

/** Pill-style category picker. */
const CategoryPicker: React.FC<{ value: FeedbackCategory; onChange: (next: FeedbackCategory) => void }> = ({ value, onChange }) => (
  <div role="radiogroup" aria-label="Feedback type" className="flex flex-wrap gap-2">
    {FEEDBACK_CATEGORIES.map((option) => (
      <button
        key={option.id}
        type="button"
        role="radio"
        aria-checked={value === option.id}
        onClick={() => onChange(option.id)}
        className={cn(
          'rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          value === option.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:bg-muted'
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);

/** Message textarea with a live length hint. */
const MessageField: React.FC<{ value: string; onChange: (next: string) => void }> = ({ value, onChange }) => {
  const trimmedLength = value.trim().length;
  const hint = trimmedLength < FEEDBACK_MIN_LENGTH ? `At least ${FEEDBACK_MIN_LENGTH} characters` : 'Looks good';
  return (
    <div className="space-y-1.5">
      <label htmlFor="feedback-message" className="text-sm font-medium">
        What happened, or what would you like to see?
      </label>
      <Textarea
        id="feedback-message"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={FEEDBACK_MAX_LENGTH}
        rows={6}
        placeholder="Steps, what you expected, what you saw. Please don't include passwords or personal info."
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{hint}</span>
        <span>{value.length}/{FEEDBACK_MAX_LENGTH}</span>
      </div>
    </div>
  );
};

/** Draft state and submit action for the feedback form. */
const useFeedbackDraft = (onSent: () => void) => {
  const { user } = useAuth();
  const location = useLocation();
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [contactOk, setContactOk] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSend = Boolean(user) && !sending && message.trim().length >= FEEDBACK_MIN_LENGTH;

  /** Submits the entry and reports success or a friendly failure. */
  const submit = async () => {
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

  return { user, category, setCategory, message, setMessage, contactOk, setContactOk, sending, error, canSend, submit };
};

/** The submit form for a signed-in user. */
const FeedbackForm: React.FC<{ onSent: () => void }> = ({ onSent }) => {
  const draft = useFeedbackDraft(onSent);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        draft.submit().catch(() => undefined);
      }}
    >
      <CategoryPicker value={draft.category} onChange={draft.setCategory} />
      <MessageField value={draft.message} onChange={draft.setMessage} />

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.contactOk}
          onChange={(event) => draft.setContactOk(event.target.checked)}
          className="mt-1"
        />
        <span>You can email me about this feedback ({draft.user?.email ?? 'your account email'}).</span>
      </label>

      <p className="text-xs text-muted-foreground">
        We attach the page you are on, app version, and screen size. Forecast contents are never sent.
      </p>

      {draft.error ? <p role="alert" className="text-sm text-destructive">{draft.error}</p> : null}

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="submit" disabled={!draft.canSend}>
          {draft.sending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
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
  // Bumped on every close so a submission finishing after the dialog closed cannot mark a later session as sent.
  const sessionRef = useRef(0);
  const signedIn = status === 'signed_in' && Boolean(user);

  /** Clears the success state when the dialog closes so it reopens as a fresh form. */
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      sessionRef.current += 1;
      setSent(false);
    }
    onOpenChange(next);
  };

  let body: React.ReactNode;
  if (!signedIn) {
    body = <SignedOutNotice onClose={() => handleOpenChange(false)} />;
  } else if (sent) {
    body = <SentNotice onClose={() => handleOpenChange(false)} />;
  } else {
    const session = sessionRef.current;
    body = <FeedbackForm onSent={() => { if (sessionRef.current === session) setSent(true); }} />;
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
