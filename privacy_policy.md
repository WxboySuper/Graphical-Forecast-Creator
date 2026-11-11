# Privacy Policy
**Version 2 — Last Updated: November 11, 2026**

This file mirrors the in-app Privacy Policy (`src/components/PrivacyPolicy/PrivacyPolicyModal.tsx`), which is the version users accept. Keep the two in sync.

**TL;DR:** Your local forecasts stay on your device. If you choose to make an account, we only collect what is strictly necessary to sync your work and securely manage your subscription.

**Optional product analytics:** Help us understand which parts of GFC are useful. This is disabled by default, is a separate choice from accepting this Privacy Policy, never affects access to GFC, and can be changed in the app at any time.

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

**5. Product Analytics & Progress Metrics**
To understand which hosted GFC workflows need improvement, we use self-hosted, cookie-free Umami product analytics on the production and beta deployments in separate reporting zones. It uses a pseudonymous visitor/session identifier to group activity from the same browser without attaching it to your GFC account. We collect page views, selected milestone events such as completed exports, cloud-save outcomes, workflow outcomes, and custom-layer creation, plus route/page activity, timestamps, and coarse technical information (browser, operating system, and device type). The Umami service can derive approximate location from an IP address, but GFC currently removes visitor IP addresses before they reach Umami, so new GFC telemetry does not include country, region, or city. **We do not use account identity, Firebase UID, email address, forecast contents, coordinates, layer text, filenames, or export contents for product analytics.**

If you are signed in, we also store limited progress metrics tied to your account so we can show you your own activity inside GFC. This may include values such as active-day streak, total active days, forecast saves, cloud saves, discussions written, and verification sessions run. These account metrics are visible only to you inside your account view.

Non-essential product analytics are disabled by default. You may optionally enable them using the local telemetry preference; choosing not to enable them does not affect access to GFC. You can withdraw that permission at any time from the same control. When disabled, GFC does not load the Umami tracker or send product-analytics events. Analytics are hosted by GFC on our VPS and are not used for advertising, cross-site tracking, or sale of personal data. Beta and production are separate analytics zones. Because this telemetry is not linked to a Firebase account, Firebase account deletion does not identify a matching telemetry record. A fixed event-level telemetry retention period has not yet been adopted; we will publish and implement one before representing a fixed deletion schedule. For a telemetry access or deletion request, or any privacy question, contact us at the address in section 10 with the approximate date, browser/device, and route or event details you want us to locate.

On production and beta hosted deployments, we use Sentry (a third-party error monitoring service) to capture application errors and limited performance data so we can fix bugs quickly. This is separate from product analytics above. We do not use Sentry for advertising or the sale of personal data. Error reports are designed to exclude forecast map payloads, do not use session replay, and are configured without sending IP addresses or cookies by default. Events are tagged by environment (production or beta) so staging issues stay separate from production.

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

Aggregate admin metrics may be retained in a non-user-specific form for product operations. Short-lived dedupe records used for daily unique counts are intended to expire automatically after a limited retention window.

**8. Age Restrictions**
GFC is intended for general audiences and is not directed at children under the age of 13. By creating an account, you confirm you are 13 years of age or older.

**9. Security & Breach Notification**
We rely on enterprise-grade infrastructure from Google (Firebase), Stripe, and Cloudflare to keep your data safe. In the unlikely event of a data breach that compromises your account information, we will notify affected users via email as quickly as legally and technically possible.

**10. Policy Changes & Contact**
We may update this policy as GFC evolves. Significant changes will be communicated via in-app notices or email. For privacy questions, or to request manual data deletion, contact us at: contact@gfcweather.com.
