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

### Feature exposure

- [ ] Exposure report generated and reviewed (see `pnpm run exposure:report`)
- [ ] All newly production-visible features are listed below
- [ ] No beta-only or experimental features leak into production exposure
- [ ] Server-backed features have matching server capability configuration
- [ ] Temporary features approaching removal have removal condition metadata confirmed

#### Newly production-visible features in this release

| Feature | Target state | Server-backed | Removal condition |
|---|---|---|---|
| (list features promoted to production here, or write "None") | | | |

### Review requests

- [ ] Server-backed feature changes reviewed by server owner
- [ ] Security-sensitive feature changes flagged for security review

### After merge (automatic)

- Stable version committed on `main`
- GitHub Release created from CHANGELOG
- Beta bumped to the next development prerelease
- **Deploy Production to VPS** runs (`stage` stages release; live site unchanged until `rolloutAt`)
- VPS cron promotes at `rolloutAt` (see [docs/hosted-rollout.md](../docs/hosted-rollout.md))

You only need to click **Merge** — no manual Actions steps unless promoting early (`bash /opt/gfc-analytics/current/release/promote-release.sh --force` on VPS).
