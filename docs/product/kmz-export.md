# KMZ / KML export (prototype)

Issue: [#621](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/621)

GFC can export forecast outlook polygons to KMZ/KML for use in Google Earth and other GIS consumers. This document describes the prototype behavior, supported scope, and known styling limitations.

## Prototype strategies

Two export strategies exist for side-by-side testing. Set the strategy in devtools:

```js
localStorage.setItem('gfc-kmz-export-strategy', 'structured-kml'); // default
localStorage.setItem('gfc-kmz-export-strategy', 'split-kmz');
```

| Strategy | Output shape | Best for |
| --- | --- | --- |
| `structured-kml` | One `doc.kml` with `Day > Outlook > Placemark` folders | Simple sharing, single-file import |
| `split-kmz` | KMZ with `days/day-N/<outlook>.kml` plus root network links | Large cycles, toggling layers independently |

## Export scope

- **Current day** — active forecast day only
- **Full cycle** — every populated day in the forecast cycle

Outlook filtering by type is supported in the utility layer (`outlookTypes` option) but not yet exposed in the toolbar.

## What is preserved

- Polygon and multipolygon geometry, including holes
- Outlook type, probability key, day, significance, and CIG metadata via KML `ExtendedData`
- Fill colors from GFC `colorMappings`
- Per-outlook opacity when configured in day metadata
- Thicker outlines for significant (`#`) contours

## Known limitations

These are intentional in the prototype; consumers must not assume visual parity with GFC maps.

| GFC feature | KMZ behavior |
| --- | --- |
| CIG hatch patterns (`CIG1`–`CIG3`) | Light fill only; hatch pattern is not exported. `gfc_cig` ExtendedData records the level. |
| Significant (`#`) hatch overlay | Fill color preserved; black hatch overlay is not exported. Border width is increased instead. |
| Custom product layers | Excluded by default (`includeCustomLayers` is off). Hatch styles are not portable. |
| Map labels / legend / status badges | Not exported (geometry export only). |
| Line-only or point geometries | Skipped; only polygon/multipolygon features export. |
| `CIG0` entries | Omitted from monitor-style rendering elsewhere; exported only when polygons exist under that key. |

## Existing exports

JSON save, workflow/cycle ZIP packages, and map image export are unchanged. KMZ export is gated behind the `kmzExport` feature flag (local/beta only during prototype validation).

## Code locations

- `src/utils/kmzExport/` — conversion utilities
- `src/components/ForecastWorkspace/forecastWorkspaceActions.tsx` — download handlers
- `src/components/IntegratedToolbar/IntegratedToolbar.tsx` — prototype toolbar buttons

## Recommended production follow-up

1. Pick one strategy after testing in Google Earth, QGIS, and ArcGIS Online.
2. Add an export modal for scope (day/cycle/outlook) instead of two toolbar buttons.
3. Optionally bundle KMZ inside the existing cycle ZIP package.
4. Decide whether custom layers warrant a separate KML folder with simplified solid fills.
