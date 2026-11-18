## Stable production hotfix

This PR targets a `stable/X.x` branch, the only line production sees. Backports opened by the backport workflow use the default template; this one is for a fix that only applies to production.

- [ ] I ran **Deploy Staging** against this exact branch or commit.
- [ ] I recorded the staging smoke-test result in this PR.

You do not bump the version, edit `deploy/production-release.json`, or move the changelog lane here: the **Release | Stable** workflow infers the next version, updates the manifest and resets the stable changelog lane when you release. Add a changelog entry only if you want the note written now.

This production-only fix is not carried to `main`. If the fix also applies to `main`, merge it there first and use the `backport-2.x` label instead.

Changelog-Impact: hotfix
