# Changelog
<!-- markdownlint-disable -->

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed
- **Forecast Page nitpicks:** Fixed UI alignment on the forecast Draw tab (spacing for sections/menus and Current Selection breathing room), ensured the tab bar touches its bottom tray properly, expanded the Cycle Date fields horizontally on the Days tab, improved Ghost Layers labels placement, eliminated duplicated basemap dropdowns favoring the toolbar, standardized tools buttons on the right side to match the new Integrated Toolbar format, and gave map control buttons neutral hover colors.
- **Home forecast workspace:** Refined the current cycle card with clearer header hierarchy, stronger status/date chips, and more balanced day and utility action tiles to reduce the cramped feel in the landing page layout.
- **Discussion editor:** Neutralized colored toolbar button backgrounds in light mode for the DIY editor toolbar and leveled/centered the DIY/Guided tabs to fix alignment issues (files: src/pages/DiscussionPage.css, src/pages/DiscussionPage.tsx, src/components/DiscussionEditor/DIYDiscussionEditor.tsx).
- **Verification header:** Compacted the verification header to reduce vertical space usage and increase map/controls visible area (file: src/components/VerificationMode/VerificationMode.css).
- **Developer:** Documented local beta dev workflow and the local beta bypass option in README.md to allow running beta features locally without hosted Firebase credentials.

### Fixed
- **Dependency/security cleanup:** Updated the Firebase/OpenLayers dependency tree and server admin stack to address the reported Dependabot vulnerabilities in protobufjs, lodash, protocol-buffers-schema, and `@tootallnate/once`.
- **Lucide brand icons:** Replaced Lucide brand icon usage with inline SVGs so the UI no longer depends on Lucide's removed brand set.
- **Unused dependency cleanup:** Removed stale geoman/react-leaflet dependencies and corresponding export-only selectors that no longer matched the codebase.
- **Map export guard:** Blocked image export on OpenLayers maps and surfaced a clear warning instead of attempting the old Leaflet export path.

## [1.4.0] - 2026-04-03

### Added
- **Hosted accounts and entitlements:** Added Firebase-backed account profiles, hosted sign-in, premium entitlements, and account management flows for the `v1.4.0` hosted release.
- **Cloud forecast library:** Added hosted cloud save/load support, a dedicated cloud library page, toolbar cloud actions, and read-only handling for expired premium users.
- **User metrics and admin dashboard:** Added progress-style account metrics, aggregate admin metrics, and a hidden admin dashboard for hosted beta operations.
- **Closed beta access flow:** Added beta-only access gating, invite onboarding, beta account activation, and deployment-specific beta access checks.

### Changed
- **Cloud hosted forecasts:** Moved cloud forecast storage out of `userSettings` into a dedicated `cloudCycles` collection so forecast payloads have a long-term home separate from profile preferences.
- **Pricing and account experience:** Refined the hosted pricing, account, billing, and cloud surfaces to match the newer card/surface design language used across the app.
- **Forecast toolbar styling:** Rebalanced the forecast utility toolbar layout and brought the cloud save/cloud library buttons back into the same visual system as the rest of the tool buttons, including dark-mode compliant color treatments.
- **Map layer rendering:** Promoted the elevated vector/reference-layer basemap treatment into the released map stack and standardized released outlook fill rendering around the new layer model.
- **Beta deployment flow:** Updated the beta and production deployment workflows to support hosted env configuration, separate beta/prod webhook secrets, and a dedicated beta backend process.
- **Privacy disclosures:** Updated the privacy policy and in-app privacy modal to reflect hosted sync, billing metadata, beta metrics, and operational logging behavior.

### Fixed
- **Billing route throttling:** Added explicit rate limiting to the Stripe billing checkout, portal, and webhook endpoints so authorization-bearing billing routes are consistently protected.
- **Cloud library UX:** Rebuilt the cloud library page and save dialog into clearer operational surfaces and corrected toolbar integration issues around cloud actions.
- **Beta backend loading:** Fixed server env loading for deployed hosted backends so colocated server `.env` files are respected on VPS deployments.
- **Closed beta activation:** Fixed beta access routing and deployment wiring so invite claims, billing config, and other hosted `/api/*` routes can reach the beta backend correctly.
- **Toolbar color consistency:** Corrected recent cloud-toolbar light/dark mode regressions so the hosted cloud actions follow the same custom toolbar color standards as the rest of the forecast tools.
- **Day 3 Total Severe colors:** Corrected the Day 3 `5%` Total Severe color back to the intended brown styling instead of the incorrect green treatment.

## [1.3.0] - 2026-03-24

### Added
- **Ghost overlays:** New overlay type that shows previous outlooks as semi-transparent ghosts on the map for comparison. Toggle visibility in the toolbar, with ghost overlays defaulting to off.
- **Verification storm report windows:** Added support for loading both today's and yesterday's storm reports in the Verification panel.
- **Alert banner system:** Added configurable alert banner with info/warning/error types and dismissible behavior.

### Fixed
- **Per-day undo/redo:** Undo and redo history now persists correctly when switching between forecast days.

## [1.2.0] - 2026-03-15

### Added
- **Forecast undo/redo:** Added undo and redo controls to the forecast page toolbar, along with standard keyboard shortcuts (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`, and `Ctrl/Cmd+Shift+Z`) for reversible drawing edits.

### Fixed
- **Porting automation:** Updated the internal PR porting workflow so it cherry-picks only the original merged PR commits and cleans up temporary `port/*` branches after their PRs close, which keeps branch synchronization cleaner and avoids noisy port PRs.
## [1.1.0] - 2026-03-07

### Fixed
- **Discussion auto-save:** Discussion editor changes now auto-save after a short debounce by syncing local editor state back to Redux, which ensures the existing global auto-save-to-localStorage flow captures discussion updates even without clicking Save.
- **Verification storm reports:** Prevented same-day NOAA storm report fetch attempts (which often return 404 before archive publication) by detecting local "today" and showing an informational message instead of a fetch error. Also added a distinct info-state message style for "no reports found" and same-day availability notices.
- **Export (dark mode):** Fixed issue where map exports could render as a blank (black) image in dark mode. Root cause was an OpenLayers canvas being tainted by tile images requested without CORS. The fix sets `crossOrigin: 'anonymous'` on OpenLayers `OSM`/`XYZ` sources, ensures cloned images request CORS during export, and waits for the OpenLayers `rendercomplete` / tile load before capturing with `html2canvas`. Verified on branch `fix/blank-dark-mode-export`.
- **Export warnings:** Added a console warning and an on-screen export banner (for live exports) when map tiles/images fail to load before capture, so users and developers can tell when the issue is network-related rather than a bug. Verified during manual export tests.
- **Layer ordering (forecast + verification maps):** Added top overlay layers so state outlines and map labels/city names render above outlook polygons, improving readability when polygons cover dense areas.
- **Polygon snapping:** Added OpenLayers Snap interactions for both probabilistic and categorical sources so drawing and editing can snap to existing vertices/segments (disabled only in delete mode).

## [1.0.0] - 2026-03-01

### Added
- **Focus trap in modals:** Tab/Shift+Tab cycles focus within CycleHistoryModal and CopyFromPreviousModal; first focusable element auto-focused on open.
- **In-app documentation:** 4-tab help panel (Overview, How to Use, Outlook Types, Categorical Conversion) accessible via the Help (?) button in the Navbar.

### Changed
- All `window.alert()` calls replaced with toast notifications app-wide (8 calls across 3 components).
- `FileReader.onerror` handlers added to file import flows for proper error feedback.
- `OutlookPanel` component removed (dead code — superseded by `IntegratedToolbar` + `OutlookSelectorPanel`).
- Version bumped to stable 1.0.0.

## [0.11.0-beta] - 2026-02-25

### Added
- **Cycle Management:**
  - Save named forecast cycles with optional labels (e.g., "Morning", "00Z").
  - Cycle history browser — view, load, or delete any saved cycle.
  - Copy features between cycles or days (e.g., yesterday's Day 2 → today's Day 1).
  - Cycle history persists to localStorage (`gfc-cycle-history`) and hydrates on app load.
- **Discussion Editor:**
  - Two-tab system: Edit and Preview modes.
  - DIY mode: plain text editor with formatting toolbar.
  - Guided mode: question-based builder walking through synopsis, threats, and confidence.
  - Export discussion as `.txt` in GFC style (no aviation jargon, no official terminators).
- **Map Migration:**
  - Migrated from Leaflet/Geoman to OpenLayers for map rendering and drawing.
  - Map tile source swaps between Standard/Light/Satellite/Terrain/Dark styles.
  - Dark mode auto-switches the base layer to CartoDB Dark.
- **Export Package:**
  - ZIP download containing forecast JSON + discussion text + map image.
  - Export loading feedback on the image export button.
- **Verification:**
  - Isolated `verificationSlice` prevents cross-contamination when verifying old cycles while editing.
  - Statistics fix: storm reports counted only at the highest containing risk level (no double-counting).
  - Visual hit/miss overlay for tornado, wind, and hail reports.

### Changed
- App branding: `<title>` and manifest updated to "Graphical Forecast Creator" / "GFC".
- `OutlookDaySelector` completely rewritten with CSS variables — was hardcoded dark regardless of theme.
- Duplicate localStorage hydration on startup removed; `ForecastPage.tsx` is the sole authority.
- All debug `console.log` / `console.error` removed from production code across 14+ files.
- Full dark mode coverage for all UI panels (VerificationMode, VerificationPanel, DrawingTools, ExportModal, OverlayControls, Toast, Documentation, OutlookDaySelector).

## [0.10.0-alpha] - 2026-01-30

### Added
- **Snapshot Export:**
  - Export current map view to PNG via `html2canvas`.
- **Map Styles:**
  - Map style selector in toolbar: Standard (OSM), Light, Dark, Satellite (Esri), Terrain (OpenTopoMap).
- **Re-implemented Map Overlays:**
  - Migrated state/county/CWA overlays to OpenLayers GeoJSON layers.

## [0.9.0-alpha] - 2026-01-30

### Added
- **Forecast Discussion Editor:**
  - Dedicated discussion editor accessible from the toolbar.

## [0.8.0-alpha] - 2026-01-30

### Added
- **Verification Tools:**
  - "Storm Report Upload" — import NOAA storm report CSV archive by date.
  - Plot tornado (red triangles), wind (blue squares), and hail (green circles) reports over the outlook.
  - Visual hit/miss check against drawn risk areas.

## [0.7.0-alpha] - 2026-01-30

### Added
- **Categorical Logic:**
  - Risk category selector: TSTM, MRGL, SLGT, ENH, MDT, HIGH.
  - Dynamic polygon colors and labels per category.
  - Auto-categorical logic: categorical risk derived from tornado/wind/hail probabilistic outlooks.

## [0.6.0-alpha] - 2026-01-30

### Added
- **Map Overlays:**
  - State borders overlay (GeoJSON).
  - County/CWA boundaries overlay (GeoJSON).
  - Toggle controls for overlay visibility.

## [0.5.0-alpha] - 2026-01-30

### Added
- **Forecast Cycle Workflow:**
  - Day 3 outlook support (totalSevere + categorical).
  - Day 4–8 outlook support (probabilistic only — 15%, 30%).
  - Day navigation: switch between Day 1–8 active outlook sets.
  - Schema supports importing older-day data into newer-day format (e.g., Day 4 → Day 3 style).
  - `Import JSON` functionality — re-upload a saved file to populate map with editable polygons.
  - Version migration handling for schema changes between releases.

## [0.4.0-alpha] - 2026-01-30

### Added

- **Load System:**
  - Implemented importing forecasts from JSON files (`.json`).
  - Added "Load Forecast" button to the toolbar.
  - Implemented automatic session restoration (auto-load) from LocalStorage on startup.
- **Map Styles:**
  - Added support for multiple base map layers.
  - Included styles: Standard (OSM), Light (Carto), Dark (Carto), Satellite (Esri), and Terrain (OpenTopoMap).
  - Added layer control to switch between styles.
- **Persistence:**
  - Added `useAutoSave` hook to automatically save work to LocalStorage every 5 seconds.
- **Save System:**
  - Defined JSON schema for GFC outlook data (`GFCForecastSaveData`).
  - Implemented `exportForecastToJson` utility to download forecasts.
  - Added schema validation (`validateForecastData`) to ensure data integrity.
- **Auto-save:**
  - Integrated auto-save logic (initially part of v0.4.0 scope, refined in v0.5.0).

### Changed

- Refactored `DrawingTools` to handle file input for loading.
- Updated `App.tsx` to manage save/load workflows using new utility functions.
- Renamed "Save Forecast" action to perform a file export (JSON).

## [0.3.0-alpha] - 2026-01-30

### Added

- **New Outlook Format:**
  - Implemented support for the updated convective outlook format (effective March 2026).
  - Added "Hatching" as a separate property/layer per probability type (Tornado, Wind, Hail).
  - Added CIG levels (CIG1, CIG2, CIG3) with specific hatching patterns.
  - Updated color mappings and categorical conversion logic (`useAutoCategorical`) to use geometric intersection with `@turf/turf`.
- **UI Updates:**
  - Updated `OutlookPanel` to support CIG selection.
  - Updated `Legend` to display mixed probability and hatching keys.
  - Removed legacy "Significant" toggle in favor of specific probability/hatching selection.

### Fixed

- Fixed bug where hatching patterns would replace fill colors (implemented as separate layers/ordering).
- Fixed categorical conversion logic to correctly account for hatching overlays.
- Fixed `SLGT%` label issue in tooltips.

## [0.2.0-alpha]

### Changed

- Switched mapping library to `@geoman-io/leaflet-geoman-free` for better drawing controls.
- Enabled polygon editing, cutting, and removal.

## [0.1.0-alpha]

### Added

- Initial project setup with React, TypeScript, and Redux Toolkit.
- Basic Leaflet map integration.
- Basic layer toggling.
