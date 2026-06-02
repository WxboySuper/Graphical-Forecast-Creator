#!/usr/bin/env bash
# Promote a staged production release (symlink swap + PM2 restart).
# Run on the VPS as root. Requires /opt/gfc-analytics/config/production-release.json
set -euo pipefail

GFC_WEB_ROOT="${GFC_WEB_ROOT:-/var/www/gfc}"
GFC_STAGING_WEB_ROOT="${GFC_STAGING_WEB_ROOT:-/var/www/gfc-staging}"
ANALYTICS_ROOT="${ANALYTICS_ROOT:-/opt/gfc-analytics}"
CONFIG_PATH="${CONFIG_PATH:-$ANALYTICS_ROOT/config/production-release.json}"
RELEASE_LIB="${RELEASE_LIB:-$ANALYTICS_ROOT/current/release}"
PM2_APP="${PM2_APP:-gfc-analytics}"
FORCE="${1:-}"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "Missing config: $CONFIG_PATH" >&2
  exit 1
fi

if [ ! -d "$RELEASE_LIB" ]; then
  RELEASE_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

IFS=$'\t' read -r VERSION RELEASE_ID ROLLOUT_AT STATUS < <(
  node "$RELEASE_LIB/read-manifest-fields.mjs" --config "$CONFIG_PATH"
)

if [ -z "$VERSION" ]; then
  echo "Invalid manifest: missing version" >&2
  exit 1
fi

RELEASE_DIR=$(node -e "console.log('$VERSION'.replace(/[^0-9A-Za-z.-]+/g, '_'))")

WEB_RELEASE="$GFC_WEB_ROOT/releases/$RELEASE_DIR"
ANALYTICS_RELEASE="$ANALYTICS_ROOT/releases/$RELEASE_DIR"

if [ ! -d "$WEB_RELEASE" ]; then
  echo "Staged web release not found: $WEB_RELEASE" >&2
  exit 1
fi

if [ ! -d "$ANALYTICS_RELEASE" ]; then
  echo "Staged analytics release not found: $ANALYTICS_RELEASE" >&2
  exit 1
fi

if [ "$STATUS" = "live" ] && [ "$FORCE" != "--force" ]; then
  echo "Release $RELEASE_ID is already live."
  exit 0
fi

if [ "$FORCE" = "--force" ]; then
  node "$RELEASE_LIB/assert-rollout-ready.mjs" --rollout-at "$ROLLOUT_AT" --force
else
  node "$RELEASE_LIB/assert-rollout-ready.mjs" --rollout-at "$ROLLOUT_AT"
fi

echo "Promoting release $VERSION ($RELEASE_ID) ..."

STAGING_WEB_RELEASE="$GFC_STAGING_WEB_ROOT/releases/$RELEASE_DIR"

ln -sfn "$WEB_RELEASE" "$GFC_WEB_ROOT/current"
mkdir -p "$GFC_STAGING_WEB_ROOT"
if [ -d "$STAGING_WEB_RELEASE" ]; then
  ln -sfn "$STAGING_WEB_RELEASE" "$GFC_STAGING_WEB_ROOT/current"
fi

ln -sfn "$ANALYTICS_RELEASE" "$ANALYTICS_ROOT/current"

cd "$ANALYTICS_ROOT/current"
npm install --omit=dev --quiet
mkdir -p "$ANALYTICS_ROOT/logs"

# Production analytics only — gfc-staging-analytics uses /opt/gfc-staging-analytics/config/.env
if [ -f "$ANALYTICS_ROOT/config/.env" ]; then
  cp "$ANALYTICS_ROOT/config/.env" "$ANALYTICS_ROOT/current/.env"
elif [ -f "$ANALYTICS_ROOT/.env" ]; then
  cp "$ANALYTICS_ROOT/.env" "$ANALYTICS_ROOT/current/.env"
fi

node "$RELEASE_LIB/write-live-alert-banner.mjs" \
  --config "$CONFIG_PATH" \
  --web-root "$GFC_WEB_ROOT/current"

if pm2 describe "$PM2_APP" > /dev/null 2>&1; then
  pm2 restart "$PM2_APP"
else
  pm2 start "$ANALYTICS_ROOT/current/analytics.js" --name "$PM2_APP"
fi
pm2 save

node "$RELEASE_LIB/mark-release-live.mjs" --config "$CONFIG_PATH"

echo "Promote complete: $VERSION is live."
