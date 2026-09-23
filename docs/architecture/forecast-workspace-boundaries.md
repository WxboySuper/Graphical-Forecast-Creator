# Forecast workspace boundaries

Issue: [#914](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/914)

This document defines the route, product ownership, and persistence contract
for the v1.8 Forecast area. It is the architectural base for the workspace
implementation, not a promise that every workspace already has a page.

## Route contract

The planned Forecast routes are:

| Workspace | Canonical path | v1.8 state | Availability source |
| --- | --- | --- | --- |
| Severe | `/forecast/severe` | available now | core Forecast |
| Mesoscale | `/forecast/mesoscale` | future; tracked in #919 | Workspace status |
| Tropical | `/forecast/tropical` | future; tracked separately from the legacy surface | Workspace status |
| Winter | `/forecast/winter` | future; tracked in #913 | Workspace status |
| Custom | `/forecast/custom` | planned; current path is `/custom-products` | `customProducts` |

`/forecast` is a compatibility entry point for the Severe workspace. The route
contract preserves compatible query parameters and the hash when the routing
follow-up redirects it to `/forecast/severe`. The workspace ID comes from the
URL, not from a global "current workspace" value in Redux.

`src/App.tsx` registers the current Severe route and its legacy redirect.
`src/config/featureSurfaces.ts` owns the actual gated route definitions, which
`src/routing/buildFeatureGatedRoutes.tsx` filters by exposure. The planned paths
above do not register pages. Route tests exercise these active definitions.

Future workspaces stay unregistered based on their workspace status. A direct
request falls through the normal application fallback instead of mounting an
unfinished page. A workspace promoted to gated must also have an explicit
feature exposure key; its route and visible navigation use the same exposure
decision. The existing top-level `/tropical` route and navigation remain
separately gated by `tropicalWorkspace`; that key does not expose the planned
`/forecast/tropical` workspace.

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
- Tropical, Mesoscale, and Winter have no production state contract yet. Their
  planned `/forecast/*` workspaces remain unregistered while status is future.
  The separate legacy `/tropical` route and navigation remain gated by
  `tropicalWorkspace`; Mesoscale and Winter have no legacy gated surface.

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

- a missing workspace id is classified as Severe only when the payload passes
  the existing `GFCForecastSaveData` validation;
- if it does not pass that validation, the importer checks the Custom schema
  owned by #915;
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
The cloud-save follow-up must attempt sync after local autosave, preserve the
local copy after a failed sync, and require an explicit retry or leave
confirmation before workspace navigation. Monitor and Verification read saved
results. They never mutate workspace-owned editing state.

Discussion drafts remain scoped by their existing scope id. Moving Discussion
inside Severe must not key drafts only by route, because route changes and
shared day groupings would make drafts collide or disappear.

## Exposure and side effects

Workspace status keeps future Mesoscale, Tropical, and Winter pages
unregistered. When implementation is ready, a future workspace must be
deliberately promoted and a gated workspace must receive an explicit exposure
key before route registration. The exposure registry continues to govern
Custom, which keeps its current product exposure and entitlement behavior.

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
