# Graphical Forecast Creator

**A web application for creating professional severe weather outlooks, verifying forecasts, and writing forecast discussions.**

Live App: [gfc.weatherboysuper.com](https://gfc.weatherboysuper.com/)

---

## Features

### Outlook Creation
- Draw, edit, and cut polygons for tornado, wind, hail, categorical, and Day 3-8 outlooks
- Automatic categorical risk derivation from probabilistic outlooks (no manual editing needed)
- CIG hatching levels (CIG1-CIG3) for significant threat areas
- Full Day 1-8 forecast cycle support with day-specific outlook types
- General Thunderstorm (TSTM) manual drawing on categorical layer

### Forecast Cycles
- Multi-day forecast cycles (Days 1-8) with individual outlook layers per day
- Save named cycles (e.g., "Morning Update", "00Z Run") with timestamps
- Cycle history browsing - load any previous cycle to resume editing
- Copy features between cycles or days (e.g., yesterday's Day 2 today's Day 1)
- Auto-save to browser localStorage every 5 seconds; session restored on reload

### Verification
- Load NOAA storm reports (tornado, wind, hail) by date
- Plot reports on top of your outlook for visual hit/miss analysis
- Statistics: report counts per risk level (highest risk only, no double-counting)
- Isolated verification state - reviewing old outlooks won't affect your active cycle

### Forecast Discussion
- Two-tab editor: **Edit** (live writing) and **Preview** (formatted render)
- **DIY mode**: plain text with formatting toolbar shortcuts
- **Guided mode**: question-based discussion builder that teaches forecasting thought process
- Export discussion as `.txt` file in GFC style (readable times, forecaster name at bottom)

### Export & Sharing
- **Export Image**: Capture the current map view as a PNG
- **Export Package**: Download a ZIP containing the forecast JSON + discussion text + map image
- Copy cycle JSON to clipboard for sharing

### Map & UI
- Multiple base map styles: Standard (OSM), Light (CartoDB), Dark (CartoDB), Satellite (Esri), **Blank (Weather)** (classic weather-style flat map — cream US, gray neighbors, blue ocean)
- Map auto-switches to dark tile set when dark mode is enabled
- Overlay toggles: state borders, county/CWA boundaries
- Full light/dark theme with persistent preference
- Toast notifications for all major actions

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` - `8` | Switch to Day 1-8 |
| `T` | Switch to Tornado outlook |
| `W` | Switch to Wind outlook |
| `H` | Switch to Hail outlook |
| `C` | Switch to Categorical outlook |
| `G` | Add General Thunderstorm (TSTM) to current day |
| `Ctrl+S` | Export forecast JSON |
| `Ctrl+O` | Open/load a forecast JSON file |
| `Ctrl+E` | Export map image |
| `Ctrl+D` | Toggle dark mode |

---

## Getting Started

### Prerequisites

- Node.js `22.22.0+`, `24.11.0+`, or `26.x`
- pnpm `10` (version pinned in `package.json`)

### Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/WxboySuper/Graphical-Forecast-Creator.git
   cd Graphical-Forecast-Creator
   ```

2. Install the dependencies:
   ```sh
   pnpm install
   ```

Use `pnpm` consistently for this repo so the checked-in `pnpm-lock.yaml` remains the source of truth.

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Vite dev server at http://localhost:3000 |
| `pnpm test` | Run Jest unit test suite |
| `pnpm run lint` | Run ESLint over the codebase |
| `pnpm run test:e2e` | Run Playwright end-to-end tests |
| `pnpm run css:build` | Regenerate the Tailwind utility snapshot from the compatibility config |
| `pnpm run css:watch` | Watch source files and regenerate the Tailwind utility snapshot |
| `pnpm run build` | Production build to `/build` via Vite |

During local development, run `pnpm run css:watch` in a second terminal alongside
`pnpm run dev` so newly added Tailwind utilities are reflected in
the generated stylesheet without waiting for a production build.

Representative light/dark forecast and mobile-toolbar evidence for the generated
utility snapshot is checked in under [`docs/visual-evidence/`](docs/visual-evidence/).

The `typescript` dependency is the TypeScript 6 compatibility package
(`@typescript/typescript6`) so `typescript-eslint` has the compiler API it
needs; `@typescript/native` provides the fast native `tsc` used by
`pnpm run typecheck`. Both install side-by-side.

### Build targets

`VITE_BUILD_TARGET` is `local`, `beta`, `staging`, or `production` (default `local`; invalid values fail the build). It is separate from Vite's mode. The beta target is an open beta: anyone can use it, existing subscriptions apply, and it adds a beta banner and a floating feedback button.

### Local beta build

```sh
cross-env VITE_BUILD_TARGET=beta pnpm run dev -- --port 3002
```

PowerShell: `$env:VITE_BUILD_TARGET='beta'; pnpm run dev -- --port 3002`. Point feedback at another Worker with `VITE_FEEDBACK_API_URL` (default `https://feedback.gfcweather.com`; see [beta feedback](docs/operations/beta-feedback.md)). On localhost, `?localBetaBypass=1` skips the Terms and Privacy modals (used by E2E). Hosted auth locally needs the `VITE_FIREBASE_*` variables.

### Error monitoring

Sentry runs on production and beta only when a DSN is provided; local builds are inert. Session replay is off and PII collection is disabled. Setup and secrets: [hosting and services](docs/guide/03-hosting-and-services.md).

---

## Project Structure

```
src/        React app: pages, components, hooks, store (Redux), utils, monitor, config
server/     Express API (metrics, billing, accounts, Auto-TSTM)
e2e/        Playwright tests
scripts/    Release, CI and validation tooling
docs/       guide/ (human), agents/ (AI agents), reference docs
```

Details: [how the code is organised](docs/guide/02-architecture.md).

---

## Documentation

- [**Guide**](docs/guide/README.md) - illustrated overview: product, architecture, hosting, releases, feature gating, automation
- [Docs index](docs/README.md) - guide, agent docs, and detailed reference
- [Outlook information](docs/product/outlook-info.md) - risk levels, probabilities, categorical conversion
- [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md)
- Contributors using AI agents: see [AGENTS.md](AGENTS.md)

---

## Disclaimer

- First and foremost, GFC is a creative and educational tool. It is NOT an official source of weather warnings, watches, or advisories. Always consult official sources (e.g., weather.gov) for accurate and authoritative weather information.
- Second AI was used in the development of this project. The final product and code in this codebase has been reviewed by me (Alex/ WeatherboySuper) to ensure quality outputs and good code. However I am not perfect, and there may be issues or bugs that I missed or I caused. If you see any problems, please report them via GitHub Issues or the GFC Support Discord.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
