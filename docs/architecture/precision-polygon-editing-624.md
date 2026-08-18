# Precision polygon editing research (#624)

Research and local prototypes for vertex removal and independent CIG/probability polygon editing.

## Current behavior (baseline)

| Capability | Status |
|------------|--------|
| Vertex drag reshape | Works in Pan mode via always-on OpenLayers `Modify` |
| Vertex deletion | OpenLayers default: **Alt+single-click** on a vertex handle (undocumented in GFC UI) |
| Whole polygon delete | Delete mode + click |
| CIG vs probability structure | Separate GeoJSON features keyed by `probability` (`5%`, `CIG2`, etc.) in the same outlook `Map` |
| Edit target selection | **None** — `Modify` uses the full active-outlook vector source |
| Overlapping movement | Coincident vertices across features move together |
| Undo per modify gesture | One undo step **per feature** when shared vertices move multiple polygons |

Key code: `src/components/Map/OpenLayersForecastMap.tsx`

## Local prototypes

Set via the **Precision edit prototype** dropdown on the forecast map (local build only) or `localStorage` key `gfc_precision_edit_prototype`.

| Prototype | Vertex deletion UX | Independent CIG/probability | Undo |
|-----------|-------------------|----------------------------|------|
| `baseline` | Hidden (OL default Alt+click) | No — shared vertices co-move | Per feature |
| `vertex-hints` | Help text + Alt/Shift+click on vertex | No | Per feature |
| `active-tier-filter` | Hidden | **Yes** — only active outlook-panel tier is editable | Per feature |
| `hover-target` | Hidden | **Partial** — only topmost polygon under cursor | Per feature |
| `combined` | Help text + Alt/Shift+click | **Yes** — active-tier filter | **Single undo step** |

### Recommended path for production

1. **Ship `active-tier-filter`** — reuses the existing probability/CIG selector as the edit target (no new UI concept).
2. **Document vertex deletion** in map help and docs (Alt+click; Shift+click enabled in hint prototypes).
3. **Batch undo** (`updateFeaturesBatch`) when a gesture updates multiple features.
4. **Defer `hover-target`** unless users need edit-without-switching-tier; it is harder to discover.

## Reproduction notes

### Independent editing (`active-tier-filter` or `combined`)

1. Forecast → Tornado → select **5%** → Draw a polygon.
2. Select **CIG2** → Draw overlapping polygon (snap optional).
3. Pan mode → select **5%** → drag a vertex → only the 5% polygon moves.
4. Select **CIG2** → drag a vertex → only CIG2 moves.

### Vertex removal (`vertex-hints` or `combined`)

1. Pan mode → hover a vertex handle on a polygon.
2. **Alt+click** or **Shift+click** the vertex handle (not the polygon interior).

## Follow-up tasks

- [ ] Product pick: `active-tier-filter` vs `hover-target` vs hybrid
- [ ] Add dedicated **Edit** toolbar mode vs Pan+filter (optional UX polish)
- [ ] Update `DocumentationContent` keyboard shortcuts
- [ ] Remove prototype picker before production ship
- [ ] E2E test for tier-filtered modify
