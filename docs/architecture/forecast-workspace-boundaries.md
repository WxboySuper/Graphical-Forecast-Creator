# Forecast workspace boundaries

Issue: [#914](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/914)

This document defines the route, product ownership, and persistence contract
for the v1.8 Forecast area. It is the architectural base for the workspace
implementation, not a promise that every workspace already has a page.

## Route contract

The planned Forecast routes are:

| Workspace | Canonical path | v1.8 state | Exposure owner |
| --- | --- | --- | --- |
| Severe | `/forecast/severe` | available now | core Forecast |
| Mesoscale | `/forecast/mesoscale` | gated until #919 enables it | `mesoscaleWorkspace` |
| Tropical | `/forecast/tropical` | future, disabled | `tropicalWorkspace` |
| Winter | `/forecast/winter` | future, disabled | `winterWorkspace` |
| Custom | `/forecast/custom` | planned; current path is `/custom-products` | `customProducts` |

`/forecast` is a compatibility entry point. It redirects to
`/forecast/severe` while preserving compatible query parameters and the hash.
The destination shows a temporary notice explaining the URL change. The
workspace ID comes from the URL, not from a global "current workspace" value in
Redux. That makes refresh, browser history, and shared links deterministic.

`src/App.tsx` registers the current Severe route and its legacy redirect.
`src/config/featureSurfaces.ts` owns the actual gated route definitions, which
`src/routing/buildFeatureGatedRoutes.tsx` filters by exposure. The planned paths
above do not register pages. Route tests exercise these active definitions.

Future routes stay unregistered when their feature is off. A direct request
falls through the normal application fallback instead of mounting a disabled
page or running workspace code. When a workspace is enabled, its route must be
registered only through the same feature exposure decision.

## Compatibility paths

Existing links remain useful during the migration:

- `/forecast` redirects to `/forecast/severe`.
- `/discussion` remains available until #916 supplies the Severe workspace
  discussion surface. That issue owns the redirect or in-workspace handoff.
- `/custom-products` remains available until #915 supplies the Custom route.
  That issue owns the compatibility redirect and product handoff.
- Existing top-level `/monitor` and `/verification` routes do not move.

The compatibility paths are temporary routing concerns. They do not create a
second copy of forecast or discussion state.

## State ownership

The shared Forecast route host owns only state and behavior that apply to
navigation between products:

- active workspace route and workspace navigation;
- unsaved-change and failed-cloud-save navigation protection;
- common local autosave and cloud-sync coordination;
- compatibility redirect state;
- shared file and notification utilities.

Each workspace owns its complete product session, including its domain data,
controls, layout, discussions, and save/restore lifecycle:

- Severe owns severe outlook geometry, outlook editing, and its discussion
  content. Existing `ForecastState` and `ForecastCycle` remain the source of
  truth during the Severe migration.
- Mesoscale owns provider parameter selection, model context, short-term
  forecast geometry, and its discussion composition. It must not write into
  Severe outlook maps.
- Custom owns custom forecast layers, category/product editing, its discussion
  editor, and its product metadata. Existing custom layers embedded in legacy
  Severe days remain readable while #915 moves the UI.
- Tropical and Winter have no production state contract yet. Their exposure
  entries stay disabled.

The URL is the only persistent active-workspace selector. Temporary controls,
map interaction state, and open panels stay local to the active workspace. They
are not part of a saved product unless that workspace later gives them a
user-facing restore requirement.

## Save, load, export, and restore

Every new saved product identifies its workspace. Severe, Mesoscale, and
Custom records are separate products even when the library displays them
together. Existing Severe data keeps using `GFCForecastSaveData` during the
migration.

New workspace payloads should use an optional envelope field such as
`workspaceId` around the existing forecast payload. The field is additive and
must not replace `forecastCycle` or change the legacy `version` meaning. The
envelope rules are:

- a missing workspace id is classified as Severe only when the payload matches
  the valid legacy Severe schema;
- otherwise the payload is checked against the valid Custom schema;
- an unknown workspace id is malformed and must not be silently treated as a
  different workspace;
- a known but disabled workspace is not opened from an import; the user gets a
  clear unavailable-workspace result;
- a workspace export contains only data owned by that workspace plus shared
  cycle metadata required to identify the cycle;
- a full-cycle export can retain the current legacy forecast payload so old
  readers keep working;
- restore selects the route from validated metadata, then hydrates only the
  selected workspace's state.

Cloud product records follow the same rule. `workspaceId` is required for new
records and is used for filtering, restore, and product-specific rendering.
Premium users get automatic Firebase sync attempts after local autosave. A
failed sync preserves the local copy and requires an explicit retry or leave
confirmation before workspace navigation. Monitor and Verification read saved
results. They never mutate workspace-owned editing state.

Discussion drafts remain scoped by their existing scope id. Moving Discussion
inside Severe must not key drafts only by route, because route changes and
shared day groupings would make drafts collide or disappear.

## Exposure and side effects

The exposure registry owns whether Mesoscale, Tropical, Winter, and Custom
workspace pages may be registered. The registry currently leaves Mesoscale and
Winter off on every target. Tropical remains governed by its existing disabled
entry. Custom keeps its current product exposure and entitlement behavior.

No future workspace page, provider client, map layer, or repository may be
imported at module scope from the always-on application shell. Route loaders and
feature boundaries must be the initialization boundary for unfinished or
server-backed work.

## Follow-up ownership

- #915 registers `/forecast/custom`, moves Custom UI, and owns custom-product
  compatibility behavior.
- #916 embeds Discussion in Severe and owns `/discussion` handoff behavior.
- #917 adds the Forecast workspace switcher and removes Discussion as a peer
  navigation item after the handoff exists.
- #918 defines the provider data contract without adding workspace state to
  Severe.
- #919 registers and enables Mesoscale in stages, then defines its payload
  details against this boundary.
- #921 consumes Mesoscale data in Monitor as read-only display state.
