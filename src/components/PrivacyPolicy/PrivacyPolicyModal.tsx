/**
 * Privacy-policy modal: this component presents the user-facing privacy
 * document, consent interaction, and accessible dialog lifecycle. It owns
 * modal presentation and local acknowledgment state; policy text and account
 * persistence are supplied by their respective boundaries.
 */
import ContactEmailLink from '../ContactEmailLink';
import React, { useState } from 'react';
import './PrivacyPolicyModal.css';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';
import { isProductAnalyticsEnabled, setProductAnalyticsEnabled, trackProductPageView } from '../../lib/productAnalytics';

// Bump this version string whenever the Privacy Policy changes materially.
// Users who accepted an older version will be asked to re-accept.
const PRIVACY_POLICY_VERSION = '1.8.0';
const PRIVACY_POLICY_LAST_UPDATED = 'November 8, 2026';
const STORAGE_KEY = 'gfc-privacy-policy-accepted';

// Changelog of material privacy-policy changes, keyed by the version that introduced them.
// When building the "What's New" list, only entries after the user's last-accepted version are shown.
const PRIVACY_POLICY_CHANGELOG: Record<string, string[]> = {
  '1.2.0': [
    'We added a disclosure for hosted error monitoring (Sentry) on production and beta deployments.',
    'Error monitoring does not use session replay and does not send IP addresses or cookies by default.',
    'Forecast map data is not attached to error reports; only limited diagnostic data is collected to fix bugs.',
  ],
  '1.3.0': [
    'We now use Google Analytics (GA4) to measure aggregate traffic on the production site.',
    'GA4 is loaded only on the hosted production domain, not on localhost development builds.',
  ],
  '1.4.0': [
    'We replaced Google Analytics and the previous hosted metrics collector with self-hosted Umami product analytics.',
    'Production and beta analytics are kept in separate reporting zones, and the same local preference can disable non-essential analytics for both.',
  ],
  '1.5.0': [
    'We clarified that cookie-free product analytics use a pseudonymous visitor/session identifier, not account identity.',
    'We added a clearer description of the coarse technical and IP-derived location information visible in our self-hosted analytics.',
  ],
  '1.6.0': [
    'Non-essential product analytics are now disabled by default and require a separate, optional opt-in.',
    'You can withdraw that telemetry permission at any time without affecting access to GFC.',
  ],
  '1.7.0': [
    'We minimized new product-analytics location collection and documented how to request access or deletion help for pseudonymous telemetry.',
    'We clarified that a fixed event-level telemetry retention period is still an unresolved operational decision.',
  ],
  '1.8.0': [
    'We added a section describing the optional Send feedback form: what it collects, where it is stored (Cloudflare and a private Discord channel), and how long it is kept.',
    'Feedback is kept until we delete it and is not removed automatically when you delete your account; you can ask us to delete it at any time.',
    'We now list Cloudflare among the infrastructure providers that process requests for the beta site and feedback service.',
    'Our contact address for privacy questions and deletion requests is now contact@gfcweather.com.',
  ],
};

/** Returns true if the user has accepted the current version of the Privacy Policy. */
export function hasAcceptedPrivacyPolicy(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === PRIVACY_POLICY_VERSION;
  } catch {
    return false;
  }
}

/** Returns true when the user previously accepted an older policy and must re-accept. */
export function isPrivacyPolicyUpgrade(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored != null && stored !== PRIVACY_POLICY_VERSION;
  } catch {
    return false;
  }
}

/** Returns the version string the user last accepted, or null if never accepted. */
export function getStoredVersion(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Returns the ordered list of changelog entries newer than `lastAcceptedVersion`. */
export function getWhatsNewItems(lastAcceptedVersion: string | null): string[] {
  const items: string[] = [];
  for (const [version, entries] of Object.entries(PRIVACY_POLICY_CHANGELOG)) {
    if (lastAcceptedVersion == null || version > lastAcceptedVersion) {
      items.push(...entries);
    }
  }
  return items;
}

// Records acceptance of the current Privacy Policy version in localStorage.
function acceptPrivacyPolicy(): void {
  try {
    localStorage.setItem(STORAGE_KEY, PRIVACY_POLICY_VERSION);
  } catch {
    // localStorage unavailable — allow usage anyway
  }
}

interface PrivacyPolicyModalProps {
  onAccept: () => void;
  viewOnly?: boolean;
  onClose?: () => void;
}

/** Highlights material changes in the current policy version for users who must re-accept. */
const PrivacyPolicyWhatsNew: React.FC<{ items: string[] }> = ({ items }) => (
  <aside className="privacy-whats-new" aria-labelledby="privacy-whats-new-title" role="note">
    <h3 id="privacy-whats-new-title">What&apos;s new in version {PRIVACY_POLICY_VERSION}</h3>
    <ul>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  </aside>
);

/** Lets people change the local, non-essential telemetry preference without creating an account. */
const ProductAnalyticsPreference: React.FC = () => {
  const [enabled, setEnabled] = useState(() => isProductAnalyticsEnabled());
  const handleChange = () => {
    const nextEnabled = !enabled;
    const effectiveEnabled = setProductAnalyticsEnabled(nextEnabled);
    // A consent action is the earliest permitted point to initialize analytics.
    // Record the page the person explicitly chose from; nothing is injected or queued beforehand.
    if (effectiveEnabled) trackProductPageView();
    setEnabled(effectiveEnabled);
  };

  return (
    <button type="button" role="switch" aria-checked={enabled} className="privacy-analytics-preference" onClick={handleChange}>
      <strong>Non-essential product analytics: {enabled ? 'Enabled' : 'Disabled'}</strong>
      <span>{enabled ? 'Withdraw telemetry permission' : 'Enable optional pseudonymous telemetry'}</span>
    </button>
  );
};

/** Renders the current in-app Privacy Policy content for both acceptance and view-only modes. */
const PrivacyPolicyContent: React.FC<{ whatsNewItems?: string[] }> = ({ whatsNewItems }) => (
  <>
    {whatsNewItems && whatsNewItems.length > 0 && <PrivacyPolicyWhatsNew items={whatsNewItems} />}
    <p>
      <strong>TL;DR:</strong> Your local forecasts stay on your device. If you choose to make an account, we only
      collect what is strictly necessary to sync your work and securely manage your subscription.
    </p>

    <section className="privacy-analytics-choice" aria-labelledby="privacy-analytics-choice-title">
      <div>
        <h3 id="privacy-analytics-choice-title">Optional product analytics</h3>
        <p>
          Help us understand which parts of GFC are useful. This is disabled by default and is a separate choice from
          accepting this Privacy Policy. It never affects access to GFC and can be changed here at any time.
        </p>
      </div>
      <ProductAnalyticsPreference />
    </section>

    <h3>1. Local-First by Default</h3>
    <p>
      If you use Graphical Forecast Creator (GFC) without creating an account, all of your forecast data, preferences,
      and cycle history remain stored locally on your device. We do not have access to this data.
    </p>

    <h3>2. Account &amp; Authentication Data</h3>
    <p>
      If you choose to create an account to sync your settings or use premium features, we authenticate you via
      Firebase Auth. We use essential session cookies strictly to keep you logged in and we store:
    </p>
    <ul>
      <li>Your email address.</li>
      <li>Your authentication provider (Google or Email/Password).</li>
      <li>Basic profile information (name/avatar).</li>
      <li>Your synced settings needed to keep the hosted account experience working across devices.</li>
    </ul>

    <h3>3. Premium Cloud Storage &amp; Encryption</h3>
    <p>
      If you subscribe to GFC Premium and actively use Cloud Saves, your forecast cycles, metadata, and discussions are
      stored securely, encrypted in transit and at rest, via Firebase. This data is stored strictly to provide
      cross-device synchronization. We do not sell this data or use it for advertising.
    </p>

    <h3>4. Payment Information</h3>
    <p>
      All payments are processed securely by Stripe. GFC does not collect, process, or store your credit card numbers
      or banking details. To operate subscriptions, we store limited billing metadata such as your subscription
      status, billing interval, renewal/cancellation state, and Stripe-linked customer or subscription identifiers
      needed to unlock and manage premium features.
    </p>

    <h3>5. Product Analytics &amp; Progress Metrics</h3>
    <p>
      To understand which hosted GFC workflows need improvement, we use self-hosted, cookie-free Umami product
      analytics on the production and beta deployments in separate reporting zones. It uses a pseudonymous
      visitor/session identifier to group activity from the same browser without attaching it to your GFC account. We
      collect page views, selected milestone events such as completed exports, cloud-save outcomes, workflow outcomes,
      and custom-layer creation, plus route/page activity, timestamps, and coarse technical information (browser,
      operating system, and device type). The Umami service can derive approximate location from an IP address, but GFC
      currently removes visitor IP addresses before they reach Umami, so new GFC telemetry does not include country,
      region, or city. <strong>We do not use account identity,
      Firebase UID, email address, forecast contents, coordinates, layer text, filenames, or export contents for
      product analytics.</strong>
    </p>
    <p>
      If you are signed in, we also store limited progress metrics tied to your account so we can show you your own
      activity inside GFC. This may include values such as active-day streak, total active days, forecast saves, cloud
      saves, discussions written, and verification sessions run. These account metrics are visible only to you inside
      your account view.
    </p>
    <p>
      Non-essential product analytics are disabled by default. You may optionally enable them using the local telemetry
      preference at the top of this policy; choosing not to enable them does not affect access to GFC. You can withdraw that permission at
      any time from the same control. When disabled, GFC does not load the Umami tracker or send product-analytics
      events. Analytics are hosted by GFC on our VPS and are not used for advertising, cross-site tracking, or sale of
      personal data. Beta and production are separate analytics zones. Because this telemetry is not linked to a
      Firebase account, Firebase account deletion does not identify a matching telemetry record. A fixed event-level
      telemetry retention period has not yet been adopted; we will publish and implement one before representing a
      fixed deletion schedule. For a telemetry access or deletion request, or any privacy question, contact us at the
      address in section 10 with the approximate date, browser/device, and route or event details you want us to locate.
    </p>
    <p>
      On production and beta hosted deployments, we use Sentry (a third-party error monitoring service) to capture
      application errors and limited performance data so we can fix bugs quickly. This is separate from product analytics
      above. We do not use Sentry for advertising or the sale of personal data. Error reports are designed to exclude
      forecast map payloads, do not use session replay, and are configured without sending IP addresses or cookies by
      default. Events are tagged by environment (production or beta) so staging issues stay separate from production.
    </p>

    <h3>6. Feedback You Send Us</h3>
    <p>
      The Send feedback form is optional and available to signed-in users; you can share feedback in our Discord
      instead if you prefer not to use it. When you send feedback we collect:
    </p>
    <ul>
      <li>The message you write and the type you choose (bug, idea, praise, question, or other).</li>
      <li>
        Technical context added automatically: the page you were on (path only, without query strings or
        fragments), the GFC version, whether you were using beta or production, your screen size, and your browser
        user-agent. We do not attach your forecast data.
      </li>
      <li>
        A one-way hash of your account identifier, created with a secret value. We use it only to limit spam and
        duplicate submissions; it is not your account identifier.
      </li>
      <li>
        Your email address, only if you tick &quot;You can email me about this feedback&quot; and your email address is
        verified. We contact you only if you opted in.
      </li>
    </ul>
    <p>
      Please do not put passwords, payment details, or other sensitive personal information in your message. We use
      feedback to fix bugs and decide what to build; we do not sell it or use it for advertising. Feedback is stored
      with Cloudflare (our feedback service and database), and a copy of each submission is posted to a private
      channel in our Discord server, where Discord&apos;s own privacy policy applies. Only GFC maintainers can read
      these. Cloudflare also processes requests to the feedback service and may keep routine technical logs, such as
      IP address and timestamps, under its own policies.
    </p>
    <p>
      We keep feedback until we delete it, and we may keep useful feedback after you delete your account because it
      is stored without your profile (it includes your email only if you opted in). Deleting your account does not
      automatically remove feedback you sent. To have specific feedback deleted, contact us at the address in
      section 10 and describe roughly when you sent it and what it said; we will remove it.
    </p>

    <h3>7. Data Retention &amp; Deletion</h3>
    <p>
      You own your data. You can delete your account from the Account page after confirming the request and
      authenticating again. The deletion process ends any subscription linked to the account, then permanently removes
      your cloud-hosted cycles, profile data, synced settings, user-linked progress metrics, billing linkage, and
      Firebase sign-in. Your local, offline saves remain untouched on your device. If cleanup cannot finish, the
      sign-in is kept available so you can retry. We retain a one-way hash of the deleted Firebase identifier as a
      deletion-safety marker so delayed billing events cannot recreate the account; it contains no email, profile,
      settings, metrics, or forecast content. Stripe may retain transaction records it is independently required to
      keep for payment, fraud-prevention, tax, or legal purposes. Feedback you sent through the feedback form is
      described in section 6 and is not removed automatically when you delete your account.
    </p>
    <p>
      Aggregate admin metrics may be retained in a non-user-specific form for product operations. Short-lived dedupe
      records used for daily unique counts are intended to expire automatically after a limited retention window.
    </p>

    <h3>8. Age Restrictions</h3>
    <p>
      GFC is intended for general audiences and is not directed at children under the age of 13. By creating an
      account, you confirm you are 13 years of age or older.
    </p>

    <h3>9. Security &amp; Breach Notification</h3>
    <p>
      We rely on enterprise-grade infrastructure from Google (Firebase), Stripe, and Cloudflare to keep your data safe. In the
      unlikely event of a data breach that compromises your account information, we will notify affected users via
      email as quickly as legally and technically possible.
    </p>

    <h3>10. Policy Changes &amp; Contact</h3>
    <p>
      We may update this policy as GFC evolves. Significant changes will be communicated via in-app notices or email.
      For privacy questions, or to request manual data deletion, contact us at{' '}
      <ContactEmailLink />.
    </p>
  </>
);

/** Renders the footer used when the privacy policy is opened in view-only mode. */
const PrivacyPolicyViewOnlyFooter: React.FC<{ onClose?: () => void }> = ({ onClose }) => (
  <div className="privacy-modal-footer">
    <div className="privacy-button-row">
      <button className="privacy-btn-decline" onClick={onClose}>
        Close
      </button>
    </div>
  </div>
);

/** Renders the footer used when the user must acknowledge the privacy policy before continuing. */
const PrivacyPolicyAcceptanceFooter: React.FC<{
  checked: boolean;
  onCheckedChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDecline: () => void;
  onAccept: () => void;
}> = ({ checked, onCheckedChange, onDecline, onAccept }) => (
  <div className="privacy-modal-footer">
    <label className="privacy-checkbox-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={onCheckedChange}
      />
      I have read and agree to the Privacy Policy. I understand what data stays local, what data may be stored for
      hosted features, product analytics, and error monitoring as described in this policy.
    </label>
    <div className="privacy-button-row">
      <button className="privacy-btn-decline" onClick={onDecline}>
        Decline
      </button>
      <button className="privacy-btn-accept" onClick={onAccept} disabled={!checked}>
        Accept &amp; Continue
      </button>
    </div>
  </div>
);

/** Renders the privacy policy title block and optional close action. */
const PrivacyPolicyHeader: React.FC<{ viewOnly: boolean; onClose?: () => void }> = ({ viewOnly, onClose }) => (
  <div className="privacy-modal-header">
    <div className="privacy-modal-header-row">
      <div>
        <h2 id="privacy-title">Privacy Policy</h2>
        <p>
          {viewOnly
            ? `Version ${PRIVACY_POLICY_VERSION} — Last updated ${PRIVACY_POLICY_LAST_UPDATED}`
            : `Please read and accept before using Graphical Forecast Creator — Last updated ${PRIVACY_POLICY_LAST_UPDATED}`}
        </p>
      </div>
      {viewOnly && (
        <button className="privacy-close-view-btn" onClick={onClose} aria-label="Close">
          &times;
        </button>
      )}
    </div>
  </div>
);

/** Displays the GFC Privacy Policy in either acceptance or read-only mode. */
const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ onAccept, viewOnly = false, onClose }) => {
  const [checked, setChecked] = useState(false);
  const { setModalRef } = useModalFocusTrap({ active: true, onClose: viewOnly ? onClose : undefined });

  /** Accepts the current policy version and lets the user continue into the app. */
  const handleAccept = () => {
    if (!checked) return;
    acceptPrivacyPolicy();
    onAccept();
  };

  /** Redirects away from the app when the user declines the required privacy agreement. */
  const handleDecline = () => {
    window.location.href = 'https://weather.gov';
  };

  /** Keeps local checkbox state in sync with the acceptance form. */
  const handleCheckedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChecked(e.target.checked);
  };

  return (
    <div className="privacy-backdrop" role="dialog" aria-modal="true" aria-labelledby="privacy-title" ref={setModalRef}>
      <div className="privacy-modal">
        <PrivacyPolicyHeader viewOnly={viewOnly} onClose={onClose} />
        <div className="privacy-modal-body">
          <PrivacyPolicyContent
            whatsNewItems={!viewOnly && isPrivacyPolicyUpgrade() ? getWhatsNewItems(getStoredVersion()) : undefined}
          />
        </div>

        {viewOnly ? (
          <PrivacyPolicyViewOnlyFooter onClose={onClose} />
        ) : (
          <PrivacyPolicyAcceptanceFooter
            checked={checked}
            onCheckedChange={handleCheckedChange}
            onDecline={handleDecline}
            onAccept={handleAccept}
          />
        )}
      </div>
    </div>
  );
};

export default PrivacyPolicyModal;
