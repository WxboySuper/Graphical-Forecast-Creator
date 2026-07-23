# Verification v2 — COMPLETE AUTHORITATIVE PLAN

> Verbatim copy of the complete authoritative brief provided for this effort, retained on the branch as the single source of truth. See `verification-v2.html` for the human-readable plan and `/docs/forecast-grade-methodology.html` (served) for the public methodology page.

This is the FULL plan. Implement ALL of it (math + UI + sources + share + docs + tests + stacked PRs). Nothing here is optional unless marked out of scope.

Tracker: GitHub #430. Formula version: `gfc-ver-1`. Feature gate: `verificationRelaunch`.

Base branch: `origin/beta`. Integration branch e.g. `ver2/integration`. Draft stacked PRs → beta. No merge. No beta/prod flag enable. Do not delete classic Verification.

Also commit plan docs onto the integration branch early.

## 1. Product outcome

Relaunch Verification as a map-first evidence dashboard with a versioned **Forecast Grade**, explicit sources, grade history, and one shareable grade-plus-map card — behind `verificationRelaunch`, without removing classic Verification until later rollout cleanup.

**Primary job:** Learn fast whether the forecast captured what happened. Deep analysis + shareable proof come next.

**Audience:** Forecasters learning the craft — clear for beginners, not bogged down for experienced users. Progressive disclosure via obviously labeled expandable sections. NOT a Basic/Advanced mode switch. NO coaching / AI prose.

## 2. Coexistence & feature gate

- Classic `/verification` (`VerificationMode`) remains the live default when the flag is **off**.
- V2 mounts only when `verificationRelaunch` is **on**.
- Dogfood: set `exposure.local: true` only. Keep `beta`, `staging`, `production` **false**.
- Add **disabled-side-effect tests** so flag-off cannot boot V2 modules as side effects.
- Repo cleanup / deleting classic is **out of scope** for this effort.

Registry: `src/config/featureExposure.ts` → `verificationRelaunch`.

## 3. Sources & history (capability-first)

| Tier | Package input | History |
|------|---------------|---------|
| Signed-out | File + SPC reports | None / empty |
| Signed-in free | **File only** + SPC | Synced **grade cards** (latest 25) for trend; cards do **not** reopen full packages |
| Premium | **File OR cloud package** + SPC | Full snapshot auto-save; cloud restore |

- Source selection is always **explicit** (no auto Forecast Editor handoff).
- Do not lead UI with plan marketing — capability-first.
- Auto-save immutable snapshots on completed runs (formula version + source snapshot). Re-run creates a new result; never rewrite history.

Reuse: `GFCForecastSaveData`, `cloudCyclesService`, `stormReportParser`, `exportUtils`.

## 4. UI / dashboard (FULL requirements)

### Visual system
- Align with **site-wide app shell / design system**.
- Do **NOT** use Cloud Library as a visual reference.

### Layout
- **Desktop:** equal-weight **map** and **results dashboard**. Map is evidence surface, not decoration.
- **Mobile:** map first with compact Forecast Grade overlay/drawer; details reachable without overflow.
- **Landscape phone:** keep mobile interaction model when height is constrained.
- Map controls always reachable: **hazard**, **day**, **evidence**.
- Selecting a grade component emphasizes related forecast/report geometry on the map.
- Selectable **report table** = keyboard/screen-reader equivalent of map highlights; map stays primary.
- Avoid horizontal page overflow; touch targets large enough; no nested scroll traps in toolbars.

### Landing
- Signed-out: minimal file picker + SPC date/load.
- Free: grade **trend chart** (25 cards) + file upload to start a run.
- Premium: same trend + file **or** cloud package picker/restore.

### Result view
- Headline: **Forecast Grade** (0–100 + letter, one decimal) + component scores.
- Expandable sections titled exactly **Score breakdown** and **Data quality**.
- Data quality: **Good** / **Limited** / **Blocked**. Quiet day copy: **No reports** (not a fake confidence label).
- Missing products: **Not evaluated** row with classic warning treatment (encourage complete packages without coaching).
- History trend filterable **by hazard**.
- Comparison mode: **OUT OF SCOPE**.

### Run UX
- Accuracy over fixed latency budget; long runs show staged **foreground** progress and complete automatically.
- Invalid inputs **block** the run.
- Sparse-but-valid may withhold package grade while showing components (Limited).

### Share
- One anonymous **grade-plus-map** card (map-led).
- Offer **download**, **native share** (when available), and **copy** (when supported) — user chooses.
- No identity by default.

### Methodology
- Public documentation page linked from dashboard: formulas, caveats, version history, SPC 25-mile citation, intent/yield explanation.
- Embed formula version in UI/docs/exports.

## 5. Math `gfc-ver-1` (FULL)

### Philosophy
Two layers:
1. **Definition** — SPC occurrence-within-25-miles + Armchair-style area buffers / per-tier contingency.
2. **Intent** — formulas definition alone misses: **event yield/concentration** for high-prob cores + **severity**.

Do **not** use distance-from-polygon decay inside the 25-mile halo (that fought SPC).

Reference (inspire, don't clone contest gaming): https://armchairforecaster.com/pages/library/#verification

### SPC spatial contract
- Probabilities = chance of severe within **25 miles of any point** in the contour (SPC About Outlooks).
- Buffer each report by 25 miles (~40 km).
- Nested contours: effective claim at a location = **highest** probability whose neighborhood reaches it.
- One report only supports area within ~25 miles of that report (does not verify an entire huge 30% blob).

### Composite weights (product-level; drop N/A and renormalize)
1. **Probability skill — 25%** — Spatial Brier and/or BSS vs observed event frequency on ~10 km grid over forecast envelope + 25 mi buffer. Cell observed = 1 if any relevant report buffer covers the cell. Higher `f` empty cells hurt more. Quiet days still score (overforecast).
2. **Spatial contingency skill — 25%** — Area-based hit/miss/FA/correct-null (Armchair area method). Compute CSI or HSS **per probability tier**, then combine across tiers.
3. **False-alarm discipline — 15%** — Area FAR, **probability-weighted** so empty high-prob paint hurts more than empty 2% skirt.
4. **Event yield / concentration — 25% (INTENT)** — For cores `f ≥ 0.15`, `0.30`, `0.45` (hazard equivalents):
   `expected ≈ area(core) × density_factor(f)`
   `yield = min(1, observed_reports_near(core) / max(expected, ε))`
   Higher `f` → higher `density_factor`. Version the table in constants; calibrate with real-day fixtures.
   - Huge 30% + 1 report → fails yield AND areal support.
   - Tiny 45% + 1 report → areal may look fine; yield still soft.
   - Document yield as GFC craft/intent layered on SPC occurrence math.
5. **Severity — 10%** — Sig reports vs sig contours in 25-mi neighborhood. N/A if neither. Soft penalty ~70 if sig drawn with zero sig reports.

### Package rollup
Equal weight among present **severe-hazard** products: tornado / wind / hail. Absent → **Not evaluated**. Categorical and TSTM are **display-only** (default map context) and never enter the package mean.

### Data quality
- **Blocked:** malformed geometry, impossible/missing dates, unreadable package, failed required SPC fetch with no usable rows, or **no severe hazard contours to grade** (categorical/TSTM-only packages) → no run.
- **Limited:** e.g. 1–2 relevant reports (non-quiet) or detectable partial coverage → show components; **withhold package Forecast Grade**.
- **Good:** otherwise, including clean quiet-day overforecast path (label **No reports**).

Geometry quality = **gate/diagnostic**, not a score weight.

### Letter bands
A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F < 60. Display one decimal (e.g. 82.4 / B).

### Display vs graded layers
Categorical is a composite summary of the hazard probabilities; TSTM is sub-severe general thunder. Neither has a standalone probabilistic field suitable for SPC-style verification, so the dashboard shows categorical by default but grades only tornado, wind, and hail contours.

### Score breakdown (visible diagnostics)
Show composite components plus diagnostics: per-tier POD/FAR/CSI, claim-support fraction, yield by core, calibration by tier, report table. Hits/misses table is diagnostic and does **not** alone determine the grade. No coaching copy.

### Tuning authority
Official grades change only via GFC releases (versioned). No per-user weight sliders.

## 6. Architecture

1. **Pure engine** (no React): neighborhood/buffers, area metrics, Brier, yield, severity, composite, snapshots.
2. **Source adapters**: file + premium cloud; SPC reports; validate or block.
3. **Snapshot store**: auto-save; free grade cards; premium full restore.
4. **Feature-gated UI**: V2 shell on `/verification` when flag on; else classic.
5. **Share + docs**: PNG/card export; methodology page for `gfc-ver-1`.

Code anchors: `VerificationPage.tsx`, `VerificationMode/`, `verificationUtils.ts` (classic), `featureExposure.ts`, `stormReportParser.ts`, `cloudCyclesService.ts`, `useCloudCycles.ts`, `exportUtils.ts`.

## 7. Stacked PRs (~10–15 min review each)

1. `ver2/01-formula-contract`
2. `ver2/02-neighborhood-area`
3. `ver2/03-prob-spatial`
4. `ver2/04-yield-composite`
5. `ver2/05-sources-history`
6. `ver2/06-dashboard-shell` (local:true + side-effect tests + classic coexistence)
7. `ver2/07-result-workspace` (grade UI, breakdown, map↔table, controls)
8. `ver2/08-share-docs`
9. `ver2/09-hardening` (fixtures, browser e2e, responsive)

Draft PRs → `beta`. Babysit CI. No merge.

## 8. Testing

Static: unit tests + fixtures (dense congestion, sparse, quiet, tiny high-prob 1 vs many). Assert yield/FAR behaviors. Flag-off side-effect tests. `pnpm test`, `pnpm run build`.

Dynamic: browser with local flag; file+SPC scenarios; Score breakdown; map↔table; share smoke; phone viewports; Playwright as needed.

## 9. Out of scope

Beta/prod flag enable; delete classic; comparison mode; DAT/tracks; Cloud Library redesign; coaching copy; leaderboards; merging PRs.

## 10. Hand-off

Report: integration branch, PR URLs + CI, dogfood steps, scenario grade notes, blockers. STOP for human review.
