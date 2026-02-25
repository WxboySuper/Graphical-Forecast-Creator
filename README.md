# Graphical Forecast Creator

**A web application for creating SPC-style severe weather outlooks, verifying forecasts, and writing forecast discussions.**

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
- Load SPC storm reports (tornado, wind, hail) by date
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
- Multiple base map styles: Standard (OSM), Light (CartoDB), Dark (CartoDB), Satellite (Esri), **Blank (Weather)** (SPC-style flat map — cream US, gray neighbors, blue ocean)
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

- Node.js (v16 or later)
- npm or pnpm

### Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/WxboySuper/Graphical-Forecast-Creator.git
   cd Graphical-Forecast-Creator
   ```

2. Install the dependencies:
   ```sh
   npm install
   # or
   pnpm install
   ```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Dev server at http://localhost:3000 |
| `npm test` | Run Jest unit test suite |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run build` | Production build to `/build` |

---

## Project Structure

```
src/
 components/
    CycleManager/       # Cycle history modal, copy-from-previous modal
    DaySelector/        # Day tab navigation panel
    DiscussionEditor/   # DIY + Guided discussion editor
    Documentation/      # In-app help/docs panel
    DrawingTools/       # Export modal, map export hook
    IntegratedToolbar/  # Main toolbar (all action buttons)
    Map/                # OpenLayers map, overlay controls, legend
    OutlookPanel/       # Probability/CIG selector panel
    OutlookSelector/    # Outlook type picker
    Toast/              # Notification toasts
    Verification/       # Storm report panel
    VerificationMode/   # Verification page layout
 hooks/
    useAutoCategorical.ts   # Auto-derives categorical from hazards
    useAutoSave.ts          # localStorage auto-save every 5s
 pages/
    ForecastPage.tsx        # Main forecast editing page
    VerificationPage.tsx    # Forecast verification page
    DiscussionPage.tsx      # Discussion editor page
    HomePage.tsx            # Landing / cycle overview page
 store/
    forecastSlice.ts        # Active forecast editing state
    verificationSlice.ts    # Isolated verification state
    overlaysSlice.ts        # Map overlay toggle state
    themeSlice.ts           # Dark mode state
 types/
    outlooks.ts             # Core TypeScript interfaces
 utils/
     fileUtils.ts            # JSON import/export, ZIP package
     exportUtils.ts          # Map image capture (html2canvas)
     verificationUtils.ts    # Storm report spatial analysis
     outlookUtils.ts         # Color mappings, categorical rules
```

---

## Documentation

- [Outlook Information](docs/Outlook_Info.md) - risk levels, probability values, categorical conversion rules
- [Roadmap](ROADMAP.md) - versioning plan and feature milestones
- [Changelog](CHANGELOG.md) - release history

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
