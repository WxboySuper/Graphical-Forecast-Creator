# Changelog

All notable changes to this project will be documented in this file.

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
  - "Storm Report Upload" — import SPC CSV archive by date.
  - Plot tornado (red triangles), wind (blue squares), and hail (green circles) reports over the outlook.
  - Visual hit/miss check against drawn risk areas.

## [0.7.0-alpha] - 2026-01-30

### Added
- **Categorical Logic:**
  - Risk category selector: TSTM, MRGL, SLGT, ENH, MDT, HIGH.
  - Dynamic polygon colors and labels per category per the SPC style guide.
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
  - Implemented support for the new SPC outlook format (effective March 2026).
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
