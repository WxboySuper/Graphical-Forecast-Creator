#!/usr/bin/env bash
# Promote a staged production release (symlink swap + PM2 restart).
# Run on the VPS as root. Requires /opt/gfc-analytics/config/production-release.json
set -euo pipefail

GFC_WEB_ROOT="${GFC_WEB_ROOT:-/var/www/gfc}"
GFC_STAGING_WEB_ROOT="${GFC_STAGING_WEB_ROOT:-/var/www/gfc-staging}"
ANALYTICS_ROOT="${ANALYTICS_ROOT:-/opt/gfc-analytics}"
CONFIG_PATH="${CONFIG_PATH:-$ANALYTICS_ROOT/config/production-release.json}"
PM2_APP="${PM2_APP:-gfc-analytics}"
FORCE="${1:-}"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "Missing config: $CONFIG_PATH" >&2
  exit 1
fi

read_manifest() {
  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('$CONFIG_PATH', 'utf8'));
    console.log([config.version, config.releaseId, config.rolloutAt || '', config.status || ''].join('\t'));
  "
}

IFS=$'\t' read -r VERSION RELEASE_ID ROLLOUT_AT STATUS < <(read_manifest)

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

if [ -n "$ROLLOUT_AT" ] && [ "$FORCE" != "--force" ]; then
  node -e "
    const rolloutAt = Date.parse('$ROLLOUT_AT');
    if (Number.isNaN(rolloutAt)) {
      console.error('Invalid rolloutAt in manifest');
      process.exit(1);
    }
    if (Date.now() < rolloutAt) {
      console.error('rolloutAt has not passed yet:', '$ROLLOUT_AT');
      process.exit(1);
    }
  "
fi

echo "Promoting release $VERSION ($RELEASE_ID) ..."

ln -sfn "$WEB_RELEASE" "$GFC_WEB_ROOT/current"
mkdir -p "$GFC_STAGING_WEB_ROOT"
ln -sfn "$WEB_RELEASE" "$GFC_STAGING_WEB_ROOT/current"

ln -sfn "$ANALYTICS_RELEASE" "$ANALYTICS_ROOT/current"

cd "$ANALYTICS_ROOT/current"
npm install --omit=dev --quiet
mkdir -p "$ANALYTICS_ROOT/logs"

if [ -f "$ANALYTICS_ROOT/config/.env" ]; then
  cp "$ANALYTICS_ROOT/config/.env" "$ANALYTICS_ROOT/current/.env"
elif [ -f "$ANALYTICS_ROOT/.env" ]; then
  cp "$ANALYTICS_ROOT/.env" "$ANALYTICS_ROOT/current/.env"
fi

node "$ANALYTICS_ROOT/current/release/write-live-alert-banner.mjs" \
  --config "$CONFIG_PATH" \
  --web-root "$GFC_WEB_ROOT/current"

if pm2 describe "$PM2_APP" > /dev/null 2>&1; then
  pm2 restart "$PM2_APP"
else
  pm2 start "$ANALYTICS_ROOT/current/analytics.js" --name "$PM2_APP"
fi
pm2 save

node -e "
  const fs = require('fs');
  const config = JSON.parse(fs.readFileSync('$CONFIG_PATH', 'utf8'));
  config.status = 'live';
  config.promotedAt = new Date().toISOString();
  fs.writeFileSync('$CONFIG_PATH', JSON.stringify(config, null, 2) + '\n');
"

echo "Promote complete: $VERSION is live."
