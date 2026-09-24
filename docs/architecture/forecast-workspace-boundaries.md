# Forecast workspace boundaries

Issue: [#914](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/914)

This document defines the route, product ownership, and persistence contract
for the v1.8 Forecast area. It is the architectural base for the workspace
implementation, not a promise that every workspace already has a page.

Contract and implementation record have separate jobs. This file states the
planned contract. [Forecast workspace route and state decisions](./forecast-workspace-route-state-914.md)
documents the behavior implemented on #1456's current branch/head, not a merged implementation. When the two disagree, this file describes
intent and that record describes that branch's code.

## Route contract

The planned Forecast routes are:

| Workspace | Canonical path | v1.8 state | Exposure owner |
| --- | --- | --- | --- |
| Severe | `/forecast/severe` | available now | core Forecast |
| Mesoscale | `/forecast/mesoscale` | gated until #919 enables it | `mesoscaleWorkspace` |
| Tropical | `/forecast/tropical` | future, disabled | `tropicalWorkspace` |
| Winter | `/forecast/winter` | future, disabled | `winterWorkspace` |
| Custom | `/forecast/custom` | gated; `customProducts` on for every target, availability follows implementation; `/custom-products` remains a separate library route | `customProducts` |

`/forecast` is a compatibility entry point for the Severe workspace. The route
contract preserves compatible query parameters and the hash when the routing
follow-up redirects it to `/forecast/severe`. The workspace ID comes from the
URL, not from a global "current workspace" value in Redux.

## Workspace switching and sharing

The Forecast shell will present exposed workspaces as tabs. A tab is a link to the
workspace's canonical route, not a mode toggle inside one shared forecast editor.
The URL is authoritative: direct navigation and refresh select the workspace from
the canonical path, and back/forward navigation restores the workspace named by
the resulting URL. Each workspace restores only its own session.

The shared host may own only the navigation, common autosave/cloud-sync
coordination, compatibility redirects, and shared file/notification utilities
listed below. Workspace domain data, controls, providers, repositories, editors,
and product-specific persistence stay inside that workspace's route boundary and
must not be initialized by rendering another workspace.

The switcher lists only exposed workspaces; it does not render disabled entries
or placeholder routes. A direct request for an unregistered workspace follows
the application fallback (`/`, or `/beta` in beta mode) without loading that
workspace's code. If a saved-item handoff targets a known but unexposed
workspace, the initiating view reports that the workspace is unavailable and
keeps its current URL and session unchanged. It must not stage a payload or
initialize the unavailable workspace.

Opening a saved or shared item follows the same ownership rule as tab navigation.
A future handoff would carry a proposed typed record descriptor, never a live
editor/Redux payload. No `ForecastRecordDescriptor` type exists in code today.
The shape below names the fields that future handoff must carry:

```ts
// Proposed, not implemented.
interface ForecastRecordDescriptor {
  workspaceId: ForecastWorkspaceId;
  source: 'local' | 'cloud';
  recordId: string; // non-empty opaque ID scoped to source and workspace
}
```

The proposed descriptor would be an internal same-tab handoff, not a shareable
URL. It would sit in session storage with the source payload until the
destination consumes or rejects it. Code today does not stage a descriptor.
The current Cloud Library stages two scoped session storage entries,
`cloudCyclePayload` and `cloudCycleMeta`. The payload entry holds the workspace
envelope, which carries `workspaceId`. The meta entry holds `{ id, label }`
for the cloud record. A cloud source is implied by those keys. Code has no
stored `source` field and no `recordId` field. Under the proposal, the destination
would derive its workspace from the canonical route, validate the pending
descriptor and payload owner, then hydrate state and clear the handoff. In that proposed flow, on refresh the canonical route would still
select the workspace and the loader would retry the staged descriptor handoff before that
workspace's local autosave. If no pending descriptor handoff existed, it would restore only that
workspace's local autosave. If descriptor staging failed, the source view would stay on the source route and report
the failure. #917 owns the switcher and this proposed handoff/refresh behavior.

In the same proposal, the shared host would validate the descriptor's shape, confirm
that its workspace is known and exposed, and require `workspaceId` to match the
destination route. It would not parse the forecast payload. The proposed destination workspace loader would resolve
the record, validate its schema, and confirm that the loaded record's owner
matches the descriptor before any state mutation. Either proposed-validation failure would leave the
current session unchanged. Legacy records without a workspace ID use the
compatibility rules in the envelope section.

Before any workspace navigation, the shared host applies the same unsaved-change
guard regardless of which workspace owns the edits. The user may stay and continue
editing, save, or explicitly confirm that local unsaved edits should be discarded;
cancelling keeps the current workspace and URL. For a cloud-backed record whose
sync fails, keep the local autosave, report that the cloud copy is not current, and
require a successful retry or an explicit leave confirmation before navigation.
These rules apply independently of premium entitlement. #915 and #917 own the
workspace-specific UI and tests for this shared contract.

Canonical workspace paths are the share and bookmark contract. Saved-record
handoffs are session-scoped and are not encoded in shareable URLs. Forecast routes
do not read a workspace selector or saved-record fields from the query string.
The `workspace` query key belongs to Cloud Library tab selection only and never
overrides a Forecast route. Workspace-tab navigation preserves the query string
and hash; there are no Forecast-specific query keys to strip. A legacy or
ambiguous `/forecast` URL is first redirected to Severe and marked for the
temporary migration notice.

Back/forward and refresh must not transfer one workspace's unsaved domain state
into another. If navigation is cancelled by the shared unsaved-change guard, the
active canonical URL remains unchanged. #917 owns the navigation interaction and
regression coverage for direct entry, refresh, history navigation, and cancelled
switches.

`src/App.tsx` registers the Severe route, the legacy redirect, and the workspace
routes returned by `getExposedForecastWorkspaceRoutes()`.
`src/config/forecastWorkspaces.ts` owns workspace definitions and exposure
metadata; `src/routing/forecastWorkspaceRoutes.ts` validates them and returns only
exposed route records. The application shell registers those records without
loading unexposed workspace pages. Other gated features use
`src/config/featureSurfaces.ts` and `src/routing/buildFeatureGatedRoutes.tsx`.
The planned paths above do not by themselves register pages. Route tests cover
the workspace definitions and route records.

Future routes stay unregistered when their feature is off. A direct request
falls through the normal application fallback instead of mounting a disabled
page or running workspace code. When a workspace is enabled, its route must be
registered only through the same feature exposure decision.

## Compatibility paths

Existing links remain useful during the migration:

- `/forecast` redirects to `/forecast/severe`.
- `/discussion` remains available until #916 supplies the Severe workspace
  discussion surface. That issue owns the redirect or in-workspace handoff.
- `/custom-products` remains the Custom Products library route after #915 adds
  `/forecast/custom`. It is not an alias for the Forecast editor; #915 owns the
  explicit product-to-editor handoff.
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
controls, layout, and save/restore lifecycle. The shared shell does not create a
generic discussion session. Severe continues to use its existing discussion scope
IDs; any future workspace that adds discussion must define an independent scope
and lifecycle before its discussion UI is integrated:

- Severe owns severe outlook geometry, outlook editing, and its discussion
  content. Existing `ForecastState` and `ForecastCycle` remain the source of
  truth during the Severe migration.
- Mesoscale owns provider parameter selection, model context, and short-term
  forecast geometry. It must not write into Severe outlook maps. Any later
  discussion feature must define a Mesoscale-specific scope ID and draft lifecycle.
- Custom owns custom forecast layers, category/product editing, and its product
  metadata. Any later discussion feature must define a Custom-specific scope ID
  and draft lifecycle. Existing custom layers embedded in legacy
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

New workspace payloads use the versioned
`ForecastWorkspaceSaveEnvelope` shape:

```ts
interface ForecastWorkspaceSaveEnvelope {
  schemaVersion: 1;
  workspaceId: ForecastWorkspaceId;
  forecast: GFCForecastSaveData;
}
```

`schemaVersion` versions the envelope independently of the legacy forecast
`version`; the envelope does not replace `forecastCycle` inside
`GFCForecastSaveData`. `ForecastWorkspacePayload` also accepts a legacy bare
`GFCForecastSaveData` during migration. The envelope rules are:

- a missing workspace id is classified as Severe only when the payload passes
  the existing `GFCForecastSaveData` validation;
- if it does not pass that validation, the importer checks the Custom schema
  only when the caller supplies the `isCustomPayload` validator owned by #915;
  without that validator, classification returns `unsupported-legacy-payload`;
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
records and is used for filtering, restore, and product-specific rendering. Under the proposal (not current code),
the shared handoff would pass the record descriptor and the destination workspace loader
would fetch and validate the cloud payload before hydrating state. Code today stages only
`cloudCyclePayload`/`cloudCycleMeta` and hydrates from the staged payload without a descriptor fetch. Cloud sync follows
the same shared navigation guard above for every entitlement level: attempt sync
after local autosave, preserve the local copy after a failed sync, and require an
explicit retry or leave confirmation before workspace navigation. Monitor and
Verification read saved results. They never mutate workspace-owned editing state.

Discussion drafts remain scoped by their existing scope id. Moving Discussion
inside Severe must not key drafts only by route, because route changes and
shared day groupings would make drafts collide or disappear. Future workspace
discussion drafts must use distinct scope IDs and must not share Severe draft
state by default.

## Exposure and side effects

The exposure registry owns whether Mesoscale, Tropical, Winter, and Custom
workspace pages may be registered. Route `status` in
`src/config/forecastWorkspaces.ts` is separate from the exposure flags in
`src/config/featureExposure.ts`. Mesoscale (`mesoscaleWorkspace`), Tropical
(`tropicalWorkspace`), and Winter (`winterWorkspace`) are off on every target
(local, beta, staging, production), so their routes stay unregistered. Custom
(`customProducts`) is enabled on every target, so `/forecast/custom` registers
through the same exposure decision. Hosted Custom mutations still pass
entitlement and Firestore capability gates apart from that exposure flag.

No future workspace page, provider client, map layer, or repository may be
imported at module scope from the always-on application shell. Route loaders and
feature boundaries must be the initialization boundary for unfinished or
server-backed work.

## Follow-up ownership

- #915 registers `/forecast/custom`, moves Custom UI, and owns custom-product
  compatibility behavior.
- #916 embeds Discussion in Severe and owns `/discussion` handoff behavior.
- #917 adds the Forecast workspace switcher and removes Discussion as a peer
  navigation item after the handoff exists. It also owns the proposed typed
  descriptor, session-storage handoff, and refresh behavior defined above.
- #918 defines the provider data contract without adding workspace state to
  Severe.
- #919 registers and enables Mesoscale in stages, then defines its payload
  details against this boundary.
- #921 consumes Mesoscale data in Monitor as read-only display state.
