# Graphical Forecast Creator (GFC) Roadmap

This roadmap outlines the evolution of the platform into a comprehensive suite of weather tools: the **Outlook Creator**, the **WarnGen Simulator**, and the **WxSim Game**. Each version is a focused, bite-sized milestone.

---

## Versioning Guide

- **Format:** vX.Y.Z (e.g., v0.1.0, v0.2.0, v1.0.0)
  - **Major (X):** Fundamental changes to the platform's scope (e.g., Launching the Simulator Game).
  - **Minor (Y):** New modules or significant feature sets (increments often!).
  - **Patch (Z):** Bug fixes or polish.
- **Pre-1.0:** Use v0.Y.0 for the initial build of the **Outlook Creator**.
- **Philosophy:** Release early, release often. Every checkmark is a victory.

---

<details>
<summary>🗂️ <strong>Milestone Progress Task List</strong></summary>

- [x] Project Initialization (v0.1.0)
- [ ] Drawing Library Fix (Leaflet-Geoman)
- [ ] Outlook Data Schema
- [ ] Save System (JSON Export)
- [ ] Load System (JSON Import)
- [ ] Map Overlays (Counties/States)
- [ ] Categorical Logic (Outlook Colors)
- [ ] Verification Tools (Storm Reports)
- [ ] Forecast Discussion Editor
- [ ] Image Export
- [ ] **v1.0.0: The Outlook Creator**
- [ ] Real-Time Radar Integration
- [ ] WarnGen Interface
- [ ] Outlook Layer Integration
- [ ] Warning Polygons
- [ ] The Timer & Status
- [ ] Educational Text Generation
- [ ] Warning Updates
- [ ] **v2.0.0: The Simulator Game**

</details>

## v0.1.0-alpha: The Foundation (Retroactive)

- [x] Initialize React project with TypeScript.
- [x] Set up Redux Toolkit for state management.
- [x] Implement basic Leaflet Map container.
- [x] Basic layer toggling logic.

## v0.2.0-alpha: The "Geoman" Fix (Current Focus)

**Goal:** Fix the broken map drawing by swapping the library.

- [ ] Uninstall `react-leaflet-draw` (Legacy/Broken).
- [ ] Install `@geoman-io/leaflet-geoman-free`.
- [ ] Implement basic polygon drawing using Geoman controls.
- [ ] Verify ability to "cut" holes in polygons (essential for doughnut-hole risks).

## v0.3.0-alpha: Outlook Data Structure

**Goal:** Teach the app what an "Outlook" is.

- [ ] Define TypeScript interfaces for `Outlook`, `RiskArea`, and `Hazard`.
- [ ] Update Redux store to hold the current outlook state.
- [ ] Connect drawn polygons to the Redux store (updating coordinates in state).

## v0.4.0-alpha: The Save System

**Goal:** Never lose a forecast.

- [ ] Implement `Export to JSON` functionality.
- [ ] Schema validation (ensure the JSON is valid GFC data).
- [ ] Add "Auto-save" to LocalStorage (prevent data loss on refresh).

## v0.5.0-alpha: The Load System

**Goal:** The "Forecast Cycle" workflow (Edit yesterday's outlook).

- [ ] Implement `Import JSON` functionality.
- [ ] Allow re-uploading a saved file to populate the map with editable polygons.
- [ ] Handle version migration (if schema changes).

## v0.6.0-alpha: Map Overlays & Context

**Goal:** Make it look like professional software.

- [ ] Add "State Borders" overlay (GeoJSON).
- [ ] Add "County/CWA Boundaries" overlay (GeoJSON).
- [ ] Add "Highways/Cities" toggle for reference.

## v0.7.0-alpha: Categorical Logic

**Goal:** Implementing the SPC style guide.

- [ ] Add "Risk Category" selector (TSTM, MRGL, SLGT, ENH, MDT, HIGH).
- [ ] Implement dynamic polygon styling based on category (Green, Yellow, Orange, Red, Magenta).
- [ ] Add standard labels/tooltips to polygons.

## v0.8.0-alpha: Verification Tools

**Goal:** "How did I do?"

- [ ] Implement "Storm Report Upload" (CSV/JSON import from SPC archive).
- [ ] Plot Tornado/Wind/Hail reports as distinct icons over the user's outlook.
- [ ] Basic "Hit/Miss" visual check.

## v0.9.0-alpha: Discussion Editor

**Goal:** Explaining the forecast.

- [ ] Add "Forecast Discussion" text editor (Markdown support?).
- [ ] Add simple text formatting tools.

## v0.10.0-alpha: Sharing & Export

**Goal:** Sharing the product.

- [ ] Implement "Snapshot" feature (Export Map View to PNG/JPG).
- [ ] Combine Map Image + Discussion text into a downloadable package.

## v1.0.0: The Outlook Creator (Stable Release) 🌪️

**Goal:** A complete, standalone tool for creating, saving, and verifying weather outlooks.

- [ ] Final UI Polish (Sidebar cleanup, Help modal).
- [ ] Deployment to GitHub Pages / Vercel.
- [ ] Public documentation on "How to create an Outlook."

---

## Post-v1.0: The "WarnGen" Era

## v1.1.0: Real-Time Data Integration

- [ ] Integrate Iowa State Mesonet (IEM) WMS service.
- [ ] Add "Base Reflectivity" (N0Q) layer.
- [ ] Add "Velocity" (N0U) layer.
- [ ] Add opacity sliders for radar layers.

## v1.2.0: The WarnGen Interface

**Goal:** A dedicated "Operations" page, separate from the Outlook creator.

- [ ] Create `WarnGenPage.tsx` (New Route).
- [ ] Implement a split-screen UI (Map vs. Warning Controls).
- [ ] Ensure map state is isolated from the Outlook Creator page.

## v1.3.0: Outlook Layer Integration

**Goal:** Bringing context to the warning process.

- [ ] Add "Load Outlook JSON" button to WarnGen toolbar.
- [ ] Render Outlook polygons as a **Reference Layer** (Read-Only/Non-Editable).
- [ ] Ensure Outlook polygons appear *below* warning polygons (z-index).

## v1.4.0: Warning Polygons

- [ ] Add "Warning Type" selector (Severe Thunderstorm, Tornado, Flash Flood).
- [ ] Implement "Warning Style" polygons (Red/Yellow outlines with drag handles).
- [ ] Ensure WarnGen polygons are distinct from Outlook polygons.

## v1.5.0: The Timer & Status

**Goal:** Simulating the pressure of operations.

- [ ] Add "Issue Time" and "Expiration Time" logic.
- [ ] Implement a countdown timer for active warnings.
- [ ] Visual cues for expiring warnings (Blinking red).

## v1.6.0: Educational Text Generation

**Goal:** Learning *why* we warn, not just generating products.

- [ ] Create the "Warning Text" modal.
- [ ] Add "Reasoning Prompts" (Why are you issuing? What is the storm motion?).
- [ ] Add "Hazard Tag" dropdowns (Hail size, Wind speed).
- [ ] Generate **Educational Summary** text (different from NWS format) focusing on the "Why."

## v1.7.0: Warning Updates

**Goal:** Managing active events.

- [ ] Implement "Edit Warning" workflow.
- [ ] Allow shrinking/trimming active polygons (using Geoman).
- [ ] Generate "Update Status" text (Simplified update logic, not formal SVS).

---

## v2.0.0+: The Simulator Game (WxSim) 🎮

**Goal:** A standalone game that utilizes the Outlook and WarnGen components for historical simulations.

## v2.1.0: Game Architecture

- [ ] Build a new "Game Mode" wrapper that isolates the user from real-time data.
- [ ] Create a "Session Manager" to track game state.

## v2.2.0: Scenario Engine

- [ ] Develop a system to replay archived radar/outlook data (not real-time).
- [ ] Create the first playable scenario (e.g., "April 27, 2011").

## v2.3.0: Scoring & Progression

- [ ] Implement points system for lead time and polygon accuracy (POD/FAR).
- [ ] Add "Career Mode" to track performance across multiple sessions.

## v3.0.0: Long Term Maintenance

**Goal:** Stability and community content.

- [ ] **Maintenance Mode:** Bug fixes and performance updates.
- [ ] **Scenario Editor:** Allow users to create and share their own historical scenarios.
