## Stable production hotfix

This PR targets a `stable/X.Y.x` branch and is eligible to become a production release after staging verification.

- [ ] The patch version in `package.json` advances the stable line.
- [ ] `deploy/production-release.json` has the matching `vX.Y.Z` release ID and version.
- [ ] `CHANGELOG.md` contains the stable hotfix entry.
- [ ] I ran **Deploy Staging** against this exact branch or commit.
- [ ] I recorded the staging smoke-test result in this PR.
- [ ] If this fix also belongs on `main`, I will open a separate PR there.

Changelog-Impact: hotfix
