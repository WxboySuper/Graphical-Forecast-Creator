## 2024-05-22 - Accessibility and Interaction Patterns
**Learning:** Found frequent use of `window.alert` and `window.confirm` for user feedback, and buttons using emojis as primary content without `aria-label`.
**Action:** Replace `alert` with non-blocking Toast notifications. Ensure all icon/emoji-based buttons have descriptive `aria-label` attributes.

## 2024-05-24 - Map Interaction and Layering
**Learning:** Overriding global Leaflet classes like `.leaflet-pane` with `z-index` can disrupt the internal stacking order of map panes (e.g., placing tooltips behind overlays).
**Action:** Avoid global overrides for library-managed styles. Rely on Leaflet's built-in pane management or use specific pane targeting for z-index adjustments.
