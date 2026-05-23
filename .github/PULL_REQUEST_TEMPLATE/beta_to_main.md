## Beta → main promotion

This PR promotes **beta** to **production** (`main`).

### Before merge

- [ ] CHANGELOG.md has an up-to-date section for this release (e.g. `## v1.6`)
- [ ] CI and reviews (Greptile, Kilo) are green
- [ ] Conflicts with `main` resolved here
- [ ] Beta deployment smoke-tested

### After merge (automatic)

- Stable version committed on `main`
- GitHub Release created from CHANGELOG
- Beta bumped to the next development prerelease
- Production deploy workflow runs

You only need to click **Merge** — no manual Actions steps.
