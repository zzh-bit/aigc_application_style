#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   bash scripts/server/deploy-next-api.sh \
#     --repo "https://github.com/your-org/your-repo.git" \
#     --app-dir "/srv/ps2-api" \
#     --branch "main"
#
# Environment variables required before running:
#   DEEPSEEK_API_KEY
# Optional:
#   DEEPSEEK_BASE_URL (default: https://api.deepseek.com/chat/completions)
#   DEEPSEEK_MODEL (default: deepseek-chat)
#   APP_PORT (default: 3000)

REPO_URL=""
APP_DIR="/srv/ps2-api"
BRANCH="main"
APP_PORT="${APP_PORT:-3000}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO_URL="$2"
      shift 2
      ;;
    --app-dir)
      APP_DIR="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$REPO_URL" ]]; then
  echo "Missing --repo"
  exit 1
fi

if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "Missing DEEPSEEK_API_KEY env var"
  exit 1
fi

DEEPSEEK_BASE_URL="${DEEPSEEK_BASE_URL:-https://api.deepseek.com/chat/completions}"
DEEPSEEK_MODEL="${DEEPSEEK_MODEL:-deepseek-chat}"

echo "[1/8] prepare app directory ..."
mkdir -p "$APP_DIR"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
fi

echo "[2/8] pull latest code ..."
cd "$APP_DIR"
git fetch --all
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "[3/8] write .env.production ..."
cat > .env.production <<EOF
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
DEEPSEEK_BASE_URL=${DEEPSEEK_BASE_URL}
DEEPSEEK_MODEL=${DEEPSEEK_MODEL}
PORT=${APP_PORT}
NODE_ENV=production
EOF
chmod 600 .env.production

echo "[4/8] install deps ..."
npm ci || npm install

echo "[5/8] build app ..."
npm run build:server

echo "[6/8] restart pm2 ..."
if pm2 describe ps2-api >/dev/null 2>&1; then
  pm2 restart ps2-api --update-env
else
  pm2 start npm --name ps2-api -- start
fi

echo "[7/8] save pm2 startup ..."
pm2 save

echo "[8/8] status ..."
pm2 status
echo "Deployment done on port ${APP_PORT}"
