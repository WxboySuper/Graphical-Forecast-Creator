/**
 * Telemetry consent UI: the one-time "Help improve GFC?" prompt and the settings dialog
 * for changing that choice later. State lives in `src/lib/telemetry`; these components only
 * present the choice and never send events themselves.
 */
import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { useTelemetryConsent } from '../../lib/telemetry';

const PRIVACY_POLICY_URL = 'https://gfcweather.com/privacy/';

/** Explains what is counted and links to the full policy. Shared by the prompt and the settings dialog. */
const ConsentExplanation: React.FC = () => (
  <>
    <DialogDescription>
      Help improve GFC? Share anonymous counts of which features get used. No personal info, ever.
    </DialogDescription>
    <p className="text-sm text-muted-foreground">
      GFC only counts what happens, such as which tools get used, with your country and the app version. It never
      records who you are, your forecasts, or what you type.{' '}
      <a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer" className="underline">
        Read how it works
      </a>
      .
    </p>
  </>
);

/** Asks once, with equal choices and nothing preselected, and stays closed after any answer. */
export const TelemetryConsentPrompt: React.FC = () => {
  const [consent, setConsent] = useTelemetryConsent();

  return (
    // Closing the prompt any other way counts as "No thanks": nothing is sent and it is not asked again.
    <Dialog open={consent === 'unset'} onOpenChange={(open) => { if (!open) setConsent('denied'); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Help improve GFC?</DialogTitle>
        </DialogHeader>
        <ConsentExplanation />
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setConsent('denied')}>
            No thanks
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setConsent('granted')}>
            Allow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface TelemetrySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Lets people turn optional feature-usage sharing on or off at any time. */
export const TelemetrySettingsDialog: React.FC<TelemetrySettingsDialogProps> = ({ open, onOpenChange }) => {
  const [consent, setConsent] = useTelemetryConsent();
  const enabled = consent === 'granted';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Usage data</DialogTitle>
        </DialogHeader>
        <ConsentExplanation />
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setConsent(enabled ? 'denied' : 'granted')}
          className="flex w-full items-center justify-between rounded-md border border-border px-4 py-3 text-left text-sm"
        >
          <span>Share anonymous feature counts</span>
          <strong>{enabled ? 'On' : 'Off'}</strong>
        </button>
        <p className="text-xs text-muted-foreground">
          Separate from this choice, GFC counts daily unique visitors and active accounts without storing who they are,
          and sends error reports. These are described in the Privacy Policy.
        </p>
      </DialogContent>
    </Dialog>
  );
};
