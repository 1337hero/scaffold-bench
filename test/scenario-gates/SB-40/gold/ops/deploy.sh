#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${DEPLOY_HOST:-user@example.com}"
REMOTE_PATH="/var/www/app"

rsync -avz --delete --exclude='.env' ./dist/ "$REMOTE_HOST:$REMOTE_PATH/"

echo "Deploy complete"
