# Changelog

All notable changes to this project will be documented in this file.

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
