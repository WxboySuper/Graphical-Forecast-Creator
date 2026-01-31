# Graphical Forecast Creator - AI Agent Instructions

## Working Philosophy

### Task Completion Over Constant Check-ins
**Work until done.** The maintainer expects autonomous agents that complete entire features without stopping for verification every step. If you start fixing dark mode, don't stop until EVERY component has dark mode. If you're implementing a feature, finish the entire workflow before asking for feedback.

### When to Ask vs When to Proceed
- **Ask when:** The requirement is genuinely ambiguous, or there are multiple valid architectural approaches with significant tradeoffs
- **Proceed when:** You can infer the intent from context, fix obvious issues, or follow established patterns in the codebase
- **Never ask:** For permission to continue work, to confirm obvious bug fixes, or for validation of standard practices

### Discovery Over Guessing
If you need information, USE THE TOOLS. Don't make assumptions about file structure - grep/search/read. Don't guess at state management - inspect the Redux store structure. The codebase has the answers; your job is to find them systematically.

### Recent Work Patterns (Learn From These)
- **Dark mode completion (Jan 2026)**: Started with partial dark mode, maintained focus until ALL 14 CSS files had complete coverage. No stopping at "good enough."
- **Verification statistics (Jan 2026)**: Found the bug (reports counted multiple times), traced through the entire logic chain (verificationUtils.ts), fixed the algorithm AND display format in one session.
- **State separation (Jan 2026)**: Created verificationSlice to prevent forecast/verification cross-contamination. Didn't just patch the symptoms - restructured the architecture.

## Project Overview
A React/TypeScript web app for creating Storm Prediction Center-style severe weather outlooks. Users draw polygons on a Leaflet map, manage multi-day forecast cycles (Days 1-8), and verify forecasts against storm reports.

## Critical Architecture Patterns

### State Management: Dual-State Redux Architecture
The app uses **separate Redux slices** for forecast creation vs verification:
- `forecastSlice`: Active forecast editing (src/store/forecastSlice.ts)
- `verificationSlice`: Isolated verification state (src/store/verificationSlice.ts)

**Why separate?** Prevents cross-contamination when loading forecasts for verification while editing a different cycle. Always dispatch to the correct slice based on mode.

### Data Structure: Maps, Not Arrays
Outlook data uses **JavaScript `Map<string, GeoJSON.Feature[]>`** keyed by probability/risk level:
```typescript
// Correct: Map-based structure
categorical: Map { 'SLGT' => [features], 'MDT' => [features] }

// Redux serialization: Configure middleware to ignore Map paths
ignoredPaths: [/^forecast\.forecastCycle\.days\.\d+\.data\.(categorical|tornado|wind|hail)$/]
```

### Multi-Day Forecast Cycles
Days 1-8 system with **day-specific outlook types**:
- **Day 1/2**: tornado, wind, hail, categorical
- **Day 3**: totalSevere, categorical (no separate hazards)
- **Day 4-8**: day4-8 only (15%, 30% - no categorical conversion)

Current day determines available outlook types (see `src/types/outlooks.ts` DayType).

### Categorical Outlook Derivation
Categorical risk is **auto-generated** from probabilistic outlooks:
- Each probability maps to a categorical risk (5% tornado → Slight, 30% wind → Enhanced)
- `useAutoCategorical` hook (src/hooks/useAutoCategorical.ts) handles derivation
- **Never manually edit categorical** - modify tornado/wind/hail instead
- Exception: TSTM (General Thunderstorm) drawn manually on categorical

Risk hierarchy: TSTM < MRGL < SLGT < ENH < MDT < HIGH

See docs/Outlook_Info.md for conversion rules.

## Map Drawing: Geoman Configuration

### Critical Geoman Settings (src/components/Map/ForecastMap.tsx)
```typescript
pm.setGlobalOptions({
  snapDistance: 8,  // Reduced from 20 - prevents aggressive line snapping
  pmIgnore: true,   // MUST set on base layers (state/county borders) to prevent editing
});
```

**Common pitfall**: Forgetting `pmIgnore={true}` on GeoJSON overlays makes them editable. All read-only layers in MapOverlays.tsx need this.

### Drawing Workflow
1. User selects outlook type (tornado/wind/hail/categorical/totalSevere/day4-8)
2. User selects probability (varies by type)
3. Draws polygon → Geoman creates layer → `handlePolygonCreated` fires
4. Layer converted to GeoJSON → Dispatched to Redux with metadata
5. Features stored in `Map<probability, Feature[]>` structure

Cut operations (donut holes): Geoman provides both original and new layer in event.

## Dark Mode Theming

### CSS Variable System (src/darkMode.css)
All colors use CSS custom properties:
```css
:root { --bg-primary: #ffffff; --text-primary: #212529; }
.dark-mode { --bg-primary: #1a1a1a; --text-primary: #e4e4e4; }
```

**Map tiles auto-switch**: Dark mode triggers CartoDB "Dark" tileset (see ForecastMap.tsx MapInner component).

**Never hardcode colors** in component CSS - use variables or add dark mode overrides.

## Verification Workflow

### State Isolation Pattern
```typescript
// Forecast page - uses forecastSlice
const outlooks = useSelector(selectCurrentOutlooks);
dispatch(addFeature({ outlookType, probability, feature }));

// Verification page - uses verificationSlice
const outlooks = useSelector((state) => selectVerificationOutlooksForDay(state, selectedDay));
dispatch(loadVerificationForecast(forecastCycle));
```

### Verification Statistics (src/utils/verificationUtils.ts)
Reports assigned to **highest risk level only** to avoid double-counting:
```typescript
// Correct: Report in 15% AND 30% area counts only for 30%
const allRiskLevels = findAllContainingRiskLevels(report, outlooks);
const highestRisk = allRiskLevels.sort(compareRiskLevels)[0];
counts[highestRisk]++;
```

Uses Turf.js `booleanPointInPolygon` for spatial analysis.

## Key File Reference

### State Management
- `src/store/index.ts`: Redux store config, middleware for Map serialization
- `src/store/forecastSlice.ts`: Main forecast state (forecastCycle, drawingState)
- `src/store/verificationSlice.ts`: Separate verification state
- `src/store/themeSlice.ts`: Dark mode state (syncs with localStorage)

### Type Definitions
- `src/types/outlooks.ts`: **Read this first** - defines OutlookType, Probability, ForecastCycle, OutlookData
- DayType: literal type `1 | 2 | 3 | 4 | 5 | 6 | 7 | 8`

### Core Components
- `src/App.tsx`: Main layout, keyboard shortcuts, mode switching
- `src/components/Map/ForecastMap.tsx`: Geoman integration, drawing handlers
- `src/components/Map/VerificationMap.tsx`: Read-only map for verification
- `src/components/VerificationMode/VerificationMode.tsx`: Day selector, verification UI

### Utilities
- `src/utils/fileUtils.ts`: JSON export/import, forecast serialization/deserialization
- `src/utils/outlookUtils.ts`: Color mappings, categorical conversion logic
- `src/utils/verificationUtils.ts`: Statistics calculation, report counting
- `src/utils/exportUtils.ts`: Map export to PNG (html2canvas integration)

## Development Workflow

### Build & Test
```bash
npm start       # Dev server on localhost:3000
npm run build   # Production build to /build (264 kB gzipped)
npm test        # Jest tests (includes AppPerformance.test.tsx)
```

### Common Tasks

**Adding a new outlook type:**
1. Update `OutlookType` in src/types/outlooks.ts
2. Add color mapping in src/utils/outlookUtils.ts
3. Update Redux middleware `ignoredPaths` in src/store/index.ts
4. Add probability list in App.tsx `getProbabilityList()`

**Modifying map behavior:**
1. Check Geoman docs: https://github.com/geoman-io/leaflet-geoman
2. Configure in `addGeomanControls()` (ForecastMap.tsx)
3. Test polygon creation handlers for edge cases (cut, edit)

**Adding dark mode to components:**
1. Use CSS variables from darkMode.css
2. Add `.dark-mode .your-component` rules
3. Test with theme toggle (Ctrl+D shortcut)

## Important Conventions

### Significant Threat Hatching (CIG Levels)
Legacy "significant" boolean replaced with CIG0-CIG3 system:
- CIG0: No hatching
- CIG1: Broken diagonal (old style)
- CIG2: Solid diagonal
- CIG3: Crosshatch

Patterns defined as SVG in ForecastMap.tsx, rendered via `fillColor: 'url(#pattern-cig2)'`.

### Feature IDs
All features use `uuid.v4()` for IDs. Critical for Redux updates/deletes.

### Redux Actions
- `addFeature`: Adds to Map structure, auto-triggers categorical derivation
- `removeFeature`: Requires { outlookType, probability, featureId }
- `importForecastCycle`: Deserializes JSON → reconstructs Map objects

### Keyboard Shortcuts (src/App.tsx)
- `1-8`: Switch days (when not typing in input)
- `T/W/H/C`: Switch outlook types (Tornado/Wind/Hail/Categorical)
- `G`: Add General Thunderstorm (TSTM) risk
- `Ctrl+S`: Save to JSON
- `Ctrl+D`: Toggle dark mode

## Common Pitfalls

1. **Editing categorical manually**: It's derived from tornado/wind/hail. Edit those instead.
2. **Forgetting pmIgnore**: Base map layers become editable, causing user confusion.
3. **Using arrays instead of Maps**: Outlook data structure is `Map<string, Feature[]>`, not arrays.
4. **Cross-slice dispatch**: Check if in forecast or verification mode before dispatching.
5. **Hardcoded colors**: Use CSS variables for dark mode compatibility.
6. **Day-specific outlook types**: Day 3 has totalSevere, Day 4-8 has day4-8 - don't assume all days identical.
7. **Stopping mid-feature**: If implementing dark mode, ALL components need it. If fixing verification, fix the entire workflow. Don't deliver half-solutions.
8. **Asking before acting**: User reported broken borders → fix with pmIgnore immediately. Don't ask "should I fix this?" Just fix it and report completion.

## Task Execution Patterns

### Bug Fixes
1. **Reproduce the issue** - Read the code paths involved
2. **Identify root cause** - Don't patch symptoms
3. **Fix comprehensively** - If verification stats are wrong, fix BOTH the calculation AND display
4. **Test the build** - `npm run build` must succeed
5. **Report completion** - State what was fixed and how

### Feature Implementation
1. **Understand the full scope** - If adding "day comparison," that means state separation, UI components, and selectors all at once
2. **Work systematically** - Plan the changes (state → logic → UI → test), then execute all steps
3. **Follow existing patterns** - Check how similar features work (e.g., forecastSlice → verificationSlice pattern)
4. **Complete the integration** - Wire everything together, don't leave TODOs
5. **Build successfully** - No TypeScript errors, successful production build

### Refactoring/Polish
Example: "Dark mode is half-done" means:
1. **Audit comprehensively** - Grep for all CSS files, read each one
2. **Create a mental map** - Which components have dark mode? Which don't?
3. **Fix systematically** - Add dark mode to ALL identified gaps in one session
4. **Verify completeness** - Legend text, toolbar buttons, map tiles - everything
5. **Don't stop until done** - "Do not finish until the whole dark mode is complete" is literal

## External Dependencies

- **@geoman-io/leaflet-geoman-free**: Drawing library (v2.18.3)
- **@turf/turf**: Spatial analysis for verification (point-in-polygon)
- **html2canvas**: Map screenshot export
- **react-leaflet**: React bindings for Leaflet (v4.2.1)

## Testing Notes

Performance tests (AppPerformance.test.tsx) measure:
- Map rendering with 100 features
- Redux state updates
- Categorical derivation speed

Keep operations under 100ms for UI responsiveness.

## Debugging Strategies

### When Something Breaks
1. **Check the error message** - TypeScript errors are usually precise about what's wrong
2. **Trace the data flow** - For Redux: action → reducer → selector → component
3. **Verify the structure** - Maps vs Arrays, proper serialization middleware
4. **Test in isolation** - Can you reproduce with just the component/function in question?
5. **Read related code** - The fix is often in a nearby file you haven't read yet

### Performance Issues
- Target: Operations under 100ms for UI responsiveness
- Check: AppPerformance.test.tsx for benchmarks
- Profile: Use React DevTools Profiler for re-render tracking
- Optimize: Memoization (React.memo, useMemo, useCallback) only when measured

### State Debugging
- Use Redux DevTools to inspect state structure
- Check middleware `ignoredPaths` if Maps aren't updating
- Verify selectors return correct data shape for the current mode
- Remember: forecast state ≠ verification state (separate slices)

## Interaction Expectations

### Communication Style
- **Concise updates**: "Fixed X by doing Y" not "I think we should maybe..."
- **Confidence with competence**: If you've verified the solution works, state it
- **Proactive problem-solving**: Found a related issue while fixing something? Fix both
- **No hand-holding requests**: Don't ask "Should I continue?" - just continue

### Quality Standards
- **Build must succeed**: `npm run build` with no errors is non-negotiable
- **Complete features**: Don't commit half-implemented workflows
- **Consistent patterns**: Follow existing code style and architecture
- **Test coverage**: Run existing tests, they must pass

### Red Flags (Avoid These)
- "Let me know if you want me to..." → Just do it if it's obviously needed
- "I could also fix..." → Either it needs fixing or it doesn't; decide and act
- "Should we test this?" → Yes, always test. Build and verify
- Stopping after implementing 1 of 3 related components
- Asking for approval on obvious bug fixes

---

**Key Documentation Files:**
- docs/Outlook_Info.md: SPC outlook specifications, color codes, conversion rules
- ROADMAP.md: Feature versioning, current v0.5.0-beta status
- README.md: Setup, available scripts

**Remember:** This maintainer trusts you to work autonomously. Use that trust to deliver complete, high-quality features without constant supervision. When in doubt, check the codebase - the patterns are there.
