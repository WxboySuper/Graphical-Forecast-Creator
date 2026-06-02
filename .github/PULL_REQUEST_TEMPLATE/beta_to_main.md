## Beta → main promotion

This PR promotes **beta** to **production** (`main`).

### Before merge

- [ ] CHANGELOG.md has an up-to-date section for this release (e.g. `## v1.6`)
- [ ] **`deploy/production-release.json`** updated:
  - [ ] `version` matches stable after merge (e.g. `1.6.0`)
  - [ ] `releaseId` unique for this rollout attempt
  - [ ] `action` is `"stage"` for timed rollout (or `"live"` for immediate full deploy)
  - [ ] `rolloutAt` set (UTC ISO) when using `stage`
  - [ ] `banner.phases`: pre-rollout warning + post-rollout info with `linkUrl` `/updates`
- [ ] CI and reviews are green
- [ ] Conflicts with `main` resolved here
- [ ] Beta deployment smoke-tested
- [ ] Plan to verify **staging-gfc.weatherboysuper.com** after merge (beta-gated build)

### After merge (automatic)

- Stable version committed on `main`
- GitHub Release created from CHANGELOG
- Beta bumped to the next development prerelease
- **Deploy Production to VPS** runs (`stage` stages release; live site unchanged until `rolloutAt`)
- VPS cron promotes at `rolloutAt` (see [docs/hosted-rollout.md](../docs/hosted-rollout.md))

You only need to click **Merge** — no manual Actions steps unless promoting early (`bash /opt/gfc-analytics/current/release/promote-release.sh --force` on VPS).
