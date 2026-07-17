# Custom layers and reusable products

Custom content uses a snapshot-first contract. A one-off layer contains every category style and polygon needed to render it; it never depends on a hosted template. Loading a premium reusable product into a map copies its current version into an embedded snapshot. Later product edits, archival, deletion, or subscription expiration therefore cannot change an existing map.

## Exposure

The `customProducts` registry key is enabled only for the `local` build target while the feature is implemented and reviewed. Beta, staging, and production must not render custom-product routes, navigation, toolbar controls, unavailable-state messages, or start custom-product side effects. Broader exposure requires separate owner authorization.

## Schema rules

- A reusable product has a stable ID and a monotonically increasing positive version.
- A product or one-off layer contains 1–12 ordered categories.
- Product and category labels are 1–64 trimmed characters.
- Colors use six-digit hex values; opacity is in the inclusive 0–1 interval.
- Supported hatches are none, diagonal, reverse diagonal, and crosshatch.
- Custom geometry is GeoJSON Polygon or MultiPolygon with closed linear rings.
- Embedded snapshots contain no entitlement dependency and remain renderable read-only.
- Archived or premium-expired products are read-only and cannot seed new maps; historical layer snapshots remain usable.

The TypeScript contracts live in `src/types/customProducts.ts`; strict runtime validators and snapshot/version helpers live in `src/lib/customProducts.ts`.

