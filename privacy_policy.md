# Privacy Policy
**Version 3 — Last Updated: November 17, 2026**

This file mirrors the in-app Privacy Policy (`src/components/PrivacyPolicy/PrivacyPolicyModal.tsx`), which is the version users accept. Keep the two in sync.

**TL;DR:** Your local forecasts stay on your device. If you choose to make an account, we only collect what is strictly necessary to sync your work and securely manage your subscription.

**Usage data:** GFC counts daily visitors and active accounts without storing who they are, and offers an optional, anonymous feature-statistics setting that is off until you choose it. See section 5.

**1. Local-First by Default**
If you use Graphical Forecast Creator (GFC) without creating an account, all of your forecast data, preferences, and cycle history remain stored locally on your device. We do not have access to this data.

**2. Account & Authentication Data**
If you choose to create an account to sync your settings or use premium features, we authenticate you via Firebase Auth. We use essential session cookies strictly to keep you logged in and we store:
* Your email address.
* Your authentication provider (Google or Email/Password).
* Basic profile information (name/avatar).
* Your synced settings needed to keep the hosted account experience working across devices.

**3. Premium Cloud Storage & Encryption**
If you subscribe to GFC Premium and actively use Cloud Saves, your forecast cycles, metadata, and discussions are stored securely, encrypted in transit and at rest, via Firebase. This data is stored strictly to provide cross-device synchronization. We do not sell this data or use it for advertising.

**4. Payment Information**
All payments are processed securely by Stripe. GFC does not collect, process, or store your credit card numbers or banking details. To operate subscriptions, we store limited billing metadata such as your subscription status, billing interval, renewal/cancellation state, and Stripe-linked customer or subscription identifiers needed to unlock and manage premium features.

**5. Usage Counts, Optional Feature Statistics & Progress Metrics**
We collect usage information in three separate layers so you can see exactly what each one does.

*Always on (no cookies, nothing stored on your device).* GFC counts how many people use it each day. When GFC opens, it sends a request to our telemetry service, which runs on Cloudflare. The service combines your IP address and browser user-agent with a secret value tied to the current date, turns that into a one-way fingerprint, and uses it only to count each browser once per UTC day. If you are signed in, GFC also sends a once-a-day "active" signal that is verified with your sign-in token; the service counts your account the same way, using your account identifier and the same date-based secret. The service keeps only the per-day totals. The one-way fingerprints used to avoid double counting are kept only for the current UTC day and are deleted by a scheduled job at the start of the next day. We do not store your IP address, user-agent, or account identifier in these counts, and the counts are not linked to your forecasts, your account, or the optional statistics below. Cloudflare may also keep routine technical logs, such as IP address and timestamps, for requests to this service under its own policies.

*Error reports (Sentry).* On production and beta hosted deployments, we use Sentry (a third-party error monitoring service) to capture application errors and limited performance data so we can fix bugs quickly. We do not use Sentry for advertising or the sale of personal data. Reports are designed to be scrubbed before they leave your browser: email addresses, IP addresses, account identifiers, request URLs and query strings, cookies, and similar sensitive values are removed from messages, page names, and performance traces, and forecast map payloads are not attached. We do not use session replay, and events are tagged by environment (production or beta) so staging issues stay separate from production.

*Optional feature statistics (off until you choose).* A one-time prompt asks "Help improve GFC?" and offers to share anonymous counts of which features get used. Allow and No thanks are equal choices, nothing is preselected, and closing the prompt without choosing counts as No thanks. Nothing in this layer is sent unless you choose Allow. If you do, when you use certain features (for example opening a page, creating, exporting, or saving a forecast, using verification, opening a mesoscale layer, changing a map layer, using a premium feature, or seeing an error), GFC sends only the name of the event, an optional short non-personal detail (such as a page name, layer name, or error type, never text you typed), and the GFC version. Our service adds your country, taken from Cloudflare. We do not send or store your account identifier, a fingerprint, your IP address, a session identifier, free text, or any forecast contents, coordinates, or filenames with these events. They are stored in Cloudflare's analytics service, which automatically expires them after about 90 days. You can change your choice at any time from the More (…) menu under Usage data. Because these statistics and the daily counts are not linked to you or your account, we cannot find or delete one person's entries; to stop contributing, turn the setting off.

Neither choice affects access to GFC, and we do not use any of this for advertising, cross-site tracking, or the sale of personal data. Earlier versions of GFC used a self-hosted analytics tool (Umami); it has been replaced by the services described here.

If you are signed in, we also store limited progress metrics tied to your account so we can show you your own activity inside GFC. This may include values such as active-day streak, total active days, forecast saves, cloud saves, discussions written, and verification sessions run. These account metrics are visible only to you inside your account view.

For a privacy question or an access or deletion request about usage data, contact us at the address in section 10 with the approximate date, browser or device, and details of what you want us to locate.

**6. Feedback You Send Us**
The Send feedback form is optional and available to signed-in users; you can share feedback in our Discord instead if you prefer not to use it. When you send feedback we collect:
* The message you write and the type you choose (bug, idea, praise, question, or other).
* Technical context added automatically: the page you were on (path only, without query strings or fragments), the GFC version, whether you were using beta or production, your screen size, and your browser user-agent. We do not attach your forecast data.
* A one-way hash of your account identifier, created with a secret value. We use it only to limit spam and duplicate submissions; it is not your account identifier.
* Your email address, only if you tick "You can email me about this feedback" and your email address is verified. We contact you only if you opted in.

Please do not put passwords, payment details, or other sensitive personal information in your message. We use feedback to fix bugs and decide what to build; we do not sell it or use it for advertising. Feedback is stored with Cloudflare (our feedback service and database), and a copy of each submission is posted to a private channel in our Discord server, where Discord's own privacy policy applies. Only GFC maintainers can read these. Cloudflare also processes requests to the feedback service and may keep routine technical logs, such as IP address and timestamps, under its own policies.

We keep feedback until we delete it, and we may keep useful feedback after you delete your account because it is stored without your profile (it includes your email only if you opted in). Deleting your account does not automatically remove feedback you sent. To have specific feedback deleted, contact us at the address in section 10 and describe roughly when you sent it and what it said; we will remove it.

**7. Data Retention & Deletion**
You own your data. You can delete your account from the Account page after confirming the request and authenticating again. The deletion process ends any subscription linked to the account, then permanently removes your cloud-hosted cycles, profile data, synced settings, user-linked progress metrics, billing linkage, and Firebase sign-in. Your local, offline saves remain untouched on your device. If cleanup cannot finish, the sign-in is kept available so you can retry. We retain a one-way hash of the deleted Firebase identifier as a deletion-safety marker so delayed billing events cannot recreate the account; it contains no email, profile, settings, metrics, or forecast content. Stripe may retain transaction records it is independently required to keep for payment, fraud-prevention, tax, or legal purposes. Feedback you sent through the feedback form is described in section 6 and is not removed automatically when you delete your account.

Daily visitor and active-account totals are kept as non-user-specific aggregates for product operations. The one-way fingerprints used to count them are deleted at the end of each UTC day. Optional feature statistics expire automatically after about 90 days.

**8. Age Restrictions**
GFC is intended for general audiences and is not directed at children under the age of 13. By creating an account, you confirm you are 13 years of age or older.

**9. Security & Breach Notification**
We rely on enterprise-grade infrastructure from Google (Firebase), Stripe, and Cloudflare to keep your data safe. In the unlikely event of a data breach that compromises your account information, we will notify affected users via email as quickly as legally and technically possible.

**10. Policy Changes & Contact**
We may update this policy as GFC evolves. Significant changes will be communicated via in-app notices or email. For privacy questions, or to request manual data deletion, contact us at: contact@gfcweather.com.
