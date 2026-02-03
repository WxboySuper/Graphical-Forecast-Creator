# Forecast Cycle Workflow - v0.5.0 Implementation

## Overview

Version 0.5.0 introduces the **Forecast Cycle Workflow**, enabling forecasters to manage multiple day outlooks and transition between different outlook formats. This provides a realistic operational workflow where Day 4-8 outlooks are progressively refined as they become Day 3, Day 2, and Day 1 outlooks.

## Background: SPC Outlook Day Types

The Storm Prediction Center (SPC) issues convective outlooks for different time periods, each with distinct formats:

### Day 1 & Day 2 Outlooks
- **Format**: Full probability and categorical outlooks
- **Hazard Types**: Tornado, Wind, Hail probabilities + Categorical (TSTM, MRGL, SLGT, ENH, MDT, HIGH)
- **CIG Levels**: CIG 0, 1, 2, 3 (Day 1 & 2)
- **Detail Level**: High resolution with specific probability contours
- **Typical Issuance**: 
  - Day 1: Multiple updates throughout the day (0100, 0600, 1300, 1630, 2000 UTC)
  - Day 2: Multiple updates (0600, 1730, 0100 UTC)

### Day 3 Outlook
- **Format**: Total Severe probability and categorical outlooks
- **Hazard Types**: 
  - **Total Severe Probability** (combined threat, NOT separate tornado/wind/hail)
  - **Categorical** (TSTM, MRGL, SLGT, ENH, MDT only - no HIGH)
- **CIG Levels**: CIG 0, 1, 2 (no CIG 3)
- **Total Severe Probability Breakdown**:
  - 5%: CIG 0, 1, 2
  - 15%: CIG 0, 1, 2
  - 30%: CIG 0, 1, 2
  - 45%: CIG 0, 1, 2
  - 60%: CIG 0, 1, 2
- **Categorical Conversion from Total Severe**:
  - MRGL (Marginal)
    - 5%: CIG 0, 1
  - SLGT (Slight)
    - 5%: CIG 2
    - 15%: CIG 0, 1
    - 30%: CIG 0
  - ENH (Enhanced)
    - 15%: CIG 2
    - 30%: CIG 1, 2
    - 45%: CIG 0, 1
    - 60%: CIG 0
  - MDT (Moderate)
    - 45%: CIG 2
    - 60%: CIG 1, 2
- **Detail Level**: Moderate resolution
- **Typical Issuance**: Once per day (0330 UTC)
- **Geographic Extent**: Similar to Day 1/2 (CONUS focus)

### Day 4-8 Outlook (Individual Days)
- **Format**: Probabilistic (NOT categorical like Days 1-3)
- **Hazard Types**: Special "Day 4-8" outlook type with only 15% and 30% probability levels
  - **15%** (Yellow) - General risk areas
  - **30%** (Orange) - Enhanced risk areas
  - NO categorical conversion (not TSTM/MRGL/SLGT/etc.)
  - NO separate tornado/wind/hail breakdown
- **CIG Levels**: None
- **Individual Days**: Track as separate days (4, 5, 6, 7, 8) not merged as "4-8"
- **Detail Level**: Low resolution, broader areas
- **Typical Issuance**: Twice per day (0400 and 1700 UTC)
- **Geographic Extent**: Can extend farther (includes Alaska/Hawaii perspectives)
- **Color Scheme**:
  - 15%: Yellow (#FFFF00)
  - 30%: Orange (#FF8C00)

## Core Implementation Requirements

### 1. Multi-Day Outlook Data Structure

**Update the Redux Store (`forecastSlice.ts`)**

```typescript
// Day type now includes individual days 4, 5, 6, 7, 8 instead of merged '4-8'
type DayType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

// Outlook types vary by day
type Day1_2_OutlookType = 'tornado' | 'wind' | 'hail' | 'categorical';
type Day3_OutlookType = 'totalSevere' | 'categorical';
type Day4_8_OutlookType = 'day4-8'; // Special outlook type with only 15% and 30%

interface OutlookDay {
  day: DayType;
  data: OutlookData; // Structure varies by day type
  metadata: {
    issueDate: string; // ISO 8601
    validDate: string; // ISO 8601
    issuanceTime: string; // UTC time like "0600"
    createdAt: string;
    lastModified: string;
  };
}

interface ForecastCycle {
  days: Partial<Record<DayType, OutlookDay>>;
  currentDay: DayType;
  cycleDate: string; // Date of the forecast cycle
}

// OutlookData structure adapts based on day:
// - Day 1/2: Has tornado, wind, hail, categorical maps
// - Day 3: Has totalSevere, categorical maps
// - Day 4-8: Has only day4-8 map (15% and 30% only)
interface OutlookData {
  // Day 1 & 2 fields
  tornado?: Map<string, GeoJSON.Feature[]>;
  wind?: Map<string, GeoJSON.Feature[]>;
  hail?: Map<string, GeoJSON.Feature[]>;
  
  // Day 3 field
  totalSevere?: Map<string, GeoJSON.Feature[]>;
  
  // Day 1, 2, 3 field (with categorical conversion)
  categorical?: Map<string, GeoJSON.Feature[]>;
  
  // Day 4-8 field (15% and 30% only, no categorical)
  'day4-8'?: Map<string, GeoJSON.Feature[]>;
}
```

**Store Structure Updates:**
- Current state only holds one outlook at a time
- Update to hold a `ForecastCycle` object containing multiple days
- Add `currentDay` to track which outlook is being actively edited
- Maintain backward compatibility with existing save files
- Support day-specific outlook structures

### 2. Day Navigation Component

**Create `OutlookDaySelector.tsx`**

```typescript
interface OutlookDaySelectorProps {
  currentDay: DayType; // 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  availableDays: DayType[];
  onDayChange: (day: DayType) => void;
}
```

**Features:**
- Tab-style navigation between Day 1, Day 2, Day 3, Day 4, Day 5, Day 6, Day 7, Day 8
- Visual indicator for which days have active outlooks
- Disable/enable days based on what's been created
- Show metadata (issue time, valid date) for each day
- Allow creating new outlook days

**UI/UX Considerations:**
- Prominent placement in toolbar (next to Load/Save buttons)
- Clear visual distinction between active and inactive days
- Warning when switching days with unsaved changes
- Breadcrumb-style display: "Forecast Cycle for March 15, 2026 > Day 3"

### 3. Outlook Format Constraints

**Implement Format Detection and Validation (`outlookUtils.ts`)**

```typescript
function getOutlookConstraints(day: DayType) {
  switch (day) {
    case 1:
    case 2:
      return {
        outlookTypes: ['tornado', 'wind', 'hail', 'categorical'] as const,
        allowedCIG: [0, 1, 2, 3],
        allowedCategorical: ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT', 'HIGH'],
        requiresConversion: true, // Categorical from probabilities
        probabilities: {
          tornado: ['2%', '5%', '10%', '15%', '30%', '45%', '60%'],
          wind: ['5%', '15%', '30%', '45%', '60%', '75%', '90%'],
          hail: ['5%', '15%', '30%', '45%', '60%']
        }
      };
    case 3:
      return {
        outlookTypes: ['totalSevere', 'categorical'] as const,
        allowedCIG: [0, 1, 2],
        allowedCategorical: ['TSTM', 'MRGL', 'SLGT', 'ENH', 'MDT'], // No HIGH
        requiresConversion: true, // Categorical from total severe
        probabilities: {
          totalSevere: ['5%', '15%', '30%', '45%', '60%']
        }
      };
    case 4:
    case 5:
    case 6:
    case 7:
    case 8:
      return {
        outlookTypes: ['day4-8'] as const,
        allowedCIG: [],
        allowedCategorical: [], // No categorical for Day 4-8
        requiresConversion: false, // No conversion
        probabilities: {
          'day4-8': ['15%', '30%'] // Only 15% (Yellow) and 30% (Orange)
        }
      };
  }
}
```

**UI Adjustments Based on Day Type:**
- Day 1/2: Show tornado, wind, hail, categorical outlook types with CIG 0-3
- Day 3: Show totalSevere and categorical outlook types with CIG 0-2 only
- Day 4-8: Show only day4-8 outlook type with 15% and 30% probabilities (no categorical, no CIG)

**OutlookPanel Updates:**
- Dynamically filter available outlook types based on current day
  - Day 1/2: tornado, wind, hail, categorical
  - Day 3: totalSevere, categorical
  - Day 4-8: day4-8 only
- Show/hide probability selectors based on day and outlook type
- Show/hide CIG selectors (Day 1/2 show CIG 0-3, Day 3 shows CIG 0-2, Day 4-8 no CIG)
- Display helper text:
  - Day 3: "Day 3 uses Total Severe probability (combined threat)"
  - Day 4-8: "Day 4-8 outlooks use 15% (Yellow) and 30% (Orange) only"

### 4. Import/Load Functionality

**Enhance `fileUtils.ts`**

```typescript
interface GFCForecastSaveData {
  version: string; // "0.5.0"
  type: 'single-day' | 'forecast-cycle';
  
  // Single day format (backward compatible)
  outlook?: OutlookDay;
  
  // Multi-day format (new)
  forecastCycle?: ForecastCycle;
}
```

**Load Workflow:**
1. User clicks "Load Forecast" button
2. File input accepts `.json` and `.gfc` files
3. Parse and validate JSON structure
4. Determine if single-day or multi-day format
5. If single-day, prompt user: "Import as which day?" (Day 1, 2, 3, or 4-8)
6. Apply format migration if needed
7. Populate Redux store
8. Render polygons on map
9. Set current day to the first available outlook

**Migration Logic:**
- **Day 4-8 → Day 3**: Add probability areas based on categorical (best guess)
- **Day 3 → Day 1/2**: Keep all data, notify that CIG 3 is now available
- **Any Day → Day 4-8**: Strip probabilities, simplify categorical

**File Format Detection:**
```typescript
function detectOutlookFormat(data: any): 'single-day' | 'forecast-cycle' {
  if (data.forecastCycle) return 'forecast-cycle';
  if (data.outlook) return 'single-day';
  // Legacy detection
  if (data.categorical || data.tornado) return 'single-day';
  throw new Error('Invalid file format');
}
```

### 5. Schema Versioning & Migration

**Version Detection:**
```typescript
interface MigrationResult {
  data: GFCForecastSaveData;
  migrationsApplied: string[];
  warnings: string[];
}

function migrateToLatest(data: any): MigrationResult {
  const version = data.version || '0.4.0'; // Default to 0.4.0 if no version
  
  let migratedData = data;
  const migrations: string[] = [];
  
  if (version === '0.4.0') {
    migratedData = migrateFrom_0_4_0_to_0_5_0(migratedData);
    migrations.push('0.4.0 → 0.5.0');
  }
  
  return {
    data: migratedData,
    migrationsApplied: migrations,
    warnings: detectWarnings(migratedData),
  };
}
```

**0.4.0 → 0.5.0 Migration:**
- Wrap single outlook in `ForecastCycle` structure
- Set default day to Day 1
- Add metadata fields (issue date, valid date)
- Preserve all polygon data and properties
- Update version string

**Display Migration Info:**
- Show toast notification: "File migrated from v0.4.0 to v0.5.0"
- Log warnings to console
- Offer to save updated format

### 6. Export Enhancements

**Update `exportUtils.ts`**

**Export Options:**
1. **Export Current Day**: Save only the currently edited day
2. **Export All Days**: Save complete forecast cycle
3. **Export as Day X**: Convert current outlook to specific day format

**File Naming Convention:**
```
GFC_ForecastCycle_2026-03-15.json  // Multi-day
GFC_Day3_2026-03-16.json           // Single day
```

**Export Modal Updates:**
- Radio buttons to select export scope
- Checkbox: "Include metadata"
- Preview of what will be exported (day count, polygon count)

### 7. Auto-Save & Recovery

**Update `useAutoSave.ts`**

```typescript
const AUTO_SAVE_KEY = 'gfc-forecast-cycle-autosave';
const AUTO_SAVE_INTERVAL = 5000; // 5 seconds

function useAutoSave() {
  const forecastCycle = useSelector(selectForecastCycle);
  
  useEffect(() => {
    const saveTimer = setInterval(() => {
      localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify({
        version: '0.5.0',
        type: 'forecast-cycle',
        forecastCycle,
        savedAt: new Date().toISOString(),
      }));
    }, AUTO_SAVE_INTERVAL);
    
    return () => clearInterval(saveTimer);
  }, [forecastCycle]);
}
```

**Recovery on Startup:**
- Check for auto-save data on app load
- Compare timestamp to detect recent work
- Prompt user: "Recover forecast from 2 minutes ago?" (Yes/No)
- If Yes, load auto-save
- If No, clear auto-save and start fresh

### 8. UI/UX Enhancements

**Loading Indicators:**
- Show spinner during file load
- Progress bar for large files (if applicable)
- Status messages: "Parsing file...", "Validating data...", "Rendering polygons..."

**Error Handling:**
- Friendly error messages for invalid files
- Specific guidance: "This file appears to be from an older version. Would you like to migrate it?"
- Validation errors: "Day 4-8 outlooks cannot have CIG levels. Remove CIG data?"

**Help/Documentation:**
- Add help icon next to Day Selector
- Modal explaining day types and format differences
- Examples: "Day 4-8 is categorical only, Day 1/2 has full probabilities"

**Toast Notifications:**
- "Outlook loaded successfully"
- "Switched to Day 3 outlook"
- "Auto-save enabled"
- "File migrated from v0.4.0"

## Implementation Phases

### Phase 1: Data Structure & Store Updates
- [ ] Update Redux store to support `ForecastCycle`
- [ ] Update selectors to work with multi-day structure
- [ ] Add actions for switching between days
- [ ] Test backward compatibility with existing state

### Phase 2: Day Navigation Component
- [ ] Create `OutlookDaySelector` component
- [ ] Integrate into main toolbar
- [ ] Wire up Redux actions
- [ ] Add visual indicators for active days

### Phase 3: Format Constraints
- [ ] Implement `getOutlookConstraints` utility
- [ ] Update `OutlookPanel` to respect constraints
- [ ] Hide/show controls based on day type
- [ ] Add validation when switching days

### Phase 4: Load/Import System
- [ ] Update file input to handle both single and multi-day
- [ ] Implement format detection
- [ ] Add migration logic for 0.4.0 → 0.5.0
- [ ] Prompt for day selection on single-day import
- [ ] Render loaded polygons on map

### Phase 5: Export Enhancements
- [ ] Add export scope selection (current day vs. all days)
- [ ] Update file naming conventions
- [ ] Implement day format conversion on export

### Phase 6: Auto-Save & Recovery
- [ ] Update auto-save to handle multi-day structure
- [ ] Implement recovery prompt on startup
- [ ] Test auto-save with day switching

### Phase 7: Testing & Polish
- [ ] Test all migration paths
- [ ] Test day switching with unsaved changes
- [ ] Test import/export round-trips
- [ ] Add error handling and user feedback
- [ ] Write unit tests for migration logic

## Technical Considerations

### Performance
- Lazy-load polygons for non-active days (don't render all days simultaneously)
- Debounce auto-save when switching days rapidly
- Consider using Web Workers for large file parsing

### Data Integrity
- Validate polygon geometries on import
- Check for CIG/probability mismatches
- Warn about invalid categorical conversions
- Preserve user data even if format is unexpected

### Testing Strategy
- Unit tests for migration functions
- Integration tests for full load/save cycle
- E2E tests for day switching workflow
- Test with sample files from each version

### Edge Cases
- Empty forecast cycles (no days created yet)
- Partial forecast cycles (only Day 3 exists)
- Corrupt or malformed JSON files
- Very old versions (pre-0.4.0)
- Switching days with drawing in progress

## User Stories

### Story 1: Starting a New Forecast Cycle
> As a forecaster, I want to create a new forecast cycle for March 15, 2026, so I can plan outlooks for multiple days.

**Acceptance Criteria:**
- Can create empty forecast cycle with today's date
- Can choose which days to create (Day 1, 2, 3, or 4-8)
- Each day starts with appropriate format constraints

### Story 2: Progressive Refinement
> As a forecaster, I want to import my Day 4-8 outlook and convert it to a Day 3 format, so I can add probability details as the event gets closer.

**Acceptance Criteria:**
- Can load Day 4-8 JSON
- Can select "Import as Day 3"
- App adds probability area templates based on categorical areas
- User can then edit and add CIG levels

### Story 3: Multi-Day Management
> As a forecaster, I want to work on Day 1, Day 2, and Day 3 outlooks simultaneously, so I can maintain consistency across all active forecasts.

**Acceptance Criteria:**
- Can switch between days without losing work
- Visual indicator shows which days have data
- Auto-save persists all days
- Can export all days as one JSON file

### Story 4: Loading Old Forecasts
> As a user with v0.4.0 files, I want to load my old outlooks into v0.5.0, so I don't lose my previous work.

**Acceptance Criteria:**
- App detects v0.4.0 format
- Prompts: "Import as which day?"
- Successfully migrates data structure
- Shows confirmation: "File migrated from v0.4.0"

## Success Metrics

- Users can create, save, and load multi-day forecast cycles
- Migration from v0.4.0 files is seamless
- Day type constraints are enforced correctly
- Auto-save preserves work across day switches
- Load times remain under 2 seconds for typical files
- Zero data loss when switching between days

## Future Considerations (Post-v0.5.0)

- **Outlook History**: Track changes over time for verification
- **Comparison View**: Side-by-side view of Day 3 vs Day 2
- **Smart Suggestions**: Recommend probability areas based on Day 4-8 categorical
- **Collaborative Mode**: Multiple users editing different days
- **Version Control**: Git-like system for outlook revisions
- **Template Library**: Pre-built outlook templates for common setups

---

**Document Version**: 1.0  
**Target Release**: v0.5.0-alpha  
**Last Updated**: January 30, 2026
