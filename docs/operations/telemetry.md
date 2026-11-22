# Telemetry operations

The web app sends privacy-gated product events to the `gfc-telemetry` Cloudflare Worker. The marketing site sends only the consent-free visit counter. The app also sends a consent-free visit counter and one authenticated daily-active ping per browser day.

The client contract lives in [`src/lib/telemetry/index.ts`](../../src/lib/telemetry/index.ts), with the event allowlist in [`events.ts`](../../src/lib/telemetry/events.ts). `VITE_TELEMETRY_BASE_URL` sets the build-time API base URL and defaults to `https://telemetry.gfcweather.com`.

## Data boundaries

- `/v1/visit` has no body or authentication and runs once per page load.
- `/v1/active` uses a Firebase ID token and stores only the last UTC day locally. It does not persist a user identifier.
- `/v1/event` runs only after consent is `granted`. Its payload contains an allowlisted event, an optional short safe detail, and app version.
- Product events must not include account identifiers, hashes, IP addresses, session identifiers, forecast content, free text, raw URLs, or error messages.
- Account progress metrics remain a separate feature using `/api/metrics/event`.

The app resets legacy `gfc-analytics-enabled=true` to `unset` because the old Umami opt-in does not carry over. A previous `false` value becomes `denied`, preserving the explicit opt-out. Both legacy values are removed after migration. Consent changes sync between open tabs through the browser storage event.

## Verification

Run `pnpm exec jest --runInBand src/lib/telemetry/index.test.ts src/instrument.test.ts` and verify the app CSP permits the telemetry origin under `connect-src`. The marketing Worker CSP has its own matching test.
