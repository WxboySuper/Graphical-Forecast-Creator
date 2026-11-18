/**
 * Terms-of-service modal: this component presents the current user-facing terms
 * document and its accessible acknowledgment dialog. It owns modal lifecycle
 * and local interaction state; legal text and account persistence are kept in
 * their separate content and policy boundaries.
 */
import ContactEmailLink from '../ContactEmailLink';
import React, { useState } from 'react';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';
import './ToSModal.css';

// Bump this version string whenever the ToS changes materially.
// Users who accepted an older version will be asked to re-accept.
const TOS_VERSION = '3';
const STORAGE_KEY = 'gfc-tos-accepted';

/** Returns true if the user has accepted the current version of the Terms of Service. */
export function hasAcceptedToS(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === TOS_VERSION;
  } catch {
    return false;
  }
}

// Function to record that the user has accepted the Terms of Service by saving the current ToS version in localStorage. If localStorage is unavailable (e.g., in private browsing mode), it will fail silently, allowing the app to function without persistent acceptance but potentially prompting the user again in future sessions.
function acceptToS(): void {
  try {
    localStorage.setItem(STORAGE_KEY, TOS_VERSION);
  } catch {
    // localStorage unavailable — allow usage anyway
  }
}

interface ToSModalProps {
  onAccept: () => void;
  viewOnly?: boolean;
  onClose?: () => void;
}

/** Renders the current in-app Terms of Service content for both acceptance and view-only modes. */
const ToSTermsContent: React.FC = () => (
  <>
    <h3>1. Unofficial Use &amp; Disclaimer (Critical)</h3>
    <p>
      GFC is intended solely as a <strong>creative and educational tool</strong>. It is <strong>NOT</strong> an official
      source of weather warnings, watches, or advisories. GFC is not affiliated with, endorsed by, or connected to the
      National Weather Service (NWS), the Storm Prediction Center (SPC), NOAA, or any government agency. All forecasts
      and graphics created within GFC are entirely unofficial. <strong>Do not use this app to make decisions that affect
      your safety, property, or the safety of others.</strong> Always consult official sources (e.g.,&nbsp;
      <a href="https://weather.gov" target="_blank" rel="noopener noreferrer">weather.gov</a>) for authoritative
      weather information.
    </p>
    <p><strong>GFC DOES NOT ISSUE OR DELIVER WARNINGS, AND IT IS NOT A SUBSTITUTE FOR OFFICIAL NWS OR SPC WARNINGS, WATCHES, OR OUTLOOKS, OR FOR INSTRUCTIONS FROM LOCAL EMERGENCY OFFICIALS.</strong> In dangerous weather, follow official warnings and local officials, and call 911 (or your local emergency number) in an emergency. Weather data shown inside GFC, such as model data, radar, satellite imagery, alerts, storm reports, and population estimates, can be delayed, incomplete, wrong, or unavailable without notice.</p>

    <h3>2. User Responsibility &amp; Proper Use</h3>
    <p>
      You are fully and solely responsible for any graphics, forecasts, and discussions you create using GFC. You
      agree <strong>NOT</strong> to use GFC to:
    </p>
    <ul>
      <li>Create or distribute graphics intended to incite public panic or spread misinformation.</li>
      <li>Impersonate, replicate, or misrepresent official government products, agencies, or forecasts.</li>
      <li>
        Distribute graphics or forecasts without clearly and prominently labeling them as{' '}
        <em>&quot;Unofficial&quot;</em> or <em>&quot;Experimental.&quot;</em>
      </li>
      <li>Remove, crop out, or obscure the &quot;Unofficial&quot; label that GFC adds to exported graphics and discussions.</li>
      <li>Harass, threaten, or harm any individual or group.</li>
      <li>Violate any applicable local, state, federal, or international laws.</li>
      <li>Overload, scrape, or bulk-download GFC&apos;s servers or data services (including model tiles and feedback endpoints), or try to get around rate limits, security, or premium checks.</li>
    </ul>

    <h3>3. License to Use</h3>
    <p>
      We grant you a personal, non-exclusive, non-transferable, revocable license to use GFC for personal,
      educational, or non-commercial research purposes. Any graphics or content you generate using the App remain
      your property. GFC does not claim ownership over your created content. You are solely responsible for how you
      share, publish, or distribute any content created with the App.
    </p>
    <p>If you send us feedback, ideas, or suggestions (for example through the in-app Send feedback form), you agree that we may use them to improve GFC without any obligation or payment to you. This does not give us ownership of your forecasts.</p>

    <h3>4. Limitation of Liability</h3>
    <p>
      TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, the creator of GFC (Alex/wxboysuper) shall not be liable
      for any damages of any kind, including direct, indirect, incidental, special, consequential, or punitive
      damages, arising from:
    </p>
    <ul>
      <li>Your use of, or inability to use, the App.</li>
      <li>Any actions taken by you or any third party based on forecasts, graphics, or discussions generated by the App.</li>
      <li>
        Errors, inaccuracies, or omissions within mapping data, storm reports, or any other data displayed in the App.
      </li>
      <li>Unauthorized access to or alteration of your data.</li>
    </ul>
    <p>
      You expressly acknowledge that GFC is provided for entertainment and educational purposes only, and that any
      reliance on content generated by GFC for real-world safety or operational decisions is entirely at your own
      risk.
    </p>
    <p><strong>TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, THE TOTAL LIABILITY OF THE CREATOR OF GFC FOR ALL CLAIMS RELATING TO GFC OR THESE TERMS IS LIMITED TO THE GREATER OF (A) THE AMOUNT YOU PAID FOR GFC PREMIUM IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM, OR (B) US $10.</strong></p>
    <p>Some jurisdictions do not allow certain warranties or liabilities to be excluded or limited. In those places, the limits in sections 4 and 5 apply only to the extent the law allows, and nothing in these Terms limits liability that cannot legally be limited.</p>

    <h3>5. &quot;As-Is&quot; Service</h3>
    <p>
      GFC is provided on an <strong>&quot;As-Is&quot;</strong> and <strong>&quot;As-Available&quot;</strong> basis without warranties
      of any kind, <strong>INCLUDING ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
      ACCURACY, AND NON-INFRINGEMENT</strong>. We do not guarantee uninterrupted, error-free, or secure operation, nor
      that any data (CWA boundaries, storm reports, map layers, model data, radar and satellite imagery, alerts, or
      population estimates) will be accurate, complete, or current.
    </p>

    <h3>6. Indemnification</h3>
    <p>
      You agree to indemnify, defend, and hold harmless the creator of GFC (Alex/wxboysuper) from and against any
      and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys&apos; fees)
      arising out of or related to your use of the App, any forecasts, graphics, or discussions you create, share, or
      publish with the App (including any reliance others place on them), your violation of these Terms, or your violation of any
      rights of another person or entity.
    </p>

    <h3>7. Modifications to Terms</h3>
    <p>
      We retain the right to update or modify these Terms at any time. Material changes will be communicated by
      updating the effective date or prompting re-acceptance within the App. Your continued use of the App after
      changes are posted constitutes your acceptance of the revised Terms.
    </p>

    <h3>8. Termination of Access</h3>
    <p>
      We reserve the right to suspend or terminate your access to the App or its associated community (Discord) at
      our sole discretion if you misuse the tool or violate these Terms, without prior notice or liability to you.
      You may stop using GFC at any time and can delete your account from the Account page. Sections 1, 3 (ownership
      and feedback), 4, 5, 6, and 9 continue to apply after your access ends.
    </p>

    <h3>9. Governing Law</h3>
    <p>
      These Terms shall be governed by and construed in accordance with the laws of the State of Oklahoma, United
      States, without regard to its conflict of law provisions. Any disputes arising under these Terms shall be
      subject to the exclusive jurisdiction of the courts located in Oklahoma.
    </p>

    <h3>10. Contact Us</h3>
    <p>
      If you have any questions regarding these Terms, please reach out via the{' '}
      <a href="https://discord.gg/SGk37rg8sz" target="_blank" rel="noopener noreferrer">official GFC Support Discord</a>
      {' '}or email <ContactEmailLink />.
    </p>

    <h3>11. Accounts, Premium Subscriptions, and Billing</h3>
    <p>
      GFC offers an optional premium subscription for hosted cloud storage and cross-device synchronization.
      Forecasting itself remains free. You must be at least 13 years old to create an account. If you are under the
      age of majority where you live, a parent or guardian must agree to these Terms and handle any purchase.
    </p>
    <ul>
      <li>Payments are processed securely via Stripe. The current price is shown on the Pricing page and at checkout before you pay. Prices may include or be subject to applicable taxes.</li>
      <li><strong>Subscriptions renew automatically</strong> on a monthly or annual basis, depending on your selected plan, and you will be charged the then-current price at each renewal until you cancel.</li>
      <li>You may cancel your subscription at any time from your Account page (which opens Stripe&apos;s billing portal). Cancellation stops future renewals.</li>
      <li>Upon cancellation, you will retain access to premium features until the end of your current paid billing cycle.</li>
      <li><strong>Refunds:</strong> Except where required by law, payments are non-refundable and we do not provide refunds or credits for partial billing periods. We may grant a refund at our discretion; contact contact@gfcweather.com. If a renewal is charged after you have deleted your account, that charge is refunded automatically.</li>
      <li>If you delete your account, any active subscription ends immediately as part of the deletion, and the remaining time is not refunded unless required by law.</li>
      <li>If we change the subscription price, we will give you notice before it applies to your next renewal, and you can cancel before then.</li>
      <li>GFC does not store, process, or have direct access to your credit card or banking details.</li>
    </ul>

    <h3>12. Cloud Storage &amp; &quot;Best Effort&quot; Service</h3>
    <p>
      Premium cloud storage features are provided on a <strong>&quot;best-effort&quot;</strong> basis. While we utilize
      enterprise-grade infrastructure (Firebase) to secure and sync your data, we do not guarantee 100% uptime or
      absolute immunity from service interruptions or data loss. You are strongly encouraged to continue utilizing
      GFC&apos;s local export tools to maintain offline backups of your most critical forecast cycles.
    </p>

    <h3>13. Premium Expiration and Data Handling</h3>
    <p>
      If your premium subscription lapses or is canceled, your account will transition to a <strong>read-only</strong>{' '}
      state regarding cloud services. You will lose the ability to save new cycles to the cloud and background sync
      will be disabled. Your existing cloud-hosted cycles will not be automatically deleted upon expiration, and any
      local work stored on your physical device will remain 100% accessible, editable, and unaffected.
    </p>
    <h3>14. Beta and Experimental Features</h3>
    <ul><li>Some features may be labeled beta or experimental, in the app or on beta.gfcweather.com. Beta features may change, break, lose data, or be removed at any time without notice.</li><li>Beta features are covered by these Terms, including sections 1, 4, and 5, and are provided with even less assurance of accuracy or availability than the rest of GFC.</li></ul>
    <h3>15. Third-Party Data and Services</h3>
    <p>GFC displays data and uses services from third parties, including NOAA, the National Weather Service, and the Storm Prediction Center (alerts, storm reports, radar, satellite, and model data such as HRRR, RAP, and RRFS), map providers such as OpenStreetMap/OpenFreeMap and Esri, WorldPop, Google Firebase, Stripe, Cloudflare, and Sentry. We do not control these providers, are not responsible for their data, availability, or changes, and their own terms and policies may also apply. Use of third-party data does not mean any of those providers endorses GFC.</p>
    <h3>16. General</h3>
    <p>These Terms, together with the Privacy Policy, are the entire agreement between you and GFC about the App. If any part of these Terms is found unenforceable, the rest stays in effect. Our not enforcing a provision is not a waiver of it.</p>
  </>
);

// Footer component for the ToS modal in view-only mode, which simply displays a close button to allow users to exit the modal after reading the Terms of Service. This is used when the modal is opened in a view-only context where acceptance is not required, such as when a user wants to review the ToS without needing to accept them.
const ToSViewOnlyFooter: React.FC<{ onClose?: () => void }> = ({ onClose }) => (
  <div className="tos-modal-footer">
    <div className="tos-button-row">
      <button className="tos-btn-accept" onClick={onClose}>
        Close
      </button>
    </div>
  </div>
);
// Footer component for the ToS modal in acceptance mode, which includes a checkbox for users to confirm they have read and agree to the Terms of Service, as well as buttons to accept or decline. The accept button is disabled until the user checks the box, ensuring that they acknowledge the terms before proceeding. If the user declines, they are redirected away from the app, while accepting records their agreement and allows them to continue using the app.
const ToSAcceptanceFooter: React.FC<{
  checked: boolean;
  onCheckedChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDecline: () => void;
  onAccept: () => void;
}> = ({ checked, onCheckedChange, onDecline, onAccept }) => (
  <div className="tos-modal-footer">
    <label className="tos-checkbox-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={onCheckedChange}
      />
      I have read and agree to the Terms of Service. I understand that GFC is an unofficial educational tool
      and I will not rely on it for real-world safety decisions.
    </label>
    <div className="tos-button-row">
      <button className="tos-btn-decline" onClick={onDecline}>
        Decline
      </button>
      <button className="tos-btn-accept" onClick={onAccept} disabled={!checked}>
        Accept &amp; Continue
      </button>
    </div>
  </div>
);

// Modal component that displays the Terms of Service (ToS) for the Graphical Forecast Creator app. It requires users to read and accept the ToS before using the app, and it can also be used in a view-only mode where users can only read the ToS without accepting. The modal includes sections outlining the unofficial nature of the app, user responsibilities, license terms, limitations of liability, and contact information. It manages state for whether the user has checked the acceptance box and handles acceptance or decline actions accordingly.
const ToSModal: React.FC<ToSModalProps> = ({ onAccept, viewOnly = false, onClose }) => {
  const [checked, setChecked] = useState(false);
  const { setModalRef } = useModalFocusTrap({ active: true, onClose: viewOnly ? onClose : undefined });

  // Handler for when the user clicks the accept button, which checks if the acceptance checkbox is checked, records the acceptance in localStorage, and calls the onAccept callback to allow the user to proceed into the app. If the checkbox is not checked, it does nothing, preventing acceptance until the user confirms they have read and agreed to the ToS.
  const handleAccept = () => {
    if (!checked) return;
    acceptToS();
    onAccept();
  };

  // Handler for when the user clicks the decline button, which redirects them away from the app to an external website (e.g., weather.gov) since they cannot use the app without accepting the ToS. This is a simple way to enforce that users must accept the terms to access the app's functionality.
  const handleDecline = () => {
    // Redirect away from the app if the user declines
    window.location.href = 'https://weather.gov';
  };

  // Handle checkbox state change
  const handleCheckedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChecked(e.target.checked);
  };

  return (
    <div className="tos-backdrop" role="dialog" aria-modal="true" aria-labelledby="tos-title" ref={setModalRef}>
      <div className="tos-modal">
        <div className="tos-modal-header">
          <div className="tos-modal-header-row">
            <div>
              <h2 id="tos-title">Terms of Service</h2>
              <p>Please read and accept before using Graphical Forecast Creator &mdash; Version {TOS_VERSION}, Effective November 21, 2026</p>
            </div>
            {viewOnly && (
              <button className="tos-close-view-btn" onClick={onClose} aria-label="Close">
                &times;
              </button>
            )}
          </div>
        </div>

        <div className="tos-modal-body">
          <ToSTermsContent />
        </div>

        {viewOnly ? (
          <ToSViewOnlyFooter onClose={onClose} />
        ) : (
          <ToSAcceptanceFooter
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

export default ToSModal;
