#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   sudo bash scripts/server/bootstrap-baidu-ubuntu.sh
#
# What this script does:
# 1) Updates apt packages
# 2) Installs git/curl/ufw/nginx
# 3) Installs Node.js LTS + npm
# 4) Installs pm2 globally
# 5) Opens firewall ports 22/80/443/3000
# 6) Prints post-check commands

echo "[1/7] apt update/upgrade ..."
apt-get update -y
apt-get upgrade -y

echo "[2/7] install base packages ..."
apt-get install -y git curl ufw nginx ca-certificates gnupg lsb-release

echo "[3/7] install Node.js LTS ..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
fi

echo "[4/7] install pm2 ..."
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

echo "[5/7] enable nginx ..."
systemctl enable nginx
systemctl restart nginx

echo "[6/7] configure ufw ..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp
ufw --force enable

echo "[7/7] done."
echo ""
echo "Check versions:"
echo "  node -v"
echo "  npm -v"
echo "  pm2 -v"
echo "  nginx -v"
echo ""
echo "Check firewall:"
echo "  ufw status"
