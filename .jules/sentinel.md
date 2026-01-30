## 2026-01-24 - [Stored XSS in Leaflet Tooltips]
**Vulnerability:** Found a Stored Cross-Site Scripting (XSS) vulnerability in `ForecastMap.tsx`. The `bindTooltip` method was being called with an HTML string constructed using the `probability` variable, which is derived from user input (loaded from localStorage or potential file imports). If a user loaded a manipulated forecast file, malicious scripts could execute when hovering over a map feature.
**Learning:** Leaflet's `bindTooltip` and `bindPopup` methods render HTML by default when passed a string. React's automatic escaping does not apply here because Leaflet manipulates the DOM directly.
**Prevention:** Always use `HTMLElement` (constructed via `document.createElement`) instead of HTML strings when using Leaflet's `bindTooltip` or `bindPopup` with dynamic data. Created `createTooltipContent` utility to enforce this pattern.

## 2026-01-25 - [Insecure Data Loading / Missing Input Validation]
**Vulnerability:** `App.tsx` relied on shallow property checks when loading forecast data from `localStorage`. Malformed data (e.g., incorrect types inside arrays) could bypass these checks and cause application crashes (DoS) or potentially undefined behavior when processed by Redux/Leaflet.
**Learning:** Type assertions (`as OutlookData`) in TypeScript do not validate runtime data. Trusting external input structure without deep validation is a robustness and potential security risk.
**Prevention:** Implemented a strict Type Guard (`validateForecastData`) in `validationUtils.ts` that recursively validates the entire JSON structure (including GeoJSON features) before acceptance.
