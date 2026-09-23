# Forecast workspace route and state decisions

Issue: [#914](https://github.com/WxboySuper/Graphical-Forecast-Creator/issues/914)
Implemented in: #1456
Base doc: [Forecast workspace boundaries](./forecast-workspace-boundaries.md)

This record pins down what #1456 actually built. The base doc describes the planned v1.8 layout. This one describes the working subset and the rules the code now enforces.

## Routes

- `/forecast/severe` is the available editor. `/forecast` redirects there and keeps query parameters and hash.
- `/forecast/custom` is registered when the existing `customProducts` exposure is on. It reuses the shared ForecastPage editor.
- `/forecast/mesoscale`, `/forecast/tropical`, and `/forecast/winter` stay unregistered while their exposure keys are off. A direct visit falls through to the normal unregistered-route handling. There is no explanatory unavailable page yet.
- `/custom-products` stays a separate library route. It is not a legacy Forecast editor path.
- Canonical matching tolerates trailing slashes. Non-forecast pages leave Redux workspace ownership alone instead of resetting it to Severe.

## State ownership

- The URL selects the workspace. App-level code syncs Redux `workspaceId` from the route.
- A real workspace switch clears the prior document, undo state, discussion drafts, and workflow state. Saved-cycle history is kept.
- The editor subtree remounts per workspace so the selected cloud cycle cannot leak from one owner to another.
- ForecastPage waits for Redux ownership to match the route before running restore effects. This stops a late reset from erasing the target workspace restore.

## Persistence

- Autosave keys, day-rollover saves, editor cloud saves, and restore keys carry the owning workspace.
- A pending debounced save flushes to its original workspace before a scope change. A deliberate fresh start clears both signed-in and anonymous copies.
- Sign-in migrates anonymous autosaves per workspace. A non-Severe draft is never promoted into Severe.
- Every new cloud record requires `workspaceId`. Library tabs filter on it. Legacy records without an id read as Severe.

## Cloud handoff

- Cloud loads wrap the payload in the workspace envelope. An already enveloped payload is reused as is. A mismatched envelope is rejected.
- A workspace can open cloud payloads only when it has a registered editor route for the current build target. Today that is Severe and exposed Custom. The check reads the shared workspace registry and exposure contract, not a separate hardcoded list.
- A cross-workspace handoff that reaches the wrong editor is a user-visible error. The pending cloud session is cleared and the editor shows an error toast instead of silently falling back to local restore.

## Exposure

- `src/config/forecastWorkspaces.ts` owns the workspace list. `src/routing/forecastWorkspaceRoutes.ts` owns route resolution and the exposed-route list. App registers routes from that list.
- Future workspace modules stay behind route loaders. The shell never imports them at module scope.

## Follow-ups, not in scope

- Full workspace switcher stays with #917.
- Custom UI move and compatibility redirect stay with #915.
- Discussion embedding and `/discussion` handoff stay with #916.
- Mesoscale registration stays with #919.
- Browser-level coverage for direct navigation, refresh, and back/forward across the restore gate is still open.
