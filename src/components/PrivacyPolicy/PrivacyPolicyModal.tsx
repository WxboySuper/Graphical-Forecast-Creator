import React, { useState } from 'react';
import './PrivacyPolicyModal.css';

// Bump this version string whenever the Privacy Policy changes materially.
// Users who accepted an older version will be asked to re-accept.
const PRIVACY_POLICY_VERSION = '1.1.0';
const STORAGE_KEY = 'gfc-privacy-policy-accepted';

/** Returns true if the user has accepted the current version of the Privacy Policy. */
export function hasAcceptedPrivacyPolicy(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === PRIVACY_POLICY_VERSION;
  } catch {
    return false;
  }
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

/** Renders the current in-app Privacy Policy content for both acceptance and view-only modes. */
const PrivacyPolicyContent: React.FC = () => (
  <>
    <p>
      <strong>TL;DR:</strong> Your local forecasts stay on your device. If you choose to make an account, we only
      collect what is strictly necessary to sync your work and securely manage your subscription.
    </p>

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
      To monitor the health of the hosted service, we collect privacy-conscious product telemetry such as signups,
      sign-ins, cloud saves/loads, verification runs, and aggregate storage usage.{' '}
      <strong>We do not log raw IP addresses for product analytics</strong>, and your forecast payload contents are
      never exposed to our metrics dashboard.
    </p>
    <p>
      If you are signed in, we also store limited progress metrics tied to your account so we can show you your own
      activity inside GFC. This may include values such as active-day streak, total active days, forecast saves, cloud
      saves, discussions written, and verification sessions run. These account metrics are visible only to you inside
      your account view.
    </p>
    <p>
      We also generate a browser-scoped anonymous installation identifier to help estimate daily active devices without
      relying on long-term raw IP storage. Where possible, admin metrics are aggregated by day and shown only in
      aggregate form.
    </p>
    <p>
      Separately from product metrics, the hosted service may keep short operational request logs such as page path,
      referrer, timestamp, and user-agent for maintenance and debugging. These logs are not used to inspect forecast
      contents and are kept separate from the product metrics dashboard.
    </p>

    <h3>6. Data Retention &amp; Deletion</h3>
    <p>
      You own your data. You have the right to delete your account and associated cloud data at any time. Upon account
      deletion, your cloud-hosted cycles, profile data, synced settings, and user-linked progress metrics will be
      permanently removed from our Firebase servers. Your local, offline saves will remain completely untouched on your
      device.
    </p>
    <p>
      Aggregate admin metrics may be retained in a non-user-specific form for product operations. Short-lived dedupe
      records used for daily unique counts are intended to expire automatically after a limited retention window.
    </p>

    <h3>7. Age Restrictions</h3>
    <p>
      GFC is intended for general audiences and is not directed at children under the age of 13. By creating an
      account, you confirm you are 13 years of age or older.
    </p>

    <h3>8. Security &amp; Breach Notification</h3>
    <p>
      We rely on enterprise-grade infrastructure from Google (Firebase) and Stripe to keep your data safe. In the
      unlikely event of a data breach that compromises your account information, we will notify affected users via
      email as quickly as legally and technically possible.
    </p>

    <h3>9. Policy Changes &amp; Contact</h3>
    <p>
      We may update this policy as GFC evolves. Significant changes will be communicated via in-app notices or email.
      For privacy questions, or to request manual data deletion, contact us at{' '}
      <a href="mailto:alex@weatherboysuper.com">alex@weatherboysuper.com</a>.
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
      hosted features, and how GFC handles anonymous product analytics.
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
        <p>Please read and accept before using Graphical Forecast Creator &mdash; Last Updated March 30, 2026</p>
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
    <div className="privacy-backdrop" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
      <div className="privacy-modal">
        <PrivacyPolicyHeader viewOnly={viewOnly} onClose={onClose} />
        <div className="privacy-modal-body">
          <PrivacyPolicyContent />
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
