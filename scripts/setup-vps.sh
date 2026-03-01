#!/usr/bin/env bash
# One-time VPS setup for GFC production
# Run as root on the VPS:  bash scripts/setup-vps.sh
set -euo pipefail

echo "═══════════════════════════════════════════"
echo "  GFC Production VPS Setup"
echo "═══════════════════════════════════════════"

echo ""
echo ">> Creating web root /var/www/gfc ..."
mkdir -p /var/www/gfc

echo ">> Creating analytics directories ..."
mkdir -p /opt/gfc-analytics/logs

echo ">> Checking for Node.js >= 18 ..."
NODE_OK=false
if command -v node &>/dev/null; then
  NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
  if [ "$NODE_VER" -ge 18 ]; then
    NODE_OK=true
    echo "   Found Node.js v$(node --version)"
  fi
fi

if [ "$NODE_OK" = false ]; then
  echo "   Installing Node.js 20 via NodeSource ..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo ">> Checking for PM2 ..."
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi
pm2 startup || true  # configure systemd service for PM2

echo ">> Checking for Nginx ..."
if ! command -v nginx &>/dev/null; then
  apt-get update && apt-get install -y nginx
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  Setup complete — next steps:"
echo "═══════════════════════════════════════════"
echo ""
echo "  1. Copy nginx config:"
echo "     cp server/nginx.conf /etc/nginx/sites-available/gfc"
echo "     ln -s /etc/nginx/sites-available/gfc /etc/nginx/sites-enabled/gfc"
echo "     nginx -t && systemctl reload nginx"
echo ""
echo "  2. Obtain SSL certificate:"
echo "     certbot --nginx -d gfc.weatherboysuper.com"
echo ""
echo "  3. Add GitHub Actions secrets in your repo settings:"
echo "     PROD_SSH_KEY  — private SSH key for this VPS"
echo "     PROD_SSH_HOST — this VPS hostname / IP"
echo "     GH_PAT        — GitHub Personal Access Token (repo scope)"
echo ""
echo "  4. Trigger 'Deploy Production to VPS' manually to do the first deploy."
echo ""
