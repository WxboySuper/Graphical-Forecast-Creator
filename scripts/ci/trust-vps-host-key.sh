#!/usr/bin/env bash
# Trust a VPS SSH host key for deploy workflows.
#
# Resolution order:
#   1. SSH_KNOWN_HOSTS env (secret or repo variable)
#   2. SSH_KNOWN_HOSTS_FILE (committed .github/known_hosts/*)
#   3. ssh-keyscan fallback (flaky from GitHub-hosted runners — avoid when possible)
#
# Required env: SSH_HOST
# Optional env: SSH_PORT (default 22), SSH_KNOWN_HOSTS, SSH_KNOWN_HOSTS_FILE
set -euo pipefail

if [ -z "${SSH_HOST:-}" ]; then
  echo "::error::SSH_HOST is required" >&2
  exit 1
fi

PORT="${SSH_PORT:-22}"

mkdir -p ~/.ssh
chmod 700 ~/.ssh

if [ -n "${SSH_KNOWN_HOSTS:-}" ]; then
  printf '%s\n' "$SSH_KNOWN_HOSTS" >> ~/.ssh/known_hosts
  echo "Trusted VPS host key from pinned secret/variable."
  exit 0
fi

if [ -n "${SSH_KNOWN_HOSTS_FILE:-}" ] && [ -f "$SSH_KNOWN_HOSTS_FILE" ]; then
  cat "$SSH_KNOWN_HOSTS_FILE" >> ~/.ssh/known_hosts
  echo "Trusted VPS host key from ${SSH_KNOWN_HOSTS_FILE}."
  exit 0
fi

echo "::warning::No pinned VPS host key configured. ssh-keyscan from GitHub Actions is unreliable — set BETA_SSH_KNOWN_HOSTS / PROD_SSH_KNOWN_HOSTS or commit keys under .github/known_hosts/. See .github/known_hosts/README.md"

for attempt in 1 2 3 4 5; do
  for key_types in ed25519 rsa; do
    if scan_output=$(ssh-keyscan -T 10 -p "$PORT" -t "$key_types" -H "$SSH_HOST" 2>/tmp/ssh-keyscan.err) \
      && [ -n "$scan_output" ]; then
      printf '%s\n' "$scan_output" >> ~/.ssh/known_hosts
      echo "ssh-keyscan succeeded on attempt ${attempt} (${key_types})."
      exit 0
    fi
  done

  cat /tmp/ssh-keyscan.err >&2 || true
  if command -v nc >/dev/null 2>&1; then
    if nc -z -w 5 "$SSH_HOST" "$PORT" 2>/dev/null; then
      echo "Port ${PORT} is reachable but ssh-keyscan returned no keys (attempt ${attempt})." >&2
    else
      echo "Port ${PORT} is not reachable from this runner (attempt ${attempt})." >&2
    fi
  fi

  if [ "$attempt" -lt 5 ]; then
    echo "ssh-keyscan attempt ${attempt} failed; retrying..." >&2
    sleep $((attempt * 3))
  fi
done

echo "::error::ssh-keyscan failed after 5 attempts. Pin the host key so deploys do not depend on runner-to-VPS discovery:" >&2
echo "  ssh-keyscan -H -p ${PORT} ${SSH_HOST}" >&2
echo "Add the output as GitHub Actions secret PROD_SSH_KNOWN_HOSTS or BETA_SSH_KNOWN_HOSTS." >&2
echo "See .github/known_hosts/README.md" >&2
exit 1
