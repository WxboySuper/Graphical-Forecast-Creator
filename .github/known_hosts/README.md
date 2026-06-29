# VPS SSH known hosts (deploy workflows)

Host public keys are **not secrets**. Pin them so deploy workflows never depend on flaky `ssh-keyscan` calls from GitHub-hosted runners.

## One-time setup

From any machine that can reach the VPS:

```bash
# Production (same host as PROD_SSH_HOST)
ssh-keyscan -H -p 22 YOUR_PROD_HOST

# Beta (same host as BETA_SSH_HOST, if different)
ssh-keyscan -H -p 22 YOUR_BETA_HOST
```

Paste each full output line into **one** of:

| Target | GitHub Actions secret | Repo variable (optional) | Committed file (optional) |
|--------|----------------------|--------------------------|---------------------------|
| Production | `PROD_SSH_KNOWN_HOSTS` | `PROD_SSH_KNOWN_HOSTS` | `.github/known_hosts/production` |
| Beta | `BETA_SSH_KNOWN_HOSTS` | `BETA_SSH_KNOWN_HOSTS` | `.github/known_hosts/beta` |

Secrets/variables take precedence over committed files. Workflows only fall back to `ssh-keyscan` when nothing is pinned.

## When the host key rotates

Update the secret/variable or committed file and merge. Do not rely on the keyscan fallback in production.

## Why pin?

Recent deploy logs show `ssh-keyscan` timing out from GitHub Actions even when SSH deploys usually work. Retries reduce but do not eliminate failures. Pinning removes the network hop entirely.
